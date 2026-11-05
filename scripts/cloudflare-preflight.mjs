// Read-only account metadata checks. Never log API payloads or credential values.
import { pathToFileURL } from 'node:url';
export const EXPECTED_ACCOUNT = 'b978dfc3f836f8a43dc0f8400604f2a4';
const TEST_DB = '619d4116-48f6-47a0-b063-b1686be45c3f';
export async function preflight({ token, account }, fetcher = fetch) {
  const checks = [], missing = [], warnings = [];
  if (!token || account !== EXPECTED_ACCOUNT) return { checks, missing:['Configure the expected Cloudflare account and API token as GitHub Actions secrets.'], warnings };
  async function get(path, label) {
    try {
      const response = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
        method:'GET', headers:{Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(15000),
      });
      if (!response.ok) { missing.push(`${label}: HTTP ${response.status}. Check token permissions and expiration.`); return null; }
      const payload = await response.json();
      if (payload.success !== true || !payload.result) { missing.push(`${label}: metadata was not available.`); return null; }
      return payload.result;
    } catch { missing.push(`${label}: metadata request could not be completed.`); return null; }
  }
  const [worker, database] = await Promise.all([
    get('/workers/workers/barber-money-tracker','Worker settings'),
    get(`/d1/database/${TEST_DB}`,'Test D1 database'),
  ]);
  if (worker) {
    if (worker.subdomain?.enabled === false && worker.subdomain?.previews_enabled === false) checks.push('Production and preview URL switches are disabled.');
    else missing.push('Confirm both Worker URL switches are disabled; this check never changes them.');
    for (const key of ['routes','domains']) {
      if (!Array.isArray(worker[key])) warnings.push(`${key}: confirm there are no public routes or custom domains in the dashboard.`);
      else if (worker[key].length) missing.push(`${key}: review configured origins before any private preview is enabled.`);
    }
    const env = worker.previews_base_config?.env ?? {};
    const text = name => env[name]?.type === 'plain_text' ? env[name].text : undefined;
    if (text('APP_ACCESS_MODE') === 'private-test') checks.push('Preview access mode is private-test.');
    else missing.push('Previews Base: save APP_ACCESS_MODE as text private-test.');
    const ids = text('PRIVATE_TEST_USER_IDS')?.split(',').map(id=>id.trim()).filter(Boolean) ?? [];
    if (ids.length && ids.every(id=>/^user_[A-Za-z0-9]+$/.test(id))) checks.push('Preview Clerk user allowlist is configured.');
    else missing.push('Previews Base: configure exact approved Clerk user IDs.');
    for (const name of ['DB','PRIVATE_TEST_DB']) {
      if (env[name]?.type === 'd1' && (env[name].database_id ?? env[name].id) === TEST_DB) checks.push(`Preview ${name} uses the test D1 database.`);
      else missing.push(`Previews Base: verify ${name} is bound to barber-money-tracker-test-db; its association could not be confirmed.`);
    }
    if (text('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')?.startsWith('pk_test_') && env.CLERK_SECRET_KEY?.type === 'secret_text') checks.push('Clerk development key bindings are present (values not logged).');
    else missing.push('Previews Base: verify Clerk development public key and secret bindings.');
  }
  if (database) {
    if (database.uuid === TEST_DB && database.name === 'barber-money-tracker-test-db') checks.push('Expected test D1 database exists.');
    else missing.push('Test D1 metadata did not match the configured database.');
  }
  warnings.push('This metadata check does not verify Access policy enforcement, D1 table schemas or real Clerk login. No URL was enabled and no app was uploaded.');
  return { checks, missing, warnings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await preflight({token:process.env.CLOUDFLARE_API_TOKEN,account:process.env.CLOUDFLARE_ACCOUNT_ID});
  for (const line of report.checks) console.log(`PASS: ${line}`);
  for (const line of report.warnings) console.log(`NOTE: ${line}`);
  for (const line of report.missing) console.log(`NEEDED: ${line}`);
  if (report.missing.length) process.exitCode = 1;
}
