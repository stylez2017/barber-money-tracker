# Deploying Barber Money Tracker to Cloudflare Workers

This repository uses `@opennextjs/cloudflare`, not Cloudflare Pages or the legacy `next-on-pages` adapter. No deployment was performed when adding this configuration.

## Requirements

- Node.js 24 (pinned in `.node-version`), npm, and a Cloudflare account with Workers access. The installed Wrangler requires Node.js 22 or newer.
- Run all commands in the `barber-money-tracker` checkout.
- No application secrets, database, R2 bucket, Stripe account, or authentication provider are required. Earnings remain in browser localStorage.
- Wrangler's Worker name is `barber-money-tracker`. The `WORKER_SELF_REFERENCE` service name must match it if renamed.

## Install and validate

```sh
npm ci
npm test
npm run typecheck
npm run build:cloudflare
npm run check:cloudflare
```

`build:cloudflare` runs the existing production Next.js build and creates `.open-next/worker.js` plus `.open-next/assets`. `check:cloudflare` bundles that output using `wrangler deploy --dry-run`; it does not deploy. Generated output is ignored by Git.

To test the actual Workers runtime locally:

```sh
npm run preview:cloudflare
```

This rebuilds and starts the OpenNext Wrangler preview. Open the address Wrangler prints. Stop with Ctrl+C. The existing `npm run dev`, `npm run build`, and `npm start` remain available for ordinary Next.js development.

## Cloudflare dashboard with GitHub integration

1. In Cloudflare, open **Workers & Pages**, create a **Worker**, and choose the option to import/connect a Git repository. Choose `stylez2017/barber-money-tracker` and production branch `main`. Use Workers Builds, not a Pages static-site deployment.
2. Set the root directory to the repository root (leave blank or use `/`), Node.js version to `24` (`NODE_VERSION=24` if the UI requires a build variable), and dependency installation to `npm ci` if configurable. Development dependencies are needed during builds; do not omit them.
3. Set **Build command** to `npm run build:cloudflare` and **Deploy command** to `npx opennextjs-cloudflare deploy`. The deploy command uses the output already built; do not configure a Pages output directory.
4. If a separate non-production/preview deployment command is offered, use `npx opennextjs-cloudflare upload`. Enable automatic Git builds only when you are ready for pushes to deploy.
5. Review and start the first deployment when ready. Cloudflare supplies build/deployment authorization for its connected Worker. No application runtime variables are needed.

GitHub integration must be authorized for this repository. If it is unavailable or the repository cannot be selected, use the manual workflow below; it does not require Cloudflare's GitHub integration.

## Manual deployment from a computer or CI

The person executing these commands must have permission to deploy to the intended Cloudflare account. This is a future action, not part of preparing the repository.

```sh
git clone https://github.com/stylez2017/barber-money-tracker.git
cd barber-money-tracker
git switch main
npm ci
npm test
npx wrangler login
npx wrangler whoami
npm run deploy:cloudflare
```

For an existing checkout, use that directory and update it safely instead of cloning again. `wrangler login` opens a browser for Cloudflare OAuth; `whoami` confirms the selected account. If you belong to multiple accounts, set `CLOUDFLARE_ACCOUNT_ID` to the intended account ID in your shell before deploying. `deploy:cloudflare` builds first and then deploys with OpenNext. It will create/update the named Worker and print its URL. No separate asset upload is needed.

For a headless machine/CI that cannot use browser OAuth, provide `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` through that system's secure environment/secret settings. Use a token scoped to the intended account with Workers Scripts **Edit** permission (Cloudflare's **Edit Cloudflare Workers** token template is a starting point). Custom domains/routes can require additional zone permissions. Do not put tokens in Git, `.env` files committed to Git, or command arguments. Then run:

```sh
npm ci
npm test
npm run deploy:cloudflare
```

GitHub clone access and Cloudflare deployment access are separate permissions. A local manual deploy works even when Cloudflare cannot connect to GitHub, provided the source is available and Cloudflare credentials are configured.

## After deployment

Visit the URL printed by the deploy command, add income/tips and expenses, verify totals, refresh to verify persistence, then edit/delete a test transaction. Use the Workers dashboard to attach a custom domain if desired. `workers_dev: true` enables the standard workers.dev URL.

**Storage is tied to the browser and origin.** Existing records on localhost, a preview URL, or a different domain do not appear on a new deployment domain. Deployment does not erase the old origin's records. Export CSV before switching origins; the app currently has no CSV import feature. Clearing browser data removes local records.

No persistent server cache is configured because the app has no ISR, server-side data, or Next.js image optimization requirements. If those features are added later, revisit OpenNext's caching and image binding documentation before deploying them.

Official references:
- https://opennext.js.org/cloudflare/get-started
- https://opennext.js.org/cloudflare/caching
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/ci-cd/builds/
