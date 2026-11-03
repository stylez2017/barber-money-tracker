import './ui-env';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaidWorkspace from '../app/paid-workspace';
import MoneySaver from '../app/money-saver';
import type { AccountApi } from '../lib/transactions';
afterEach(cleanup);
test('private workspace loads records with no subscription or billing buttons',async()=>{
 const paths:string[]=[];
 const api:AccountApi=async path=>{paths.push(path);return Response.json(path==='/api/billing/status'?{paid:false,hasCustomer:false,hasSubscription:false,privateTesting:true}:path==='/api/savings'?{goal:100000,saved:0,percent:20}:{rows:[],next:null});};
 render(<PaidWorkspace api={api} user={{id:'user_A',email:'owner@example.test'}} onSignOut={async()=>{}}/>);
 await waitFor(()=>assert.equal((screen.getByRole('button',{name:'Add transaction'}) as HTMLButtonElement).disabled,false));
 assert.ok(paths.some(path=>path.startsWith('/api/transactions')));
 assert.equal(screen.queryByRole('button',{name:'Manage subscription'}),null);
 assert.equal(screen.queryByText(/Subscribe for/),null);
 assert.ok(screen.getByText('Private testing · Payments are disabled.'));
});
test('failed access check never opens the tracker',async()=>{
 const api:AccountApi=async()=>Response.json({error:'Denied'},{status:403});
 render(<PaidWorkspace api={api} user={{id:'user_C',email:'other@example.test'}} onSignOut={async()=>{}}/>);
 await screen.findByText('Your account access could not be verified. Please retry.');
 assert.equal(screen.queryByRole('button',{name:'Add transaction'}),null);
});
test('Money Saver retains offline drafts, saves cents and restores its plan after remount',async()=>{
 let plan={goal:100000,saved:0,percent:20}; let fail=true;
 const api:AccountApi=async(_,init)=>{
   if(init?.method==='POST') {if(fail)return Response.json({error:'Offline'},{status:503});plan=JSON.parse(String(init.body));return Response.json({saved:true});}
   return Response.json(plan);
 };
 const view=render(<MoneySaver api={api} profit={10000}/>);
 await screen.findByRole('button',{name:'Save savings plan'});
 fireEvent.change(screen.getByLabelText('Savings goal (USD)'),{target:{value:'2500.99'}});
 fireEvent.change(screen.getByLabelText('Already set aside (USD)'),{target:{value:'150.25'}});
 fireEvent.submit(screen.getByRole('button',{name:'Save savings plan'}).closest('form')!);
 await screen.findByText(/Your savings plan could not be saved/);
 assert.equal((screen.getByLabelText('Savings goal (USD)') as HTMLInputElement).value,'2500.99');
 fail=false;fireEvent.submit(screen.getByRole('button',{name:'Save savings plan'}).closest('form')!);
 await screen.findByText('Savings plan saved to your account.');
 assert.deepEqual(plan,{goal:250099,saved:15025,percent:20});
 view.unmount();render(<MoneySaver api={api} profit={10000}/>);
 await waitFor(()=>assert.equal((screen.getByLabelText('Already set aside (USD)') as HTMLInputElement).value,'150.25'));
});
