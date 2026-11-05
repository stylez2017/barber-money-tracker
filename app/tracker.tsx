'use client';

import { useEffect, useRef, useState } from 'react';
import { Scissors, LayoutDashboard, History, Plus, ArrowUpRight, ArrowDownRight, Wallet, TrendingUp, ChevronRight, X, Pencil, Trash2, Download, Check, Menu, ShieldCheck } from 'lucide-react';
import { type Kind, type Transaction, labels, isIncome, localDate, validTransaction, inPeriod, totals, money } from '../lib/finance';
import MoneySaver from './money-saver';
import type { AccountApi } from '../lib/transactions';
import { transactionsCsv } from '../lib/csv';
import { LEGACY_KEY, parseLegacy, loadTransactions, writeTransaction, removeTransaction, importTransactions } from '../lib/transactions';
export default function Tracker({ api, user, onSignOut, onManageSubscription, privateTesting = false }: { api: AccountApi; user: { id: string; email: string }; onSignOut: () => Promise<void>; onManageSubscription?: () => Promise<void>; privateTesting?: boolean }) {
 const [busy,setBusy] = useState(false);
 const locked = useRef(false);
 const [legacy,setLegacy] = useState<Transaction[]>([]);
 const [legacyError,setLegacyError] = useState('');
 const [loadAttempt,setLoadAttempt] = useState(0);
 const [rows,setRows] = useState<Transaction[]>([]);
 const [ready,setReady] = useState(false);
 const [notice,setNotice] = useState('');
 const [view,setView] = useState<'dashboard'|'history'>('dashboard');
 const [period,setPeriod] = useState<'day'|'week'|'month'>('week');
 const [filter,setFilter] = useState('all');
 const [search,setSearch] = useState('');
 const [modal,setModal] = useState(false);
 const [editing,setEditing] = useState<string|null>(null);
 const [draftId,setDraftId] = useState('');
 const [kind,setKind] = useState<Kind>('haircut');
 const [date,setDate] = useState(localDate());
 const [amount,setAmount] = useState('');
 const [note,setNote] = useState('');
 const [error,setError] = useState('');
 const [deleting,setDeleting] = useState<string|null>(null);
 const [mobile,setMobile] = useState(false);
 useEffect(() => {
  let cancelled = false;
  setReady(false);
  loadTransactions(api).then(records => {
   if (!cancelled) { setRows(records); setReady(true); setNotice(''); }
  }).catch(() => { if (!cancelled) setNotice('Your records could not be loaded. Check your connection and retry.'); });
  try { const raw = localStorage.getItem(LEGACY_KEY); if (raw) setLegacy(parseLegacy(raw)); }
  catch { setLegacyError('Browser records could not be read. They have not been changed.'); }
  return () => { cancelled = true; };
 }, [api, user.id, loadAttempt]);
 async function importLegacy() {
  if (!ready || locked.current || !window.confirm(`Import ${legacy.length} browser records into ${user.email}? Only import records that belong to this account.`)) return;
  locked.current = true; setBusy(true);
  try {
   await importTransactions(api, legacy);
   const records = await loadTransactions(api);
   setRows(records); setLegacy([]); setNotice('Browser records imported. The original browser copy was kept.');
  } catch { setNotice('Import could not be completed. Your browser copy was kept; you can retry safely.'); }
  finally { locked.current = false; setBusy(false); }
 }
 async function signOut() {
  if (locked.current) return;
  locked.current = true; setBusy(true);
  try { await onSignOut(); }
  catch { setNotice('Sign-out failed. Check your connection and try again.'); }
  finally { locked.current = false; setBusy(false); }
 }
 useEffect(() => { if (!modal && !deleting) return; const previous = document.activeElement as HTMLElement | null; const handle = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked.current) { setModal(false); setDeleting(null); } if (event.key === 'Tab') { const controls = Array.from(document.querySelectorAll<HTMLElement>('.modal button:not(:disabled), .modal input:not(:disabled), .modal select:not(:disabled)')); if (!controls.length) { event.preventDefault(); return; } const first = controls[0]; const last = controls[controls.length - 1]; if (!controls.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); return; } if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }; const timer = setTimeout(() => document.querySelector<HTMLElement>('.modal input, .modal button')?.focus(), 0); document.addEventListener('keydown', handle); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { clearTimeout(timer); document.removeEventListener('keydown', handle); document.body.style.overflow = overflow; previous?.focus(); }; }, [modal, deleting]);
 async function persist(next: Transaction[]) {
  if (!ready || locked.current) return false;
  locked.current = true; setBusy(true);
  try {
   const removed = rows.find(row => !next.some(value => value.id === row.id));
   const changed = next.find(row => rows.find(value => value.id === row.id) !== row);
   if (removed) await removeTransaction(api, removed.id);
   else if (changed) await writeTransaction(api, changed);
   setRows(next); setNotice(''); return true;
  } catch { setNotice('Your change could not be saved. Check your connection and try again.'); return false; }
  finally { locked.current = false; setBusy(false); }
 }
 function open(t?: Transaction, preset: Kind = 'haircut') { if (!ready || locked.current) return; setEditing(t?.id??null);setDraftId(t?.id??crypto.randomUUID());setKind(t?.kind??preset);setDate(t?.date??localDate());setAmount(t?String(t.amount/100):'');setNote(t?.note??'');setError('');setModal(true); }
 async function save(e: React.FormEvent) { e.preventDefault(); const cents=Math.round(Number(amount)*100); const t: Transaction={id:editing??draftId,date,kind,amount:cents,note:note.trim()}; if(!validTransaction(t)||date>localDate()||!/^\d+(\.\d{1,2})?$/.test(amount)) {setError('Enter a valid date and an amount greater than $0 with up to two decimal places.');return;} if(await persist(editing?rows.map(r=>r.id===editing?t:r):[...rows,t])) setModal(false); else setError('Your transaction could not be saved. Your entries are still here; please retry.'); }
 const selected=rows.filter(t=>inPeriod(t.date,period)); const summary=totals(selected);
 const sorted=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
 const visible=(view==='history'?sorted:sorted.filter(t=>inPeriod(t.date,period))).filter(t=>(filter==='all'||(filter==='income'?isIncome(t.kind):!isIncome(t.kind)))&&`${t.note} ${labels[t.kind]}`.toLowerCase().includes(search.toLowerCase()));
 const today=new Date(); const chart=Array.from({length:7},(_,i)=>{const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-6+i);const dayRows=rows.filter(t=>t.date===localDate(d));return {date:d,...totals(dayRows)};});
 const max=Math.max(100,...chart.flatMap(d=>[d.income,d.expenses]));
 function exportCsv() { const csv=transactionsCsv(sorted); const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`barber-money-${localDate()}.csv`;a.click();URL.revokeObjectURL(url); }
 return <div className="app-shell">
 <aside className={mobile?'sidebar mobile-open':'sidebar'}><a className="brand" href="/" aria-label="Barber Money Tracker home"><span className="brand-icon"><Scissors size={23}/></span><span>BARBER<span className="brand-second">MONEY TRACKER</span></span></a><div className="workspace-label">YOUR WORKSPACE</div><nav><button className={view==='dashboard'?'nav-item active':'nav-item'} onClick={()=>{setView('dashboard');setMobile(false);}}><LayoutDashboard size={19}/> Dashboard</button><button className={view==='history'?'nav-item active':'nav-item'} onClick={()=>{setView('history');setMobile(false);}}><History size={19}/> Transactions</button></nav><div className="sidebar-note"><span className="small-scissors"><Scissors size={22}/></span><h3>Your craft. Your business.</h3><p>A little clarity goes a long way. Keep your numbers as sharp as your cuts.</p><span className="mini-line"/></div><div className="local-status"><span className="status-dot"/> Account workspace <ShieldCheck size={15}/></div></aside>
 <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="menu-button" aria-label="Toggle navigation" onClick={()=>setMobile(!mobile)}><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{view==='dashboard'?'Dashboard':'Transactions'}</strong></div><span className="private-label"><span className="status-dot"/> Saved to your account</span>{onManageSubscription&&<button className="secondary-button" disabled={busy} onClick={onManageSubscription}>Manage subscription</button>}<button className="secondary-button" disabled={busy} onClick={signOut}>Sign out</button></header>
 <main><div className="page-heading"><div><div className="eyebrow">A CLEARER PICTURE OF YOUR BUSINESS</div><h1>{view==='dashboard'?'Make every cut count.':'Your money, on record.'}</h1><p>{view==='dashboard'?'Less guesswork. More growth. Here’s how your business is doing.':'All your earnings and expenses, in one place.'}</p></div><button className="primary-button" onClick={()=>open()} disabled={!ready||busy}><Plus size={18}/> Add transaction</button></div>
 {privateTesting&&<div className="notice" role="status">Private testing · Payments are disabled.</div>}
 <p className="account-email">Signed in as {user.email}</p>
 {notice&&<div className="notice" role="alert">{notice}</div>}
 {legacyError&&<div className="notice" role="alert">{legacyError}</div>}
 {!ready&&notice&&<button className="secondary-button" onClick={()=>setLoadAttempt(value=>value+1)}>Retry loading records</button>}
 {legacy.length>0&&<div className="notice">{legacy.length} records are available in this browser. <button className="secondary-button" disabled={!ready||busy} onClick={importLegacy}>Import browser records into this account</button></div>}
 {busy&&<p role="status">Saving changes…</p>}
 <div className="section-toolbar"><div className="tabs">{(['day','week','month'] as const).map(p=><button key={p} className={period===p?'selected':''} onClick={()=>setPeriod(p)}>{p==='day'?'Today':p==='week'?'This week':'This month'}</button>)}</div><span className="date-label">{today.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</span></div>
 <div className="stats-grid">{[{label:'Total income',value:summary.income,icon:ArrowUpRight,sub:`Including ${money(summary.tips)} in tips`,green:true},{label:'Total expenses',value:summary.expenses,icon:ArrowDownRight,sub:'Rent, supplies & other costs',green:false},{label:'Net profit',value:summary.profit,icon:Wallet,sub:'What you take home',green:true},{label:'Profit margin',value:summary.income?`${Math.round(summary.profit/summary.income*100)}%`:'—',icon:TrendingUp,sub:summary.income?'Profit as a share of income':'Add income to see your margin',green:false}].map((s,i)=><div className={`stat-card ${i===2?'profit-card':''}`} key={s.label}><div className="stat-label">{s.label}<s.icon size={18}/></div><div className="stat-value">{typeof s.value==='number'?money(s.value):s.value}</div><div className="stat-sub">{i===2&&<span className="status-dot"/>}{s.sub}</div></div>)}</div>
 {view==='dashboard'&&<div className="overview-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Your cash flow</h2><p>A little perspective on the last 7 days.</p></div><div className="legend"><span><i/> Income</span><span><i/> Expenses</span></div></div><div className="chart"><div className="axis"><span>{money(max)}</span><span>{money(max/2)}</span><span>$0</span></div><div className="chart-bars">{chart.map(d=><div className="day-column" key={localDate(d.date)}><div className="bar-space"><div className="bar income-bar" style={{height:`${d.income/max*100}%`}} title={`Income: ${money(d.income)}`}/><div className="bar expense-bar" style={{height:`${d.expenses/max*100}%`}} title={`Expenses: ${money(d.expenses)}`}/></div><span>{d.date.toLocaleDateString('en-US',{weekday:'short'})}</span></div>)}</div></div><div className="chart-footer"><span className="status-dot"/>{rows.length?'Small steps. A stronger business.':'Your story starts with your first transaction.'}</div></section>
 <section className="panel quick-panel"><div className="panel-heading"><div><h2>Keep the books fresh</h2><p>A few seconds now. Clarity later.</p></div></div><button disabled={!ready||busy} className="quick-action" onClick={()=>open(undefined,'haircut')}><span className="action-icon green"><Scissors size={20}/></span><span><strong>Log your earnings</strong><small>Haircuts & tips</small></span><ChevronRight size={17}/></button><button disabled={!ready||busy} className="quick-action" onClick={()=>open(undefined,'rent')}><span className="action-icon"><Wallet size={20}/></span><span><strong>Add booth rent</strong><small>Record your weekly rent</small></span><ChevronRight size={17}/></button><button disabled={!ready||busy} className="quick-action" onClick={()=>open(undefined,'supplies')}><span className="action-icon"><ArrowDownRight size={20}/></span><span><strong>Track an expense</strong><small>Supplies & everything else</small></span><ChevronRight size={17}/></button><div className="rent-note">Booth rent counts on the date you record it. Log it once each week.</div></section></div>}
 {view==='dashboard'&&ready&&<MoneySaver key={user.id} api={api} profit={summary.profit}/>}
 <section className="panel transactions-panel"><div className="panel-heading"><div><h2>{view==='history'?'Transaction history':'Recent transactions'} <span className="count">{visible.length}</span></h2><p>{view==='history'?'Your complete history. Search, edit, or export anytime.':'The details behind your numbers for this period.'}</p></div><button className="secondary-button" disabled={!rows.length} onClick={exportCsv}><Download size={15}/><span>Export CSV</span></button></div><div className="transaction-filters"><div className="filter-buttons">{['all','income','expenses'].map(f=><button key={f} className={filter===f?'selected':''} onClick={()=>setFilter(f)}>{f==='all'?'All transactions':f[0].toUpperCase()+f.slice(1)}</button>)}</div><input aria-label="Search transactions" placeholder="Search transactions…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 {!ready?<div className="empty-state">Loading your records…</div>:!visible.length?<div className="empty-state"><span className="empty-icon"><History size={25}/></span><h3>{rows.length?'No matching transactions':'A fresh start for your finances'}</h3><p>{rows.length?'Try another filter, search, or date range.':'Add your first haircut, tip, or expense. We’ll take care of the math.'}</p>{!rows.length&&<button className="text-button" onClick={()=>open()}>Add your first transaction <ArrowUpRight size={16}/></button>}</div>:<div className="table-scroll"><table><thead><tr><th>TRANSACTION</th><th>DATE</th><th>TYPE</th><th className="right">AMOUNT</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(t=><tr key={t.id}><td><div className="transaction-name"><span className={`transaction-icon ${isIncome(t.kind)?'green':''}`}>{isIncome(t.kind)?<ArrowUpRight size={18}/>:<ArrowDownRight size={18}/>}</span><span><strong>{labels[t.kind]}</strong><small>{t.note||'No note added'}</small></span></div></td><td>{new Date(`${t.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td><td><span className={`badge ${isIncome(t.kind)?'green':''}`}>{isIncome(t.kind)?'Income':'Expense'}</span></td><td className={`right amount ${isIncome(t.kind)?'green-text':''}`}>{isIncome(t.kind)?'+':'−'}{money(t.amount)}</td><td><div className="row-actions"><button disabled={busy} aria-label={`Edit ${labels[t.kind]} on ${t.date}`} onClick={()=>open(t)}><Pencil size={15}/></button><button disabled={busy} aria-label={`Delete ${labels[t.kind]} on ${t.date}`} onClick={()=>setDeleting(t.id)}><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
 {view==='dashboard'&&rows.length>0&&<button className="view-all" onClick={()=>{setView('history');setSearch('');setFilter('all');}}>View all transactions <ChevronRight size={15}/></button>}</section>
 <footer><span><Scissors size={14}/> Built for the business behind the chair.</span><span>USD · Saved to your account</span></footer></main></div>
 {modal&&<div className="modal-backdrop" onClick={()=>{if(!locked.current)setModal(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!locked.current)setModal(false);}}><button disabled={busy} className="close-button" aria-label="Close" onClick={()=>setModal(false)}><X size={20}/></button><span className="eyebrow">KEEP YOUR NUMBERS SHARP</span><h2 id="modal-title">{editing?'Edit transaction':'Add a transaction'}</h2><p>Every cut and every dollar has a place.</p><form onSubmit={save}><label>Category<select disabled={busy} value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><div className="form-grid"><label>Amount (USD)<input disabled={busy} autoFocus required type="number" min="0.01" max="999999999" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Date<input disabled={busy} required type="date" max={localDate()} value={date} onChange={e=>setDate(e.target.value)}/></label></div>{kind==='rent'&&<p className="field-hint">Enter the full weekly booth rent. It is deducted once on this date.</p>}<label>Note <span className="optional">(optional)</span><input disabled={busy} maxLength={160} placeholder="e.g. Saturday walk-ins" value={note} onChange={e=>setNote(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button disabled={busy} type="button" className="secondary-button" onClick={()=>setModal(false)}>Cancel</button><button disabled={busy} className="primary-button" type="submit"><Check size={17}/>{editing?'Save changes':'Save transaction'}</button></div></form></section></div>}
 {deleting&&<div className="modal-backdrop"><section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete this transaction?</h2><p>This removes the record and updates your totals. This cannot be undone.</p><div className="modal-actions"><button disabled={busy} className="secondary-button" onClick={()=>setDeleting(null)}>Keep transaction</button><button disabled={busy} className="danger-button" onClick={async ()=>{if(await persist(rows.filter(t=>t.id!==deleting)))setDeleting(null);}}>Delete transaction</button></div></section></div>}
 </div>;
}
