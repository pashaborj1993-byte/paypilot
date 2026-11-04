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
  return named.length === 1 ? named[0] : undefined;
}

function nameInHint(hint: string, name: string) {
  const clean = name.trim().toLowerCase();
  if (clean.length < 2) return false;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`).test(hint);
}
