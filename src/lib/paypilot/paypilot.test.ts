import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApproval, isListRequest } from "./interpret.ts";
import { findInvoice } from "./match.ts";
import { draftTotal } from "./money.ts";
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
});
