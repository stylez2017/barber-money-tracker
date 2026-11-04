# Private testing without Stripe

The app supports an explicit `APP_ACCESS_MODE=private-test`. It never treats a
missing Stripe configuration as free access. Default/production mode retains the
subscription gate. Future subscription pricing is $4.99 USD/month, defined in
`lib/subscription.ts`; live keys/events remain rejected.

Every private records or savings request still verifies a Clerk session, its
signature, issuer, expiry, session ID and authorized origin. Only the exact IDs
in `PRIVATE_TEST_USER_IDS` are accepted. Empty/missing configuration denies access.
Record ownership comes from the verified session, never request fields.

Private mode uses only the `PRIVATE_TEST_DB` binding. It cannot fall back to DB.
Repository configuration creates this binding only in previews and points it at
`barber-money-tracker-test-db` (619d4116-48f6-47a0-b063-b1686be45c3f).
Production has no private mode variable or private binding. Both URL switches
remain false, and no routes/custom domains are added.

## Account-side progress confirmed in this conversation

- Clerk development test user created; owner supplied its user ID.
- Owner reports PRIVATE_TEST_USER_IDS saved to Previews Base.
- Owner confirmed transactions and savings_plans tables in TEST.
- Screenshot confirmed preview-only PRIVATE_TEST_DB uses the test database;
  owner reports the binding was saved.
- APP_ACCESS_MODE=private-test was the last requested dashboard change, but its
  save was not confirmed. The source preview configuration also supplies it.
- Worker Access All traffic / Owner testing only and both URL switches disabled
  were confirmed by earlier screenshots, not re-read live from this workspace.

## Setup reference (verify remaining items; do not repeat completed work)

1. In the **Clerk development app → Users**, select/create the owner's test user
   and copy its `user_...` ID. No password or secret key needs to be shared.
2. In **Cloudflare → barber-money-tracker → preview base settings**, add a plain
   variable `PRIVATE_TEST_USER_IDS` with that ID. Multiple explicitly approved
   test accounts can be separated by commas. Do not set this in production.
   The preview config supplies `APP_ACCESS_MODE=private-test`. Retain the saved
   Clerk development public key and replacement secret in Previews Base.
3. In **Storage & databases → D1 → barber-money-tracker-test-db → Console**, run
   the SQL from `migrations/0003_savings.sql`. It creates one new savings table
   and preserves transactions. Transactions migration 0001 was previously run
   manually and verified; check it exists. Do not blindly apply the full migration
   directory: its ledger has not been baselined. Migration 0002 is not required.
4. A future private preview upload must use the updated branch, the saved preview
   settings and both test D1 bindings. Do not deploy the old default branch.
   Keep the saved Worker Access **All traffic → Owner testing only** policy.
   Enabling a URL or uploading a remote app is not part of this checkpoint.

Cloudflare credentials are not attached to this workspace. The token stored in
GitHub Actions is intentionally unreadable here. A future remote check needs a
Cloudflare-authorized execution path; do not paste the token into chat. The
build/test job needs no deployment secret. A separate read-only metadata job uses
the saved GitHub secrets, prints only sanitized check results, and never uploads
anything. Both jobs run for internal pull requests or manual dispatch. Fork PRs
never receive the Cloudflare token.

## Local checks

Run `npm test`, `npm run test:timezones`, `npm run test:tooling`,
`node scripts/check-private-config.mjs`, `npm run build:cloudflare`,
`npm run typecheck`, `npm run check:cloudflare`, then
`npm run test:worker:private` and `npm run test:worker`.

Worker tests use temporary local D1 databases and throwaway Clerk signing keys.
The private suite has no Stripe keys, HTTP fixture installation or billing
tables. The preserved paid-mode suite uses isolated offline Stripe fixtures.
Neither suite authenticates to the owner's accounts or runs remote migrations.

## Connected acceptance checks still required

On an owner-protected instance, verify real Clerk email/Google login, recovery,
sign-out, session expiry and account switching. Check anonymous and unapproved
identities are denied. Add/edit/delete income and every expense category, reload,
and confirm D1 persistence. Save/reload Money Saver goals for separate approved
accounts. Check mobile layout, offline retries, imports and CSV export.

Money Saver records a manual goal and amount already set aside. It recommends
a percentage of positive net profit for the selected period, capped at the
remaining goal. It does not transfer money, verify bank balances or count savings
as a business expense. Settings persist separately from transactions.

Local completion does not mean the remote app is ready to open. A reachable
owner-protected instance and these real-account checks remain outstanding.

## Review follow-up

The workspace matched the remote development tree before this follow-up; there
was no unsaved work. Access denial now clears the financial interface and
invalidates older pending status responses. Transient network failures retain
unsaved drafts. Loaded records reject duplicate IDs and malformed categories;
server and client share amount/shape limits. Money Saver shows remaining goal,
profit after the suggestion, and an explicitly conditional estimate of similar
periods to the goal. Search exclusion headers are defense in depth, not access
control. Cloudflare Access and Clerk remain required.

The Cloudflare preflight inspects Worker/D1 metadata with GET requests only. It
cannot prove saved table schemas, valid Clerk credentials, Access enforcement,
mobile browser behavior or sign-in/recovery. Complete those on a protected test
instance before considering private acceptance testing finished.
