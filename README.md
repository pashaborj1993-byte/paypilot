# PayPilot

Chat drafts an invoice. It is recorded only after you approve it.

PayPal sandbox credentials stay in `.env` (see `.env.example`). They are not in this repo. Approving an invoice creates a PayPal sandbox checkout. This app's PayPal permissions do not include the Invoicing product, so it uses Checkout orders.
