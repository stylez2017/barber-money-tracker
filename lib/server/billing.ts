import Stripe from 'stripe';
import { MONTHLY_PRICE_CENTS, MONTHLY_PRICE_LABEL } from '../subscription.ts';
import { HttpError } from './auth.ts';
import type { Database } from './storage.ts';

export type BillingConfig = {
  DB?: Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  APP_ORIGIN?: string;
};
export type BillingStatus = { paid: boolean; hasCustomer: boolean; hasSubscription: boolean; privateTesting?: boolean };
type Account = { user_id: string; billing_key: string; stripe_customer_id: string | null;
  checkout_key: string; checkout_session_id: string | null; checkout_expires_at: number };
const app = 'barber-money-tracker';
const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
export function billingClient(config: BillingConfig): Stripe {
  // Live mode is deliberately unavailable until the owner approves activation.
  if (!config.STRIPE_SECRET_KEY || !/^(sk|rk)_test_/.test(config.STRIPE_SECRET_KEY)) {
    throw new HttpError(503, 'Test-mode billing is not configured.');
  }
  return new Stripe(config.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), timeout: 10_000, maxNetworkRetries: 1 });
}
export class BillingService {
  config: BillingConfig;
  stripe: Stripe;
  db: Database;
  constructor(config: BillingConfig, stripe?: Stripe) {
    // Validate mode even when tests supply a Stripe transport.
    if (!config.STRIPE_SECRET_KEY || !/^(sk|rk)_test_/.test(config.STRIPE_SECRET_KEY) || !config.STRIPE_PRICE_ID || !config.STRIPE_WEBHOOK_SECRET || !config.DB) {
      throw new HttpError(503, 'Test-mode billing is not configured.');
    }
    this.config = config; this.stripe = stripe ?? billingClient(config); this.db = config.DB;
  }
  async account(owner: string): Promise<Account | undefined> {
    return (await this.db.prepare('SELECT * FROM billing_accounts WHERE user_id = ?').bind(owner).all<Account>()).results[0];
  }
  async ensureAccount(owner: string): Promise<Account> {
    await this.db.prepare('INSERT INTO billing_accounts(user_id,billing_key,checkout_key) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING')
      .bind(owner, crypto.randomUUID(), crypto.randomUUID()).run();
    const account = await this.account(owner);
    if (!account) throw new Error('Billing account could not be saved');
    return account;
  }
  origin(): string {
    let url: URL;
    try { url = new URL(this.config.APP_ORIGIN ?? ''); } catch { throw new HttpError(503, 'Billing return URL is not configured.'); }
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new HttpError(503, 'Billing return URL is not configured.');
    }
    return url.origin;
  }
  validPrice(price: Stripe.Price): boolean {
    return price.id === this.config.STRIPE_PRICE_ID && price.livemode === false && price.currency === 'usd' && price.unit_amount === MONTHLY_PRICE_CENTS &&
      price.type === 'recurring' && price.recurring?.interval === 'month' && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed';
  }
  async ensureCustomer(owner: string): Promise<Account & { stripe_customer_id: string }> {
    let account = await this.ensureAccount(owner);
    if (!account.stripe_customer_id) {
      const customer = await this.stripe.customers.create({ metadata: { app, clerk_user_id: owner } }, { idempotencyKey: `${account.billing_key}:customer` });
      if (customer.livemode) throw new Error('Live billing is disabled');
      await this.db.prepare('UPDATE billing_accounts SET stripe_customer_id = ? WHERE user_id = ? AND stripe_customer_id IS NULL').bind(customer.id, owner).run();
      account = (await this.account(owner))!;
    }
    if (!account.stripe_customer_id) throw new Error('Billing account is not linked');
    await this.verifyCustomer(account.stripe_customer_id, owner);
    return account as Account & { stripe_customer_id: string };
  }
  async verifyCustomer(customerId: string, owner: string) {
    const customer = await this.stripe.customers.retrieve(customerId);
    if (customer.deleted || customer.livemode || customer.metadata.app !== app || customer.metadata.clerk_user_id !== owner) {
      throw new HttpError(403, 'Billing account does not match this customer.');
    }
  }
  async subscriptions(customer: string): Promise<Stripe.Subscription[]> {
    const rows: Stripe.Subscription[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await this.stripe.subscriptions.list({ customer, status: 'all', limit: 100, expand: ['data.latest_invoice'], ...(cursor ? { starting_after: cursor } : {}) });
      rows.push(...result.data);
      if (!result.has_more) return rows;
      const next = result.data.at(-1)?.id;
      if (!next || next === cursor) break;
      cursor = next;
    }
    throw new Error('Subscription list could not be fully checked');
  }
  async paidSubscription(subscription: Stripe.Subscription, customerId: string, owner: string): Promise<boolean> {
    if (subscription.livemode || objectId(subscription.customer) !== customerId || subscription.metadata.app !== app ||
        subscription.metadata.clerk_user_id !== owner || subscription.status !== 'active' || subscription.pause_collection || subscription.items.has_more || subscription.items.data.length !== 1) return false;
    const item = subscription.items.data[0];
    if (item.quantity !== 1 || !this.validPrice(item.price) || item.current_period_end <= Math.floor(Date.now() / 1000)) return false;
    let invoice = subscription.latest_invoice;
    if (typeof invoice === 'string') invoice = await this.stripe.invoices.retrieve(invoice);
    return !!invoice && !invoice.livemode && objectId(invoice.customer) === customerId && invoice.status === 'paid' && invoice.amount_paid >= MONTHLY_PRICE_CENTS &&
      objectId(invoice.parent?.subscription_details?.subscription) === subscription.id;
  }
  async status(owner: string): Promise<BillingStatus> {
    const account = await this.account(owner);
    if (!account?.stripe_customer_id) return { paid: false, hasCustomer: false, hasSubscription: false };
    await this.verifyCustomer(account.stripe_customer_id, owner);
    const holds = await this.db.prepare('SELECT charge_id FROM billing_holds WHERE stripe_customer_id = ? AND blocked = 1 LIMIT 1')
      .bind(account.stripe_customer_id).all<{ charge_id: string }>();
    const subscriptions = await this.subscriptions(account.stripe_customer_id);
    const hasSubscription = subscriptions.some(s => !['canceled','incomplete_expired'].includes(s.status));
    // Never grant access from a redirect, browser flag or stale webhook snapshot.
    for (const subscription of subscriptions) {
      if (!holds.results.length && await this.paidSubscription(subscription, account.stripe_customer_id, owner)) return { paid: true, hasCustomer: true, hasSubscription };
    }
    return { paid: false, hasCustomer: true, hasSubscription };
  }
  async requirePaid(owner: string) {
    if (!(await this.status(owner)).paid) throw new HttpError(402, `An active ${MONTHLY_PRICE_LABEL}/month subscription is required.`);
  }
  async checkout(owner: string): Promise<string> {
    const origin = this.origin();
    const price = await this.stripe.prices.retrieve(this.config.STRIPE_PRICE_ID!);
    if (!price.active || !this.validPrice(price)) throw new HttpError(503, `The ${MONTHLY_PRICE_LABEL}/month subscription price is not configured correctly.`);
    let account = await this.ensureCustomer(owner);
    const holds = await this.db.prepare('SELECT charge_id FROM billing_holds WHERE stripe_customer_id = ? AND blocked = 1 LIMIT 1').bind(account.stripe_customer_id).all();
    if (holds.results.length) throw new HttpError(409, 'Billing requires review before another subscription can be started.');
    if ((await this.subscriptions(account.stripe_customer_id)).some(s => !['canceled','incomplete_expired'].includes(s.status))) {
      throw new HttpError(409, 'A subscription already exists. Use Manage subscription.');
    }
    if (account.checkout_session_id) {
      const existing = await this.stripe.checkout.sessions.retrieve(account.checkout_session_id, { expand: ['line_items.data.price'] });
      if (objectId(existing.customer) !== account.stripe_customer_id || existing.livemode || existing.mode !== 'subscription' || existing.client_reference_id !== owner || existing.metadata?.app !== app || existing.metadata?.clerk_user_id !== owner) throw new Error('Checkout account mismatch');
      const line = existing.line_items?.data[0];
      if (existing.status === 'open' && (!line?.price || !this.validPrice(line.price) || line.quantity !== 1 || existing.line_items?.data.length !== 1 || existing.line_items?.has_more)) throw new Error('Pending checkout has a different plan');
      if (existing.status === 'open' && existing.url) return existing.url;
      if (existing.status === 'complete') {
        const oldSubscriptionId = objectId(existing.subscription);
        const oldSubscription = oldSubscriptionId ? await this.stripe.subscriptions.retrieve(oldSubscriptionId) : null;
        if (!oldSubscription || !['canceled','incomplete_expired'].includes(oldSubscription.status)) throw new HttpError(409, 'Checkout is processing. Refresh subscription status shortly.');
      }
      await this.db.prepare('UPDATE billing_accounts SET checkout_key = ?, checkout_session_id = NULL, checkout_expires_at = 0 WHERE user_id = ? AND checkout_session_id = ?')
        .bind(crypto.randomUUID(), owner, account.checkout_session_id).run();
      account = (await this.account(owner)) as typeof account;
    }
    // Persisted key makes simultaneous clicks and failed-response retries reuse one session.
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription', customer: account.stripe_customer_id,
      client_reference_id: owner, line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: false,
      metadata: { app, clerk_user_id: owner }, subscription_data: { metadata: { app, clerk_user_id: owner } },
      success_url: `${origin}/?billing=success`, cancel_url: `${origin}/?billing=cancelled`,
    }, { idempotencyKey: `${account.checkout_key}:checkout` });
    if (session.livemode || objectId(session.customer) !== account.stripe_customer_id || !session.url) throw new Error('Invalid checkout response');
    await this.db.prepare('UPDATE billing_accounts SET checkout_session_id = ?, checkout_expires_at = ? WHERE user_id = ? AND checkout_key = ?')
      .bind(session.id, session.expires_at, owner, account.checkout_key).run();
    return session.url;
  }
  async portal(owner: string): Promise<string> {
    const account = await this.account(owner);
    if (!account?.stripe_customer_id) throw new HttpError(409, 'No billing account exists yet.');
    await this.verifyCustomer(account.stripe_customer_id, owner);
    const portal = await this.stripe.billingPortal.sessions.create({ customer: account.stripe_customer_id, return_url: `${this.origin()}/` });
    return portal.url;
  }
  async webhook(event: Stripe.Event) {
    if (event.livemode) throw new HttpError(400, 'Live events are not accepted.');
    const seen = (await this.db.prepare('SELECT event_id FROM billing_events WHERE event_id = ?').bind(event.id).all()).results.length;
    if (seen) return;
    const object = event.data.object as unknown as { object: string; id: string; customer?: string; subscription?: string; charge?: string; parent?: { subscription_details?: { subscription?: string } } };
    const supported = event.type.startsWith('customer.subscription.') || ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','invoice.paid','invoice.payment_failed','invoice.payment_action_required','charge.refunded','charge.dispute.created','charge.dispute.updated','charge.dispute.closed'].includes(event.type);
    if (!supported) return;
    const statements = [];
    if (event.type.startsWith('charge.')) {
      const dispute = event.type.startsWith('charge.dispute.') ? await this.stripe.disputes.retrieve(object.id) : null;
      const charge = await this.stripe.charges.retrieve(dispute ? String(objectId(dispute.charge)) : object.id);
      const customerId = objectId(charge.customer);
      if (charge.livemode || !customerId) throw new HttpError(400, 'Invalid billing event.');
      const account = (await this.db.prepare('SELECT * FROM billing_accounts WHERE stripe_customer_id = ?').bind(customerId).all<Account>()).results[0];
      if (!account) return;
      await this.verifyCustomer(customerId, account.user_id);
      const blocked = charge.amount_refunded > 0 || (dispute ? !['won','warning_closed'].includes(dispute.status) : charge.disputed);
      statements.push(this.db.prepare(`INSERT INTO billing_holds(charge_id,stripe_customer_id,reason,blocked,event_created) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM billing_events WHERE event_id = ?) ON CONFLICT(charge_id) DO UPDATE SET blocked=excluded.blocked,reason=excluded.reason,event_created=excluded.event_created WHERE excluded.event_created >= billing_holds.event_created`)
        .bind(charge.id, customerId, charge.amount_refunded > 0 ? 'refund' : 'dispute', blocked ? 1 : 0, event.created, event.id));
    } else {
      let subscriptionId: string | undefined;
      if (event.type.startsWith('customer.subscription.')) subscriptionId = object.id;
      else if (event.type.startsWith('checkout.session.')) {
        const session = await this.stripe.checkout.sessions.retrieve(object.id);
        if (session.livemode || session.mode !== 'subscription') return;
        subscriptionId = objectId(session.subscription);
      } else {
        const invoice = await this.stripe.invoices.retrieve(object.id);
        subscriptionId = objectId(invoice.parent?.subscription_details?.subscription);
      }
      if (!subscriptionId) return;
      // Fetch current state: Stripe events can arrive late or out of order.
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
      const customerId = objectId(subscription.customer);
      if (!customerId || subscription.livemode) throw new HttpError(400, 'Invalid subscription event.');
      const account = (await this.db.prepare('SELECT * FROM billing_accounts WHERE stripe_customer_id = ?').bind(customerId).all<Account>()).results[0];
      if (!account) return;
      await this.verifyCustomer(customerId, account.user_id);
      if (subscription.metadata.app !== app || subscription.metadata.clerk_user_id !== account.user_id) throw new HttpError(400, 'Subscription ownership mismatch.');
      const item = subscription.items.data[0];
      statements.push(this.db.prepare(`INSERT INTO billing_subscriptions(stripe_subscription_id,stripe_customer_id,user_id,status,price_id,paid_through,event_created,refreshed_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM billing_events WHERE event_id = ?) ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,price_id=excluded.price_id,paid_through=excluded.paid_through,event_created=excluded.event_created,refreshed_at=excluded.refreshed_at WHERE excluded.event_created >= billing_subscriptions.event_created`)
        .bind(subscription.id, customerId, account.user_id, subscription.status, item?.price.id ?? '', item?.current_period_end ?? 0, event.created, Math.floor(Date.now() / 1000), event.id));
    }
    statements.push(this.db.prepare('INSERT INTO billing_events(event_id,event_type,event_created,processed_at) VALUES (?,?,?,?) ON CONFLICT(event_id) DO NOTHING')
      .bind(event.id, event.type, event.created, Math.floor(Date.now() / 1000)));
    // D1 batches are atomic; failures remain retryable, and concurrent duplicates do no work.
    await this.db.batch(statements);
  }
}
