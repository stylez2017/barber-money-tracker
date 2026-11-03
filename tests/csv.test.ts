import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transactionsCsv } from '../lib/csv.ts';
import type { Transaction } from '../lib/finance.ts';
const row: Transaction = { id: 'x', date: '2026-11-01', kind: 'haircut', amount: 4500, note: '' };

test('CSV retains its existing columns, USD precision, record order and signed expense convention', () => {
  const csv = transactionsCsv([row, { ...row, id: 'rent', kind: 'rent', amount: 2000, note: 'Weekly booth rent' }, { ...row, id: 'tip', kind: 'tip', amount: 1, note: '' }]);
  assert.equal(csv, '"Date","Category","Amount (USD)","Note"\r\n"2026-11-01","Haircut income","45.00",""\r\n"2026-11-01","Booth rent","\'-20.00","Weekly booth rent"\r\n"2026-11-01","Tips","0.01",""');
  assert.equal(transactionsCsv([]), '"Date","Category","Amount (USD)","Note"');
});
test('CSV quotes commas, quotes, newlines and Unicode without changing stored notes', () => {
  const original = { ...row, note: 'Walk-in, "Sam"\nCafé ✂' };
  const before = structuredClone(original);
  assert.ok(transactionsCsv([original]).endsWith('"Walk-in, ""Sam""\nCafé ✂"'));
  assert.deepEqual(original, before);
});
test('CSV neutralizes formulas even after leading whitespace or control characters', () => {
  for (const note of ['=SUM(1,2)', '+1+1', '-1+2', '@SUM(1,2)', '  =SUM(1,2)', '\t=1+1', '\r\n@SUM(1,2)', '\u0000+1+1']) {
    const lastCell = transactionsCsv([{ ...row, note }]).split('\r\n').slice(1).join('\r\n');
    assert.ok(lastCell.includes(',"\''), 'Formula-like note must be prefixed before spreadsheet import');
  }
});
