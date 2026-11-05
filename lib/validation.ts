import { validTransaction, type Transaction } from './finance.ts';

// Match the amount limit offered by the transaction form and retain exact cents.
export const MAX_TRANSACTION_CENTS = 99_999_999_900;
export function validStoredTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object' || typeof (value as Transaction).kind !== 'string' || !validTransaction(value)) return false;
  return value.id.length > 0 && value.id.length <= 128 && value.note.length <= 160 &&
    value.amount <= MAX_TRANSACTION_CENTS &&
    Object.keys(value).every(key => ['id','date','kind','amount','note'].includes(key));
}
