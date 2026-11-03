'use client';
import { useEffect, useRef, useState } from 'react';
import type { AccountApi } from '../lib/transactions';
import { money } from '../lib/finance';
import { DEFAULT_SAVINGS, validSavings, savingsSummary, type SavingsPlan } from '../lib/savings';

export default function MoneySaver({ api, profit }: { api: AccountApi; profit:number }) {
  const [plan,setPlan] = useState<SavingsPlan | null>(null);
  const [goal,setGoal] = useState('');
  const [saved,setSaved] = useState('');
  const [percent,setPercent] = useState(String(DEFAULT_SAVINGS.percent));
  const [busy,setBusy] = useState(false);
  const locked = useRef(false);
  const [message,setMessage] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPlan(null); setMessage('');
    void api('/api/savings').then(async response => {
      if (!response.ok) throw new Error();
      const next:unknown = await response.json();
      if (!validSavings(next)) throw new Error();
      if (active) { setPlan(next); setGoal(String(next.goal/100)); setSaved(String(next.saved/100)); setPercent(String(next.percent)); }
    }).catch(() => { if(active) setMessage('Your savings plan could not be loaded. Please retry.'); });
    return () => { active = false; };
  }, [api,attempt]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current || !plan) return;
    const next = { goal:Math.round(Number(goal)*100), saved:Math.round(Number(saved)*100), percent:Number(percent) };
    if (![goal,saved].every(value => /^\d+(\.\d{1,2})?$/.test(value)) || !validSavings(next)) { setMessage('Use positive dollar goals, up to two decimal places, and a percentage from 0 to 100.'); return; }
    locked.current = true; setBusy(true); setMessage('');
    try {
      const response = await api('/api/savings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
      if (!response.ok || (await response.json()).saved !== true) throw new Error();
      setPlan(next); setMessage('Savings plan saved to your account.');
    } catch { setMessage('Your savings plan could not be saved. Your entries are still here; please retry.'); }
    finally { locked.current = false; setBusy(false); }
  }
  const summary = plan ? savingsSummary(plan,profit) : null;
  return <section className="panel savings-panel" aria-labelledby="savings-title">
    <div className="panel-heading"><div><h2 id="savings-title">Money Saver</h2><p>Build a cushion for your business. This planner does not move money.</p></div></div>
    <div className="savings-content">
      {summary && <><p><strong>{money(plan!.saved)}</strong> set aside toward {money(plan!.goal)} · {summary.progress}%</p>
        <progress aria-label="Savings goal progress" max={100} value={summary.progress}/>
        <p>Suggested set-aside for the selected period: <strong>{money(summary.suggested)}</strong> ({plan!.percent}% of positive net profit, up to your remaining goal).</p></>}
      {!plan && !message && <p role="status">Loading your savings plan…</p>}
      {plan && <form onSubmit={save}><div className="savings-fields">
        <label>Savings goal (USD)<input required disabled={busy} type="number" min="0.01" max="999999999" step="0.01" value={goal} onChange={e=>setGoal(e.target.value)}/></label>
        <label>Already set aside (USD)<input required disabled={busy} type="number" min="0" max="999999999" step="0.01" value={saved} onChange={e=>setSaved(e.target.value)}/></label>
        <label>Save from profit (%)<input required disabled={busy} type="number" min="0" max="100" step="1" value={percent} onChange={e=>setPercent(e.target.value)}/></label>
      </div><button className="primary-button" disabled={busy} type="submit">{busy?'Saving plan…':'Save savings plan'}</button></form>}
      {message && <p role="status">{message}</p>}
      {!plan && message && <button className="secondary-button" onClick={()=>setAttempt(n=>n+1)}>Retry savings plan</button>}
    </div>
  </section>;
}
