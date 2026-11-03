# Barber Money Tracker

A responsive Next.js and Tailwind CSS application for independent barbers. Track haircut income, tips, weekly booth rent, supplies, and other expenses in USD.

## Development

Use Node.js 24 (pinned in .node-version) and npm.

```sh
npm ci
npm run dev
```

## Validation and production

```sh
npm test
npm run typecheck
npm run test:timezones
npm run build
npm start
```

For core tracker checks without a Stripe account, run `npm run test:core` and
`npm run test:ui`. Interface tests use a local DOM and an in-memory API.

## How it works

- Add transactions from the dashboard or quick actions. Record haircut income and tips as separate entries.
- Daily, weekly (Monday through today), and monthly (first of month through today) summaries show income, expenses, profit, and margin. The chart shows the last seven days.
- Enter the full weekly booth rent once on the date paid. Rent is not automatically recurring or prorated.
- The Transactions view includes all saved records, with search, category filters, editing, confirmed deletion, and CSV export.
- Amounts are stored as integer cents. Entries must be positive and cannot be future dated.
- Customer sign-in uses Clerk. Cloud transaction storage uses Cloudflare D1 through authenticated server routes that restrict each account to its own records. Existing browser records under `barber-money-tracker-v1` can be explicitly imported after sign-in; the browser copy is preserved. CSV export is not a CSV import or restore feature.
- Stripe test-mode checkout and subscription management use a fixed $5 USD/month plan. Every financial API request requires a verified Clerk session and a currently paid subscription. Live payment keys are deliberately rejected. Account-connected testing and launch approval are still required; keep public access disabled.

Clerk runtime configuration and the D1 schema are required. See [AUTHENTICATION.md](./AUTHENTICATION.md) for configuration, security boundaries, migration status, and remaining live tests. See [BILLING.md](./BILLING.md) for test-mode billing and [RELEASE_READINESS.md](./RELEASE_READINESS.md) for remaining account-side work. No external fonts are required.

## Cloudflare Workers

OpenNext Cloudflare deployment configuration is included. See [CLOUDFLARE.md](./CLOUDFLARE.md) for build, local Worker preview, GitHub integration, and manual deployment instructions. Preparing this repository does not deploy it.
