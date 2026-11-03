import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireCustomer } from '../lib/server/auth.ts';
import { sessionResponse, transactionResponse as transactions } from '../lib/server/handlers.ts';
import { authConfig as config, token, request, database } from './helpers.ts';
import { stripeFixture } from './stripe-fixture.ts';
const billing = stripeFixture();
const transactionResponse = (req: Request, env: ReturnType<typeof database>) => transactions(req, env, billing.stripe);
async function paidDatabase() {
 const env = database();
 await billing.paid(env.DB, 'user_A');
 await billing.paid(env.DB, 'user_B');
 return env;
}
const row = { id: 'same-id', date: '2026-11-01', kind: 'haircut', amount: 4500, note: 'A only' };

test('real Clerk verifier accepts a signed session and rejects missing, expired, tampered and wrong-party sessions', async () => {
  assert.equal(await requireCustomer(request('user_A'), config), 'user_A');
  const valid = token('user_A');
  for (const req of [request(null), request('user_A', undefined, valid.slice(0, -20) + 'invalid'), request('user_A', undefined, token('user_A', { exp: 1 })), request('user_A', undefined, token('user_A', { azp: 'https://attacker.example' })), request('user_A', undefined, token('user_A', { sid: null })), request('user_A', undefined, token('user_A', { iss: 'https://other.clerk.accounts.dev' })), request('user_A', undefined, token('user_A', { azp: null }))]) {
    assert.equal((await sessionResponse(req, config)).status, 401);
  }
  assert.equal((await sessionResponse(request('user_A'), {})).status, 503);
});
test('two verified customers can use the same record ID without reading or changing one another’s records', async () => {
  const env = await paidDatabase();
  assert.equal((await transactionResponse(request('user_A', { operation: 'save', transaction: row }), env)).status, 200);
  let b = await (await transactionResponse(request('user_B'), env)).json();
  assert.deepEqual(b.rows, []);
  assert.equal((await transactionResponse(request('user_B', { operation: 'save', transaction: { ...row, note: 'B only' } }), env)).status, 200);
  await transactionResponse(request('user_B', { operation: 'delete', id: row.id }), env);
  const a = await (await transactionResponse(request('user_A'), env)).json();
  assert.equal(a.rows[0].note, 'A only');
  b = await (await transactionResponse(request('user_B'), env)).json();
  assert.deepEqual(b.rows, []);
});
test('unauthenticated writes and client-supplied ownership are rejected', async () => {
  const env = await paidDatabase();
  assert.equal((await transactionResponse(request(null, { operation: 'save', transaction: row }), env)).status, 401);
  for (const body of [{ operation: 'save', user_id: 'user_A', transaction: row }, { operation: 'save', transaction: { ...row, user_id: 'user_A' } }, { operation: 'save', transaction: { ...row, amount: -1 } }]) {
    assert.equal((await transactionResponse(request('user_B', body), env)).status, 400);
  }
  const req = new Request('http://localhost:3000/api/transactions?user_id=user_A', { headers: { Authorization: `Bearer ${token('user_B')}` } });
  const response = await transactionResponse(req, env);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('import retries preserve newer cloud edits and remain scoped to the verified customer', async () => {
  const env = await paidDatabase();
  await transactionResponse(request('user_A', { operation: 'save', transaction: { ...row, note: 'Newer cloud edit' } }), env);
  for (let i = 0; i < 2; i++) await transactionResponse(request('user_A', { operation: 'import', rows: [row] }), env);
  const a = await (await transactionResponse(request('user_A'), env)).json();
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].note, 'Newer cloud edit');
  const b = await (await transactionResponse(request('user_B'), env)).json();
  assert.deepEqual(b.rows, []);
});
