import type { ChatMessage, Invoice } from "./types";

const LEDGER_KEY = "paypilot-ledger-v1";
const CHAT_KEY = "paypilot-chat-v1";

export function loadLedger(): Invoice[] {
  return read<Invoice[]>(LEDGER_KEY, []);
}

export function saveLedger(invoices: Invoice[]) {
  write(LEDGER_KEY, invoices);
}

export function loadChat(): ChatMessage[] {
  return read<ChatMessage[]>(CHAT_KEY, []);
}

export function saveChat(messages: ChatMessage[]) {
  const pending = messages.filter((message) => message.draft && message.draftState === "pending");
  const tail = messages.slice(-40);
  const missing = pending.filter((message) => !tail.some((kept) => kept.id === message.id));
  write(CHAT_KEY, [...missing, ...tail]);
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const CALLS_KEY = "paypilot-model-calls-v1";
const LOGO_KEY = "paypilot-logo-v1";

export const MODEL_CALL_CAP = 20;

export function loadModelCalls() {
  const value = Number(read<number>(CALLS_KEY, 0));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveModelCalls(count: number) {
  write(CALLS_KEY, count);
}

const LOGO = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export function loadLogo() {
  const value = read<string>(LOGO_KEY, "");
  return LOGO.test(value) ? value : "";
}

export function saveLogo(dataUrl: string) {
  write(LOGO_KEY, LOGO.test(dataUrl) ? dataUrl : "");
}

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}
