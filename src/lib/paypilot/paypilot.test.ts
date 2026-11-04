import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApproval, isDismiss, isListRequest } from "./interpret.ts";
import { canFollowUp, findInvoice } from "./match.ts";
import { checkoutAmount, draftTotal, ledgerBrief, oldestOpen, payStep } from "./money.ts";
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
