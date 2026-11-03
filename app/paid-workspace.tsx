'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BillingStatus } from '../lib/server/billing';
import type { AccountApi } from '../lib/transactions';
import Tracker from './tracker';
import { MONTHLY_PRICE_LABEL } from '../lib/subscription';

export default function PaidWorkspace({ api, user, onSignOut }: {
  api: AccountApi; user: { id: string; email: string }; onSignOut: () => Promise<void>;
}) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const response = await api('/api/billing/status');
      if (!response.ok) throw new Error();
      const next = await response.json();
      if (typeof next.paid !== 'boolean' || typeof next.hasCustomer !== 'boolean' || typeof next.hasSubscription !== 'boolean' || (next.privateTesting !== undefined && typeof next.privateTesting !== 'boolean')) throw new Error();
      if (mounted.current) { setStatus(next); setError(''); }
    } catch { if (mounted.current) { setError('Your account access could not be verified. Please retry.'); } }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const focus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    const timer = setInterval(focus, 60_000);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);
  const guardedApi: AccountApi = useCallback(async (path, init) => {
    try {
      const response = await api(path, init);
      if (mounted.current && response.status === 402) setStatus({ paid: false, hasCustomer: true, hasSubscription: true });
      if (mounted.current && response.status === 401) { setStatus(null); setError('Please sign in again to continue.'); }
      if (mounted.current && response.status === 503) setError('Your records could not be accessed. Please retry.');
      return response;
    } catch (error) {
      if (mounted.current) setError('Connection lost. Your unsaved form is still here; please retry.');
      throw error;
    }
  }, [api]);
  async function billingAction(action: 'checkout' | 'portal') {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const response = await api(`/api/billing/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Billing is temporarily unavailable.');
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com','billing.stripe.com'].includes(url.hostname)) throw new Error('Unable to open billing.');
      window.location.assign(url.href);
    } catch (error) { setError(error instanceof Error ? error.message : 'Billing is temporarily unavailable.'); }
    finally { locked.current = false; setBusy(false); }
  }
  if (status?.paid || status?.privateTesting) return <>
    {error && <div role="alert" className="notice">{error}</div>}
    <Tracker privateTesting={status.privateTesting === true} api={guardedApi} user={user} onSignOut={onSignOut} onManageSubscription={status.privateTesting ? undefined : () => billingAction('portal')}/>
  </>;
  return <main className="auth-shell"><section className="auth-card">
    <div className="eyebrow">BARBER MONEY TRACKER</div>
    <h1>{status ? 'Your business, in focus.' : 'Checking your account access'}</h1>
    <p>Signed in as {user.email}</p>
    {status && <><p>Track your income, tips, rent, and expenses for <strong>{MONTHLY_PRICE_LABEL} USD per month</strong>. Your records stay in your own account.</p>
      <p>Billing is currently in test mode. No real payments are enabled.</p>
      {!status.hasSubscription && <button className="primary-button" disabled={busy} onClick={() => billingAction('checkout')}>{busy ? 'Opening billing…' : 'Subscribe for {MONTHLY_PRICE_LABEL}/month'}</button>}
      {status.hasCustomer && <button className="secondary-button" disabled={busy} onClick={() => billingAction('portal')}>Manage subscription</button>}
      {status.hasSubscription && <p>Your subscription is not currently eligible for access. Manage your subscription to review payment details.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    <div className="auth-links"><button className="text-button" disabled={busy} onClick={refresh}>Refresh subscription status</button><button className="text-button" disabled={busy} onClick={onSignOut}>Sign out</button></div>
  </section></main>;
}
