import { readFileSync } from "node:fs";
import { checkoutAmount, payStep } from "./money";
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

async function paypal(
  token: string,
  method: string,
  path: string,
  payload?: unknown,
  extra?: Record<string, string>,
): Promise<PayPalBody> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra,
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

export async function createCheckout(draft: Draft, number: string, requestId: string) {
  const token = await accessToken();
  const order = await paypal(token, "POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        description: `${number} for ${draft.recipientName}`.slice(0, 127),
        custom_id: draft.recipientEmail.slice(0, 127),
        amount: { currency_code: "USD", value: checkoutAmount(draft) },
      },
    ],
  }, { "PayPal-Request-Id": requestId });
  const url = order.links?.find((link) => link.rel === "approve")?.href || "";
  if (!order.id || !url) throw new Error("PayPal did not return a checkout link.");
  return { id: order.id, url };
}

export async function capturePaid(paypalId: string) {
  const token = await accessToken();
  const path = `/v2/checkout/orders/${encodeURIComponent(paypalId)}`;
  const order = await paypal(token, "GET", path);
  if (payStep(order.status) === "capture") {
    const captured = await paypal(token, "POST", `${path}/capture`, {}, { "PayPal-Request-Id": `capture-${paypalId}` });
    if (captured.status !== "COMPLETED") throw new Error("PayPal has not completed this payment.");
  }
  return { ok: true };
}

export async function orderStatus(paypalId: string) {
  const token = await accessToken();
  const order = await paypal(token, "GET", `/v2/checkout/orders/${encodeURIComponent(paypalId)}`);
  return { status: order.status || "UNKNOWN" };
}

export async function deleteWebhook(id: string) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v1/notifications/webhooks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`PayPal did not remove the previous webhook (${res.status}).`);
  }
}

export async function registerWebhook(url: string) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v1/notifications/webhooks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      event_types: [{ name: "PAYMENT.CAPTURE.COMPLETED" }, { name: "CHECKOUT.ORDER.COMPLETED" }],
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; details?: { description?: string }[] };
  if (!res.ok || !body.id) {
    throw new Error(body.details?.[0]?.description || body.message || `PayPal did not register the webhook (${res.status}).`);
  }
  return { id: body.id };
}

export async function verifyWebhook(headers: Headers, event: unknown, webhookId: string) {
  const token = await accessToken();
  const res = await fetch(`${BASE}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { verification_status?: string };
  return res.ok && body.verification_status === "SUCCESS";
}
