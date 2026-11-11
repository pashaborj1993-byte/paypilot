import type { Invoice } from "./types";

function isOpen(invoice: Invoice) {
  return invoice.status === "sent" || invoice.status === "reminded";
}

export function findInvoice(invoices: Invoice[], hint: string): Invoice | undefined {
  const needle = hint.trim().toLowerCase();
  if (!needle) return undefined;

  const exact = invoices.find(
    (invoice) =>
      invoice.number.toLowerCase() === needle || invoice.recipientEmail.toLowerCase() === needle,
  );
  if (exact) return exact;

  const email = needle.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0];
  if (email) {
    const hit = invoices.find((invoice) => invoice.recipientEmail.toLowerCase() === email);
    if (hit) return hit;
  }

  const number = needle.match(/\bpp-\d+\b/)?.[0];
  if (number) {
    const hit = invoices.find((invoice) => invoice.number.toLowerCase() === number);
    if (hit) return hit;
  }

  const open = invoices.filter(isOpen);
  const named = open.filter((invoice) => nameInHint(needle, invoice.recipientName));
  if (named.length === 1) return named[0];
  if (named.length > 1) return undefined;
  return uniqueFirstName(open, needle);
}

const NAME_STOP = new Set([
  "remind",
  "the",
  "invoice",
  "bill",
  "mark",
  "marked",
  "paid",
  "please",
  "this",
  "that",
  "cancel",
  "chase",
  "unpaid",
  "open",
  "for",
  "and",
  "with",
  "client",
]);

function uniqueFirstName(invoices: Invoice[], hint: string) {
  const tokens = (hint.match(/[a-z][a-z'-]*/g) ?? []).filter((token) => !NAME_STOP.has(token));
  const hits = invoices.filter((invoice) => {
    const parts = invoice.recipientName.toLowerCase().split(/\s+/);
    return tokens.some((token) => parts.includes(token));
  });
  return hits.length === 1 ? hits[0] : undefined;
}

export function homeTeamId(
  memberships: { teamId: string; userId: string | null; role: string }[],
  userId: string,
) {
  return memberships
    .filter((row) => row.userId === userId)
    .sort((a, b) => Number(a.role !== "owner") - Number(b.role !== "owner") || a.teamId.localeCompare(b.teamId))[0]?.teamId;
}

export function canFollowUp(status: Invoice["status"], next: "reminded" | "cancelled" | "paid") {
  if (next === "paid") return true;
  return status === "sent" || status === "reminded";
}

function nameInHint(hint: string, name: string) {
  const clean = name.trim().toLowerCase();
  if (clean.length < 2) return false;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`).test(hint);
}
