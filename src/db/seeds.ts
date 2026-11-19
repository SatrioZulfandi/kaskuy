// src/db/seeds.ts
import type { SQLiteDatabase } from 'expo-sqlite';

export async function seedInitialData(db: SQLiteDatabase, repairMissing = false): Promise<void> {
  // 1. Cek apakah books sudah ada
  const existingBook = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM books'
  );

  if (existingBook && existingBook.count > 0 && !repairMissing) {
    return;
  }

  let bookId: number;
  if (existingBook && existingBook.count > 0) {
    const book = await db.getFirstAsync<{ id: number }>('SELECT id FROM books ORDER BY is_default DESC, id ASC LIMIT 1');
    if (!book) throw new Error('Buku awal tidak ditemukan.');
    bookId = book.id;
  } else {
    const bookResult = await db.runAsync(`INSERT INTO books (name, is_default) VALUES (?, 1)`, ['Buku Utama']);
    bookId = bookResult.lastInsertRowId;
  }

  // Repair interrupted legacy seeds only where a complete group is missing.
  // Existing wallet balances, category edits and dictionary corrections are kept.
  const wallets = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM wallets WHERE book_id = ?', [bookId]);
  if (!wallets?.count) await db.runAsync(
    `INSERT INTO wallets (book_id, name, type, balance, icon, color) VALUES
     (?, 'Uang Tunai', 'cash', 0, 'cash', '#10B981'),
     (?, 'Rekening Utama', 'bank', 0, 'bank', '#0066FF'),
     (?, 'E-Wallet', 'ewallet', 0, 'phone', '#00AED6')`,
    [bookId, bookId, bookId]
  );

  const expenses = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM categories WHERE type = 'expense'");
  if (!expenses?.count) await db.runAsync(
    `INSERT INTO categories (name, type, icon, color, sort_order, is_default) VALUES
     ('Makanan', 'expense', 'food', '#F59E0B', 1, 1),
     ('Belanja', 'expense', 'shop', '#EC4899', 2, 1),
     ('Hiburan', 'expense', 'entertainment', '#8B5CF6', 3, 1),
     ('Transport', 'expense', 'transport', '#3B82F6', 4, 1),
     ('Tagihan', 'expense', 'bill', '#EF4444', 5, 1),
     ('Kesehatan', 'expense', 'health', '#10B981', 6, 1),
     ('Pendidikan', 'expense', 'education', '#6366F1', 7, 1),
     ('Lainnya', 'expense', 'other', '#6B7280', 8, 1)`
  );

  const incomes = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM categories WHERE type = 'income'");
  if (!incomes?.count) await db.runAsync(
    `INSERT INTO categories (name, type, icon, color, sort_order, is_default) VALUES
     ('Gaji', 'income', 'salary', '#10B981', 1, 1),
     ('Bisnis', 'income', 'business', '#3B82F6', 2, 1),
     ('Freelance', 'income', 'freelance', '#8B5CF6', 3, 1),
     ('Tabungan', 'income', 'savings', '#F59E0B', 4, 1),
     ('Hadiah', 'income', 'gift', '#EC4899', 5, 1),
     ('Lainnya', 'income', 'other', '#6B7280', 6, 1)`
  );

  // 5. Default Merchant Dictionary (Built-in)
  const defaultMerchants = [
    ['INDOMARET', 'Indomaret'],
    ['ALFAMART', 'Alfamart'],
    ['ALFAMIDI', 'Alfamidi'],
    ['ALFARIA', 'Alfamart'],
    ['SUPERINDO', 'Superindo'],
    ['YOMART', 'Yomart'],
    ['HYPERMART', 'Hypermart'],
    ['TRANSMART', 'Transmart'],
    ['TRANSMRT', 'Transmart'],
    ['STARBUCKS', 'Starbucks'],
    ['KFC', 'KFC'],
    ['MCDONALD', 'McDonalds'],
  ];

  for (const [raw, norm] of defaultMerchants) {
    await db.runAsync(
      `INSERT OR IGNORE INTO merchant_dictionary (raw_text, normalized_name, frequency) VALUES (?, ?, 1)`,
      [raw, norm]
    );
  }
}

