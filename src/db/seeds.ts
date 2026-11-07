// src/db/seeds.ts
import type { SQLiteDatabase } from 'expo-sqlite';

export async function seedInitialData(db: SQLiteDatabase): Promise<void> {
  // 1. Cek apakah books sudah ada
  const existingBook = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM books'
  );

  if (existingBook && existingBook.count > 0) {
    // Database sudah di-seed
    return;
  }

  // 2. Default Book
  const bookResult = await db.runAsync(
    `INSERT INTO books (name, is_default) VALUES (?, 1)`,
    ['Buku Utama']
  );
  const bookId = bookResult.lastInsertRowId;

  // 3. Default Wallets
  await db.runAsync(
    `INSERT INTO wallets (book_id, name, type, balance, icon, color) VALUES
     (?, 'Uang Tunai', 'cash', 0, 'cash', '#10B981'),
     (?, 'Rekening Utama', 'bank', 0, 'bank', '#0066FF'),
     (?, 'E-Wallet', 'ewallet', 0, 'phone', '#00AED6')`,
    [bookId, bookId, bookId]
  );

  // 4. Default Categories
  // Expense
  await db.runAsync(
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

  // Income
  await db.runAsync(
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

