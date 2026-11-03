// Imported ONLY by the temporary local integration-test wrapper, never by app code.
const app = 'barber-money-tracker';
const price = { id: 'price_monthly', object: 'price', active: true, livemode: false, currency: 'usd', unit_amount: 500, type: 'recurring', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
const customers = new Map();
const subscriptions = new Map();
const sessions = new Map();
const idempotent = new Map();
for (const owner of ['user_A','user_B']) {
  const customer = `cus_${owner}`, subscription = `sub_${owner}`;
  customers.set(customer, { id: customer, object: 'customer', livemode: false, metadata: { app, clerk_user_id: owner } });
  subscriptions.set(subscription, { id: subscription, object: 'subscription', customer, livemode: false, metadata: { app, clerk_user_id: owner }, status: 'active', pause_collection: null,
    items: { has_more: false, data: [{ quantity: 1, price, current_period_end: Math.floor(Date.now()/1000)+86400 }] },
    latest_invoice: { id: `in_${owner}`, object: 'invoice', customer, livemode: false, status: 'paid', amount_paid: 500, parent: { subscription_details: { subscription } } },
  });
}
export function fixtureControl(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/__local_fixture/status') return null;
  const sub = subscriptions.get(`sub_${url.searchParams.get('owner')}`);
  if (!sub) return Response.json({ error: 'Unknown fixture' }, { status: 404 });
  sub.status = url.searchParams.get('status') ?? 'active';
  return Response.json({ updated: true });
}
export function installFixture() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    if (url.hostname !== 'api.stripe.com') return original(input, init);
    // Workerd freezes the clock during module initialization; generate future
    // fixture periods inside the request context instead.
    for (const sub of subscriptions.values()) sub.items.data[0].current_period_end = Math.floor(Date.now()/1000)+86400;
    const method = init?.method ?? 'GET';
    const params = method === 'GET' ? url.searchParams : new URLSearchParams(String(init?.body ?? ''));
    const key = new Headers(init?.headers).get('idempotency-key');
    if (method === 'POST' && key && idempotent.has(key)) return Response.json(idempotent.get(key));
    let result;
    if (url.pathname.startsWith('/v1/prices/')) result = price;
    else if (url.pathname === '/v1/customers' && method === 'POST') {
      const owner = params.get('metadata[clerk_user_id]');
      result = { id: `cus_${owner}`, object: 'customer', livemode: false, metadata: { app, clerk_user_id: owner } };
      customers.set(result.id, result);
    } else if (url.pathname.startsWith('/v1/customers/')) result = customers.get(url.pathname.split('/').at(-1));
    else if (url.pathname === '/v1/subscriptions') result = { object: 'list', data: [...subscriptions.values()].filter(s => s.customer === params.get('customer')), has_more: false };
    else if (url.pathname.startsWith('/v1/subscriptions/')) result = subscriptions.get(url.pathname.split('/').at(-1));
    else if (url.pathname.startsWith('/v1/invoices/')) result = [...subscriptions.values()].find(s => s.latest_invoice.id === url.pathname.split('/').at(-1))?.latest_invoice;
    else if (url.pathname === '/v1/checkout/sessions' && method === 'POST') {
      const id = `cs_test_${sessions.size+1}`;
      result = { id, object: 'checkout.session', mode: 'subscription', customer: params.get('customer'), livemode: false, status: 'open', expires_at: Math.floor(Date.now()/1000)+86400, url: `https://checkout.stripe.com/c/pay/${id}`, client_reference_id: params.get('client_reference_id'), metadata: { app, clerk_user_id: params.get('client_reference_id') }, line_items: { data: [{ price, quantity: 1 }], has_more: false } };
      sessions.set(id, result);
    } else if (url.pathname.startsWith('/v1/checkout/sessions/')) result = sessions.get(url.pathname.split('/').at(-1));
    else if (url.pathname === '/v1/billing_portal/sessions') result = { id: 'bps_test', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/test' };
    if (!result) return Response.json({ error: { message: `Unsupported local Stripe fixture: ${url.pathname}`, type: 'invalid_request_error' } }, { status: 404 });
    if (key && method === 'POST') idempotent.set(key, result);
    return Response.json(result);
  };
}
