# PayPilot

A freelancer says who to bill. Grok (`grok-4.5`) drafts the invoice and can see the open bills, so "what's unpaid?" names the oldest one to chase. Nothing is created until a person approves it. Approval opens a PayPal sandbox checkout. The ledger then follows PayPal, not the other way around.

## What is stored where

- The draft lives in the chat until Approve.
- The approved bill is stored in this browser.
- The payable order lives at PayPal. Creating it sends `PayPal-Request-Id` set to the bill number, so a retry does not open a second checkout.
- Mark paid captures the order only after the payer has approved it.
- Check PayPal reads the order. The ledger is marked paid only when PayPal says `COMPLETED`.

PayPal credentials stay in `.env` (see `.env.example`). They are not in this repo. This app's PayPal permissions do not include the Invoicing product, so it uses Checkout orders.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:8080. Try “Invoice Maya Chen for 6 hours of brand design at $140”, then Approve.
