// Local Workers integration test. Never uses or modifies a remote D1 database.
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';

const privateMode = process.argv.includes('--private');
const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'barber-worker-test-'));
const cli = join(root, 'node_modules/wrangler/bin/wrangler.js');
const probe = createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
const entry = join(root, '.open-next/worker.js');
const wrapper = join(scratch, 'worker-test-entry.mjs');
writeFileSync(wrapper, `import app from ${JSON.stringify(entry)};
import { installFixture, fixtureControl } from ${JSON.stringify(join(root, 'scripts/stripe-worker-fixture.mjs'))};
export * from ${JSON.stringify(entry)};
${privateMode ? '' : 'installFixture();'}
export default { fetch(request, env, ctx) { return ${privateMode ? '' : 'fixtureControl(request) ?? '}app.fetch(request, env, ctx); } };
`);
config.main = wrapper;
config.assets.directory = join(root, '.open-next/assets');
// Throwaway keys, intentionally unrelated to the owner's Clerk instance.
config.vars = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('example.clerk.accounts.dev$').toString('base64'),
  CLERK_SECRET_KEY: 'sk_test_not_a_real_key_only_for_offline_tests',
  CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  CLERK_AUTHORIZED_PARTIES: origin,
  STRIPE_SECRET_KEY: 'sk_test_not_a_real_key_only_for_offline_tests',
  STRIPE_WEBHOOK_SECRET: 'whsec_local_fixture_not_real',
  STRIPE_PRICE_ID: 'price_monthly',
  APP_ORIGIN: origin,
};
if (privateMode) {
  config.d1_databases[0] = config.previews.d1_databases[0];
  config.d1_databases.push({binding:'PRIVATE_TEST_DB',database_name:'barber-money-tracker-test-db',database_id:'619d4116-48f6-47a0-b063-b1686be45c3f'});
  config.vars.APP_ACCESS_MODE = 'private-test';
  config.vars.PRIVATE_TEST_USER_IDS = 'user_A,user_B';
  for (const key of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_ID']) delete config.vars[key];
}
const configPath = join(scratch, 'wrangler.json');
writeFileSync(configPath, JSON.stringify(config));
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: join(scratch, 'config'), WRANGLER_REGISTRY_PATH: join(scratch, 'registry'), WRANGLER_LOG_PATH: join(scratch, 'wrangler.log') };
let worker;
let logs = '';
function token(owner, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'worker-test' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: owner, sid: 'sess_local', iss: 'https://example.clerk.accounts.dev', azp: origin, iat: now, nbf: now - 1, exp: now + 300, v: 2, ...overrides })).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}
async function call(owner, body, jwt) {
  return fetch(`${origin}/api/transactions`, { method: body ? 'POST' : 'GET',
    headers: { ...(owner ? { Authorization: `Bearer ${jwt ?? token(owner)}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
}
try {
  for (const migration of (privateMode ? ['0001_transactions.sql','0003_savings.sql'] : ['0001_transactions.sql','0002_billing.sql','0003_savings.sql'])) {
    execFileSync(process.execPath, [cli, 'd1', 'execute', privateMode ? 'PRIVATE_TEST_DB' : 'DB', '--local', '--config', configPath,
      '--file', join(root, 'migrations', migration), '--persist-to', join(scratch, 'state')], { cwd: root, env, stdio: 'pipe' });
  }
  if (!privateMode) {
  const seed = join(scratch, 'seed.sql');
  writeFileSync(seed, "INSERT INTO billing_accounts(user_id,billing_key,checkout_key,stripe_customer_id) VALUES ('user_A','key_A','checkout_A','cus_user_A'),('user_B','key_B','checkout_B','cus_user_B');");
  execFileSync(process.execPath, [cli, 'd1', 'execute', privateMode ? 'PRIVATE_TEST_DB' : 'DB', '--local', '--config', configPath,
    '--file', seed, '--persist-to', join(scratch, 'state')], { cwd: root, env, stdio: 'pipe' });
  }
  worker = spawn(process.execPath, [cli, 'dev', '--local', '--config', configPath, '--port', String(port),
    '--ip', '127.0.0.1', '--persist-to', join(scratch, 'state')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [worker.stdout, worker.stderr]) stream.on('data', chunk => { logs = (logs + chunk).slice(-12_000); });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (worker.exitCode !== null) throw new Error('Local Worker stopped unexpectedly.');
    try { const response = await fetch(`${origin}/api/session`, { signal: AbortSignal.timeout(1000) }); if (response.status === 401) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Worker must start and reject missing sessions');
  const session = await fetch(`${origin}/api/session`, { headers: { Authorization: `Bearer ${token('user_A')}` } });
  assert.equal(session.status, 200, 'Actual workerd must verify the signed session');
  assert.equal(session.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(session.headers.get('x-frame-options'), 'DENY');
  assert.ok(session.headers.get('x-robots-tag')?.includes('noindex'));
  const page = await fetch(origin);
  assert.equal(page.status,200);
  assert.ok(!(await page.text()).includes(config.vars.CLERK_SECRET_KEY), 'Server secret must not appear in HTML');
  assert.deepEqual(await session.json(), { userId: 'user_A' });
  assert.equal((await call(null)).status, 401);
  assert.equal((await call('user_A', undefined, token('user_A', { exp: 1 }))).status, 401);
  const row = { id: 'shared-id', date: '2026-11-01', kind: 'haircut', amount: 4000, note: 'A private' };
  const saved = await call('user_A', { operation: 'save', transaction: row });
  assert.equal(saved.status, 200, await saved.text());
  assert.equal((await call('user_B', { operation: 'save', transaction: { ...row, note: 'B private' } })).status, 200);
  assert.equal((await call('user_B', { operation: 'save', transaction: row, user_id: 'user_A' })).status, 400);
  assert.equal((await call('user_B', { operation: 'delete', id: row.id })).status, 200);
  const aResponse = await call('user_A');
  assert.equal(aResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await aResponse.json()).rows, [row]);
  assert.deepEqual((await (await call('user_B')).json()).rows, []);
  if (privateMode) {
    assert.equal((await call('user_C')).status,403);
    const status = await fetch(`${origin}/api/billing/status`,{headers:{Authorization:`Bearer ${token('user_A')}`}});
    assert.equal((await status.json()).privateTesting,true);
    const plan = {goal:100000,saved:12345,percent:25};
    const savings = await fetch(`${origin}/api/savings`,{method:'POST',headers:{Authorization:`Bearer ${token('user_A')}`,'Content-Type':'application/json'},body:JSON.stringify(plan)});
    assert.equal(savings.status,200,await savings.clone().text());
    const loaded=await fetch(`${origin}/api/savings`,{headers:{Authorization:`Bearer ${token('user_A')}`}});
    assert.deepEqual(await loaded.json(),plan);
    const denied=await fetch(`${origin}/api/billing/checkout`,{method:'POST',headers:{Authorization:`Bearer ${token('user_A')}`,'Content-Type':'application/json'},body:'{}'});
    assert.equal(denied.status,403);
    console.log('PASS: private local workerd, Clerk sessions, isolated D1 CRUD and savings persistence with NO Stripe configuration.');
  } else {
  assert.equal((await call('user_C')).status, 402, 'Unpaid customer cannot read records');
  assert.equal((await call('user_C', { operation: 'save', transaction: row })).status, 402, 'Unpaid customer cannot write records');
  const billingCall = (action, body) => fetch(`${origin}/api/billing/${action}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token('user_C')}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const checkout = await billingCall('checkout', {});
  assert.equal(checkout.status, 200, await checkout.clone().text());
  const checkoutAgain = await billingCall('checkout', {});
  assert.deepEqual(await checkout.json(), await checkoutAgain.json(), 'Repeated checkout reuses the same session');
  assert.equal((await billingCall('status')).status, 200);
  assert.equal((await call('user_C')).status, 402, 'Open checkout never unlocks records');
  await fetch(`${origin}/__local_fixture/status?owner=user_A&status=past_due`);
  const fixtureStripe = new Stripe('sk_test_not_real_fixture_key');
  const payload = JSON.stringify({ id: 'evt_worker_failure', object: 'event', type: 'customer.subscription.updated', created: Math.floor(Date.now()/1000), livemode: false, data: { object: { id: 'sub_user_A', object: 'subscription', customer: 'cus_user_A' } } });
  const signature = fixtureStripe.webhooks.generateTestHeaderString({ payload, secret: config.vars.STRIPE_WEBHOOK_SECRET });
  for (let i = 0; i < 2; i++) {
    const hook = await fetch(`${origin}/api/billing/webhook`, { method: 'POST', body: payload, headers: { 'Stripe-Signature': signature } });
    assert.equal(hook.status, 200, await hook.clone().text());
  }
  const forged = await fetch(`${origin}/api/billing/webhook`, { method: 'POST', body: payload, headers: { 'Stripe-Signature': 't=1,v1=invalid' } });
  assert.equal(forged.status, 400);
  assert.equal((await call('user_A')).status, 402, 'Payment failure revokes record access');
  assert.equal((await call('user_B')).status, 200, 'Other paid customers keep access');
  console.log('PASS: local workerd verified sessions, D1 isolation, Stripe SDK checkout, payment restrictions and signed webhook retries using local-only Stripe fixtures.');
  }
} catch (error) {
  console.error(logs.replace(/sk_test_[A-Za-z0-9_]+/g, '[THROWAWAY TEST KEY]'));
  throw error;
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await Promise.race([once(worker, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (worker.exitCode === null) worker.kill('SIGKILL');
  }
  rmSync(scratch, { recursive: true, force: true });
}
