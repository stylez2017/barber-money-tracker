export type Kind = 'haircut' | 'tip' | 'rent' | 'supplies' | 'other';
export type Transaction = { id: string; date: string; kind: Kind; amount: number; note: string };
export const labels: Record<Kind, string> = { haircut: 'Haircut income', tip: 'Tips', rent: 'Booth rent', supplies: 'Supplies', other: 'Other expense' };
export const isIncome = (kind: Kind) => kind === 'haircut' || kind === 'tip';
export function localDate(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function validTransaction(value: unknown): value is Transaction {
 if (!value || typeof value !== 'object') return false;
 const t = value as Transaction;
 return typeof t.id === 'string' && typeof t.note === 'string' && Object.hasOwn(labels, t.kind) && typeof t.amount === 'number' && Number.isSafeInteger(t.amount) && t.amount > 0 && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && localDate(new Date(`${t.date}T12:00:00`)) === t.date;
}
export function inPeriod(date: string, period: 'day' | 'week' | 'month', today = new Date()) {
 const end = localDate(today);
 if (period === 'day') return date === end;
 const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
 if (period === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7); else start.setDate(1);
 return date >= localDate(start) && date <= end;
}
export function totals(rows: Transaction[]) {
 const income = rows.filter(t => isIncome(t.kind)).reduce((s,t) => s+t.amount,0);
 const expenses = rows.filter(t => !isIncome(t.kind)).reduce((s,t) => s+t.amount,0);
 return { income, expenses, profit: income-expenses, tips: rows.filter(t => t.kind === 'tip').reduce((s,t) => s+t.amount,0) };
}
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents/100);
