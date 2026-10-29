import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { interpretRequest } from "@/lib/paypilot/agent";
import { isApproval, isDismiss, isListRequest, localInterpret } from "@/lib/paypilot/interpret";
import { recordPayPalInvoice, paypalFollowUp } from "@/lib/paypilot/paypal";
import { printInvoice } from "@/lib/paypilot/invoice-doc";
import { findInvoice } from "@/lib/paypilot/match";
import { draftTotal, formatMoney, nextNumber, outstanding } from "@/lib/paypilot/money";
import {
  loadChat,
  loadLedger,
  loadLogo,
  loadModelCalls,
  MODEL_CALL_CAP,
  saveChat,
  saveLedger,
  saveLogo,
  saveModelCalls,
} from "@/lib/paypilot/storage";
import type { ChatMessage, Draft, Invoice, InvoiceStatus } from "@/lib/paypilot/types";

const SUGGESTIONS = [
  "Invoice Maya Chen for 6 hours of brand design at $140",
  "Bill leo@northline.test $900 for a landing page",
  "What's still unpaid?",
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Tell me who to bill. I'll draft the invoice here, and it only hits the sandbox ledger after you approve it.",
};

export function PayPilotDesk() {
  const [ready, setReady] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<"chat" | "ledger">("chat");
  const [error, setError] = useState("");
  const [logo, setLogo] = useState("");
  const interpret = useServerFn(interpretRequest);
  const saveToPayPal = useServerFn(recordPayPalInvoice);
  const updatePayPal = useServerFn(paypalFollowUp);
  const threadRef = useRef<HTMLDivElement>(null);
  const approving = useRef(new Set<string>());
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedChat = loadChat();
    setInvoices(loadLedger().map((invoice) => ({ ...invoice, currency: "USD" })));
    setMessages(storedChat.length ? storedChat : [WELCOME]);
    setLogo(loadLogo());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveLedger(invoices);
  }, [invoices, ready]);

  useEffect(() => {
    if (!ready) return;
    saveChat(messages);
  }, [messages, ready]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const openTotal = useMemo(() => outstanding(invoices), [invoices]);
  const openCount = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "reminded").length;

  function push(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function updateMessage(id: string, patch: Partial<ChatMessage>) {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch } : message)));
  }

  async function approve(messageId: string, pending: Draft) {
    if (approving.current.has(messageId)) return;
    const current = messages.find((message) => message.id === messageId);
    if (current?.draftState === "sent") return;
    approving.current.add(messageId);
    setBusy(true);
    setError("");
    try {
      const number = nextNumber(invoices);
      const paypal = await saveToPayPal({ data: { draft: pending, number } });
      const invoice: Invoice = {
        id: crypto.randomUUID(),
        number,
        recipientEmail: pending.recipientEmail,
        recipientName: pending.recipientName,
        items: pending.items,
        currency: "USD",
        note: pending.note,
        status: "sent",
        createdAt: new Date().toISOString(),
        paypalId: paypal.id,
        paypalUrl: paypal.url,
      };
      setInvoices((rows) => [invoice, ...rows]);
      updateMessage(messageId, { draftState: "sent", invoiceNumber: invoice.number });
      push({
        id: crypto.randomUUID(),
        role: "assistant",
        text: `${invoice.number} is a PayPal sandbox checkout for ${invoice.recipientName} — ${formatMoney(draftTotal(invoice), "USD")}. Open it from the ledger.`,
      });
    } catch (cause) {
      approving.current.delete(messageId);
      setError(cause instanceof Error ? cause.message : "PayPal could not create the invoice.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss(messageId: string) {
    updateMessage(messageId, { draftState: "dismissed" });
    push({
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Discarded. Nothing was recorded.",
    });
  }

  async function applyStatus(status: InvoiceStatus, hint: string, verb: string) {
    const match = findInvoice(invoices, hint);
    if (!match) {
      push({
        id: crypto.randomUUID(),
        role: "assistant",
        text: "I couldn't match that to an invoice. Use a name, email, or number like PP-1041.",
      });
      return;
    }
    if (match.paypalId && status === "paid") {
      setBusy(true);
      setError("");
      try {
        await updatePayPal({
          data: {
            action: "paid",
            paypalId: match.paypalId,
          },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "PayPal could not update that invoice.");
        return;
      } finally {
        setBusy(false);
      }
    }
    setInvoices((current) =>
      current.map((invoice) =>
        invoice.id === match.id
          ? {
              ...invoice,
              status,
              remindedAt: status === "reminded" ? new Date().toISOString() : invoice.remindedAt,
              paidAt: status === "paid" ? new Date().toISOString() : invoice.paidAt,
            }
          : invoice,
      ),
    );
    push({
      id: crypto.randomUUID(),
      role: "assistant",
      text: `${match.number} for ${match.recipientName} is now ${verb}.`,
    });
  }

  async function submit(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setError("");
    setDraft("");
    setPane("chat");
    push({ id: crypto.randomUUID(), role: "user", text: clean });

    const pending = [...messages].reverse().find((message) => message.draft && message.draftState === "pending");
    if (pending?.draft && isApproval(clean)) {
      approve(pending.id, pending.draft);
      return;
    }
    if (pending && isDismiss(clean)) {
      dismiss(pending.id);
      return;
    }

    if (isListRequest(clean)) {
      const open = invoices.filter((invoice) => invoice.status === "sent" || invoice.status === "reminded");
      push({
        id: crypto.randomUUID(),
        role: "assistant",
        text: open.length
          ? `${open.length} open, ${formatMoney(outstanding(invoices))} outstanding. ${open
              .slice(0, 3)
              .map((invoice) => `${invoice.number} ${invoice.recipientName}`)
              .join(", ")}.`
          : "Nothing is open. Draft one and I'll hold it until you approve.",
      });
      return;
    }

    setBusy(true);
    try {
      const calls = loadModelCalls();
      const result =
        calls >= MODEL_CALL_CAP
          ? localInterpret(clean)
          : await interpret({ data: { text: clean, calls: calls + 1 } });
      if (calls < MODEL_CALL_CAP) saveModelCalls(calls + 1);
      if (result.action === "draft" && result.draft) {
        push({
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.reply,
          draft: result.draft,
          draftState: "pending",
        });
        return;
      }
      if (result.action === "remind") {
        applyStatus("reminded", result.targetHint || clean, "reminded");
        return;
      }
      if (result.action === "mark_paid") {
        applyStatus("paid", result.targetHint || clean, "paid");
        return;
      }
      if (result.action === "cancel") {
        applyStatus("cancelled", result.targetHint || clean, "cancelled");
        return;
      }
      push({ id: crypto.randomUUID(), role: "assistant", text: result.reply });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="rise mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-4 md:px-6 md:py-6">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">Sandbox ledger</p>
          <h1 className="font-display text-3xl leading-none tracking-tight">
            <span className="text-ink">Pay</span>
            <span className="text-sky">Pilot</span>
          </h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg text-ink tabular-nums">{formatMoney(openTotal)}</p>
          <p className="text-sm text-muted">{openCount} open</p>
        </div>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 md:hidden">
        <PaneButton active={pane === "chat"} onClick={() => setPane("chat")} label="Chat" />
        <PaneButton active={pane === "ledger"} onClick={() => setPane("ledger")} label="Ledger" />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <section
          className={`flex min-h-[70vh] flex-col rounded-[28px] border border-line bg-surface p-3 md:min-h-[640px] md:p-4 ${pane === "ledger" ? "hidden md:flex" : "flex"}`}
        >
          <div ref={threadRef} className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`msg ${message.role === "user" ? "ml-8 self-end md:ml-16" : "mr-6 self-start md:mr-12"}`}
              >
                <p
                  className={
                    message.role === "user"
                      ? "rounded-[18px] bg-accent px-4 py-3 text-sm text-accent-fg"
                      : "rounded-[18px] bg-surface-2 px-4 py-3 text-sm text-ink"
                  }
                >
                  {message.text}
                </p>
                {message.draft && message.draftState === "pending" ? (
                  <DraftCard
                    draft={message.draft}
                    onApprove={() => approve(message.id, message.draft!)}
                    onDismiss={() => dismiss(message.id)}
                  />
                ) : null}
                {message.draftState === "sent" && message.invoiceNumber ? (
                  <p className="mt-2 text-xs text-muted">Recorded as {message.invoiceNumber}</p>
                ) : null}
              </article>
            ))}
            {busy ? <p className="drafting text-sm text-muted">Drafting…</p> : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void submit(suggestion)}
                className="rounded-full border border-line bg-bg px-3 py-2 text-left text-xs text-muted transition-opacity hover:opacity-80"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(draft);
            }}
          >
            <label className="sr-only" htmlFor="request">
              Request
            </label>
            <input
              id="request"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Invoice someone…"
              className="h-12 min-w-0 flex-1 rounded-[14px] border border-line bg-bg px-4 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="h-12 rounded-[14px] bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
            >
              Send
            </button>
          </form>
          {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
          <p className="mt-2 text-xs text-faint">
            Approving creates a PayPal sandbox checkout. It does not move live money.
          </p>
        </section>

        <aside className={`flex flex-col gap-3 ${pane === "chat" ? "hidden md:flex" : "flex"}`}>
          <div className="rounded-[28px] border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-ink">Ledger</h2>
                <p className="mt-1 text-sm text-muted">Sent invoices stay here until you remind, collect, or cancel.</p>
              </div>
              {logo ? <img src={logo} alt="" className="h-12 w-12 rounded-[8px] object-contain" /> : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                className="h-10 rounded-[10px] border border-line px-3 text-xs text-ink"
              >
                {logo ? "Change logo" : "Add logo"}
              </button>
              {logo ? (
                <button type="button" onClick={() => { setLogo(""); saveLogo(""); }} className="h-10 px-3 text-xs text-muted">
                  Remove
                </button>
              ) : null}
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.size > 120_000) {
                  setError("Logo must be under 120KB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const value = typeof reader.result === "string" ? reader.result : "";
                  if (!value.startsWith("data:image/")) {
                    setError("Use a PNG, JPEG, GIF, or WebP logo.");
                    return;
                  }
                  setLogo(value);
                  saveLogo(value);
                  setError("");
                };
                reader.readAsDataURL(file);
              }}
            />
          </div>
          {invoices.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-line px-4 py-8 text-sm text-muted">
              No invoices yet. Approve a draft and it will land here.
            </div>
          ) : (
            invoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onRemind={() => applyStatus("reminded", invoice.number, "reminded")}
                onPaid={() => applyStatus("paid", invoice.number, "paid")}
                onCancel={() => applyStatus("cancelled", invoice.number, "cancelled")}
                onDownload={() => printInvoice(invoice, logo)}
              />
            ))
          )}
        </aside>
      </div>
    </main>
  );
}

function PaneButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-[14px] text-sm font-medium ${active ? "bg-accent text-accent-fg" : "border border-line bg-surface text-ink"}`}
    >
      {label}
    </button>
  );
}

function DraftCard({
  draft,
  onApprove,
  onDismiss,
}: {
  draft: Draft;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="card mt-2 w-full max-w-md rounded-[20px] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{draft.recipientName}</p>
          <p className="text-xs text-muted">{draft.recipientEmail}</p>
        </div>
        <p className="font-mono text-sm text-ink tabular-nums">{formatMoney(draftTotal(draft), draft.currency)}</p>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-ink">
        {draft.items.map((item) => (
          <li key={`${item.name}-${item.unitPrice}`} className="flex justify-between gap-3">
            <span>
              {item.name}
              <span className="text-muted"> × {item.quantity}</span>
            </span>
            <span className="font-mono tabular-nums">{formatMoney(item.quantity * item.unitPrice, draft.currency)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">{draft.note}</p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onApprove} className="h-11 flex-1 rounded-[12px] bg-accent text-sm font-medium text-accent-fg">
          Approve
        </button>
        <button type="button" onClick={onDismiss} className="h-11 rounded-[12px] border border-line px-4 text-sm text-ink">
          Discard
        </button>
      </div>
    </div>
  );
}

function InvoiceCard({
  invoice,
  onRemind,
  onPaid,
  onCancel,
  onDownload,
}: {
  invoice: Invoice;
  onRemind: () => void;
  onPaid: () => void;
  onCancel: () => void;
  onDownload: () => void;
}) {
  const closed = invoice.status === "paid" || invoice.status === "cancelled";
  return (
    <article className="card rounded-[20px] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{invoice.number}</p>
          <p className="text-sm font-medium text-ink">{invoice.recipientName}</p>
        </div>
        <StatusPill status={invoice.status} />
      </div>
      <p className="mt-2 font-mono text-sm tabular-nums text-ink">{formatMoney(draftTotal(invoice), "USD")}</p>
      {invoice.paypalUrl ? (
        <a href={invoice.paypalUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-accent">
          Open in PayPal
        </a>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onDownload} className="h-10 rounded-[10px] border border-line px-3 text-xs text-ink">
          Download
        </button>
        {closed ? null : (
          <>
            <button type="button" onClick={onRemind} className="h-10 rounded-[10px] border border-line px-3 text-xs text-ink">
              Remind
            </button>
            <button type="button" onClick={onPaid} className="h-10 rounded-[10px] border border-line px-3 text-xs text-ink">
              Mark paid
            </button>
            <button type="button" onClick={onCancel} className="h-10 rounded-[10px] px-3 text-xs text-bad">
              Cancel
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const tone =
    status === "paid"
      ? "text-good"
      : status === "cancelled"
        ? "text-bad"
        : status === "reminded"
          ? "text-warn"
          : "text-accent";
  return <span className={`text-xs font-medium capitalize ${tone}`}>{status}</span>;
}
