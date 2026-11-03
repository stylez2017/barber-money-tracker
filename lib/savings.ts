export type SavingsPlan = { goal: number; saved: number; percent: number };
export const DEFAULT_SAVINGS: SavingsPlan = { goal: 100000, saved: 0, percent: 20 };
export function validSavings(value: unknown): value is SavingsPlan {
  if (!value || typeof value !== 'object') return false;
  const p = value as SavingsPlan;
  return Object.keys(p).length === 3 && ['goal','saved','percent'].every(k => Object.hasOwn(p,k)) &&
    Number.isSafeInteger(p.goal) && p.goal > 0 && p.goal <= 99_999_999_900 &&
    Number.isSafeInteger(p.saved) && p.saved >= 0 && p.saved <= 99_999_999_900 &&
    Number.isInteger(p.percent) && p.percent >= 0 && p.percent <= 100;
}
export function savingsSummary(plan: SavingsPlan, profit: number) {
  const remaining = Math.max(0, plan.goal - plan.saved);
  return { remaining, progress: Math.min(100, Math.floor(plan.saved / plan.goal * 100)),
    suggested: Math.min(remaining, Math.round(Math.max(0, profit) * plan.percent / 100)) };
}
