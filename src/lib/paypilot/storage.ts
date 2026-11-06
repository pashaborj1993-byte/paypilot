import type { ChatMessage } from "./types";

const CHAT_KEY = "paypilot-chat-v1";

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

function write(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

const LOGO_KEY = "paypilot-logo-v1";
const LOGO = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;

export function loadLogo() {
  const value = read<string>(LOGO_KEY, "");
  return LOGO.test(value) ? value : "";
}

export function saveLogo(dataUrl: string) {
  write(LOGO_KEY, LOGO.test(dataUrl) ? dataUrl : "");
}

