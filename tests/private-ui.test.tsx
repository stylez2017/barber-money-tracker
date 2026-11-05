import './ui-env';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PaidWorkspace from '../app/paid-workspace';
import MoneySaver from '../app/money-saver';
import type { AccountApi } from '../lib/transactions';
afterEach(cleanup);
Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
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
 assert.equal(Boolean(screen.queryByRole('button',{name:'Add transaction'})),false);
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

test('revoked access clears financial UI and a delayed status response cannot reopen it',async()=>{
 let delayed:((response:Response)=>void)|undefined;
 let statusCalls=0;
 const allowed={paid:false,hasCustomer:false,hasSubscription:false,privateTesting:true};
 const api:AccountApi=async(path,init)=>{
  if(path==='/api/billing/status') {if(++statusCalls>1)return new Promise<Response>(resolve=>{delayed=resolve;});return Response.json(allowed);}
  if(path==='/api/savings')return Response.json({goal:100000,saved:0,percent:20});
  if(init?.method==='POST')return Response.json({error:'Revoked'},{status:403});
  return Response.json({rows:[],next:null});
 };
 render(<PaidWorkspace api={api} user={{id:'user_A',email:'owner@example.test'}} onSignOut={async()=>{}}/>);
 await waitFor(()=>assert.equal((screen.getByRole('button',{name:'Add transaction'}) as HTMLButtonElement).disabled,false));
 fireEvent(window,new Event('focus'));
 await waitFor(()=>assert.ok(delayed));
 fireEvent.click(screen.getByRole('button',{name:'Add transaction'}));
 fireEvent.change(screen.getByLabelText('Amount (USD)'),{target:{value:'25'}});
 fireEvent.submit(screen.getByRole('button',{name:'Save transaction'}).closest('form')!);
 await screen.findByText('This account is not approved for access. Contact the app owner.');
 assert.equal(Boolean(screen.queryByRole('button',{name:'Add transaction'})),false);
 await act(async()=>{delayed!(Response.json(allowed));});
 assert.equal(Boolean(screen.queryByRole('button',{name:'Add transaction'})),false);
});

test('periodic verification keeps offline drafts but removes records after an explicit denial',async()=>{
 let status=200;
 const api:AccountApi=async path=>{
  if(path==='/api/billing/status')return Response.json({paid:false,hasCustomer:false,hasSubscription:false,privateTesting:true},{status});
  if(path==='/api/savings')return Response.json({goal:100000,saved:0,percent:20});
  return Response.json({rows:[],next:null});
 };
 render(<PaidWorkspace api={api} user={{id:'user_A',email:'owner@example.test'}} onSignOut={async()=>{}}/>);
 await waitFor(()=>assert.equal((screen.getByRole('button',{name:'Add transaction'}) as HTMLButtonElement).disabled,false));
 fireEvent.click(screen.getByRole('button',{name:'Add transaction'}));
 fireEvent.change(screen.getByLabelText('Amount (USD)'),{target:{value:'42.25'}});
 status=503;fireEvent(window,new Event('focus'));
 await screen.findByText('Your account access could not be verified. Please retry.');
 assert.equal((screen.getByLabelText('Amount (USD)') as HTMLInputElement).value,'42.25');
 status=403;fireEvent(window,new Event('focus'));
 await waitFor(()=>assert.equal(Boolean(screen.queryByRole('dialog')),false));
 assert.equal(Boolean(screen.queryByRole('button',{name:'Add transaction'})),false);
});
