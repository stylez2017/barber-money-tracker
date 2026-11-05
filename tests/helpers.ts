import { generateKeyPairSync, sign } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { AuthConfig } from '../lib/server/auth.ts';
import type { Database, Statement } from '../lib/server/storage.ts';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const authConfig: AuthConfig = {
  CLERK_SECRET_KEY: 'sk_test_not_a_real_key_only_for_offline_tests',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('example.clerk.accounts.dev$').toString('base64'),
  CLERK_JWT_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000',
};
export function token(user: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: user, sid: 'sess_test', iss: 'https://example.clerk.accounts.dev', azp: 'http://localhost:3000', iat: now, nbf: now - 1, exp: now + 60, v: 2, ...overrides })).toString('base64url');
  return `${head}.${payload}.${sign('RSA-SHA256', Buffer.from(`${head}.${payload}`), privateKey).toString('base64url')}`;
}
export function request(user: string | null, body?: unknown, jwt?: string, path = '/api/transactions') {
  return new Request(`http://localhost:3000${path}`, {
    method: body ? 'POST' : 'GET', headers: { ...(user ? { Authorization: `Bearer ${jwt ?? token(user)}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0001_transactions.sql','0002_billing.sql','0003_savings.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  const db: Database = {
    prepare(sql): Statement {
      let values: (string | number | null)[] = [];
      return { bind(...args) { values = args; return this; },
        async all<T>() { return { results: sqlite.prepare(sql).all(...values) as T[] }; },
        async run() { return sqlite.prepare(sql).run(...values); } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for (const stmt of statements) await stmt.run(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return { ...authConfig, DB: db, sqlite,
    STRIPE_SECRET_KEY: 'sk_test_not_a_real_key_only_for_offline_tests', STRIPE_WEBHOOK_SECRET: 'whsec_not_real_offline_test', STRIPE_PRICE_ID: 'price_monthly', APP_ORIGIN: 'http://localhost:3000' };
}
