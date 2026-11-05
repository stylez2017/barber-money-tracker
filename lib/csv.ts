import { type Transaction, labels, isIncome } from './finance.ts';

function csvCell(value: string): string {
  // Spreadsheet applications can ignore leading whitespace/control characters
  // before interpreting a formula. Escape at export time; preserve stored notes.
  const safe = /^[\s\u0000-\u001f\u007f]*[=+@-]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function transactionsCsv(rows: Transaction[]): string {
  const lines = [
    ['Date', 'Category', 'Amount (USD)', 'Note'],
    ...rows.map(row => [row.date, labels[row.kind], ((isIncome(row.kind) ? 1 : -1) * row.amount / 100).toFixed(2), row.note]),
  ];
  return lines.map(line => line.map(csvCell).join(',')).join('\r\n');
}
