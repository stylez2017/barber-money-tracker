import Stripe from 'stripe';
import { requireCustomer, apiError, HttpError, type AuthConfig } from './auth.ts';
import { BillingService, billingClient, type BillingConfig } from './billing.ts';
import { readJson } from './handlers.ts';
import { privateTestDatabase, type AccessConfig } from './access.ts';

const headers = { 'Cache-Control': 'no-store' };
export async function billingResponse(request: Request, config: AuthConfig & AccessConfig, action: 'status' | 'checkout' | 'portal', client?: Stripe) {
  try {
    const owner = await requireCustomer(request, config);
    if (action === 'status' && request.method !== 'GET' || action !== 'status' && request.method !== 'POST') throw new HttpError(405, 'Unsupported method.');
    if (action !== 'status' && Object.keys(await readJson(request)).length) throw new HttpError(400, 'Billing details are determined by your account.');
    if (privateTestDatabase(config, owner)) {
      if (action !== 'status') throw new HttpError(403, 'Payments are disabled during private testing.');
      return Response.json({ paid: false, hasCustomer: false, hasSubscription: false, privateTesting: true }, { headers });
    }
    const billing = new BillingService(config, client);
    if (action === 'status') return Response.json(await billing.status(owner), { headers });
    const url = action === 'checkout' ? await billing.checkout(owner) : await billing.portal(owner);
    // Never let a compromised/configured response redirect the browser to arbitrary sites.
    const destination = new URL(url);
    if (destination.protocol !== 'https:' || (action === 'checkout' ? destination.hostname !== 'checkout.stripe.com' : destination.hostname !== 'billing.stripe.com')) throw new Error('Invalid billing destination');
    return Response.json({ url }, { headers });
  } catch (error) { return apiError(error); }
}
export async function webhookResponse(request: Request, config: BillingConfig, client?: Stripe) {
  try {
    if ((config as AccessConfig).APP_ACCESS_MODE === 'private-test') throw new HttpError(403, 'Payments are disabled during private testing.');
    if (!config.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Test-mode webhook verification is not configured.');
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new HttpError(400, 'Missing webhook signature.');
    const stripe = client ?? billingClient(config);
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Missing webhook body.');
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1_000_000) { await reader.cancel(); throw new HttpError(413, 'Webhook body is too large.'); }
        parts.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(new TextDecoder().decode(bytes), signature, config.STRIPE_WEBHOOK_SECRET,
        300, Stripe.createSubtleCryptoProvider());
    } catch { throw new HttpError(400, 'Invalid webhook signature.'); }
    await new BillingService(config, stripe).webhook(event);
    return Response.json({ received: true }, { headers });
  } catch (error) { return apiError(error); }
}
