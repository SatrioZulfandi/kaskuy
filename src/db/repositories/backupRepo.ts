import { withDatabaseTransaction } from '../database';
import { buildTransactionsCsv } from '../../lib/dataPortability';
import type { Book, Budget, Category, Transaction, TransactionWithDetails, Wallet } from '../../types';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

export const BACKUP_BATCH_SIZE = 100;

export type RestoreResult = {
  books: number;
  wallets: number;
  categories: number;
  categoriesCreated: number;
  transactions: number;
  budgets: number;
};

export async function getTransactionsForExport(bookId: number): Promise<{ book: Book; transactions: TransactionWithDetails[] }> {
  return withDatabaseTransaction(async (db) => {
    const book = await db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) throw new Error('Buku keuangan tidak ditemukan.');
    const transactions = await db.getAllAsync<TransactionWithDetails>(
      `SELECT t.*, w.name AS wallet_name, w.type AS wallet_type,
       c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t JOIN wallets w ON w.id = t.wallet_id JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? ORDER BY t.date ASC, t.id ASC`, [bookId]
    );
    return { book, transactions };
  });
}

export async function exportTransactionsCsv(bookId: number): Promise<string> {
  const { transactions } = await getTransactionsForExport(bookId);
  return buildTransactionsCsv(transactions);
}

export type BackupTransaction = Omit<Transaction, 'scan_result_id'>;

type RestoreRows = {
  books: Book[];
  wallets: Wallet[];
  categories: Category[];
  transactionCount: number;
  budgetCount: number;
  transactions: AsyncIterable<BackupTransaction[]>;
  budgets: AsyncIterable<Budget[]>;
};

export type BackupProgress = (completed: number, total: number) => void;
export type RestoredBook = Pick<Book, 'id' | 'name'>;

async function insertRows(db: SQLiteDatabase, target: string, rows: SQLiteBindValue[][]): Promise<void> {
  const rowPlaceholder = `(${rows[0].map(() => '?').join(', ')})`;
  const placeholders = rows.map(() => rowPlaceholder).join(', ');
  await db.runAsync(`INSERT INTO ${target} VALUES ${placeholders}`, rows.flat());
}

/** Restore into new books without deleting or changing the existing ledger. */
export async function restoreBackupRows(data: RestoreRows, onProgress?: BackupProgress): Promise<{
  counts: RestoreResult;
  restoredBooks: RestoredBook[];
}> {
  return withDatabaseTransaction(async (db) => {
    const bookMap = new Map<number, number>();
    const walletMap = new Map<number, number>();
    const categoryMap = new Map<number, number>();
    const restoredBooks: RestoredBook[] = [];
    const total = data.books.length + data.wallets.length + data.categories.length + data.transactionCount + data.budgetCount;
    let completed = 0;
    const advance = (count: number) => {
      completed += count;
      onProgress?.(completed, total);
    };
    advance(0);
    const existingBooks = await db.getAllAsync<{ name: string }>('SELECT name FROM books');
    const usedNames = new Set(existingBooks.map((book) => book.name.trim().toLowerCase()));
    for (const book of data.books) {
      const stem = `${book.name.trim().slice(0, 40)} (Pemulihan)`;
      let name = stem;
      let counter = 2;
      while (usedNames.has(name.toLowerCase())) name = `${stem} ${counter++}`;
      usedNames.add(name.toLowerCase());
      const result = await db.runAsync('INSERT INTO books (name, is_default, created_at) VALUES (?, 0, ?)', [name, book.created_at]);
      bookMap.set(book.id, result.lastInsertRowId);
      restoredBooks.push({ id: result.lastInsertRowId, name });
    }
    advance(data.books.length);
    let categoriesCreated = 0;
    const usedCategoryIds = new Set<number>();
    for (const category of data.categories) {
      const existing = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND type = ? ORDER BY id LIMIT 1',
        [category.name.trim(), category.type]
      );
      if (existing && !usedCategoryIds.has(existing.id)) {
        categoryMap.set(category.id, existing.id);
        usedCategoryIds.add(existing.id);
      } else {
        // Distinct source categories must stay distinct, even in older backups
        // that used the same category name more than once.
        let name = category.name.trim();
        let counter = 2;
        while (await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND type = ? LIMIT 1', [name, category.type]
        )) name = `${category.name.trim().slice(0, 24)} (Pemulihan ${counter++})`;
        const result = await db.runAsync(
          'INSERT INTO categories (name, type, icon, color, sort_order, is_default) VALUES (?, ?, ?, ?, ?, 0)',
          [name, category.type, category.icon, category.color, category.sort_order]
        );
        categoryMap.set(category.id, result.lastInsertRowId);
        usedCategoryIds.add(result.lastInsertRowId);
        categoriesCreated++;
      }
    }
    advance(data.categories.length);
    for (const wallet of data.wallets) {
      const values = [bookMap.get(wallet.book_id)!, wallet.name, wallet.type, wallet.balance, wallet.icon, wallet.color, wallet.is_archived, wallet.created_at];
      const result = await db.runAsync(
        'INSERT INTO wallets (book_id, name, type, balance, icon, color, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', values
      );
      walletMap.set(wallet.id, result.lastInsertRowId);
    }
    advance(data.wallets.length);
    for await (const transactions of data.transactions) {
      await insertRows(
        db,
        'transactions (book_id, wallet_id, category_id, type, amount, note, date, created_at, updated_at)',
        transactions.map((transaction) => [
          bookMap.get(transaction.book_id)!, walletMap.get(transaction.wallet_id)!, categoryMap.get(transaction.category_id)!,
          transaction.type, transaction.amount, transaction.note, transaction.date, transaction.created_at, transaction.updated_at,
        ])
      );
      advance(transactions.length);
    }
    for await (const budgets of data.budgets) {
      await insertRows(
        db,
        'budgets (book_id, category_id, amount, month, created_at)',
        budgets.map((budget) => [bookMap.get(budget.book_id)!, categoryMap.get(budget.category_id)!, budget.amount, budget.month, budget.created_at])
      );
      advance(budgets.length);
    }
    if (completed !== total) throw new Error('Isi cadangan berubah selama pemulihan.');
    return {
      counts: {
        books: data.books.length,
        wallets: data.wallets.length,
        categories: data.categories.length,
        categoriesCreated,
        transactions: data.transactionCount,
        budgets: data.budgetCount,
      },
      restoredBooks,
    };
  });
}
