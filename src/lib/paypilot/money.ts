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

export function checkoutAmount(draft: Pick<Draft, "items">) {
  for (const item of draft.items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
      throw new Error("That quantity is not allowed.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1_000_000) {
      throw new Error("That price is not allowed.");
    }
  }
  const total = draftTotal(draft);
  if (!Number.isFinite(total) || total <= 0) throw new Error("That price is not allowed.");
  return total.toFixed(2);
}

export function payStep(status: string | undefined): "capture" | "done" {
  if (status === "APPROVED") return "capture";
  if (status === "COMPLETED") return "done";
  throw new Error("The payer has not approved this in PayPal yet.");
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
