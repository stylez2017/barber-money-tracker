import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { BillingService, billingClient } from '../lib/server/billing.ts';
import { billingResponse, webhookResponse } from '../lib/server/billing-handlers.ts';
import { transactionResponse } from '../lib/server/handlers.ts';
import { database, request, token } from './helpers.ts';
import { stripeFixture } from './stripe-fixture.ts';

function event(id: string, type = 'customer.subscription.updated', objectId = 'sub_user_A', created = Math.floor(Date.now()/1000)) {
  return { id, object: 'event', type, created, livemode: false, data: { object: { id: objectId, object: 'subscription', customer: 'cus_user_A' } } } as unknown as Stripe.Event;
}
function signedRequest(env: ReturnType<typeof database>, stripe: Stripe, value: Stripe.Event, timestamp?: number) {
  const payload = JSON.stringify(value);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET, timestamp });
  return new Request('http://localhost:3000/api/billing/webhook', { method: 'POST', body: payload, headers: { 'Stripe-Signature': signature } });
}

test('live keys are blocked and missing billing configuration never grants financial access', async () => {
  const env = database();
  assert.throws(() => billingClient({ ...env, STRIPE_SECRET_KEY: 'sk_live_NOT_A_REAL_KEY' }));
  const res = await transactionResponse(request('user_A'), { ...env, STRIPE_SECRET_KEY: undefined });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
test('unpaid customers cannot read, save, delete or import financial records through the API', async () => {
  const env = database(), fake = stripeFixture();
  const row = { id: 'x', date: '2026-11-01', kind: 'haircut', amount: 500, note: '' };
  for (const body of [undefined, { operation: 'save', transaction: row }, { operation: 'delete', id: 'x' }, { operation: 'import', rows: [row] }]) {
    const res = await transactionResponse(request('user_A', body), env, fake.stripe);
    assert.equal(res.status, 402);
  }
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM transactions').get()!.n, 0);
});
test('only an active, currently paid $4.99 USD monthly plan grants access', async () => {
  const env = database(), fake = stripeFixture();
  await fake.paid(env.DB, 'user_A');
  const original = structuredClone(fake.state.subscriptions.get('sub_user_A')!);
  const billing = new BillingService(env, fake.stripe);
  assert.equal((await billing.status('user_A')).paid, true);
  const mutations = [
    (s: typeof original) => { s.status = 'past_due'; },
    (s: typeof original) => { s.status = 'canceled'; },
    (s: typeof original) => { s.status = 'trialing'; },
    (s: typeof original) => { s.status = 'unpaid'; },
    (s: typeof original) => { s.pause_collection = {}; },
    (s: typeof original) => { s.items.data[0].price.unit_amount = 100; },
    (s: typeof original) => { s.items.data[0].price.currency = 'eur'; },
    (s: typeof original) => { s.items.data[0].price.recurring.interval = 'year'; },
    (s: typeof original) => { s.items.data[0].price.id = 'price_wrong'; },
    (s: typeof original) => { s.items.data[0].current_period_end = 1; },
    (s: typeof original) => { s.items.data[0].quantity = 2; },
    (s: typeof original) => { s.latest_invoice.status = 'open'; },
    (s: typeof original) => { s.latest_invoice.amount_paid = 0; },
    (s: typeof original) => { s.latest_invoice.parent.subscription_details.subscription = 'sub_other'; },
    (s: typeof original) => { s.metadata.clerk_user_id = 'user_B'; },
    (s: typeof original) => { s.livemode = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original); mutate(changed); fake.state.subscriptions.set(changed.id, changed);
    assert.equal((await billing.status('user_A')).paid, false);
    assert.equal((await transactionResponse(request('user_A'), env, fake.stripe)).status, 402);
  }
  fake.state.subscriptions.set(original.id, original);
  assert.equal((await billing.status('user_A')).paid, true);
});
test('a Stripe outage fails closed and a forged webhook snapshot cannot unlock an account', async () => {
  const env = database(), fake = stripeFixture();
  const sub = await fake.paid(env.DB, 'user_A'); sub.status = 'past_due';
  env.sqlite.prepare('INSERT INTO billing_subscriptions VALUES (?,?,?,?,?,?,?,?)').run('sub_user_A','cus_user_A','user_A','active','price_monthly',9999999999,1,1);
  assert.equal((await transactionResponse(request('user_A'), env, fake.stripe)).status, 402);
  fake.state.offline = true;
  assert.equal((await transactionResponse(request('user_A'), env, fake.stripe)).status, 503);
});
test('cancellation at period end keeps paid access until the paid period expires', async () => {
  const env = database(), fake = stripeFixture();
  const sub = await fake.paid(env.DB, 'user_A');
  Object.assign(sub, { cancel_at_period_end: true });
  assert.equal((await new BillingService(env, fake.stripe).status('user_A')).paid, true);
  sub.items.data[0].current_period_end = 1;
  assert.equal((await new BillingService(env, fake.stripe).status('user_A')).paid, false);
});
test('checkout ignores client pricing and customer IDs and requires a verified session', async () => {
  const env = database(), fake = stripeFixture();
  assert.equal((await billingResponse(request(null, {}), env, 'checkout', fake.stripe)).status, 401);
  for (const body of [{ price: 'price_cheap' }, { customer: 'cus_user_B' }, { return_url: 'https://attacker.example' }]) {
    assert.equal((await billingResponse(request('user_A', body), env, 'checkout', fake.stripe)).status, 400);
  }
  assert.equal(fake.state.calls.length, 0);
});
test('checkout uses server pricing, fixed return URLs and persisted idempotency keys', async () => {
  const env = database(), fake = stripeFixture();
  const billing = new BillingService(env, fake.stripe);
  const urls = await Promise.all([billing.checkout('user_A'), billing.checkout('user_A')]);
  assert.equal(urls[0], urls[1]);
  assert.equal(fake.state.sessions.size, 1);
  assert.equal(await billing.checkout('user_A'), urls[0]);
  const creates = fake.state.calls.filter(c => c.path === '/v1/checkout/sessions' && c.method === 'POST');
  assert.ok(creates.length >= 1);
  assert.equal(new Set(creates.map(c => c.idempotencyKey)).size, 1);
  const params = creates[0].params;
  assert.equal(params.get('line_items[0][price]'), 'price_monthly');
  assert.equal(params.get('line_items[0][quantity]'), '1');
  assert.equal(params.get('mode'), 'subscription');
  assert.equal(params.get('success_url'), 'http://localhost:3000/?billing=success');
  assert.equal(params.get('subscription_data[metadata][clerk_user_id]'), 'user_A');
  assert.equal((await billing.status('user_A')).paid, false, 'open checkout is never paid access');
});
test('checkout rejects an incorrectly configured price and existing subscriptions', async () => {
  const env = database(), fake = stripeFixture();
  fake.state.price.unit_amount = 500;
  await assert.rejects(new BillingService(env, fake.stripe).checkout('user_A'));
  assert.equal(fake.state.customers.size, 0);
  fake.state.price.unit_amount = 499;
  await fake.paid(env.DB, 'user_A');
  const response = await billingResponse(request('user_A', {}), env, 'checkout', fake.stripe);
  assert.equal(response.status, 409);
  assert.equal(fake.state.sessions.size, 0);
});
test('billing portal is bound to the verified owner and never accepts client customer IDs', async () => {
  const env = database(), fake = stripeFixture();
  await fake.paid(env.DB, 'user_A'); await fake.paid(env.DB, 'user_B');
  const response = await billingResponse(request('user_A', {}), env, 'portal', fake.stripe);
  assert.equal(response.status, 200);
  const call = fake.state.calls.find(c => c.path === '/v1/billing_portal/sessions')!;
  assert.equal(call.params.get('customer'), 'cus_user_A');
  assert.equal(call.params.get('return_url'), 'http://localhost:3000/');
  assert.equal((await billingResponse(request('user_A', { customer: 'cus_user_B' }), env, 'portal', fake.stripe)).status, 400);
});
test('missing, forged, stale and live-mode webhooks cannot update billing state', async () => {
  const env = database(), fake = stripeFixture();
  await fake.paid(env.DB, 'user_A');
  const body = event('evt_invalid');
  assert.equal((await webhookResponse(new Request('http://localhost:3000/api/billing/webhook', { method: 'POST', body: JSON.stringify(body) }), env, fake.stripe)).status, 400);
  assert.equal((await webhookResponse(new Request('http://localhost:3000/api/billing/webhook', { method: 'POST', body: JSON.stringify(body), headers: { 'Stripe-Signature': 't=1,v1=forged' } }), env, fake.stripe)).status, 400);
  assert.equal((await webhookResponse(signedRequest(env, fake.stripe, body, 1), env, fake.stripe)).status, 400);
  assert.equal((await webhookResponse(signedRequest(env, fake.stripe, { ...body, livemode: true }), env, fake.stripe)).status, 400);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM billing_events').get()!.n, 0);
});
test('signed webhook retries are idempotent and failed processing remains retryable', async () => {
  const env = database(), fake = stripeFixture(); await fake.paid(env.DB, 'user_A');
  const value = event('evt_once');
  fake.state.offline = true;
  assert.equal((await webhookResponse(signedRequest(env, fake.stripe, value), env, fake.stripe)).status, 503);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM billing_events').get()!.n, 0);
  fake.state.offline = false;
  for (let i = 0; i < 2; i++) assert.equal((await webhookResponse(signedRequest(env, fake.stripe, value), env, fake.stripe)).status, 200);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM billing_events').get()!.n, 1);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM billing_subscriptions').get()!.n, 1);
});
test('out-of-order events fetch current state and cannot restore access after cancellation', async () => {
  const env = database(), fake = stripeFixture(); const sub = await fake.paid(env.DB, 'user_A');
  const billing = new BillingService(env, fake.stripe);
  sub.status = 'canceled';
  await billing.webhook(event('evt_new', 'customer.subscription.deleted', sub.id, 20));
  await billing.webhook(event('evt_old', 'customer.subscription.created', sub.id, 10));
  assert.equal(env.sqlite.prepare('SELECT status FROM billing_subscriptions').get()!.status, 'canceled');
  assert.equal((await billing.status('user_A')).paid, false);
});
test('refund and dispute events block financial access and isolate billing holds by customer', async () => {
  const env = database(), fake = stripeFixture(); await fake.paid(env.DB, 'user_A'); await fake.paid(env.DB, 'user_B');
  fake.state.charges.set('ch_refund', { id: 'ch_refund', customer: 'cus_user_A', livemode: false, amount_refunded: 500, disputed: false });
  const billing = new BillingService(env, fake.stripe);
  await billing.webhook(event('evt_refund', 'charge.refunded', 'ch_refund', 20));
  assert.equal((await billing.status('user_A')).paid, false);
  assert.equal((await billing.status('user_B')).paid, true);
  assert.equal((await transactionResponse(request('user_A'), env, fake.stripe)).status, 402);
});
test('billing responses never leak customer identifiers and reject external return origins', async () => {
  const env = database(), fake = stripeFixture(); await fake.paid(env.DB, 'user_A');
  const result = await billingResponse(request('user_A', undefined, undefined, '/api/billing/status'), env, 'status', fake.stripe);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { paid: true, hasCustomer: true, hasSubscription: true });
  for (const origin of ['javascript:alert(1)', 'http://attacker.example', 'https://example.com/path', 'https://example.com/?next=evil']) {
    assert.throws(() => new BillingService({ ...env, APP_ORIGIN: origin }, fake.stripe).origin());
  }
});

