import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coreDatabase, sqliteAdapter } from './sqlite-helper.ts';
import { readRecords, saveRecord, deleteRecord, importRecords, transactionInput } from '../lib/server/storage.ts';
import { loadTransactions } from '../lib/transactions.ts';
import { totals, type Kind, type Transaction } from '../lib/finance.ts';

const row: Transaction = { id: 'one', date: '2026-11-02', kind: 'haircut', amount: 4500, note: 'Cut' };
test('core storage edits and deletes only the selected owner even for identical IDs', async t => {
  const env = coreDatabase(); t.after(() => env.sqlite.close());
  await saveRecord(env.DB, 'A', row); await saveRecord(env.DB, 'B', { ...row, note: 'B private' });
  await saveRecord(env.DB, 'A', { ...row, amount: 5000, note: 'Edited' });
  assert.equal((await readRecords(env.DB,'A',''))[0].amount, 5000);
  assert.equal((await readRecords(env.DB,'B',''))[0].note, 'B private');
  await deleteRecord(env.DB,'B',row.id);
  assert.equal((await readRecords(env.DB,'A','')).length, 1);
  assert.deepEqual(await readRecords(env.DB,'B',''), []);
});
test('large histories load every page once and keep complete totals', async t => {
  const env = coreDatabase(); t.after(() => env.sqlite.close());
  const kinds: Kind[] = ['haircut','tip','rent','supplies','other'];
  const rows: Transaction[] = Array.from({ length: 1501 }, (_, i) => ({ ...row, id: String(i).padStart(5,'0'), kind: kinds[i%5], amount: i+1 }));
  for (let i=0;i<rows.length;i+=100) await importRecords(env.DB,'A',rows.slice(i,i+100));
  await saveRecord(env.DB,'B',{ ...row, id:'00000', amount:999999 });
  let pages=0;
  const loaded = await loadTransactions(async path => {
    const after = new URL(path,'http://local.test').searchParams.get('after') ?? '';
    const page = await readRecords(env.DB,'A',after); pages++;
    return Response.json({ rows:page, next:page.length===500?page.at(-1)!.id:null });
  });
  assert.equal(pages,4); assert.equal(loaded.length,1501);
  assert.equal(new Set(loaded.map(t=>t.id)).size,1501);
  assert.deepEqual(totals(loaded),totals(rows));
});
test('an import storage failure rolls back the whole batch and a retry is safe', async t => {
  const env = coreDatabase(); t.after(() => env.sqlite.close());
  await assert.rejects(importRecords(env.DB,'A',[row,{...row,id:'bad',amount:0}]));
  assert.deepEqual(await readRecords(env.DB,'A',''),[]);
  await importRecords(env.DB,'A',[row]); await importRecords(env.DB,'A',[row]);
  assert.deepEqual(await readRecords(env.DB,'A',''),[row]);
});
test('server validation rejects owner fields, malformed records and invalid limits', () => {
  for (const value of [{...row,user_id:'B'},{...row,id:''},{...row,id:'x'.repeat(129)},{...row,note:'x'.repeat(161)},{...row,date:'2026-02-30'},{...row,amount:0},{...row,kind:'__proto__'}]) assert.throws(()=>transactionInput(value));
  assert.deepEqual(transactionInput(row),row);
});
test('a local backup restores records, owner isolation, totals and the owner-date index', async t => {
  const env = coreDatabase();
  const scratch = mkdtempSync(join(tmpdir(),'barber-core-restore-'));
  let restored: DatabaseSync | undefined;
  t.after(()=>{ restored?.close(); env.sqlite.close(); rmSync(scratch,{recursive:true,force:true}); });
  await importRecords(env.DB,'A',[row,{...row,id:'tip',kind:'tip',amount:500},{...row,id:'rent',kind:'rent',amount:2000}]);
  await saveRecord(env.DB,'B',{...row,note:'B private'});
  const original = await readRecords(env.DB,'A','');
  const path=join(scratch,'test-backup.sqlite');
  await backup(env.sqlite,path);
  await deleteRecord(env.DB,'A',row.id);
  restored = new DatabaseSync(path);
  const db=sqliteAdapter(restored);
  assert.deepEqual(await readRecords(db,'A',''),original);
  assert.deepEqual(totals(await readRecords(db,'A','')),{income:5000,expenses:2000,profit:3000,tips:500});
  assert.equal((await readRecords(db,'B',''))[0].note,'B private');
  assert.equal(restored.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='transactions_owner_date'").get()!.name,'transactions_owner_date');
});
