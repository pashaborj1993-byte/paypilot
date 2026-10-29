import { readFileSync } from "node:fs";
import { draftTotal } from "./money";
import type { Draft } from "./types";

const BASE = "https://api-m.sandbox.paypal.com";

type PayPalBody = {
  id?: string;
  status?: string;
  message?: string;
  links?: { href?: string; rel?: string }[];
  details?: { description?: string }[];
};

function envValue(key: string) {
  const current = process.env[key]?.trim();
  if (current) return current;
  try {
    const line = readFileSync(".env", "utf8")
      .split("\n")
      .find((row) => row.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim() || "";
  } catch {
    return "";
  }
}

async function accessToken() {
  const id = envValue("PAYPAL_CLIENT_ID");
  const secret = envValue("PAYPAL_CLIENT_SECRET");
  if (!id || !secret) throw new Error("PayPal sandbox credentials are missing on the server.");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description || `PayPal login failed (${res.status}).`);
  }
  return body.access_token;
}

async function paypal(token: string, method: string, path: string, payload?: unknown): Promise<PayPalBody> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let body: PayPalBody = {};
  try {
    body = text ? (JSON.parse(text) as PayPalBody) : {};
  } catch {
    if (!res.ok) throw new Error(`PayPal request failed (${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(body.details?.[0]?.description || body.message || `PayPal request failed (${res.status}).`);
  }
  return body;
}

export async function createCheckout(draft: Draft, number: string) {
  const token = await accessToken();
  const order = await paypal(token, "POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        invoice_id: number,
        description: `${number} for ${draft.recipientName}`.slice(0, 127),
        custom_id: draft.recipientEmail.slice(0, 127),
        amount: { currency_code: "USD", value: draftTotal(draft).toFixed(2) },
      },
    ],
  });
  const url = order.links?.find((link) => link.rel === "approve")?.href || "";
  if (!order.id || !url) throw new Error("PayPal did not return a checkout link.");
  return { id: order.id, url, sent: true, sendError: "" };
}

export async function capturePaid(paypalId: string) {
  const token = await accessToken();
  const path = `/v2/checkout/orders/${encodeURIComponent(paypalId)}`;
  const order = await paypal(token, "GET", path);
  if (order.status === "APPROVED") {
    const captured = await paypal(token, "POST", `${path}/capture`, {});
    if (captured.status !== "COMPLETED") throw new Error("PayPal has not completed this payment.");
    return { ok: true };
  }
  if (order.status !== "COMPLETED") throw new Error("The payer has not approved this in PayPal yet.");
  return { ok: true };
}
