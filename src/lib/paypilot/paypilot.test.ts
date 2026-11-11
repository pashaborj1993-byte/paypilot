import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApproval, isDismiss, isListRequest } from "./interpret.ts";
import { canFollowUp, findInvoice } from "./match.ts";
import { checkoutAmount, commerceSteps, draftTotal, ledgerBrief, oldestOpen, payStep } from "./money.ts";
import { invoiceNumber, ALLOCATE_NUMBER_SQL } from "./numbers.ts";
import { isPayPalAdmin, webhookEndpoint } from "./policy.ts";
import { MODEL_CALL_CAP, RESERVE_CALL_SQL, withinDailyCap } from "./quota.ts";
import { orderIdFromWebhook } from "./webhook.ts";
import type { Invoice } from "./types.ts";

function invoice(patch: Partial<Invoice> & Pick<Invoice, "number" | "recipientName" | "recipientEmail" | "status">): Invoice {
  return {
    id: patch.number,
    items: [{ name: "Work", quantity: 1, unitPrice: 10 }],
    currency: "USD",
    note: "",
    createdAt: "2026-01-01",
    ...patch,
  };
}

describe("findInvoice", () => {
  const rows = [
    invoice({ number: "PP-1041", recipientName: "Heather", recipientEmail: "heather@client.test", status: "sent" }),
    invoice({ number: "PP-1042", recipientName: "Maya Chen", recipientEmail: "maya@client.test", status: "paid" }),
  ];

  it("does not treat a short word inside a name as a match", () => {
    assert.equal(findInvoice(rows, "remind the client"), undefined);
  });

  it("matches a paid invoice only by exact email or number", () => {
    assert.equal(findInvoice(rows, "maya@client.test")?.number, "PP-1042");
    assert.equal(findInvoice(rows, "remind Maya Chen"), undefined);
  });

  it("matches one open invoice by its full name", () => {
    assert.equal(findInvoice(rows, "remind Heather")?.number, "PP-1041");
  });

  it("does not match a short name hidden inside another word", () => {
    const ann = invoice({ number: "PP-1043", recipientName: "Ann", recipientEmail: "ann@client.test", status: "sent" });
    assert.equal(findInvoice([ann], "cancel the annual bill"), undefined);
    assert.equal(findInvoice([ann], "remind Ann")?.number, "PP-1043");
  });

  it("does not guess a bill when the hint is blank", () => {
    assert.equal(findInvoice(rows, "   "), undefined);
  });

  it("does not reopen a paid bill", () => {
    assert.equal(canFollowUp("paid", "reminded"), false);
    assert.equal(canFollowUp("sent", "reminded"), true);
    assert.equal(canFollowUp("paid", "paid"), true);
  });
});

describe("money and phrases", () => {
  it("bills 6 hours at $140 as $840", () => {
    assert.equal(draftTotal({ items: [{ name: "Design", quantity: 6, unitPrice: 140 }] }), 840);
  });

  it("keeps a tenth of an hour", () => {
    assert.equal(draftTotal({ items: [{ name: "Design", quantity: 0.1, unitPrice: 100 }] }), 10);
  });

  it("does not treat a priced request as a list", () => {
    assert.equal(isListRequest("Show an invoice for Maya Chen for 2 hours at $140"), false);
  });

  it("approves only the exact phrase", () => {
    assert.equal(isApproval("send it"), true);
    assert.equal(isApproval("Send a reminder to Maya"), false);
    assert.equal(isApproval("Yes, change the hours to 4"), false);
  });

  it("discards only the exact phrase", () => {
    assert.equal(isDismiss("no"), true);
    assert.equal(isDismiss("no, make it 4 hours"), false);
  });

  it("sends 6 hours at $140 to PayPal as 840.00", () => {
    assert.equal(checkoutAmount({ items: [{ name: "Design", quantity: 6, unitPrice: 140 }] }), "840.00");
  });

  it("rejects a zero price before PayPal", () => {
    assert.throws(
      () => checkoutAmount({ items: [{ name: "Design", quantity: 1, unitPrice: 0 }] }),
      /price is not allowed/,
    );
  });

  it("captures only an approved PayPal order", () => {
    assert.equal(payStep("APPROVED"), "capture");
    assert.equal(payStep("COMPLETED"), "done");
    assert.throws(() => payStep("CREATED"), /not approved/);
  });

  it("tells the model about open bills only, oldest first", () => {
    const rows = [
      invoice({ number: "PP-1042", recipientName: "Maya", recipientEmail: "maya@client.test", status: "paid", createdAt: "2026-01-01" }),
      invoice({ number: "PP-1044", recipientName: "Leo", recipientEmail: "leo@client.test", status: "sent", createdAt: "2026-02-01" }),
      invoice({ number: "PP-1043", recipientName: "Ann", recipientEmail: "ann@client.test", status: "sent", createdAt: "2026-01-15" }),
    ];
    assert.equal(oldestOpen(rows)?.number, "PP-1043");
    assert.match(ledgerBrief(rows), /^PP-1043 \| Ann/);
    assert.equal(ledgerBrief(rows).includes("Maya"), false);
    assert.deepEqual(
      commerceSteps({ status: "sent", paypalId: "ORDER1" }).map((step) => step.done),
      [true, true, true, false],
    );
    assert.equal(commerceSteps({ status: "paid", paypalId: "ORDER1" })[3].done, true);
    assert.equal(commerceSteps({ status: "cancelled" })[2].done, false);
  });

  it("reads the PayPal order id from a completed capture", () => {
    assert.equal(
      orderIdFromWebhook({
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { supplementary_data: { related_ids: { order_id: "ORDER1" } } },
      }),
      "ORDER1",
    );
    assert.equal(orderIdFromWebhook({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "ORDER1" } }), null);
  });
});

