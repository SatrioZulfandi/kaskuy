import type { TransactionWithDetails } from '../types';

/** Quote every cell and neutralize formulas when opened by spreadsheet software. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const original = value === null || value === undefined ? '' : String(value);
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(original) || /^[\t\r\n]/.test(original) ? `'${original}` : original;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildTransactionsCsv(transactions: TransactionWithDetails[]): string {
  const rows: (string | number | null)[][] = [
    ['ID', 'Tanggal', 'Jenis', 'Dompet', 'Kategori', 'Nominal (IDR)', 'Catatan'],
    ...transactions.map((transaction) => [transaction.id, transaction.date, transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran', transaction.wallet_name, transaction.category_name, transaction.amount, transaction.note]),
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}
