# Dependency security review — November 1, 2026

## Findings and changes

The initial `npm audit` reported **5 affected packages: 4 high and 1 moderate**. These are package counts, including inherited findings in `@node-minify/core`, `@opennextjs/aws`, and `@opennextjs/cloudflare`, rather than five independent vulnerabilities.

The underlying advisories were:

- `glob` CLI command injection via `--cmd` with `shell:true`: [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2). The installed node-minify dependency pinned vulnerable `glob` 10.3.3.
- `glob` AbortSignal cancellation bypass / continued filesystem traversal: [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). This also affected the adapter's `glob` 13.0.6.
- `minimatch` denial of service through globparts amplification: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Both installed minimatch versions (9.0.9 and 10.2.6) were affected.

`@opennextjs/cloudflare` 1.20.15 and its `@opennextjs/aws` 4.1.14 dependency were already the latest releases available during this review. The audit's proposed change to Cloudflare adapter 0.3.0 was not a compatible update and was rejected. No forced audit fix was run.

Two exact, parent-scoped npm overrides replace `glob` with **14.0.3**, only under `@opennextjs/cloudflare` and `@node-minify/core`. It resolves patched **minimatch 11.0.3** in the lockfile. This removes the vulnerable nested glob without replacing the minifier, terser integration, adapter, or application dependencies.

These overrides intentionally cross the parents' declared glob major ranges. The callers use `glob` and `globSync`, which still exist in v14. The upstream v14 changes include matcher internals and edge-case pattern behavior, so compatibility was checked with actual consumer resolution, manifest/ignore matching, wildcard-input minification, and the complete production Worker build. Do not generalize these overrides to unrelated packages. Revisit/remove them when upstream dependencies adopt patched versions.

## Validation

```sh
npm ci
npm audit
npm audit --omit=dev
npm test
npm run test:tooling
npm run typecheck
npm run build:cloudflare
npm run check:cloudflare
```

The Cloudflare build runs `npm run build` (the production Next.js build) before generating the Worker. The dry run bundles it without publishing or deploying anything. `test:tooling` exercises synchronous and asynchronous manifest globs with ignore patterns, plus node-minify's real wildcard-input path with its existing terser compressor.

## Production exposure and remaining findings

After the changes, the complete audit and production-only audit both report **0 vulnerabilities**. There are no remaining npm advisories to accept from this audit snapshot.

The previous findings were in local/CI build tooling: file discovery and minification. The glob command-injection advisory requires the vulnerable CLI command path; the inspected callers use library APIs instead. The app does not accept user-supplied filesystem patterns or invoke these build tools from a request. Its transaction fields and localStorage do not feed them. They were not identified as exploitable paths in the deployed app, but build tooling still merits updates because builds process checkout contents.

`--omit=dev` only describes npm's production dependency graph; it is not, by itself, proof about bundled Worker contents. OpenNext includes runtime code from development dependencies. The affected paths here were checked specifically as build/CLI code, and the generated dry-run bundle was inspected for the affected package paths.

Audit results depend on the advisory database at the time of the check. Continue running `npm audit` after dependency updates. All application source, financial calculations, styles, localStorage logic, and deployment configuration remain unchanged by this fix.
