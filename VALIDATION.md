# Local validation record

Completed on the current private release candidate:

- npm test: 51 data/API tests and 10 local DOM interface tests passed, including original financial calculations, signed
  Clerk sessions, D1 owner isolation, payment restrictions, duplicate checkout,
  cancellations/resubscription, webhook verification/retries/order, refunds and
  dispute holds.
- npm run typecheck: passed.
- npm run test:tooling: both existing OpenNext/minifier compatibility tests passed.
- npm audit: 0 known vulnerabilities at the time checked.
- npm run build:cloudflare: production build and OpenNext Worker bundle passed.
- npm run check:cloudflare: local deployment dry run passed. No deployment ran.
- npm run test:worker: passed against the built app in local workerd, local D1,
  real Clerk/Stripe SDKs and isolated HTTP fixtures for Stripe. Verified signed
  sessions, customer isolation, hosted checkout/session reuse, unpaid rejection,
  signed webhook retries, payment failure revocation and continued access for
  another paid customer.
- git diff --check: passed. Original finance module and finance tests unchanged.
- Configuration checks: workers_dev=false; preview_urls=false; distinct production
  and test D1 IDs. No real secret-key patterns found in source files.

The test Stripe transport never calls the owner's Stripe account or processes a
real charge. The temporary Workers fixture wrapper is not an app route or a
production payment bypass. No real browser email/Google sign-in, account-connected
Stripe sandbox checkout, remote billing migration, Cloudflare Access enforcement
or production backup/restore has been verified by these local checks. Those
remaining checks are listed in RELEASE_READINESS.md.

No publication, remote deployment or live-payment activation was performed.

## Core tracker follow-up without Stripe account access

- npm run test:core: 23 core tests, no Stripe connection or billing fixture needed.
- npm run test:timezones: finance/date tests pass in UTC, America/Los_Angeles
  and Pacific/Kiritimati, covering DST, leap days, month/year boundaries.
- New interface tests render the actual Tracker component in jsdom with a local
  in-memory API: failed-save drafts, pending-save controls, search/filtering,
  editing, confirmed deletion, explicit legacy import and CSV downloads.
- A 1,501-record history test verifies pagination, unique records and full totals.
- A local SQLite backup/restore test verifies per-owner records, totals and index
  recovery. This is not a test of Cloudflare's remote Time Travel service.
- CSV export now also neutralizes formula-like notes after leading whitespace.
  CSV columns, filenames, cents and stored notes retain their existing behavior.
- Mutations require an explicit saved:true acknowledgement. Failed saves keep the
  draft form open; pending saves lock fields and modal dismissal until completion.

Stripe account setup and real Clerk/private-browser acceptance remain paused or
pending. No payment bypass, publication or live payment activation was added.

A further interface regression test verifies that a server-committed save whose
acknowledgement is lost can be retried without creating a duplicate record. Each
new draft retains its UUID until saved or explicitly discarded.

## Stripe-free private testing checkpoint

- The 61 app tests include private-mode authentication/allowlisting, missing-config
  rejection, disabled billing endpoints, test/production D1 separation, Money
  Saver persistence/validation/ownership, and offline UI draft retention.
- Local workerd private integration passes with zero Stripe configuration and
  only transactions + savings schemas (no billing tables). It verifies signed
  Clerk sessions, rejected expired/anonymous/unapproved sessions, D1 CRUD,
  savings persistence and denied checkout. The paid-mode Worker suite also passes.
- Timezones, tooling, typecheck, OpenNext build and deployment dry run pass.
- These are local tests using temporary signed identities, not proof that real
  Clerk email/Google login or remote Cloudflare Access enforcement works.
- Both URL switches stay false; no remote D1 migration or deployment was run.
