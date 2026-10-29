import { createServerFn } from "@tanstack/react-start";
import { localInterpret } from "./interpret";
import { MODEL_CALL_CAP } from "./storage";
import type { AgentResult, Draft, LineItem } from "./types";

const SYSTEM = `You are PayPilot, a calm freelancer payments assistant.
Return ONLY JSON, no markdown:
{"reply":"one or two short sentences","action":"none"|"draft"|"remind"|"mark_paid"|"cancel","targetHint":"","draft":null}
When action is draft, draft must be:
{"recipientEmail":"","recipientName":"","currency":"USD","note":"","items":[{"name":"","quantity":1,"unitPrice":0}]}
Rules:
- Draft only when the user is asking to bill or invoice someone.
- Numbers must be numeric. Currency is always USD.
- If they give a name and no email, use firstname.lastname@client.test.
- remind / mark_paid / cancel: draft is null and targetHint is the email, name, or invoice number.
- Never say money has already moved. Approval happens outside this reply.
- reply is plain language, no emoji.`;

export const interpretRequest = createServerFn({ method: "POST" })
  .validator((input: { text: string; calls?: number }) => {
    const text = input?.text?.trim() ?? "";
    if (!text || text.length > 800) {
      throw new Error("Write a short request, under 800 characters.");
    }
    const calls = Number(input?.calls ?? 0);
    if (!Number.isFinite(calls) || calls < 0) {
      throw new Error("Write a short request, under 800 characters.");
    }
    return { text, calls };
  })
  .handler(async ({ data }): Promise<AgentResult> => {
    // shortcut: the cap trusts the browser's own count. A forged count or a new browser starts over. Upgrade to an account cap before this key is shared widely.
    if (data.calls >= MODEL_CALL_CAP) return localInterpret(data.text);

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return localInterpret(data.text);

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: data.text },
          ],
        }),
      });

      if (!res.ok) return { ...localInterpret(data.text), error: `Model unavailable (${res.status}). Used a local draft.` };

      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const parsed = parseAgentJson(body.choices?.[0]?.message?.content ?? "");
      if (!parsed) return localInterpret(data.text);
      return { ...parsed, ok: true, source: "grok" };
    } catch {
      return localInterpret(data.text);
    }
  });

function parseAgentJson(raw: string): Omit<AgentResult, "ok" | "source"> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as {
      reply?: string;
      action?: AgentResult["action"];
      targetHint?: string;
      draft?: Draft | null;
    };
    const action = value.action ?? "none";
    const draft = action === "draft" ? sanitizeDraft(value.draft) : null;
    if (action === "draft" && !draft) return null;
    return {
      reply: (value.reply || "Here's what I understood.").slice(0, 400),
      action: draft ? "draft" : action,
      targetHint: (value.targetHint ?? "").slice(0, 160),
      draft,
    };
  } catch {
    return null;
  }
}

function sanitizeDraft(draft: Draft | null | undefined): Draft | null {
  if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) return null;
  const items = draft.items
    .slice(0, 6)
    .map((item) => cleanLine(item))
    .filter((item) => item !== null);
  if (!items.length) return null;
  const recipientName = String(draft.recipientName || "Client").slice(0, 80);
  const email = String(draft.recipientEmail || "").trim();
  return {
    recipientName,
    recipientEmail: email.includes("@")
      ? email.slice(0, 120)
      : `${recipientName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@client.test`,
    currency: "USD",
    note: String(draft.note || "Thanks for the work together.").slice(0, 180),
    items,
  };
}

function cleanLine(item: { name?: string; quantity?: number; unitPrice?: number }): LineItem | null {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) return null;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1_000_000) return null;
  return {
    name: String(item.name || "Service").slice(0, 80),
    quantity,
    unitPrice,
  };
}
