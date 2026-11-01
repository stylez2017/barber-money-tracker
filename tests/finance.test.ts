import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inPeriod, totals, validTransaction } from '../lib/finance.ts';
test('income, tips and expenses calculate in cents', () => { assert.deepEqual(totals([{id:'1',date:'2026-11-01',kind:'haircut',amount:4000,note:''},{id:'2',date:'2026-11-01',kind:'tip',amount:500,note:''},{id:'3',date:'2026-11-01',kind:'rent',amount:2000,note:''}]), {income:4500,expenses:2000,profit:2500,tips:500}); });
test('week starts Monday and month excludes previous month and future dates', () => { const now = new Date(2026,10,1,12); assert.equal(inPeriod('2026-10-26','week',now),true); assert.equal(inPeriod('2026-10-25','week',now),false); assert.equal(inPeriod('2026-10-31','month',now),false); assert.equal(inPeriod('2026-11-02','month',now),false); });
test('rejects corrupt saved transactions', () => { assert.equal(validTransaction({id:'x',date:'2026-02-30',kind:'tip',amount:100,note:''}),false); assert.equal(validTransaction({id:'x',date:'2026-02-20',kind:'tip',amount:-100,note:''}),false); });
