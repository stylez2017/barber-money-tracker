'use client';
import { useCallback, useEffect, useState } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import PaidWorkspace from './paid-workspace';
import { checkAccountToken, type AccountApi } from '../lib/transactions';

export default function AccountApp({ publishableKey }: { publishableKey: string }) {
  if (!publishableKey) return <main className="auth-shell"><section className="auth-card"><h1>Account setup required</h1><p>Customer sign-in is not configured yet. Please contact the app owner.</p></section></main>;
  return <ClerkProvider publishableKey={publishableKey}><CustomerWorkspace/></ClerkProvider>;
}
function CustomerWorkspace() {
  const { isLoaded, isSignedIn, userId, sessionId, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [signup, setSignup] = useState(false);
  const [verified, setVerified] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setSignup(new URLSearchParams(window.location.search).get('signup') === '1'); }, []);
  const api: AccountApi = useCallback(async (path, init) => {
    const token = await getToken();
    if (!token || !userId || !sessionId) throw new Error('Sign in again to continue.');
    checkAccountToken(token, userId, sessionId);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...init, headers, cache: 'no-store' });
  }, [getToken, userId, sessionId]);
  const account = `${userId ?? ''}:${sessionId ?? ''}`;
  useEffect(() => {
    let active = true;
    setVerified(''); setError('');
    if (isSignedIn && userId) {
      api('/api/session').then(async response => {
        if (!response.ok || (await response.json()).userId !== userId) throw new Error();
        if (active) setVerified(account);
      }).catch(() => { if (active) setError('Your account could not be verified. Please retry or sign out.'); });
    }
    return () => { active = false; };
  }, [api, isSignedIn, userId, account, attempt]);
  if (!isLoaded) return <main className="auth-shell"><p role="status">Loading your account…</p></main>;
  if (!isSignedIn) return <main className="auth-shell"><section><div className="eyebrow">BARBER MONEY TRACKER</div>
    {signup ? <SignUp routing="hash" signInUrl="/" forceRedirectUrl="/"/> : <SignIn routing="hash" signUpUrl="/?signup=1" forceRedirectUrl="/"/>}
  </section></main>;
  if (verified !== account || !user) return <main className="auth-shell"><section className="auth-card">
    <p role="status">{error || 'Verifying your account…'}</p>
    {error && <><button className="primary-button" onClick={() => setAttempt(value => value + 1)}>Retry</button><button className="secondary-button" onClick={() => signOut()}>Sign out</button></>}
  </section></main>;
  return <PaidWorkspace key={account} api={api} user={{ id: user.id, email: user.primaryEmailAddress?.emailAddress ?? '' }} onSignOut={async () => { await signOut(); }}/>;
}
