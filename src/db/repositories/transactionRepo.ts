// src/db/repositories/transactionRepo.ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase, withDatabaseTransaction } from '../database';
import { getCurrentMonthString, getDateStringsInRange, getMonthRange, isValidDateString } from '../../lib/date';
import type {
  TransactionType,
  TransactionWithDetails,
} from '../../types';

export async function getTransactions(
  bookId: number,
  options?: {
    startDate?: string;
    endDate?: string;
    walletId?: number;
    categoryId?: number;
    type?: TransactionType;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<TransactionWithDetails[]> {
  const db = await getDatabase();
  const conditions: string[] = ['t.book_id = ?'];
  const params: any[] = [bookId];

  if (options?.startDate) {
    conditions.push('t.date >= ?');
    params.push(options.startDate);
  }
  if (options?.endDate) {
    conditions.push('t.date <= ?');
    params.push(options.endDate);
  }
  if (options?.walletId) {
    conditions.push('t.wallet_id = ?');
    params.push(options.walletId);
  }
  if (options?.categoryId) {
    conditions.push('t.category_id = ?');
    params.push(options.categoryId);
  }
  if (options?.type) {
    conditions.push('t.type = ?');
    params.push(options.type);
  }
  if (options?.search?.trim()) {
    conditions.push("instr(lower(COALESCE(t.note, '') || ' ' || c.name || ' ' || w.name), lower(?)) > 0");
    params.push(options.search.trim());
  }

  let sql = `
    SELECT 
      t.*,
      w.name AS wallet_name,
      w.type AS wallet_type,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color
    FROM transactions t
    JOIN wallets w ON t.wallet_id = w.id
    JOIN categories c ON t.category_id = c.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
  `;

  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
    if (options?.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }
  }

  return await db.getAllAsync<TransactionWithDetails>(sql, params);
}

export async function getTransactionById(id: number): Promise<TransactionWithDetails | null> {
  const db = await getDatabase();
  return findTransaction(db, id);
}

async function findTransaction(db: SQLiteDatabase, id: number): Promise<TransactionWithDetails | null> {
  const row = await db.getFirstAsync<TransactionWithDetails>(
    `SELECT 
      t.*,
      w.name AS wallet_name,
      w.type AS wallet_type,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color
    FROM transactions t
    JOIN wallets w ON t.wallet_id = w.id
    JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?`,
    [id]
  );
  return row ?? null;
}

async function applyWalletDelta(db: SQLiteDatabase, walletId: number, delta: number): Promise<void> {
  const wallet = await db.getFirstAsync<{ balance: number }>('SELECT balance FROM wallets WHERE id = ?', [walletId]);
  if (!wallet || !Number.isSafeInteger(wallet.balance + delta)) {
    throw new Error('Saldo dompet tidak valid atau melebihi batas nominal.');
  }
  const result = await db.runAsync(
    'UPDATE wallets SET balance = balance + ? WHERE id = ?',
    [delta, walletId]
  );
  if (result.changes !== 1) throw new Error('Dompet transaksi tidak ditemukan.');
}

async function validateTransaction(
  db: SQLiteDatabase,
  data: { book_id: number; wallet_id: number; category_id: number; type: TransactionType; amount: number; date: string },
  existingWalletId?: number
): Promise<void> {
  if (!Number.isSafeInteger(data.amount) || data.amount <= 0) {
    throw new Error('Nominal transaksi harus berupa Rupiah bulat yang lebih besar dari 0.');
  }
  if (!isValidDateString(data.date)) {
    throw new Error('Tanggal transaksi harus valid dengan format YYYY-MM-DD.');
  }
  if (data.type !== 'income' && data.type !== 'expense') {
    throw new Error('Jenis transaksi tidak valid.');
  }
  const wallet = await db.getFirstAsync<{ book_id: number; is_archived: number }>(
    'SELECT book_id, is_archived FROM wallets WHERE id = ?', [data.wallet_id]
  );
  if (!wallet || wallet.book_id !== data.book_id || (wallet.is_archived !== 0 && data.wallet_id !== existingWalletId)) {
    throw new Error('Pilih dompet aktif dari buku keuangan yang sama.');
  }
  const category = await db.getFirstAsync<{ type: TransactionType }>(
    'SELECT type FROM categories WHERE id = ?', [data.category_id]
  );
  if (!category || category.type !== data.type) {
    throw new Error('Kategori harus sesuai dengan jenis transaksi.');
  }
}

type TransactionInput = {
  book_id: number;
  wallet_id: number;
  category_id: number;
  type: TransactionType;
  amount: number;
  note?: string | null;
  date: string;
  scan_result_id?: number | null;
};

/** Create a transaction and update its balance within the caller's write transaction. */
export async function createTransactionInDatabase(
  db: SQLiteDatabase,
  data: TransactionInput
): Promise<TransactionWithDetails> {
  await validateTransaction(db, data);
  const result = await db.runAsync(
    `INSERT INTO transactions (book_id, wallet_id, category_id, type, amount, note, date, scan_result_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.book_id,
      data.wallet_id,
      data.category_id,
      data.type,
      data.amount,
      data.note ?? null,
      data.date,
      data.scan_result_id ?? null,
    ]
  );

  const delta = data.type === 'income' ? data.amount : -data.amount;
  await applyWalletDelta(db, data.wallet_id, delta);

  const created = await findTransaction(db, result.lastInsertRowId);
  if (!created) throw new Error('Failed to retrieve created transaction');
  return created;
}

export async function createTransaction(data: TransactionInput): Promise<TransactionWithDetails> {
  return withDatabaseTransaction((db) => createTransactionInDatabase(db, data));
}

export async function updateTransaction(
  id: number,
  data: {
    wallet_id?: number;
    category_id?: number;
    type?: TransactionType;
    amount?: number;
    note?: string | null;
    date?: string;
  }
): Promise<TransactionWithDetails> {
  return withDatabaseTransaction(async (db) => {
    const existing = await findTransaction(db, id);
    if (!existing) throw new Error(`Transaction ${id} not found`);

    const newWalletId = data.wallet_id ?? existing.wallet_id;
    const newCategoryId = data.category_id ?? existing.category_id;
    const newType = data.type ?? existing.type;
    const newAmount = data.amount ?? existing.amount;
    const newNote = data.note !== undefined ? data.note : existing.note;
    const newDate = data.date ?? existing.date;

    await validateTransaction(db, {
      book_id: existing.book_id,
      wallet_id: newWalletId,
      category_id: newCategoryId,
      type: newType,
      amount: newAmount,
      date: newDate,
    }, existing.wallet_id);

    // Revert, edit, and reapply within the same transaction.
    const revertDelta = existing.type === 'income' ? -existing.amount : existing.amount;
    await applyWalletDelta(db, existing.wallet_id, revertDelta);

    await db.runAsync(
      `UPDATE transactions
       SET wallet_id = ?, category_id = ?, type = ?, amount = ?, note = ?, date = ?, updated_at = (datetime('now', 'localtime'))
       WHERE id = ?`,
      [newWalletId, newCategoryId, newType, newAmount, newNote, newDate, id]
    );

    const applyDelta = newType === 'income' ? newAmount : -newAmount;
    await applyWalletDelta(db, newWalletId, applyDelta);

    const updated = await findTransaction(db, id);
    if (!updated) throw new Error('Failed to retrieve updated transaction');
    return updated;
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    const existing = await findTransaction(db, id);
    if (!existing) return;

    const revertDelta = existing.type === 'income' ? -existing.amount : existing.amount;
    await applyWalletDelta(db, existing.wallet_id, revertDelta);

    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  });
}

// Aggregation for Dashboard 1
export async function getSummary(
  bookId: number,
  startDate: string,
  endDate: string
): Promise<{ income: number; expense: number; total: number }> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ type: TransactionType; total: number }>(
    `SELECT type, SUM(amount) AS total 
     FROM transactions 
     WHERE book_id = ? AND date >= ? AND date <= ?
     GROUP BY type`,
    [bookId, startDate, endDate]
  );

  let income = 0;
  let expense = 0;

  for (const r of rows) {
    if (r.type === 'income') income = r.total;
    if (r.type === 'expense') expense = r.total;
  }

  return {
    income,
    expense,
    total: income - expense,
  };
}

// Breakdown for Dashboard 2 & 3
export async function getCategoryBreakdown(
  bookId: number,
  type: TransactionType,
  startDate: string,
  endDate: string
): Promise<
  {
    category_id: number;
    category_name: string;
    category_icon: string;
    category_color: string;
    total: number;
    count: number;
  }[]
> {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT 
      c.id AS category_id,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      SUM(t.amount) AS total,
      COUNT(t.id) AS count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.book_id = ? AND t.type = ? AND t.date >= ? AND t.date <= ?
    GROUP BY c.id
    ORDER BY total DESC`,
    [bookId, type, startDate, endDate]
  );
}

// Daily trends for Dashboard 5 (e.g. 7 days)
export async function getDailyTrends(
  bookId: number,
  startDate: string,
  endDate: string
): Promise<{ date: string; income: number; expense: number }[]> {
  const dates = getDateStringsInRange(startDate, endDate);
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    date: string;
    type: TransactionType;
    total: number;
  }>(
    `SELECT date, type, SUM(amount) AS total
     FROM transactions
     WHERE book_id = ? AND date >= ? AND date <= ?
     GROUP BY date, type
     ORDER BY date ASC`,
    [bookId, startDate, endDate]
  );

  const map = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const entry = map.get(r.date) ?? { income: 0, expense: 0 };
    if (r.type === 'income') entry.income += r.total;
    if (r.type === 'expense') entry.expense += r.total;
    map.set(r.date, entry);
  }

  return dates.map((date) => ({ date, ...(map.get(date) ?? { income: 0, expense: 0 }) }));
}

// Monthly trends for Dashboard 6 (last N months)
export async function getMonthlyTrends(
  bookId: number,
  limitMonths: number = 6,
  anchorMonth: string = getCurrentMonthString()
): Promise<{ month: string; income: number; expense: number }[]> {
  if (!Number.isSafeInteger(limitMonths) || limitMonths < 1) {
    throw new Error('Jumlah bulan harus berupa bilangan bulat positif.');
  }
  const { endDate } = getMonthRange(anchorMonth);
  const [year, month] = anchorMonth.split('-').map(Number);
  const months = Array.from({ length: limitMonths }, (_, index) => {
    const date = new Date(year, month - limitMonths + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const startDate = `${months[0]}-01`;
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    month: string;
    income: number;
    expense: number;
  }>(
    `SELECT substr(date, 1, 7) AS month,
       SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
       SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
     FROM transactions
     WHERE book_id = ? AND date >= ? AND date <= ?
     GROUP BY substr(date, 1, 7)
     ORDER BY month ASC`,
    [bookId, startDate, endDate]
  );

  const byMonth = new Map(rows.map((row) => [row.month, row]));
  return months.map((month) => byMonth.get(month) ?? { month, income: 0, expense: 0 });
}
