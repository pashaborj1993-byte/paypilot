export type LineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceStatus = "sent" | "reminded" | "paid" | "cancelled";

export type Invoice = {
  id: string;
  number: string;
  recipientEmail: string;
  recipientName: string;
  items: LineItem[];
  currency: string;
  note: string;
  status: InvoiceStatus;
  createdAt: string;
  remindedAt?: string;
  paidAt?: string;
  paypalId?: string;
  paypalUrl?: string;
};

export type Draft = {
  recipientEmail: string;
  recipientName: string;
  currency: string;
  note: string;
  items: LineItem[];
};

export type AgentAction = "none" | "draft" | "remind" | "mark_paid" | "cancel";

export type AgentResult = {
  ok: boolean;
  reply: string;
  action: AgentAction;
  targetHint: string;
  draft: Draft | null;
  source: "grok" | "local";
  error?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  draft?: Draft;
  draftState?: "pending" | "sent" | "dismissed";
  invoiceNumber?: string;
};
