import { isValidDateString, isValidMonthString } from './date';
import type { Book, Budget, Category, Transaction, TransactionWithDetails, Wallet } from '../types';

export const BACKUP_FORMAT = 'kaskuy-financial-backup' as const;
export const BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_LENGTH = 10_000_000;

export type BackupWallet = Wallet;
export type BackupTransaction = Omit<Transaction, 'scan_result_id'> & { scan_result_id: null };
export type FinancialBackup = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  created_at: string;
  books: Book[];
  wallets: BackupWallet[];
  categories: Category[];
  transactions: BackupTransaction[];
  budgets: Budget[];
};

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new Error(`Cadangan tidak valid: ${message}`);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} harus berupa objek.`);
  return value as RecordValue;
}

function text(value: unknown, label: string, maxLength = MAX_BACKUP_LENGTH, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    invalid(`${label} harus berupa teks${allowEmpty ? '' : ' yang tidak kosong'}.`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = Number.MIN_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    invalid(`${label} harus berupa bilangan bulat yang valid.`);
  }
  return value;
}

function flag(value: unknown, label: string): number {
  if (value !== 0 && value !== 1) invalid(`${label} hanya boleh 0 atau 1.`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 100);
  if (!isValidDateString(result.slice(0, 10)) || !Number.isFinite(Date.parse(result.replace(' ', 'T')))) {
    invalid(`${label} bukan waktu yang valid.`);
  }
  return result;
}

function color(value: unknown, label: string): string {
  const result = text(value, label, 7);
  if (!/^#[0-9a-f]{6}$/i.test(result)) invalid(`${label} bukan warna yang valid.`);
  return result;
}

function transactionType(value: unknown, label: string): 'income' | 'expense' {
  if (value !== 'income' && value !== 'expense') invalid(`${label} bukan jenis transaksi yang valid.`);
  return value;
}

function rows<T>(value: unknown, label: string, parse: (row: RecordValue, label: string) => T & { id: number }): T[] {
  if (!Array.isArray(value) || value.length > 100_000) invalid(`${label} harus berupa daftar yang valid.`);
  const ids = new Set<number>();
  return value.map((entry, index) => {
    const rowLabel = `${label} baris ${index + 1}`;
    const row = parse(record(entry, rowLabel), rowLabel);
    if (ids.has(row.id)) invalid(`${rowLabel} memiliki ID duplikat.`);
    ids.add(row.id);
    return row;
  });
}

/** Validate the complete financial graph before any database mutation. */
export function parseFinancialBackup(source: string): FinancialBackup {
  if (typeof source !== 'string' || !source.trim()) invalid('tempelkan isi cadangan JSON terlebih dahulu.');
  if (source.length > MAX_BACKUP_LENGTH) invalid('ukuran melebihi batas 10 juta karakter.');
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    invalid('isi JSON tidak dapat dibaca.');
  }
  const data = record(value, 'data');
  if (data.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION) {
    invalid('format atau versi cadangan tidak didukung.');
  }
  const books = rows<Book>(data.books, 'buku', (row, label) => ({
    id: integer(row.id, `${label}: ID`, 1),
    name: text(row.name, `${label}: nama`),
    is_default: flag(row.is_default, `${label}: buku aktif`),
    created_at: timestamp(row.created_at, `${label}: waktu dibuat`),
  }));
  if (!books.length || books.filter((book) => book.is_default === 1).length !== 1) {
    invalid('harus terdapat tepat satu buku aktif.');
  }
  const wallets = rows<BackupWallet>(data.wallets, 'dompet', (row, label) => {
    const type = row.type;
    if (type !== 'cash' && type !== 'bank' && type !== 'ewallet' && type !== 'credit_card') {
      invalid(`${label}: jenis dompet tidak valid.`);
    }
    return {
      id: integer(row.id, `${label}: ID`, 1),
      book_id: integer(row.book_id, `${label}: ID buku`, 1),
      name: text(row.name, `${label}: nama`),
      type,
      balance: integer(row.balance, `${label}: saldo`),
      icon: text(row.icon, `${label}: ikon`, 64),
      color: color(row.color, `${label}: warna`),
      is_archived: flag(row.is_archived, `${label}: status arsip`),
      created_at: timestamp(row.created_at, `${label}: waktu dibuat`),
    };
  });
  const categories = rows<Category>(data.categories, 'kategori', (row, label) => ({
    id: integer(row.id, `${label}: ID`, 1),
    name: text(row.name, `${label}: nama`),
    type: transactionType(row.type, `${label}: jenis`),
    icon: text(row.icon, `${label}: ikon`, 64),
    color: color(row.color, `${label}: warna`),
    sort_order: integer(row.sort_order, `${label}: urutan`, 0),
    is_default: flag(row.is_default, `${label}: kategori bawaan`),
  }));
  const transactions = rows<BackupTransaction>(data.transactions, 'transaksi', (row, label) => {
    const date = text(row.date, `${label}: tanggal`, 10);
    if (!isValidDateString(date)) invalid(`${label}: tanggal tidak valid.`);
    return {
      id: integer(row.id, `${label}: ID`, 1),
      book_id: integer(row.book_id, `${label}: ID buku`, 1),
      wallet_id: integer(row.wallet_id, `${label}: ID dompet`, 1),
      category_id: integer(row.category_id, `${label}: ID kategori`, 1),
      type: transactionType(row.type, `${label}: jenis`),
      amount: integer(row.amount, `${label}: nominal`, 1),
      note: row.note === null ? null : text(row.note, `${label}: catatan`, MAX_BACKUP_LENGTH, true),
      date,
      scan_result_id: null,
      created_at: timestamp(row.created_at, `${label}: waktu dibuat`),
      updated_at: timestamp(row.updated_at, `${label}: waktu diubah`),
    };
  });
  const budgets = rows<Budget>(data.budgets, 'budget', (row, label) => {
    const month = text(row.month, `${label}: bulan`, 7);
    if (!isValidMonthString(month)) invalid(`${label}: bulan tidak valid.`);
    return {
      id: integer(row.id, `${label}: ID`, 1),
      book_id: integer(row.book_id, `${label}: ID buku`, 1),
      category_id: integer(row.category_id, `${label}: ID kategori`, 1),
      amount: integer(row.amount, `${label}: nominal`, 1),
      month,
      created_at: timestamp(row.created_at, `${label}: waktu dibuat`),
    };
  });
  const bookIds = new Set(books.map((book) => book.id));
  const walletMap = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  for (const wallet of wallets) {
    if (!bookIds.has(wallet.book_id)) invalid(`dompet ${wallet.id} merujuk ke buku yang tidak ada.`);
  }
  for (const transaction of transactions) {
    const wallet = walletMap.get(transaction.wallet_id);
    const category = categoryMap.get(transaction.category_id);
    if (!bookIds.has(transaction.book_id) || !wallet || wallet.book_id !== transaction.book_id) {
      invalid(`transaksi ${transaction.id} tidak cocok dengan buku/dompetnya.`);
    }
    if (!category || category.type !== transaction.type) invalid(`transaksi ${transaction.id} tidak cocok dengan kategorinya.`);
  }
  const budgetKeys = new Set<string>();
  for (const budget of budgets) {
    if (!bookIds.has(budget.book_id) || categoryMap.get(budget.category_id)?.type !== 'expense') {
      invalid(`budget ${budget.id} tidak cocok dengan buku/kategorinya.`);
    }
    const key = `${budget.book_id}:${budget.category_id}:${budget.month}`;
    if (budgetKeys.has(key)) invalid('budget kategori/bulan yang sama tidak boleh duplikat.');
    budgetKeys.add(key);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at: timestamp(data.created_at, 'waktu cadangan'), books, wallets, categories, transactions, budgets };
}

export function serializeFinancialBackup(data: Omit<FinancialBackup, 'format' | 'version' | 'created_at'>): string {
  const source = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, created_at: new Date().toISOString(), ...data });
  const validated = parseFinancialBackup(source);
  const formatted = JSON.stringify(validated, null, 2);
  return formatted.length <= MAX_BACKUP_LENGTH ? formatted : JSON.stringify(validated);
}

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
