# Clerk authentication and D1 storage — private implementation stage

The existing tracker UI and lib/finance.ts calculations are preserved. This
implementation uses @clerk/react in the browser and @clerk/backend in server
route handlers. It does not use the Next.js Node proxy/middleware path that
OpenNext currently does not support. The previously prepared, undeployed
Supabase implementation has been replaced; neither Client Builder project is used.

## Configuration

The owner has configured the development Clerk keys in Cloudflare Previews Base:

- NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: public runtime value
- CLERK_SECRET_KEY: secret runtime value, never commit it or send it in chat
- Optional CLERK_AUTHORIZED_PARTIES: comma-separated exact app origins. Without it,
  the server requires the signed azp claim to match the request URL origin.

The dynamic root page reads the runtime configuration on the server and passes
only the publishable key to the browser. This allows the existing Cloudflare
runtime value to work without a Git-connected build environment. The secret key
is never serialized. `keep_vars: true` preserves dashboard-managed runtime
variables during later Wrangler deployments. Missing configuration fails closed. Development auth values
can be placed privately in .env.local for Next.js or .dev.vars for Wrangler;
those files are ignored. Never use the revoked development key from the earlier
setup attempt. No production Clerk credentials are configured by this change.

## Security and storage

The browser sends a Clerk session token to /api/session and /api/transactions.
Every server request verifies the token signature, expiration, issuer, authorized
party and session identity. Only session tokens are accepted. The owner ID comes
from the verified token, never a request body/query. Requests containing owner
fields are rejected. User-specific responses use Cache-Control: no-store.

D1 has no Supabase-style row-level security: isolation is enforced by server SQL.
Every query scopes records by the verified user_id. A composite primary key
(user_id,id) prevents ID collisions across customers. Amounts remain integer cents.
The browser cannot connect directly to D1. Legacy records require an explicit
confirmed import; retries ignore duplicates without overwriting cloud edits.

wrangler.jsonc binds production DB to barber-money-tracker-db and previews DB to
barber-money-tracker-test-db, with the test database selected for Wrangler remote
development as well. URLs remain disabled. Local Wrangler data stays local unless
an explicit remote command is used. Do not enable URLs, create domains, run
production migrations, or deploy as part of this stage.

The transactions schema and index from migrations/0001_transactions.sql were
manually created and verified in the remote TEST database through the dashboard.
The production schema has not been applied. The new billing migration
(migrations/0002_billing.sql) is prepared locally and has not been applied remotely.
Do not run the old Supabase SQL. See BILLING.md before applying migrations.

## Verification and remaining work

Automated tests generate throwaway RSA keys and use the actual Clerk verifier
with signed test session tokens; no real Clerk secret is needed. They exercise
invalid/expired/forged/wrong-party/wrong-issuer tokens and missing configuration.
Storage integration tests execute the migration and owner-scoped SQL against
SQLite, using two independently verified customer IDs. These tests check
cross-account reads/writes/deletes, forged owner fields and import retries.

Run npm test, npm run typecheck, npm run test:tooling, npm run build:cloudflare,
and npm run check:cloudflare. The final command is a local dry run, not a deploy.
After building, npm run test:worker uses temporary test keys and local D1 to
exercise the actual Workers runtime. It never executes remote D1 commands.

Live email/Google sign-in, verification/recovery, sign-out across tabs, account
switches, and real Stripe sandbox checkout still require account access and a
configured private test environment. Stripe test-mode subscriptions, signed
idempotent webhooks and server-side paid checks are implemented. Access is
verified against Stripe on every financial request; browser redirects and stored
webhook snapshots cannot grant paid access. See BILLING.md and
RELEASE_READINESS.md. Keep public access disabled until account-connected
acceptance tests and explicit launch approval are complete.

## Stripe-free private testing

See PRIVATE_TESTING.md. Explicit private mode still verifies Clerk sessions on
every request, requires an exact approved Clerk user ID and uses PRIVATE_TEST_DB
without falling back to production DB. The default subscription path is unchanged.
Savings settings are owner-scoped in migration 0003; private testing does not
require the billing schema or Stripe configuration.
