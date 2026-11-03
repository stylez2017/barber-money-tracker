import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPeriod, localDate, money, totals, validTransaction, type Kind, type Transaction } from '../lib/finance.ts';
const row = (id: string, kind: Kind, amount: number, date = '2026-11-02'): Transaction => ({ id, kind, amount, date, note: '' });

test('empty and expense-only accounts produce zero income and correct negative profit', () => {
  assert.deepEqual(totals([]), { income: 0, expenses: 0, profit: 0, tips: 0 });
  assert.deepEqual(totals([row('rent', 'rent', 12500), row('supply', 'supplies', 2599), row('other', 'other', 101)]), { income: 0, expenses: 15200, profit: -15200, tips: 0 });
});
test('all income and expense categories remain exact in cents and do not mutate records', () => {
  const rows = [row('cut','haircut',1001), row('tip','tip',99), row('rent','rent',700), row('supplies','supplies',149), row('other','other',51)];
  const original = structuredClone(rows);
  assert.deepEqual(totals(rows), { income: 1100, expenses: 900, profit: 200, tips: 99 });
  assert.deepEqual(totals([...rows].reverse()), totals(rows));
  assert.deepEqual(rows, original);
  assert.equal(money(1), '$0.01'); assert.equal(money(-125), '-$1.25');
});
test('daily, weekly and monthly totals count booth rent once on its payment date', () => {
  const today = new Date(2026, 10, 3, 12);
  const rows = [row('rent','rent',10000,'2026-11-02'), row('mon','haircut',8000,'2026-11-02'), row('tue','haircut',12000,'2026-11-03')];
  const period = (p: 'day'|'week'|'month') => totals(rows.filter(t => inPeriod(t.date,p,today)));
  assert.deepEqual(period('day'), { income: 12000, expenses: 0, profit: 12000, tips: 0 });
  assert.deepEqual(period('week'), { income: 20000, expenses: 10000, profit: 10000, tips: 0 });
  assert.deepEqual(period('month'), period('week'));
});
test('Monday weeks can cross year boundaries without including future days', () => {
  const today = new Date(2027,0,3,12);
  assert.equal(inPeriod('2026-12-28','week',today), true);
  assert.equal(inPeriod('2026-12-27','week',today), false);
  assert.equal(inPeriod('2027-01-03','week',today), true);
  assert.equal(inPeriod('2027-01-04','week',today), false);
  assert.equal(inPeriod('2026-12-31','month',today), false);
});
test('date boundaries remain correct over daylight saving changes', () => {
  const spring = new Date(2026,2,9,0,15), autumn = new Date(2026,10,2,0,15);
  assert.equal(localDate(spring), '2026-03-09');
  assert.equal(inPeriod('2026-03-08','week',spring), false);
  assert.equal(inPeriod('2026-03-09','day',spring), true);
  assert.equal(localDate(autumn), '2026-11-02');
  assert.equal(inPeriod('2026-11-01','week',autumn), false);
  assert.equal(inPeriod('2026-11-02','day',autumn), true);
});
test('leap days, malformed dates and noninteger amounts are validated consistently', () => {
  for (const date of ['2024-02-29','2000-02-29']) assert.equal(validTransaction(row('x','tip',1,date)), true);
  for (const date of ['2026-02-29','2100-02-29','2026-04-31','2026-1-01','2026-13-01']) assert.equal(validTransaction(row('x','tip',1,date)), false);
  for (const amount of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.equal(validTransaction(row('x','tip',amount)), false);
});
