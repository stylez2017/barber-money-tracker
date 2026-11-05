# Data operations before release

D1 is accessed only from server code through a database binding. No customer
receives database credentials or a direct database endpoint. Access is scoped by
verified Clerk user ID; changing an ID in a browser request cannot select another
owner. Financial responses disable caching and errors omit financial payloads,
secret values, raw Stripe errors and database internals.

Before storing real customer records, check the account's D1 Time Travel retention
and access controls. Keep database exports and CSV backups in private storage.
The ignored work/ directory is for scratch exports; never commit customer data,
a database dump, local .dev.vars/.env files or secret credentials.

## Test restore drill — required before launch

1. Use only the test database and fictitious customers. Record a Time Travel
   bookmark or create a private export before migration/recovery work.
2. Restore/export-import into a separate disposable TEST database. Do not
   overwrite the production database to practice recovery.
3. Verify schema/indexes, row counts per user, sample transaction histories,
   date-period totals and CSV exports. Sign in as each test customer to repeat
   record-isolation checks.
4. Reconcile Stripe customer mappings, active subscriptions and refund/dispute
   holds before opening a restored instance. Never create replacement Stripe
   customers/subscriptions blindly after a restore. The server checks Stripe
   live state, not stored entitlement snapshots.
5. Document the restore result, bookmark/export location and responsible owner.
   Any production restore or binding switch requires explicit owner approval.

Subscription cancellation or access loss retains financial records; it does not
silently delete the customer's history. Establish and publish a customer data
retention/deletion process before launch. Clerk account deletion and financial
record retention must be coordinated with billing cancellation to prevent an
orphaned recurring subscription. This release does not automatically delete
customer data or cancel an unrelated subscription when an identity disappears.

Monitor failed webhook deliveries and API errors once a private test endpoint
exists. Replay failed deliveries after correcting configuration. Billing events
are idempotent. Refunded accounts remain on hold pending review; do not manually
clear a hold without checking current Stripe charge/dispute state and the owner.

The Stripe SDK is configured for Fetch/Web Crypto in Workers. Every financial
request checks Stripe, which adds external requests and means a Stripe outage
blocks new financial access. Evaluate real account latency/rate limits during
private tests before increasing traffic or changing this conservative policy.

## Automated local recovery coverage

The core test suite now exercises a local SQLite backup and restore with multiple
owners, checking saved records, totals and the owner-date index. This provides
local recovery coverage without a Stripe account. It does not replace the remote
D1 restore drill above or validate the account's Time Travel retention.
