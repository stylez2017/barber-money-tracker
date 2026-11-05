import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { Database, Statement } from '../lib/server/storage.ts';

export function sqliteAdapter(sqlite: DatabaseSync): Database {
  return {
    prepare(sql): Statement {
      let values: (string | number | null)[] = [];
      return { bind(...args) { values = args; return this; },
        async all<T>() { return { results: sqlite.prepare(sql).all(...values).map(row => ({ ...row })) as T[] }; },
        async run() { return sqlite.prepare(sql).run(...values); } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}
export function coreDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_transactions.sql', import.meta.url), 'utf8'));
  return { sqlite, DB: sqliteAdapter(sqlite) };
}