describe("webhook and model cap", () => {
  it("builds the webhook from the configured origin only", () => {
    assert.equal(webhookEndpoint("https://paypilot.example.com"), "https://paypilot.example.com/api/paypal/webhook");
    assert.equal(webhookEndpoint("https://paypilot.example.com/"), "https://paypilot.example.com/api/paypal/webhook");
    assert.throws(() => webhookEndpoint("http://paypilot.example.com"), /https/);
    assert.throws(() => webhookEndpoint("https://localhost"), /public host/);
    assert.throws(() => webhookEndpoint("https://paypilot.example.com/hook"), /origin/);
    assert.throws(() => webhookEndpoint(undefined), /APP_PUBLIC_URL/);
  });

  it("allows only the configured admin address", () => {
    assert.equal(isPayPalAdmin("Owner@Example.com", "owner@example.com"), true);
    assert.equal(isPayPalAdmin("member@example.com", "owner@example.com"), false);
    assert.equal(isPayPalAdmin("owner@example.com", ""), false);
    assert.equal(isPayPalAdmin("owner@example.com", undefined), false);
  });

  it("stops counting once the daily cap is reached", () => {
    assert.equal(withinDailyCap(1), true);
    assert.equal(withinDailyCap(MODEL_CALL_CAP), true);
    assert.equal(withinDailyCap(MODEL_CALL_CAP + 1), false);
    assert.equal(withinDailyCap(undefined), false);
  });

  it("allocates the next bill number once, then the one after", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    await db.exec(`
      create table paypilot_invoice (
        id text primary key,
        team_id text not null,
        number text not null,
        unique (team_id, number)
      );
      create table paypilot_number (
        team_id text primary key,
        next_n integer not null
      );
      insert into paypilot_invoice (id, team_id, number) values ('a', 'team', 'PP-1044');
    `);
    const first = await db.query<{ next_n: number }>(ALLOCATE_NUMBER_SQL, ["team"]);
    const second = await db.query<{ next_n: number }>(ALLOCATE_NUMBER_SQL, ["team"]);
    assert.equal(invoiceNumber(first.rows[0].next_n), "PP-1045");
    assert.equal(invoiceNumber(second.rows[0].next_n), "PP-1046");
    const together = await Promise.all([
      db.query<{ next_n: number }>(ALLOCATE_NUMBER_SQL, ["team"]),
      db.query<{ next_n: number }>(ALLOCATE_NUMBER_SQL, ["team"]),
    ]);
    const handed = together.map((result) => result.rows[0].next_n).sort((a, b) => a - b);
    assert.deepEqual(handed, [1047, 1048]);

    await db.exec(`
      create table paypilot_model_use (
        user_id text not null,
        day text not null,
        calls integer not null,
        primary key (user_id, day)
      );
    `);
    const day = "2026-11-06";
    await db.query(RESERVE_CALL_SQL, ["user", day, MODEL_CALL_CAP]);
    await db.query(`update paypilot_model_use set calls = $1 where user_id = $2`, [MODEL_CALL_CAP, "user"]);
    const blocked = await db.query<{ calls: number }>(RESERVE_CALL_SQL, ["user", day, MODEL_CALL_CAP]);
    assert.equal(blocked.rows.length, 0);
    const kept = await db.query<{ calls: number }>(`select calls from paypilot_model_use where user_id = $1`, ["user"]);
    assert.equal(kept.rows[0].calls, MODEL_CALL_CAP);
    await db.close();
  });
});

