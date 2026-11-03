import './ui-env';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Tracker from '../app/tracker';
import { localDate, type Transaction } from '../lib/finance';
import { LEGACY_KEY, type AccountApi } from '../lib/transactions';

const originalConfirm = window.confirm;
afterEach(() => { cleanup(); localStorage.clear(); window.confirm=originalConfirm; });
function fixture(initial: Transaction[] = []) {
  const rows = new Map(initial.map(row => [row.id,{...row}]));
  const requests: Record<string,unknown>[] = [];
  const state = { failSave: false, loseAcknowledgement: false, waitForSave: null as Promise<void> | null };
  const api: AccountApi = async (_, init) => {
    if (!init?.method) return Response.json({ rows:[...rows.values()], next:null });
    const body = JSON.parse(String(init.body)); requests.push(body);
    if (state.waitForSave) await state.waitForSave;
    if (state.failSave) return Response.json({error:'Offline'},{status:503});
    if (body.operation==='save') rows.set(body.transaction.id,body.transaction);
    if (body.operation==='delete') rows.delete(body.id);
    if (body.operation==='import') for (const row of body.rows) if (!rows.has(row.id)) rows.set(row.id,row);
    return Response.json(state.loseAcknowledgement ? {} : {saved:true});
  };
  render(<Tracker api={api} user={{id:'local_customer',email:'owner@example.test'}} onSignOut={async()=>{}}/>);
  return { rows, requests, state };
}
const row: Transaction = {id:'cut',date:localDate(),kind:'haircut',amount:4500,note:'Saturday walk-in'};
async function ready() { await waitFor(()=>assert.equal((screen.getByRole('button',{name:'Add transaction'}) as HTMLButtonElement).disabled,false)); }
function openForm() { fireEvent.click(screen.getByRole('button',{name:'Add transaction'})); }
function input(label: RegExp | string, value: string) { fireEvent.change(screen.getByLabelText(label),{target:{value}}); }
function submit() { fireEvent.submit(screen.getByRole('button',{name:'Save transaction'}).closest('form')!); }

