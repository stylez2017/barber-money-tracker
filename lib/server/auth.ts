import { createClerkClient } from '@clerk/backend';

export type AuthConfig = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
};
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export async function requireCustomer(request: Request, config: AuthConfig): Promise<string> {
  // APIs accept only explicit session tokens, never a client-supplied customer ID.
  if (!/^Bearer \S+$/i.test(request.headers.get('authorization') ?? '')) {
    throw new HttpError(401, 'Sign in to access your records.');
  }
  if (!config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !config.CLERK_SECRET_KEY) {
    throw new HttpError(503, 'Customer sign-in is not configured.');
  }
  const parties = config.CLERK_AUTHORIZED_PARTIES?.split(',').map(value => value.trim()).filter(Boolean)
    ?? [new URL(request.url).origin];
  try {
    const frontendApi = atob(config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.slice(8).replace(/-/g, '+').replace(/_/g, '/')).replace(/\$$/, '');
    const issuer = new URL(`https://${frontendApi}`).origin;
    const clerk = createClerkClient({ publishableKey: config.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: config.CLERK_SECRET_KEY, jwtKey: config.CLERK_JWT_KEY, telemetry: { disabled: true } });
    // workerd can transfer the body when an SDK constructs a Request from it.
    // Verification needs only URL/headers; keep the financial payload untouched.
    const authRequest = new Request(request.url, { headers: request.headers });
    const state = await clerk.authenticateRequest(authRequest, {
      acceptsToken: 'session_token', authorizedParties: parties,
    });
    const auth = state.toAuth();
    if (!state.isAuthenticated || !auth?.userId || !auth.sessionId ||
        !parties.includes(String(auth.sessionClaims?.azp ?? '')) || auth.sessionClaims?.iss !== issuer) {
      throw new HttpError(401, 'Your session is invalid or expired.');
    }
    return auth.userId;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Your session could not be verified.');
  }
}
export function apiError(error: unknown): Response {
  const status = error instanceof HttpError ? error.status : 503;
  const message = error instanceof HttpError ? error.message : 'Your records could not be accessed. Please retry.';
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
