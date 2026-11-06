import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { checkoutAmount } from "./money";
import { ALLOCATE_NUMBER_SQL, invoiceNumber } from "./numbers";
import { isPayPalAdmin, webhookEndpoint } from "./policy";
import type { Draft, Invoice, InvoiceStatus } from "./types";

type InvoiceRow = {
  id: string;
  number: string;
  recipient_email: string;
  recipient_name: string;
  items: string;
  currency: string;
  note: string;
  status: InvoiceStatus;
  created_at: string;
  reminded_at: string | null;
  paid_at: string | null;
  paypal_id: string | null;
  paypal_url: string | null;
};

async function caller(userId: string, bearerToken?: string) {
  const session = await getSessionUser(bearerToken);
  if (session) {
    if (session.id !== userId || !session.email) throw new Error("Unauthorized");
    return { userId: session.id, email: session.email.toLowerCase() };
  }
  if (userId !== "dev-user") throw new Error("Unauthorized");
  return { userId, email: "dev@example.com" };
}

async function teamFor(userId: string, email: string) {
  const sql = await getSql();
  await sql`update paypilot_member set user_id = ${userId} where lower(email) = ${email} and user_id is null`;
  const found = await sql<{ team_id: string }>`
    select team_id from paypilot_member
    where user_id = ${userId} or lower(email) = ${email}
    limit 1
  `;
  const existing = found[0]?.team_id;
  if (existing) return existing;
  const id = crypto.randomUUID();
  await sql`insert into paypilot_team (id, name, owner_user_id) values (${id}, ${"My team"}, ${userId})`;
  await sql`
    insert into paypilot_member (team_id, email, user_id, role)
    values (${id}, ${email}, ${userId}, ${"owner"})
  `;
  return id;
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    number: row.number,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    items: JSON.parse(row.items) as Invoice["items"],
    currency: "USD",
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    remindedAt: row.reminded_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    paypalId: row.paypal_id ?? undefined,
    paypalUrl: row.paypal_url ?? undefined,
  };
}

const INVOICE_SELECT = `
  select id, number, recipient_email, recipient_name, items, currency, note, status,
         created_at::text as created_at, reminded_at::text as reminded_at, paid_at::text as paid_at,
         paypal_id, paypal_url
  from paypilot_invoice
`;

export async function listFor(userId: string, bearerToken?: string) {
  const { userId: id, email } = await caller(userId, bearerToken);
  const teamId = await teamFor(id, email);
  const sql = await getSql();
  const rows = await sql.query<InvoiceRow>(
    `${INVOICE_SELECT} where team_id = $1 order by created_at desc`,
    [teamId],
  );
  return rows.map(toInvoice);
}

export async function teamForCaller(userId: string, bearerToken?: string) {
  const { userId: id, email } = await caller(userId, bearerToken);
  const teamId = await teamFor(id, email);
  const sql = await getSql();
  const teams = await sql<{ name: string; owner_user_id: string }>`
    select name, owner_user_id from paypilot_team where id = ${teamId}
  `;
  const members = await sql<{ email: string; role: string }>`
    select email, role from paypilot_member where team_id = ${teamId} order by role, email
  `;
  return { name: teams[0]?.name ?? "My team", owner: teams[0]?.owner_user_id === id, members };
}

export async function inviteToTeam(userId: string, bearerToken: string | undefined, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a teammate's email.");
  const { userId: id, email: mine } = await caller(userId, bearerToken);
  const teamId = await teamFor(id, mine);
  const sql = await getSql();
  const me = await sql<{ role: string }>`
    select role from paypilot_member where team_id = ${teamId} and user_id = ${id}
  `;
  if (me[0]?.role !== "owner") throw new Error("Only the team owner can invite.");
  await sql`
    insert into paypilot_member (team_id, email, user_id, role)
    values (${teamId}, ${email}, ${null}, ${"member"})
    on conflict (team_id, email) do nothing
  `;
  return teamForCaller(userId, bearerToken);
}

export async function openFor(userId: string, bearerToken: string | undefined, draft: Draft) {
  checkoutAmount(draft);
  const who = await caller(userId, bearerToken);
  const teamId = await teamFor(who.userId, who.email);
  const sql = await getSql();
  const allocated = await sql.query<{ next_n: number }>(ALLOCATE_NUMBER_SQL, [teamId]);
  const number = invoiceNumber(allocated[0]?.next_n ?? 0);
  const invoiceId = crypto.randomUUID();
  await sql.query(
    `insert into paypilot_invoice
       (id, team_id, number, recipient_email, recipient_name, items, currency, note, status)
     values ($1,$2,$3,$4,$5,$6,'USD',$7,'sent')`,
    [invoiceId, teamId, number, draft.recipientEmail, draft.recipientName, JSON.stringify(draft.items), draft.note],
  );
  try {
    const { createCheckout } = await import("./paypal.server");
    const paypal = await createCheckout(draft, number, invoiceId);
    const rows = await sql.query<InvoiceRow>(
      `update paypilot_invoice
         set paypal_id = $2, paypal_url = $3
       where id = $1
       returning id, number, recipient_email, recipient_name, items, currency, note, status,
         created_at::text as created_at, reminded_at::text as reminded_at, paid_at::text as paid_at,
         paypal_id, paypal_url`,
      [invoiceId, paypal.id, paypal.url],
    );
    const row = rows[0];
    if (!row) throw new Error("The bill was not saved.");
    return toInvoice(row);
  } catch (error) {
    await sql.query(`delete from paypilot_invoice where id = $1 and paypal_id is null`, [invoiceId]);
    throw error;
  }
}

