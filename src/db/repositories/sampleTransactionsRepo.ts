import { getDateStringsInRange, getTodayDateString } from '../../lib/date';
import type { Book, Category, TransactionType } from '../../types';
import { withDatabaseTransaction } from '../database';
import { createTransactionInDatabase } from './transactionRepo';

const SAMPLE_BOOK_NAME = 'Buku Contoh';
const SAMPLE_BOOK_KEY = 'sample_transactions_book_id';

const SAMPLE_WALLETS = [
  { type: 'cash', name: 'Uang Tunai', icon: 'cash', color: '#10B981' },
  { type: 'bank', name: 'Rekening Utama', icon: 'bank', color: '#0066FF' },
  { type: 'ewallet', name: 'E-Wallet', icon: 'phone', color: '#00AED6' },
] as const;

type SampleWallet = (typeof SAMPLE_WALLETS)[number]['type'];
type SampleBook = Pick<Book, 'id' | 'name'>;

const SAMPLE_TRANSACTIONS: readonly {
  daysAgo: number;
  wallet: SampleWallet;
  category: string;
  type: TransactionType;
  amount: number;
  note: string;
}[] = [
  { daysAgo: 16, wallet: 'bank', category: 'Gaji', type: 'income', amount: 5_600_000, note: 'Gaji bulanan' },
  { daysAgo: 16, wallet: 'cash', category: 'Hadiah', type: 'income', amount: 350_000, note: 'Hadiah dari keluarga' },
  { daysAgo: 15, wallet: 'ewallet', category: 'Bisnis', type: 'income', amount: 245_000, note: 'Penjualan buku bekas' },
  { daysAgo: 15, wallet: 'bank', category: 'Tagihan', type: 'expense', amount: 1_450_000, note: 'Sewa kos bulanan' },
  { daysAgo: 14, wallet: 'cash', category: 'Belanja', type: 'expense', amount: 78_500, note: 'Belanja sayur dan buah di pasar' },
  { daysAgo: 13, wallet: 'ewallet', category: 'Transport', type: 'expense', amount: 54_500, note: 'Isi bensin motor' },
  { daysAgo: 12, wallet: 'bank', category: 'Tagihan', type: 'expense', amount: 325_000, note: 'Tagihan internet bulanan' },
  { daysAgo: 11, wallet: 'cash', category: 'Makanan', type: 'expense', amount: 28_000, note: 'Makan siang di warung' },
  { daysAgo: 10, wallet: 'bank', category: 'Belanja', type: 'expense', amount: 187_350, note: 'Belanja kebutuhan rumah' },
  { daysAgo: 9, wallet: 'ewallet', category: 'Makanan', type: 'expense', amount: 28_000, note: 'Kopi dan roti' },
  { daysAgo: 8, wallet: 'ewallet', category: 'Hiburan', type: 'expense', amount: 58_000, note: 'Tiket bioskop' },
  { daysAgo: 7, wallet: 'bank', category: 'Freelance', type: 'income', amount: 725_000, note: 'Pembayaran desain poster' },
  { daysAgo: 6, wallet: 'cash', category: 'Kesehatan', type: 'expense', amount: 48_500, note: 'Vitamin dari apotek' },
  { daysAgo: 5, wallet: 'bank', category: 'Pendidikan', type: 'expense', amount: 119_000, note: 'Buku belajar bahasa Inggris' },
  { daysAgo: 4, wallet: 'ewallet', category: 'Transport', type: 'expense', amount: 24_000, note: 'Tiket KRL' },
  { daysAgo: 3, wallet: 'bank', category: 'Tagihan', type: 'expense', amount: 218_750, note: 'Tagihan listrik' },
  { daysAgo: 1, wallet: 'cash', category: 'Makanan', type: 'expense', amount: 21_500, note: 'Sarapan bubur ayam' },
  { daysAgo: 0, wallet: 'cash', category: 'Belanja', type: 'expense', amount: 56_000, note: 'Belanja telur dan beras' },
];

export function createSampleTransactionsBook(): Promise<SampleBook | null> {
  return withDatabaseTransaction(async (db) => {
    const previous = await db.getFirstAsync<{ id: number | null; name: string | null }>(
      `SELECT books.id, books.name FROM app_settings
       LEFT JOIN books ON app_settings.value = CAST(books.id AS TEXT)
       WHERE app_settings.key = ?`,
      [SAMPLE_BOOK_KEY]
    );
    if (previous) {
      // A deleted example book should stay deleted across development reloads.
      return previous.id !== null && previous.name !== null ? { id: previous.id, name: previous.name } : null;
    }

    let name = SAMPLE_BOOK_NAME;
    let suffix = 2;
    while (await db.getFirstAsync('SELECT id FROM books WHERE name = ? COLLATE NOCASE LIMIT 1', [name])) {
      name = `${SAMPLE_BOOK_NAME} ${suffix++}`;
    }
    const book = await db.runAsync('INSERT INTO books (name) VALUES (?)', [name]);
    const bookId = book.lastInsertRowId;
    const walletIds = new Map<SampleWallet, number>();
    for (const wallet of SAMPLE_WALLETS) {
      const result = await db.runAsync(
        'INSERT INTO wallets (book_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)',
        [bookId, wallet.name, wallet.type, wallet.icon, wallet.color]
      );
      walletIds.set(wallet.type, result.lastInsertRowId);
    }

    const categories = await db.getAllAsync<Pick<Category, 'id' | 'name' | 'type'>>(
      'SELECT id, name, type FROM categories ORDER BY is_default DESC, sort_order, id'
    );
    const today = getTodayDateString();
    const dates = getDateStringsInRange(`${today.slice(0, 7)}-01`, today);
    for (const transaction of SAMPLE_TRANSACTIONS) {
      const category = categories.find((item) => item.type === transaction.type
        && item.name.toLowerCase() === transaction.category.toLowerCase())
        ?? categories.find((item) => item.type === transaction.type);
      if (!category) throw new Error('Kategori untuk transaksi contoh tidak tersedia.');
      await createTransactionInDatabase(db, {
        book_id: bookId,
        wallet_id: walletIds.get(transaction.wallet)!,
        category_id: category.id,
        type: transaction.type,
        amount: transaction.amount,
        note: transaction.note,
        date: dates[Math.max(0, dates.length - 1 - transaction.daysAgo)],
      });
    }

    await db.runAsync(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [SAMPLE_BOOK_KEY, String(bookId)]
    );
    return { id: bookId, name };
  });
}
