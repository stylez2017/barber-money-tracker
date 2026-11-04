import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savingsInsights } from '../lib/savings.ts';

test('savings insights preserve spendable profit and estimate repeated periods without treating losses as cash',()=>{
 assert.deepEqual(savingsInsights({goal:10000,saved:1000,percent:20},10000),{availableAfterSuggestion:8000,periodsToGoal:5});
 assert.deepEqual(savingsInsights({goal:10000,saved:9999,percent:20},10000),{availableAfterSuggestion:9999,periodsToGoal:1});
 assert.deepEqual(savingsInsights({goal:10000,saved:11000,percent:20},10000),{availableAfterSuggestion:10000,periodsToGoal:0});
 for(const profit of [0,-1234]) assert.deepEqual(savingsInsights({goal:10000,saved:0,percent:20},profit),{availableAfterSuggestion:0,periodsToGoal:null});
 assert.deepEqual(savingsInsights({goal:10000,saved:0,percent:0},10000),{availableAfterSuggestion:10000,periodsToGoal:null});
});
