import { withDatabaseTransaction } from '../database';
import { buildTransactionsCsv, parseFinancialBackup, serializeFinancialBackup } from '../../lib/dataPortability';
import type { BackupTransaction, BackupWallet } from '../../lib/dataPortability';
import type { Book, Budget, Category, TransactionWithDetails } from '../../types';

export type RestoreResult = {
  books: number;
  wallets: number;
  categories: number;
  categoriesCreated: number;
  transactions: number;
  budgets: number;
};

export async function exportTransactionsCsv(bookId: number): Promise<string> {
  return withDatabaseTransaction(async (db) => {
    const book = await db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) throw new Error('Buku keuangan tidak ditemukan.');
    const transactions = await db.getAllAsync<TransactionWithDetails>(
      `SELECT t.*, w.name AS wallet_name, w.type AS wallet_type,
       c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t JOIN wallets w ON w.id = t.wallet_id JOIN categories c ON c.id = t.category_id
       WHERE t.book_id = ? ORDER BY t.date ASC, t.id ASC`, [bookId]
    );
    return buildTransactionsCsv(transactions);
  });
}

export async function createFinancialBackup(): Promise<string> {
  return withDatabaseTransaction(async (db) => {
    const [books, wallets, categories, transactions, budgets] = await Promise.all([
      db.getAllAsync<Book>('SELECT * FROM books ORDER BY id'),
      db.getAllAsync<BackupWallet>('SELECT * FROM wallets ORDER BY id'),
      db.getAllAsync<Category>('SELECT * FROM categories ORDER BY id'),
      db.getAllAsync<BackupTransaction>(
        `SELECT id, book_id, wallet_id, category_id, type, amount, note, date,
         NULL AS scan_result_id, created_at, updated_at FROM transactions ORDER BY id`
      ),
      db.getAllAsync<Budget>('SELECT * FROM budgets ORDER BY id'),
    ]);
    return serializeFinancialBackup({ books, wallets, categories, transactions, budgets });
  });
}

/** Restore into new books without deleting or changing the existing ledger. */
export async function restoreFinancialBackup(source: string): Promise<RestoreResult> {
  const data = parseFinancialBackup(source);
  return withDatabaseTransaction(async (db) => {
    const bookMap = new Map<number, number>();
    const walletMap = new Map<number, number>();
    const categoryMap = new Map<number, number>();
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
    }
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
    for (const wallet of data.wallets) {
      const values = [bookMap.get(wallet.book_id)!, wallet.name, wallet.type, wallet.balance, wallet.icon, wallet.color, wallet.is_archived, wallet.created_at];
      const result = await db.runAsync(
        'INSERT INTO wallets (book_id, name, type, balance, icon, color, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', values
      );
      walletMap.set(wallet.id, result.lastInsertRowId);
    }
    for (const transaction of data.transactions) {
      await db.runAsync(
        `INSERT INTO transactions (book_id, wallet_id, category_id, type, amount, note, date, scan_result_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        [bookMap.get(transaction.book_id)!, walletMap.get(transaction.wallet_id)!, categoryMap.get(transaction.category_id)!, transaction.type, transaction.amount, transaction.note, transaction.date, transaction.created_at, transaction.updated_at]
      );
    }
    for (const budget of data.budgets) {
      await db.runAsync(
        'INSERT INTO budgets (book_id, category_id, amount, month, created_at) VALUES (?, ?, ?, ?, ?)',
        [bookMap.get(budget.book_id)!, categoryMap.get(budget.category_id)!, budget.amount, budget.month, budget.created_at]
      );
    }
    return { books: data.books.length, wallets: data.wallets.length, categories: data.categories.length, categoriesCreated, transactions: data.transactions.length, budgets: data.budgets.length };
  });
}
