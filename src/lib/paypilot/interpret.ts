import type { AgentResult, Draft, LineItem } from "./types";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const APPROVALS = new Set(["yes", "send it", "approve", "do it", "go ahead", "looks good"]);

export function isListRequest(text: string) {
  if (/\$\s*\d/.test(text) || /\d+(?:\.\d+)?\s*(?:hours?|hrs?)\b/i.test(text)) return false;
  return (
    /\b(list|show|what('s| is)|open|unpaid|outstanding|ledger|status)\b/i.test(text) &&
    /\b(invoice|bill|open|unpaid|outstanding|owe|ledger)\b/i.test(text)
  );
}

export function isApproval(text: string) {
  const clean = text.trim().toLowerCase().replace(/[.!]+$/, "");
  return APPROVALS.has(clean);
}

export function isDismiss(text: string) {
  return /^(no|nope|discard|cancel that|don't send|dont send|stop)\b/i.test(text.trim());
}

export function localInterpret(text: string): AgentResult {
  const draft = extractDraft(text);
  if (draft) {
    return {
      ok: true,
      source: "local",
      action: "draft",
      targetHint: "",
      draft,
      reply: `Draft ready for ${draft.recipientName || draft.recipientEmail}. Nothing is recorded until you approve it.`,
    };
  }

  if (/\bremind\b/i.test(text)) {
    return {
      ok: true,
      source: "local",
      action: "remind",
      targetHint: hint(text),
      draft: null,
      reply: "I'll mark a reminder on the matching open invoice.",
    };
  }

  if (/\b(mark|marked).*(paid)|paid in full|received payment\b/i.test(text)) {
    return {
      ok: true,
      source: "local",
      action: "mark_paid",
      targetHint: hint(text),
      draft: null,
      reply: "I'll mark the matching invoice paid.",
    };
  }

  if (/\bcancel\b/i.test(text)) {
    return {
      ok: true,
      source: "local",
      action: "cancel",
      targetHint: hint(text),
      draft: null,
      reply: "I'll cancel the matching invoice.",
    };
  }

  return {
    ok: true,
    source: "local",
    action: "none",
    targetHint: "",
    draft: null,
    reply:
      "Tell me who to bill, for what, and the amount. Example: invoice Maya Chen for 6 hours of brand design at $140.",
  };
}

function hint(text: string) {
  return text.match(EMAIL)?.[0] ?? text.match(/\bPP-\d+\b/i)?.[0] ?? text;
}

function extractDraft(text: string): Draft | null {
  const email = text.match(EMAIL)?.[0] ?? "";
  const money = [...text.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map((match) => Number(match[1]));
  const hours = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  const units = text.match(/(\d+(?:\.\d+)?)\s*(?:units?|days?|sessions?)\b/i);

  const named = text.match(/\b(?:invoice|bill|charge)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1] ?? "";

  const forWhat = text.match(/\bfor\s+(.+?)(?:\s+at\s+\$|\s+for\s+\$|$)/i)?.[1]?.replace(/\.$/, "").trim() ?? "";

  const quantity = hours ? Number(hours[1]) : units ? Number(units[1]) : 1;
  const unitPrice = hours && money.length ? money[money.length - 1] : money[0];

  if (!unitPrice || (!email && !named && !forWhat)) return null;

  const recipientName = named || (email ? email.split("@")[0] : "Client");
  const recipientEmail = email || `${slug(recipientName)}@client.test`;
  const itemName = cleanItem(forWhat, hours ? "Consulting" : "Project fee");

  const items: LineItem[] = [
    {
      name: itemName,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unitPrice,
    },
  ];

  return {
    recipientEmail,
    recipientName,
    currency: "USD",
    note: "Thanks for the work together.",
    items,
  };
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "client";
}

function cleanItem(value: string, fallback: string) {
  const trimmed = value.replace(/^\d+(?:\.\d+)?\s*(hours?|hrs?|units?)\s+(of\s+)?/i, "").trim();
  if (!trimmed || trimmed.length > 80) return fallback;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
