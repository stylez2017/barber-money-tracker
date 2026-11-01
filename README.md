# Barber Money Tracker

A responsive Next.js and Tailwind CSS application for independent barbers. Track haircut income, tips, weekly booth rent, supplies, and other expenses in USD.

## Development

Requires Node.js 20.9 or newer and npm.

```sh
npm ci
npm run dev
```

## Validation and production

```sh
npm test
npm run typecheck
npm run build
npm start
```

## How it works

- Add transactions from the dashboard or quick actions. Record haircut income and tips as separate entries.
- Daily, weekly (Monday through today), and monthly (first of month through today) summaries show income, expenses, profit, and margin. The chart shows the last seven days.
- Enter the full weekly booth rent once on the date paid. Rent is not automatically recurring or prorated.
- The Transactions view includes all saved records, with search, category filters, editing, confirmed deletion, and CSV export.
- Amounts are stored as integer cents. Entries must be positive and cannot be future dated.
- Data is stored in this browser's localStorage, under `barber-money-tracker-v1`. It does not sync between browsers or devices. Clearing browser data removes records; export CSV regularly as a backup. CSV export is not an import or restore feature.
- No authentication, backend, subscription billing, or Stripe integration is included. The planned future subscription price is $5/month.

No environment variables, external database, API keys, or external fonts are required.
