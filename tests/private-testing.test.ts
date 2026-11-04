import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, request } from './helpers.ts';
import { transactionResponse } from '../lib/server/handlers.ts';
import { billingResponse, webhookResponse } from '../lib/server/billing-handlers.ts';
import { savingsResponse } from '../lib/server/savings-handlers.ts';
import { savingsSummary } from '../lib/savings.ts';

function fixture() {
  const production = database();
  const test = database();
  return { ...production, APP_ACCESS_MODE:'private-test', PRIVATE_TEST_USER_IDS:'user_A, user_B', PRIVATE_TEST_DB:test.DB,
    STRIPE_SECRET_KEY:undefined, STRIPE_WEBHOOK_SECRET:undefined, STRIPE_PRICE_ID:undefined, test };
}
const row = {id:'same',date:'2026-11-01',kind:'haircut',amount:4500,note:'Private'};
test('approved Clerk sessions can CRUD and import without any Stripe keys, isolated from production and other users', async()=>{
  const env=fixture();
  assert.equal((await transactionResponse(request('user_A',{operation:'save',transaction:row}),env)).status,200);
  assert.equal((await transactionResponse(request('user_A',{operation:'save',transaction:{...row,amount:4999}}),env)).status,200);
  assert.equal((await transactionResponse(request('user_A',{operation:'import',rows:[{...row,id:'tip',kind:'tip'}]}),env)).status,200);
  assert.equal((await (await transactionResponse(request('user_B'),env)).json()).rows.length,0);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM transactions').get()!.n,0);
  assert.equal((await (await transactionResponse(request('user_A'),env)).json()).rows[0].amount,4999);
  assert.equal((await transactionResponse(request('user_A',{operation:'delete',id:'same'}),env)).status,200);
  assert.equal((await (await transactionResponse(request('user_A'),env)).json()).rows.length,1);
});
test('private mode still rejects anonymous and unapproved users and fails closed when its configuration is missing', async()=>{
  const env=fixture();
  assert.equal((await transactionResponse(request(null),env)).status,401);
  assert.equal((await transactionResponse(request('user_C'),env)).status,403);
  for(const patch of [{PRIVATE_TEST_USER_IDS:''},{PRIVATE_TEST_DB:undefined},{PRIVATE_TEST_DB:env.DB},{APP_ACCESS_MODE:'typo'},{APP_ACCESS_MODE:undefined}]) {
    assert.equal((await transactionResponse(request('user_A'),{...env,...patch})).status,503);
  }
  const forged=new Request('http://localhost:3000/api/transactions?privateTesting=true',{headers:request('user_A').headers});
  assert.equal((await transactionResponse(forged,env)).status,400);
});
test('private status grants testing access without claiming a subscription; all payment endpoints are disabled', async()=>{
  const env=fixture();
  assert.deepEqual(await (await billingResponse(request('user_A',undefined,undefined,'/api/billing/status'),env,'status')).json(),
    {paid:false,hasCustomer:false,hasSubscription:false,privateTesting:true});
  for(const action of ['checkout','portal'] as const) assert.equal((await billingResponse(request('user_A',{},undefined,`/api/billing/${action}`),env,action)).status,403);
  assert.equal((await webhookResponse(new Request('http://localhost:3000/api/billing/webhook',{method:'POST'}),env)).status,403);
});
test('Money Saver persists exact cents per owner, rejects corrupt plans and never changes transactions',async()=>{
  const env=fixture(); const path='/api/savings'; const plan={goal:100000,saved:12345,percent:25};
  assert.equal((await savingsResponse(request('user_A',plan,undefined,path),env)).status,200);
  assert.deepEqual(await (await savingsResponse(request('user_A',undefined,undefined,path),env)).json(),plan);
  assert.deepEqual(await (await savingsResponse(request('user_B',undefined,undefined,path),env)).json(),{goal:100000,saved:0,percent:20});
  for(const patch of [{goal:0},{saved:-1},{percent:101},{percent:2.5},{goal:1.2},{user_id:'user_B'}]) assert.equal((await savingsResponse(request('user_A',{...plan,...patch},undefined,path),env)).status,400);
  assert.equal((await savingsResponse(request(null,plan,undefined,path),env)).status,401);
  assert.equal((await savingsResponse(request('user_C',plan,undefined,path),env)).status,403);
  assert.equal(env.test.sqlite.prepare('SELECT count(*) AS n FROM transactions').get()!.n,0);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM savings_plans').get()!.n,0);
});
test('Money Saver uses positive net profit, rounds cents, caps recommendations and progress at the goal',()=>{
  assert.deepEqual(savingsSummary({goal:10000,saved:0,percent:25},1999),{remaining:10000,progress:0,suggested:500});
  assert.equal(savingsSummary({goal:10000,saved:9999,percent:20},10000).suggested,1);
  assert.equal(savingsSummary({goal:10000,saved:0,percent:20},-1000).suggested,0);
  assert.deepEqual(savingsSummary({goal:10000,saved:12000,percent:20},50000),{remaining:0,progress:100,suggested:0});
});

test('private transaction writes reject malformed categories and out-of-form-range cents',async()=>{
 const env=fixture();
 for(const patch of [{kind:['haircut']},{amount:100_000_000_000},{amount:1.5},{note:'x'.repeat(161)}]) {
  assert.equal((await transactionResponse(request('user_A',{operation:'save',transaction:{...row,...patch}}),env)).status,400);
 }
 assert.equal(env.test.sqlite.prepare('SELECT count(*) AS n FROM transactions').get()!.n,0);
});
