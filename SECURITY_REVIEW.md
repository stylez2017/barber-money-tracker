# Private testing security review

This is a code/configuration review and local regression record, not an assertion
that account-connected enforcement has been verified.

- Every financial API verifies a signed Clerk session, authorized party, issuer
  and expiry. It uses the verified user ID for all prepared SQL statements.
- Private testing requires an exact approved user ID and PRIVATE_TEST_DB; missing
  settings deny access. There is no fallback to production data or default free
  access when Stripe settings are absent.
- Status/transaction denials remove financial views. Older pending status checks
  cannot restore access after a denial. Temporary failures preserve unsaved forms.
- API JSON bodies are bounded, owner fields are rejected, cents and record shapes
  are validated, and cloud loads reject duplicate IDs instead of inflating totals.
- Financial responses are no-store. Server secrets are not serialized into the
  app. Legacy import is explicit and preserves the original local copy.
- CSV escapes formula prefixes. Exports contain the signed-in user's records;
  account isolation, import retries and local backup/restore have automated tests.
- Browser headers prevent embedding and MIME sniffing, limit referrer details and
  request search exclusion. Search exclusion is not authentication or privacy.
- Private mode disables checkout, portal and webhooks. Future subscription mode
  remains $4.99/month and rejects live keys/events. Changing live mode requires
  separate authorization and connected billing acceptance tests.
- Repository URL flags remain disabled; preview bindings target test D1 only.
  The read-only Cloudflare workflow never uploads code, queries financial rows,
  edits Access, migrates databases or changes URL settings. Fork PRs do not get
  the Cloudflare token. Reports omit credentials and raw API payloads.

Before private acceptance is complete, verify real Clerk login/recovery, sign-out
and account switching, owner-only Cloudflare Access enforcement, remote D1
persistence, backups and a real mobile browser. Before public launch, configure
production Clerk and schemas, review customer account deletion/data retention and
production traffic controls, complete subscription acceptance, and obtain explicit
launch/payment approval. Production rollout and policy/business decisions remain
outside this private development checkpoint.
