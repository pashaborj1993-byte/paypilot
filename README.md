# PayPilot

A freelancer says who to bill. Grok (`grok-4.5`) drafts the invoice and can see the open bills, so "what's unpaid?" names the oldest one to chase. Nothing is created until a person approves it. Approval opens a PayPal sandbox checkout and saves the bill on the server, on that person's team.

Sign in with email and a password, or with Google or X. The owner can invite a teammate by email. When that person signs in with the same email, they see the same ledger.

PayPal can mark a bill paid on its own. After the app is published, use **Register PayPal webhook**. PayPal then calls `/api/paypal/webhook`. The call is checked with PayPal's signature. `PAYMENT.CAPTURE.COMPLETED` and `CHECKOUT.ORDER.COMPLETED` mark the matching bill paid.

Publishing this app provisions a free Neon Postgres database. In the sandbox preview the same tables use the local database, which resets when the preview process restarts.

PayPal credentials stay in `.env` (see `.env.example`). They are not in this repo. This app's PayPal permissions do not include the Invoicing product, so it uses Checkout orders.

## What is stored where

- The draft lives in the chat until Approve.
- The approved bill is stored on the server, scoped to the team.
- The payable order lives at PayPal. Creating it sends `PayPal-Request-Id` set to the bill number, so a retry does not open a second checkout.
- Mark paid captures the order only after the payer has approved it.
- Check PayPal reads the order. The ledger is marked paid only when PayPal says `COMPLETED`.

## Run

You need Node 22+. Clone the repo, then:

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:8080. Create an account with email and a password.

Put these in `.env`:

| Name | Where it comes from | What breaks without it |
|---|---|---|
| `PAYPAL_CLIENT_ID` | PayPal Developer Dashboard → Apps & Credentials → Sandbox | Approve cannot open a checkout |
| `PAYPAL_CLIENT_SECRET` | Same app, Secret | Same |
| `PAYPAL_ENV` | `sandbox` | Live charges. Do not change this for the demo |
| `XAI_API_KEY` | xAI console | The desk drafts with a local parser instead of Grok |
| `PAYPAL_WEBHOOK_ID` | Filled when you press Register PayPal webhook | PayPal cannot mark a bill paid on its own |
| `DATABASE_URL` | Leave empty | Empty uses the local database. A Neon URL uses Neon |

Try: “Invoice Maya Chen for 6 hours of brand design at $140”. Read the draft. Approve. PayPal sandbox opens the order. Nothing is sent to PayPal before Approve.

## Tools

- PayPal Checkout Orders v2 (sandbox): create order, capture after the payer approves, read order status, verify webhook signatures.
- Grok `grok-4.5` via `https://api.x.ai/v1/chat/completions`: turns one sentence into a draft and names the oldest unpaid bill. No sponsor tool is used. Sponsor tools are optional.