test('failed saves retain the open form and draft; retry saves successfully', async()=>{
  const f=fixture(); await ready(); openForm();
  input('Amount (USD)','45.25'); input(/Note/,'Keep my draft');
  f.state.failSave=true; submit();
  await waitFor(()=>screen.getByText('Your transaction could not be saved. Your entries are still here; please retry.'));
  assert.equal((screen.getByLabelText('Amount (USD)') as HTMLInputElement).value,'45.25');
  assert.equal((screen.getByLabelText(/Note/) as HTMLInputElement).value,'Keep my draft');
  assert.equal(f.rows.size,0);
  f.state.failSave=false; submit();
  await waitFor(()=>assert.equal(Boolean(screen.queryByRole('dialog')),false));
  assert.equal([...f.rows.values()][0].amount,4525);
  assert.equal([...f.rows.values()][0].note,'Keep my draft');
});
test('pending saves disable edits and cannot be dismissed with Escape', async()=>{
  const f=fixture(); await ready(); openForm(); input('Amount (USD)','25');
  let finish!:()=>void; f.state.waitForSave=new Promise(resolve=>{finish=resolve;}); submit();
  await waitFor(()=>assert.equal((screen.getByLabelText('Amount (USD)') as HTMLInputElement).disabled,true));
  assert.equal((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled,true);
  fireEvent.keyDown(document,{key:'Escape'});
  assert.ok(screen.getByRole('dialog'));
  const tab=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  document.dispatchEvent(tab); assert.equal(tab.defaultPrevented,true);
  await act(async()=>{finish();});
  await waitFor(()=>assert.equal(Boolean(screen.queryByRole('dialog')),false));
  assert.equal(f.rows.size,1);
});
test('transaction history combines search and category filters correctly', async()=>{
  fixture([row,{...row,id:'supplies',kind:'supplies',amount:1200,note:'Clippers purchase'}]); await ready();
  fireEvent.click(screen.getByRole('button',{name:'Transactions'}));
  input('Search transactions','Clippers');
  assert.equal(Boolean(screen.queryByText('Saturday walk-in')),false);
  assert.ok(screen.getByText('Clippers purchase'));
  input('Search transactions',''); fireEvent.click(screen.getByRole('button',{name:'Income'}));
  assert.ok(screen.getByText('Saturday walk-in'));
  assert.equal(Boolean(screen.queryByText('Clippers purchase')),false);
  input('Search transactions','missing'); assert.ok(screen.getByText('No matching transactions'));
});
test('editing preserves cents and deletion requires confirmation', async()=>{
  const f=fixture([row]); await ready();
  fireEvent.click(screen.getByRole('button',{name:/^Edit Haircut income/}));
  input('Amount (USD)','33.25'); input(/Note/,'Corrected record');
  fireEvent.submit(screen.getByRole('button',{name:'Save changes'}).closest('form')!);
  await waitFor(()=>screen.getByText('Corrected record'));
  assert.equal(f.rows.get('cut')!.amount,3325);
  fireEvent.click(screen.getByRole('button',{name:/^Delete Haircut income/}));
  assert.ok(screen.getByRole('alertdialog'));
  fireEvent.click(screen.getByRole('button',{name:'Keep transaction'}));
  assert.equal(f.requests.filter(r=>r.operation==='delete').length,0);
  fireEvent.click(screen.getByRole('button',{name:/^Delete Haircut income/}));
  fireEvent.click(screen.getByRole('button',{name:'Delete transaction'}));
  await waitFor(()=>assert.equal(Boolean(screen.queryByRole('alertdialog')),false));
  assert.equal(f.rows.size,0);
});
test('browser import requires confirmation and keeps both original browser data and cloud edits', async()=>{
  const legacy=[{...row,note:'Older browser copy'},{...row,id:'tip',kind:'tip' as const,amount:500,note:'Legacy tip'}];
  const original=JSON.stringify(legacy); localStorage.setItem(LEGACY_KEY,original);
  const f=fixture([{...row,note:'Newer cloud edit'}]); await ready();
  const button=screen.getByRole('button',{name:'Import browser records into this account'});
  fireEvent.click(button); assert.equal(f.requests.length,0);
  window.confirm=()=>true; fireEvent.click(button);
  await waitFor(()=>screen.getByText('Browser records imported. The original browser copy was kept.'));
  assert.equal(f.rows.get('cut')!.note,'Newer cloud edit');
  assert.equal(f.rows.get('tip')!.amount,500);
  assert.equal(localStorage.getItem(LEGACY_KEY),original);
});
test('CSV download uses the original filename pattern and safely exported notes', async t=>{
  fixture([{...row,note:'  =SUM(1,2)'}]); await ready();
  let blob: Blob | undefined, download='';
  t.mock.method(URL,'createObjectURL',(value:Blob)=>{blob=value;return 'blob:local-test';});
  t.mock.method(URL,'revokeObjectURL',()=>{});
  t.mock.method(HTMLAnchorElement.prototype,'click',function(this:HTMLAnchorElement){download=this.download;});
  fireEvent.click(screen.getByRole('button',{name:'Export CSV'}));
  assert.equal(download,`barber-money-${localDate()}.csv`);
  assert.ok((await blob!.text()).includes('"\'  =SUM(1,2)"'));
});

test('retrying a committed save with a lost acknowledgement does not duplicate the transaction', async()=>{
  const f=fixture(); await ready(); openForm(); input('Amount (USD)','40'); input(/Note/,'Retry exactly once');
  f.state.loseAcknowledgement=true; submit();
  await waitFor(()=>screen.getByText('Your transaction could not be saved. Your entries are still here; please retry.'));
  assert.equal(f.rows.size,1,'server committed the first attempt');
  const firstId=(f.requests[0].transaction as Transaction).id;
  f.state.loseAcknowledgement=false; submit();
  await waitFor(()=>assert.equal(Boolean(screen.queryByRole('dialog')),false));
  assert.equal(f.rows.size,1,'retry must update the same record');
  assert.equal((f.requests[1].transaction as Transaction).id,firstId);
});
