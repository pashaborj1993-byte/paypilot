import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name: name || email, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Sign-in failed.");
      return;
    }
    window.location.assign("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-3xl text-ink">
          <span>Pay</span>
          <span className="text-sky">Pilot</span>
        </h1>
        <p className="text-sm text-muted">One account. One team. The ledger lives on the server.</p>
        <form className="space-y-2" onSubmit={(event) => void submit(event)}>
          {mode === "up" ? (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-sm"
            />
          ) : null}
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="h-11 w-full rounded-[12px] border border-line bg-surface px-3 text-sm"
          />
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <button type="submit" disabled={busy} className="h-11 w-full rounded-[12px] bg-accent text-sm font-medium text-accent-fg disabled:opacity-40">
            {busy ? "Working…" : mode === "up" ? "Create account" : "Sign in"}
          </button>
        </form>
        <button type="button" className="text-sm text-muted" onClick={() => setMode(mode === "up" ? "in" : "up")}>
          {mode === "up" ? "I already have an account" : "Create an account"}
        </button>
        <div className="space-y-2">
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
              className="h-11 w-full rounded-[12px] border border-line text-sm text-ink"
            >
              Continue with {provider.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
