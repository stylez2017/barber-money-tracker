# Stripe test-mode subscriptions

Billing code is implemented, but no real Stripe account is connected to this
workspace. No product, price, webhook, subscription or payment has been created
in the owner's Stripe account by this work. Public URLs remain disabled.

## Contract

- One subscription: USD 499 cents, recurring monthly, quantity one, licensed use.
- Checkout and portal sessions are server-created for the verified Clerk user.
  The browser cannot choose a customer, price, amount or return URL.
- Live secret keys, live price objects, and live webhook events are rejected.
  Live activation requires a separate approved code/configuration change.
- Access requires an active subscription for the configured price, an unexpired
  paid period, and the latest invoice paid for at least USD 499 cents.
- Trialing, incomplete, paused, past-due, unpaid, canceled and expired access is
  denied. Cancellation scheduled for period end retains access through that paid
  period. Saved records are not deleted when subscription access ends.
- Every financial API request checks current Stripe state. There is no paid flag
  in localStorage, browser-only authorization or stale webhook entitlement cache.
  Stripe outages fail closed for new financial requests. The UI preserves an
  unsaved form during transient connection errors; a confirmed access revocation
  removes the tracker.
- Refund/dispute webhooks place a billing hold on the owning customer. A won
  dispute can clear that hold; refunds require an account review. A held customer
  cannot start a new chargeable subscription. Monitor webhook deliveries: refund
  and dispute holds take effect when a valid event is successfully processed.

## Runtime configuration — TEST / sandbox only

Set these for Cloudflare Previews Base, never paste secret values into chat:

| Name | Type | Value |
| --- | --- | --- |
| STRIPE_SECRET_KEY | Secret | Sandbox/test key beginning sk_test_ or rk_test_ |
| STRIPE_WEBHOOK_SECRET | Secret | Signing secret for this test endpoint/listener |
| STRIPE_PRICE_ID | Plain variable | Test recurring price: USD 4.99 each month |
| APP_ORIGIN | Plain variable | Exact private app origin, with no path or query |

The Clerk publishable key and secret key configured earlier are also required.
APP_ORIGIN is fixed server-side and cannot be supplied through request bodies.
localhost/127.0.0.1 HTTP origins are accepted for local testing only; other origins
must use HTTPS. The public Clerk key is read at request time, so no Git build
connection is needed for the previously saved runtime configuration.

## D1 migrations

The owner manually created the transactions table/index in the remote TEST D1
database. Do NOT rerun 0001 there blindly. Neither remote database has received
0002_billing.sql from this workspace. Check its existing tables first, then apply
0002 to barber-money-tracker-test-db only through an authorized account session.
Production migrations must wait for private testing and release approval.

Because 0001 was created manually in the test dashboard, Wrangler's migration
ledger may not record it. Baseline that ledger deliberately after verifying the
schema before switching to automatic migrations; do not blindly run a command
that reapplies 0001 and then assume 0002 succeeded.

## Stripe account-side setup still required

Use a Stripe sandbox/test environment. Create a Barber Money Tracker product and
one USD 4.99/month price. Do not add a trial, promotion code, metered billing or
quantity selector. Configure the test Billing Portal for payment-method updates
and cancellation at period end; disable plan/quantity switching. Test declines,
authentication-required payments, renewals, cancellations and resubscription.

The webhook route is /api/billing/webhook. Register these test events:

- checkout.session.completed, checkout.session.async_payment_succeeded,
  checkout.session.async_payment_failed
- customer.subscription.created, customer.subscription.updated,
  customer.subscription.deleted, customer.subscription.paused,
  customer.subscription.resumed
- invoice.paid, invoice.payment_failed, invoice.payment_action_required
- charge.refunded, charge.dispute.created, charge.dispute.updated,
  charge.dispute.closed

Signatures are checked against the exact raw request body with a five-minute
replay tolerance. D1 applies event processing atomically; duplicates do not repeat
state changes and failed processing remains retryable. Subscription data is
retrieved from Stripe instead of trusting an old event's subscription snapshot.
Webhook snapshots are audit state, not the authority for granting record access.

A Stripe webhook cannot pass an owner-only Cloudflare Access login. While the
app is private, test with the Stripe CLI forwarding to localhost, or use a
separately approved, narrowly scoped webhook ingress. Do not remove the app's
Access protection or enable its URLs just to receive webhooks.

## Routes

- GET /api/billing/status: own subscription status, no Stripe identifiers leaked.
- POST /api/billing/checkout: empty JSON body; returns a hosted Stripe URL.
- POST /api/billing/portal: empty JSON body; returns the owner's hosted portal.
- POST /api/billing/webhook: verified Stripe events; no Clerk session required.
- GET/POST /api/transactions: verified Clerk session AND server-verified paid
  subscription, including reads, writes, deletes and legacy imports.

## Verification already available

npm test exercises the real Stripe SDK with an in-process mock HTTP transport,
real signed Clerk test tokens, signed webhook payloads, and SQLite-backed D1 SQL.
After a Cloudflare build, npm run test:worker executes the built application in
local workerd with local D1 and an isolated Stripe HTTP fixture. Fixture hooks
exist only in a temporary local test wrapper, never in the production app.
Neither test suite calls Stripe's real API or charges a real payment method.
Account-connected Stripe and Clerk/browser acceptance checks remain required.

## Private testing exception

Stripe setup is paused. The explicit, allowlisted private-test mode documented
in PRIVATE_TESTING.md uses only test D1 and never calls Stripe. Checkout, portal
and webhooks are disabled in that mode. The billing implementation and $4.99
monthly price remain for future activation; production still fails closed.
