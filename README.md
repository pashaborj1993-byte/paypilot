# PayPilot

A freelancer says who to bill. Grok (`grok-4.5`) drafts the invoice and can see the open bills, so "what's unpaid?" names the oldest one to chase. Nothing is created until a person approves it. Approval opens a PayPal sandbox checkout and saves the bill on the server, on that person's team.

Sign in with email and a password, or with Google or X. The owner can invite a teammate by email. When that person signs in with the same email, they see the same ledger.

PayPal can mark a bill paid on its own. Set `APP_PUBLIC_URL` and `PAYPAL_ADMIN_EMAIL`, then use **Register PayPal webhook**. PayPal then calls `/api/paypal/webhook`. The call is checked with PayPal's signature. `PAYMENT.CAPTURE.COMPLETED` and `CHECKOUT.ORDER.COMPLETED` mark the matching bill paid. The app does not take the webhook host from the request.

Publishing this app provisions a free Neon Postgres database. In the sandbox preview the same tables use the local database, which resets when the preview process restarts.

PayPal credentials stay in `.env` (see `.env.example`). They are not in this repo. This app's PayPal permissions do not include the Invoicing product, so it uses Checkout orders.

## Demo video

Watch the full PayPilot demo: [PayPilot on YouTube](https://www.youtube.com/watch?v=5hz2C9kJWPw&feature=youtu.be).

## What is stored where

- The draft lives in the chat until Approve.
- The approved bill is stored on the server, scoped to the team.
- The payable order lives at PayPal. Creating it sends `PayPal-Request-Id` set to the bill's database id, so a retry of that same bill does not open a second checkout.
- Mark paid captures the order only after the payer has approved it.
- Check PayPal reads the order. The ledger is marked paid only when PayPal says `COMPLETED`.

## Run

You need Node 22+. Clone the repo, then:

```bash
cp .env.example .env
npm ci
npm run dev
```

Open http://localhost:8080. Create an account with email and a password. Google and X only work on the Grok preview or a deployed Grok app. Email and password work on localhost with no extra auth variables.

On any other host, set `BETTER_AUTH_URL` to that exact origin (for example `https://paypilot.example.com`) and set `BETTER_AUTH_SECRET` to a long random string. Without `BETTER_AUTH_URL`, sign-up is rejected because the app only trusts localhost and `*.grok-sandbox.com`.

Put these in `.env`:

| Name | Where it comes from | What breaks without it |
|---|---|---|
| `PAYPAL_CLIENT_ID` | PayPal Developer Dashboard → Apps & Credentials → Sandbox | Approve cannot open a checkout |
| `PAYPAL_CLIENT_SECRET` | Same app, Secret | Same |
| `PAYPAL_ENV` | `sandbox` | Do not change this for the demo |
| `XAI_API_KEY` | xAI console | The desk drafts with a local parser instead of Grok. Signed-in users get 20 Grok calls per UTC day. |
| `PAYPAL_ADMIN_EMAIL` | The email you sign in with | Only that address can register the webhook |
| `APP_PUBLIC_URL` | The public https origin, no path | Webhook registration is refused. The request host is ignored. |
| `PAYPAL_WEBHOOK_ID` | Leave empty | A value here blocks a new registration |
| `DATABASE_URL` | Leave empty | Empty uses the local database. A Neon URL uses Neon |
| `BETTER_AUTH_URL` | The public origin, if you are not on localhost | Sign-up returns "Invalid origin" |
| `BETTER_AUTH_SECRET` | A long random string, on that host | Sessions are not stable across restarts |

Try: “Invoice Maya Chen for 6 hours of brand design at $140”. Read the draft. Approve. PayPal sandbox opens the order. Nothing is sent to PayPal before Approve.

To pay it, open the approval link and sign in as the **sandbox personal account** from PayPal Developer Dashboard → Testing Tools → Sandbox Accounts. Do not use a live PayPal login. The business sandbox app above is the seller. The personal sandbox account is the buyer.

## Tools

- PayPal Checkout Orders v2 (sandbox): create order, capture after the payer approves, read order status, delete and replace the webhook, verify webhook signatures.
- Grok `grok-4.5` via `https://api.x.ai/v1/chat/completions`: turns one sentence into a draft and names the oldest unpaid bill. The open bills are read from the server, not from the browser. No sponsor tool is used. Sponsor tools are optional.


