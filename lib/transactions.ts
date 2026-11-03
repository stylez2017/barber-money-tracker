import { type Transaction, validTransaction } from './finance.ts';
export const LEGACY_KEY = 'barber-money-tracker-v1';
export type AccountApi = (path: string, init?: RequestInit) => Promise<Response>;
// Client-side race guard only; the server independently verifies every token.
export function checkAccountToken(token: string, owner: string, sessionId: string) {
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.sub !== owner || claims.sid !== sessionId) throw new Error();
  } catch { throw new Error('Your account changed. Please retry in your current account.'); }
}
export function parseLegacy(raw: string): Transaction[] {
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows) || !rows.every(row => validTransaction(row) && row.id.length > 0 && row.id.length <= 128 && row.note.length <= 160) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Invalid browser records');
  return rows;
}
async function responseJson(response: Response) {
  if (!response.ok) throw new Error('Your request could not be completed.');
  return response.json();
}
export async function loadTransactions(api: AccountApi): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  let cursor = '';
  while (true) {
    const page = await responseJson(await api(`/api/transactions?after=${encodeURIComponent(cursor)}`));
    if (!Array.isArray(page.rows) || !page.rows.every(validTransaction)) throw new Error('Invalid cloud records');
    rows.push(...page.rows);
    if (page.next === null) return rows;
    if (typeof page.next !== 'string' || page.next <= cursor) throw new Error('Invalid record cursor');
    cursor = page.next;
  }
}
async function mutate(api: AccountApi, body: unknown) {
  const result = await responseJson(await api('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  if (result?.saved !== true) throw new Error('The server did not confirm this change. Please retry.');
}
export async function writeTransaction(api: AccountApi, row: Transaction) { await mutate(api, { operation: 'save', transaction: row }); }
export async function removeTransaction(api: AccountApi, id: string) { await mutate(api, { operation: 'delete', id }); }
export async function importTransactions(api: AccountApi, rows: Transaction[]) {
  for (let offset = 0; offset < rows.length; offset += 100) await mutate(api, { operation: 'import', rows: rows.slice(offset, offset + 100) });
}
