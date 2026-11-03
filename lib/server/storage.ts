import { type Transaction, validTransaction } from '../finance.ts';
import { HttpError } from './auth.ts';

export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export function transactionInput(value: unknown): Transaction {
  if (!validTransaction(value) || !value.id.length || value.id.length > 128 || value.note.length > 160 ||
      Object.keys(value).some(key => !['id', 'date', 'kind', 'amount', 'note'].includes(key))) {
    throw new HttpError(400, 'Enter a valid transaction.');
  }
  return { id: value.id, date: value.date, kind: value.kind, amount: value.amount, note: value.note };
}
const insert = `INSERT INTO transactions (user_id,id,date,kind,amount,note) VALUES (?,?,?,?,?,?)`;
export async function readRecords(db: Database, owner: string, after: string) {
  return (await db.prepare('SELECT id,date,kind,amount,note FROM transactions WHERE user_id = ? AND id > ? ORDER BY id LIMIT 500')
    .bind(owner, after).all<Transaction>()).results;
}
export async function saveRecord(db: Database, owner: string, row: Transaction) {
  await db.prepare(`${insert} ON CONFLICT(user_id,id) DO UPDATE SET date=excluded.date,kind=excluded.kind,amount=excluded.amount,note=excluded.note`)
    .bind(owner, row.id, row.date, row.kind, row.amount, row.note).run();
}
export async function deleteRecord(db: Database, owner: string, id: string) {
  await db.prepare('DELETE FROM transactions WHERE user_id = ? AND id = ?').bind(owner, id).run();
}
export async function importRecords(db: Database, owner: string, rows: Transaction[]) {
  if (rows.length) await db.batch(rows.map(row => db.prepare(`${insert} ON CONFLICT(user_id,id) DO NOTHING`)
    .bind(owner, row.id, row.date, row.kind, row.amount, row.note)));
}
