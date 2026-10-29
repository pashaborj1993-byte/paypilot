import { draftTotal, formatMoney } from "./money";
import type { Invoice } from "./types";

export function printInvoice(invoice: Invoice, logo: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc || !iframe.contentWindow) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(invoiceHtml(invoice, logo));
  doc.close();
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  window.setTimeout(() => iframe.remove(), 1000);
}

function invoiceHtml(invoice: Invoice, logo: string) {
  const rows = invoice.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(String(item.quantity))}</td>
        <td>${escapeHtml(formatMoney(item.unitPrice, "USD"))}</td>
        <td>${escapeHtml(formatMoney(item.quantity * item.unitPrice, "USD"))}</td>
      </tr>`,
    )
    .join("");
  const mark = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(logo)
    ? `<img src="${logo}" alt="" />`
    : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.number)}</title>
  <style>
    body { margin: 32px; color: #003087; font: 15px/1.45 "Segoe UI", sans-serif; }
    header { display: flex; justify-content: space-between; align-items: flex-start; }
    img { width: 72px; height: 72px; object-fit: contain; }
    h1 { font: 28px/1.1 "Segoe UI", sans-serif; margin: 0; color: #003087; }
    p { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #c5d4e4; }
    td:last-child, th:last-child { text-align: right; }
    .total { margin-top: 16px; text-align: right; font: 20px "Segoe UI", sans-serif; color: #0070ba; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(invoice.number)}</h1>
      <p>${escapeHtml(invoice.recipientName)}</p>
      <p>${escapeHtml(invoice.recipientEmail)}</p>
    </div>
    ${mark}
  </header>
  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">${escapeHtml(formatMoney(draftTotal(invoice), "USD"))}</p>
  <p>${escapeHtml(invoice.note)}</p>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}
