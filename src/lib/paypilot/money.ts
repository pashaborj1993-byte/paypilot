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

export function oldestOpen(invoices: Invoice[]) {
  return invoices
    .filter((invoice) => invoice.status === "sent" || invoice.status === "reminded")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

export function commerceSteps(invoice: Pick<Invoice, "status" | "paypalId">) {
  const cancelled = invoice.status === "cancelled";
  return [
    { label: "Grok drafted", done: true },
    { label: "You approved", done: !cancelled },
    { label: "PayPal checkout", done: Boolean(invoice.paypalId) && !cancelled },
    { label: "Paid by PayPal", done: invoice.status === "paid" },
  ];
}

export function ledgerBrief(invoices: Invoice[]) {
  return invoices
    .filter((invoice) => invoice.status === "sent" || invoice.status === "reminded")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 8)
    .map(
      (invoice) =>
        `${invoice.number} | ${invoice.recipientName} | ${invoice.recipientEmail} | ${invoice.status} | ${draftTotal(invoice)} | ${invoice.createdAt}`,
    )
    .join("\n")
    .slice(0, 1500);
}
