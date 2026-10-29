import type { Draft, Invoice, LineItem } from "./types";

export function lineTotal(item: LineItem) {
  return roundMoney(item.quantity * item.unitPrice);
}

export function draftTotal(draft: Pick<Draft, "items">) {
  return roundMoney(draft.items.reduce((sum, item) => sum + lineTotal(item), 0));
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function outstanding(invoices: Invoice[]) {
  return roundMoney(
    invoices
      .filter((invoice) => invoice.status === "sent" || invoice.status === "reminded")
      .reduce((sum, invoice) => sum + draftTotal(invoice), 0),
  );
}

export function nextNumber(invoices: Invoice[]) {
  const used = invoices
    .map((invoice) => Number(invoice.number.replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value));
  const next = (used.length ? Math.max(...used) : 1040) + 1;
  return `PP-${next}`;
}
