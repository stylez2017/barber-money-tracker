import { HttpError } from './auth.ts';
import { BillingService, type BillingConfig } from './billing.ts';
import type Stripe from 'stripe';
import type { Database } from './storage.ts';

export type AccessConfig = BillingConfig & {
  APP_ACCESS_MODE?: string;
  PRIVATE_TEST_USER_IDS?: string;
  PRIVATE_TEST_DB?: Database;
};
export function privateTestDatabase(config: AccessConfig, owner: string): Database | null {
  if (config.APP_ACCESS_MODE === undefined || config.APP_ACCESS_MODE === 'subscription') return null;
  if (config.APP_ACCESS_MODE !== 'private-test') throw new HttpError(503, 'Account access is not configured.');
  const approved = config.PRIVATE_TEST_USER_IDS?.split(',').map(id => id.trim()).filter(Boolean) ?? [];
  if (!approved.length || !config.PRIVATE_TEST_DB || config.PRIVATE_TEST_DB === config.DB) {
    throw new HttpError(503, 'Private testing is not configured.');
  }
  if (!approved.includes(owner)) throw new HttpError(403, 'This account is not approved for private testing.');
  return config.PRIVATE_TEST_DB;
}
export async function financialDatabase(config: AccessConfig, owner: string, client?: Stripe): Promise<Database> {
  const test = privateTestDatabase(config, owner);
  if (test) return test;
  if (!config.DB) throw new HttpError(503, 'Financial storage is not configured.');
  await new BillingService(config, client).requirePaid(owner);
  return config.DB;
}