test('expired checkout can be restarted and canceled customers can resubscribe', async () => {
  const env = database(), fake = stripeFixture(), billing = new BillingService(env, fake.stripe);
  const first = await billing.checkout('user_A');
  const firstSession = [...fake.state.sessions.values()][0];
  firstSession.status = 'expired';
  const second = await billing.checkout('user_A');
  assert.notEqual(second, first);
  const sub = await fake.paid(database().DB, 'user_A');
  sub.status = 'canceled';
  const secondSession = [...fake.state.sessions.values()][1];
  secondSession.status = 'complete'; secondSession.subscription = sub.id;
  const third = await billing.checkout('user_A');
  assert.notEqual(third, second);
  assert.equal(fake.state.sessions.size, 3);
});
test('disputes restrict access until won and cannot affect another customer', async () => {
  const env = database(), fake = stripeFixture();
  await fake.paid(env.DB, 'user_A'); await fake.paid(env.DB, 'user_B');
  fake.state.charges.set('ch_dispute', { id: 'ch_dispute', customer: 'cus_user_A', livemode: false, amount_refunded: 0, disputed: true });
  fake.state.disputes.set('dp_test', { id: 'dp_test', charge: 'ch_dispute', status: 'needs_response' });
  const billing = new BillingService(env, fake.stripe);
  await billing.webhook(event('evt_dispute', 'charge.dispute.created', 'dp_test', 10));
  assert.equal((await billing.status('user_A')).paid, false);
  assert.equal((await billing.status('user_B')).paid, true);
  fake.state.disputes.get('dp_test')!.status = 'won';
  await billing.webhook(event('evt_dispute_won', 'charge.dispute.closed', 'dp_test', 20));
  assert.equal((await billing.status('user_A')).paid, true);
});
test('revoking paid access retains the customer’s saved financial records', async () => {
  const env = database(), fake = stripeFixture();
  const sub = await fake.paid(env.DB, 'user_A');
  const row = { id: 'keep', date: '2026-11-01', kind: 'haircut', amount: 4500, note: 'Keep after cancellation' };
  assert.equal((await transactionResponse(request('user_A', { operation: 'save', transaction: row }), env, fake.stripe)).status, 200);
  sub.status = 'canceled';
  assert.equal((await transactionResponse(request('user_A'), env, fake.stripe)).status, 402);
  assert.equal(env.sqlite.prepare('SELECT note FROM transactions WHERE user_id = ?').get('user_A')!.note, row.note);
});
test('billing ownership mismatches and changed webhook payloads are rejected', async () => {
  const env = database(), fake = stripeFixture(); await fake.paid(env.DB, 'user_A');
  fake.state.customers.get('cus_user_A')!.metadata = { app: 'barber-money-tracker', clerk_user_id: 'user_B' };
  assert.equal((await billingResponse(request('user_A', {}), env, 'portal', fake.stripe)).status, 403);
  const value = event('evt_original');
  const original = signedRequest(env, fake.stripe, value);
  const changed = new Request(original.url, { method: 'POST', headers: original.headers, body: JSON.stringify({ ...value, id: 'evt_tampered' }) });
  assert.equal((await webhookResponse(changed, env, fake.stripe)).status, 400);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM billing_events').get()!.n, 0);
});

test('refunded customers cannot be charged again while their access is on hold', async () => {
  const env = database(), fake = stripeFixture();
  const sub = await fake.paid(env.DB, 'user_A'); sub.status = 'canceled';
  env.sqlite.prepare('INSERT INTO billing_holds VALUES (?,?,?,?,?)').run('ch_review','cus_user_A','refund',1,1);
  const response = await billingResponse(request('user_A', {}), env, 'checkout', fake.stripe);
  assert.equal(response.status, 409);
  assert.equal(fake.state.sessions.size, 0);
});