async function invoiceInTeam(teamId: string, id: string) {
  const sql = await getSql();
  const rows = await sql.query<InvoiceRow>(`${INVOICE_SELECT} where team_id = $1 and id = $2`, [teamId, id]);
  const row = rows[0];
  if (!row) throw new Error("That bill is not on your team.");
  return row;
}

export async function changeFor(userId: string, bearerToken: string | undefined, id: string, status: "reminded" | "paid" | "cancelled") {
  const { userId: ownerId, email } = await caller(userId, bearerToken);
  const teamId = await teamFor(ownerId, email);
  const row = await invoiceInTeam(teamId, id);
  const open = row.status === "sent" || row.status === "reminded";
  if ((status === "reminded" || status === "cancelled") && !open) {
    throw new Error(`${row.number} is already ${row.status}.`);
  }
  if (status === "cancelled" && row.paypal_id) {
    throw new Error(`${row.number} is still a PayPal checkout. Cancel here does not close that link.`);
  }
  if (status === "paid" && row.paypal_id) {
    const { capturePaid } = await import("./paypal.server");
    await capturePaid(row.paypal_id);
  }
  const sql = await getSql();
  const rows = await sql.query<InvoiceRow>(
    `update paypilot_invoice
       set status = $3,
           reminded_at = case when $3 = 'reminded' then now() else reminded_at end,
           paid_at = case when $3 = 'paid' then now() else paid_at end
     where team_id = $1 and id = $2
     returning id, number, recipient_email, recipient_name, items, currency, note, status,
       created_at::text as created_at, reminded_at::text as reminded_at, paid_at::text as paid_at,
       paypal_id, paypal_url`,
    [teamId, id, status],
  );
  const next = rows[0];
  if (!next) throw new Error("That bill is not on your team.");
  return toInvoice(next);
}

export async function syncFor(userId: string, bearerToken: string | undefined, id: string) {
  const { userId: ownerId, email } = await caller(userId, bearerToken);
  const teamId = await teamFor(ownerId, email);
  const row = await invoiceInTeam(teamId, id);
  if (!row.paypal_id) return { invoice: toInvoice(row), paypalStatus: row.status.toUpperCase() };
  const { orderStatus } = await import("./paypal.server");
  const live = await orderStatus(row.paypal_id);
  if (live.status !== "COMPLETED") return { invoice: toInvoice(row), paypalStatus: live.status };
  const sql = await getSql();
  const rows = await sql.query<InvoiceRow>(
    `update paypilot_invoice set status = 'paid', paid_at = coalesce(paid_at, now())
     where team_id = $1 and id = $2
     returning id, number, recipient_email, recipient_name, items, currency, note, status,
       created_at::text as created_at, reminded_at::text as reminded_at, paid_at::text as paid_at,
       paypal_id, paypal_url`,
    [teamId, id],
  );
  const next = rows[0];
  if (!next) throw new Error("That bill is not on your team.");
  return { invoice: toInvoice(next), paypalStatus: "COMPLETED" };
}

export async function markPaidByPaypalOrder(paypalId: string) {
  const sql = await getSql();
  await sql`
    update paypilot_invoice
    set status = 'paid', paid_at = coalesce(paid_at, now())
    where paypal_id = ${paypalId} and status in ('sent', 'reminded')
  `;
}

export async function webhookId() {
  const fromEnv = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (fromEnv) return fromEnv;
  const sql = await getSql();
  const rows = await sql<{ paypal_id: string }>`select paypal_id from paypilot_webhook where id = ${"current"}`;
  return rows[0]?.paypal_id ?? "";
}

export async function connectWebhook(userId: string, bearerToken?: string) {
  const who = await caller(userId, bearerToken);
  if (!isPayPalAdmin(who.email, process.env.PAYPAL_ADMIN_EMAIL)) {
    throw new Error("Only the address in PAYPAL_ADMIN_EMAIL can register the webhook.");
  }
  if (process.env.PAYPAL_WEBHOOK_ID?.trim()) {
    throw new Error("PAYPAL_WEBHOOK_ID is already set. Clear it before registering a new URL.");
  }
  const url = webhookEndpoint(process.env.APP_PUBLIC_URL);
  const sql = await getSql();
  const previous = await sql<{ paypal_id: string }>`select paypal_id from paypilot_webhook where id = ${"current"}`;
  const { deleteWebhook, registerWebhook } = await import("./paypal.server");
  if (previous[0]?.paypal_id) {
    await deleteWebhook(previous[0].paypal_id);
    await sql`delete from paypilot_webhook where id = ${"current"}`;
  }
  const created = await registerWebhook(url);
  await sql`
    insert into paypilot_webhook (id, url, paypal_id)
    values (${"current"}, ${url}, ${created.id})
    on conflict (id) do update set url = ${url}, paypal_id = ${created.id}
  `;
  return { url };
}
