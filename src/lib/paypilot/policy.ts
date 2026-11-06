/** Public webhook URL. Request headers are not a source for this. */
export function webhookEndpoint(publicUrl: string | undefined): string {
  const raw = publicUrl?.trim() ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Set APP_PUBLIC_URL to the public https origin. The app does not trust the request host.");
  }
  if (url.protocol !== "https:") throw new Error("APP_PUBLIC_URL must start with https://.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
    throw new Error("APP_PUBLIC_URL must be a public host.");
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("APP_PUBLIC_URL must be an origin, with no path.");
  }
  return `${url.origin}/api/paypal/webhook`;
}

/** One configured address. An empty setting means nobody can register. */
export function isPayPalAdmin(email: string, adminEmail: string | undefined) {
  const admin = adminEmail?.trim().toLowerCase() ?? "";
  return admin.length > 0 && email.trim().toLowerCase() === admin;
}
