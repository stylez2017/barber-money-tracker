import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacy, loadTransactions, importTransactions, checkAccountToken, writeTransaction, removeTransaction } from '../lib/transactions.ts';
const row = { id: 'legacy-id', date: '2026-11-01', kind: 'haircut' as const, amount: 4500, note: 'Cut' };
test('legacy import rejects corrupt data and duplicate IDs without modifying the source', () => {
  const source = JSON.stringify([row]);
  assert.deepEqual(parseLegacy(source), [row]);
  assert.equal(source, JSON.stringify([row]));
  for (const value of [[row, row], [{ ...row, amount: -1 }], [{ ...row, note: 'x'.repeat(161) }], {}]) assert.throws(() => parseLegacy(JSON.stringify(value)));
});
test('all pages are loaded, without sending a client-selected owner', async () => {
  const paths: string[] = [];
  const records = await loadTransactions(async path => {
    paths.push(path);
    return Response.json(paths.length === 1 ? { rows: [row], next: row.id } : { rows: [{ ...row, id: 'next' }], next: null });
  });
  assert.equal(records.length, 2);
  assert.deepEqual(paths, ['/api/transactions?after=', '/api/transactions?after=legacy-id']);
});
test('failed loads, corrupt records and repeated cursors never return partial totals', async () => {
  for (const result of [new Response(null, { status: 401 }), Response.json({ rows: [{ ...row, amount: -1 }], next: null }), Response.json({ rows: [row], next: '' })]) {
    await assert.rejects(loadTransactions(async () => result));
  }
});
test('browser imports use bounded requests and do not supply customer IDs', async () => {
  const sizes: number[] = [];
  await importTransactions(async (_, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body), ['operation', 'rows']);
    sizes.push(body.rows.length);
    return Response.json({ saved: true });
  }, Array.from({ length: 201 }, (_, i) => ({ ...row, id: String(i) })));
  assert.deepEqual(sizes, [100, 100, 1]);
});

test('account-switch races cannot send one customer’s draft with another session token', () => {
  const jwt = 'header.' + Buffer.from(JSON.stringify({ sub: 'user_B', sid: 'session_B' })).toString('base64url') + '.signature';
  assert.throws(() => checkAccountToken(jwt, 'user_A', 'session_A'));
  assert.doesNotThrow(() => checkAccountToken(jwt, 'user_B', 'session_B'));
});

test('offline, failed and unacknowledged mutations never report a successful save', async () => {
  for (const api of [async () => { throw new Error('Offline'); }, async () => new Response(null,{status:503}), async () => Response.json({})]) {
    await assert.rejects(writeTransaction(api,row));
    await assert.rejects(removeTransaction(api,row.id));
  }
  await assert.doesNotReject(writeTransaction(async () => Response.json({saved:true}),row));
});
