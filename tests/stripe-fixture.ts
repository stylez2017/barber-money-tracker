import Stripe from 'stripe';
import type { Database } from '../lib/server/storage.ts';

export function stripeFixture() {
  const price = { id: 'price_monthly', object: 'price', active: true, livemode: false, currency: 'usd', unit_amount: 500, type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
  type Subscription = {
    id: string; object: string; customer: string; livemode: boolean; metadata: Record<string,string>; status: string; pause_collection: object | null;
    items: { has_more: boolean; data: { quantity: number; price: typeof price; current_period_end: number }[] };
    latest_invoice: { id: string; object: string; customer: string; livemode: boolean; status: string; amount_paid: number; parent: { subscription_details: { subscription: string } } };
  };
  const state = {
    price, offline: false,
    customers: new Map<string, Record<string, unknown>>(), subscriptions: new Map<string, Subscription>(), sessions: new Map<string, Record<string, unknown>>(),
    charges: new Map<string, Record<string, unknown>>(), disputes: new Map<string, Record<string, unknown>>(),
    calls: [] as { path: string; method: string; params: URLSearchParams; idempotencyKey: string | null }[],
    idempotent: new Map<string, object>(),
  };
  const stripe = new Stripe('sk_test_not_a_real_key_only_for_offline_tests', { maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async (input, init) => {
      if (state.offline) throw new Error('Simulated Stripe outage');
      const url = new URL(String(input));
      const path = url.pathname;
      const method = init?.method ?? 'GET';
      const params = method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body ?? ''));
      const idempotencyKey = new Headers(init?.headers).get('idempotency-key');
      state.calls.push({ path, method, params, idempotencyKey });
      const out = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
      if (method === 'POST' && idempotencyKey && state.idempotent.has(idempotencyKey)) return out(state.idempotent.get(idempotencyKey));
      let result: unknown;
      if (path.startsWith('/v1/prices/')) result = state.price;
      else if (path === '/v1/customers' && method === 'POST') {
        const owner = params.get('metadata[clerk_user_id]')!;
        result = { id: `cus_${owner}`, object: 'customer', livemode: false, metadata: { app: 'barber-money-tracker', clerk_user_id: owner } };
        state.customers.set(`cus_${owner}`, result as Record<string,unknown>);
      } else if (path.startsWith('/v1/customers/')) result = state.customers.get(path.split('/').at(-1)!);
      else if (path === '/v1/subscriptions') result = { object: 'list', data: [...state.subscriptions.values()].filter(s => s.customer === params.get('customer')), has_more: false, url: path };
      else if (path.startsWith('/v1/subscriptions/')) result = state.subscriptions.get(path.split('/').at(-1)!);
      else if (path.startsWith('/v1/invoices/')) result = [...state.subscriptions.values()].find(s => s.latest_invoice.id === path.split('/').at(-1))?.latest_invoice;
      else if (path === '/v1/checkout/sessions' && method === 'POST') {
        const id = `cs_test_${state.sessions.size + 1}`;
        result = { id, object: 'checkout.session', mode: 'subscription', customer: params.get('customer'), livemode: false, url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open', expires_at: Math.floor(Date.now()/1000)+86400, client_reference_id: params.get('client_reference_id'), metadata: { app: 'barber-money-tracker', clerk_user_id: params.get('client_reference_id') }, line_items: { data: [{ price: state.price, quantity: 1 }], has_more: false } };
        state.sessions.set(id, result as Record<string,unknown>);
      } else if (path.startsWith('/v1/checkout/sessions/')) result = state.sessions.get(path.split('/').at(-1)!);
      else if (path === '/v1/billing_portal/sessions') result = { id: 'bps_test', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/test', customer: params.get('customer') };
      else if (path.startsWith('/v1/charges/')) result = state.charges.get(path.split('/').at(-1)!);
      else if (path.startsWith('/v1/disputes/')) result = state.disputes.get(path.split('/').at(-1)!);
      if (!result) return out({ error: { type: 'invalid_request_error', message: `Unexpected test request: ${method} ${path}` } }, 404);
      if (method === 'POST' && idempotencyKey) state.idempotent.set(idempotencyKey, result as object);
      return out(result);
    }),
  });
  async function paid(db: Database, owner: string) {
    state.customers.set(`cus_${owner}`, { id: `cus_${owner}`, object: 'customer', livemode: false, metadata: { app: 'barber-money-tracker', clerk_user_id: owner } });
    await db.prepare('INSERT INTO billing_accounts(user_id,billing_key,checkout_key,stripe_customer_id) VALUES (?,?,?,?)')
      .bind(owner, `key_${owner}`, `checkout_${owner}`, `cus_${owner}`).run();
    const subscription: Subscription = {
      id: `sub_${owner}`, object: 'subscription', customer: `cus_${owner}`, livemode: false, metadata: { app: 'barber-money-tracker', clerk_user_id: owner }, status: 'active', pause_collection: null,
      items: { has_more: false, data: [{ quantity: 1, price: structuredClone(price), current_period_end: Math.floor(Date.now()/1000)+86400 }] },
      latest_invoice: { id: `in_${owner}`, object: 'invoice', customer: `cus_${owner}`, livemode: false, status: 'paid', amount_paid: 500, parent: { subscription_details: { subscription: `sub_${owner}` } } },
    };
    state.subscriptions.set(subscription.id, subscription);
    return subscription;
  }
  return { stripe, state, paid };
}
