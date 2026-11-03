import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AuthConfig } from './auth';
import type { BillingConfig } from './billing';
import type { Database } from './storage';

export type RuntimeConfig = AuthConfig & BillingConfig & { DB?: Database };
export async function runtimeConfig(): Promise<RuntimeConfig> {
  try {
    return (await getCloudflareContext({ async: true })).env as unknown as RuntimeConfig;
  } catch {
    // Ordinary Next.js development can use local auth values. D1 still requires workerd.
    return {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      CLERK_JWT_KEY: process.env.CLERK_JWT_KEY,
      CLERK_AUTHORIZED_PARTIES: process.env.CLERK_AUTHORIZED_PARTIES,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
      APP_ORIGIN: process.env.APP_ORIGIN,
    };
  }
}
