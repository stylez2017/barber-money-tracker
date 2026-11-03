# Private release candidate — not approved for public launch

## Implemented in this workspace

- Existing tracker views, integer-cent calculations, CSV export and transaction
  controls retained; finance module and its original tests are unchanged.
- Clerk sign-in/sign-up UI, server-side session verification and account-switch
  safeguards, without relying on OpenNext's unsupported Node middleware path.
- Owner-scoped D1 storage, bounded import requests and duplicate-safe imports
  that preserve existing cloud edits and leave browser originals untouched.
- Stripe test-mode USD 5/month checkout, persisted idempotency keys, portal,
  verified webhooks, refund/dispute holds and server-side paid-access checks.
- Production and preview URL flags remain false. Dashboard-managed variables
  are preserved during future Wrangler deploys with keep_vars=true.

## Completed account-side work (confirmed earlier by screenshots/user replies)

- Production D1: barber-money-tracker-db.
- Test D1: barber-money-tracker-test-db.
- DB bindings saved separately for production and previews.
- Transactions table and index created/verified in TEST only.
- Clerk development app created, email verification enabled, preview public key
  and replacement secret saved. Exposed earlier key was deleted by the owner.
- Cloudflare Zero Trust Free activated and owner-email allow policy created.
- Worker Access applied to **All traffic**, using the exact owner-email policy.
  Dashboard confirmed login is required for production and preview URLs. Both
  URL switches remain disabled; enforcement still needs a real browser check.
- Owner reports GitHub Actions deployment secrets saved. Values have not been
  read or validated by this workspace.

## Manual cloud checks

`.github/workflows/private-checks.yml` is manually triggered only. It runs tests,
checks private configuration, builds the app and performs a Worker dry run.
It has read-only repository permissions and does not use deployment credentials,
upload code, migrate a database or enable URLs. It must be present on the default
branch before GitHub offers its manual Run workflow button.

Wrangler's named preview command requires an active preview URL. A usable
owner-only preview therefore needs a separately reviewed URL-setting change and
verification of Worker Access. Do not use `wrangler deploy` as a shortcut from
the old default branch: its configuration still enables `workers_dev`.

## Blockers requiring account access

1. Verify the saved Worker-level owner-only Access rule in a real browser before
   enabling a test URL. The earlier unsaved standalone application was discarded.
2. Apply 0002_billing.sql to TEST, after checking schema/migration history.
3. Stripe setup is paused at the owner's request. Current account UI and financial
   APIs still require verified billing; a usable Stripe-free private testing path
   remains to be implemented without allowing access to production data.
4. Arrange an owner-only private test instance, or authenticated local testing,
   for real Clerk email/Google sign-in and real Stripe sandbox checkout.

## Additional core verification completed locally

The core suite covers large histories, edit/delete behavior, atomic import failure
and a local backup/restore. Financial date boundaries pass in three time zones.
Local DOM tests cover forms, offline retries, filters, legacy import confirmation
and CSV downloads. No real Stripe account or real browser session is used.

## Required connected acceptance tests

- Confirm signed-out browsers and non-allowlisted Access identities cannot open
  the private test app. Check all configured Worker origins/routes, not just one.
- Verify email/Google sign-in, email verification, recovery, expired sessions,
  cross-tab sign-out, same-device account switching and account isolation.
- Use two real test customers. Attempt direct record API access using the other
  customer's IDs; verify reads/writes/deletes/imports cannot cross owners.
- Complete test checkout, decline a payment, complete 3DS, cancel/restart checkout,
  double-click checkout, retry a failed request and return with a forged success
  URL. Only verified paid accounts may access financial APIs.
- Test recurring renewal, failed renewal, recovery, immediate cancellation,
  cancellation at period end, expiration, resubscription, refunds and disputes.
- Retry/reorder webhook events. Confirm a missed/failed delivery is observable
  and recoverable; never treat a successful redirect as proof of payment.
- Recheck add/edit/delete, filters, all date periods, charts, CSV export, legacy
  imports, refresh persistence, mobile layout, offline saves and larger histories.
- Perform the backup/restore drill described in OPERATIONS.md using test data.

## Launch permission is a separate gate

Passing local tests is not launch approval. Public publication, production
migration/rollout, production Clerk configuration and LIVE Stripe activation
require the owner's explicit permission. The current code deliberately rejects
live billing keys and events; changing that gate needs a separate review.
Neither Barber Client Builder Supabase project is used or modified.
