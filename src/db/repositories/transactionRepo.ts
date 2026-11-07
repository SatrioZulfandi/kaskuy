// src/db/repositories/transactionRepo.ts
import { getDatabase } from '../database';
import { updateWalletBalance } from './walletRepo';
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

export async function createTransaction(data: {
  book_id: number;
  wallet_id: number;
  category_id: number;
  type: TransactionType;
  amount: number;
  note?: string | null;
  date: string;
  scan_result_id?: number | null;
}): Promise<TransactionWithDetails> {
  const db = await getDatabase();

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

  // Update wallet balance: income increases balance, expense decreases
  const delta = data.type === 'income' ? data.amount : -data.amount;
  await updateWalletBalance(data.wallet_id, delta);

  const created = await getTransactionById(result.lastInsertRowId);
  if (!created) throw new Error('Failed to retrieve created transaction');
  return created;
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
  const db = await getDatabase();
  const existing = await getTransactionById(id);
  if (!existing) throw new Error(`Transaction ${id} not found`);

  // 1. Revert previous wallet balance impact
  const revertDelta = existing.type === 'income' ? -existing.amount : existing.amount;
  await updateWalletBalance(existing.wallet_id, revertDelta);

  // 2. Determine new values
  const newWalletId = data.wallet_id ?? existing.wallet_id;
  const newCategoryId = data.category_id ?? existing.category_id;
  const newType = data.type ?? existing.type;
  const newAmount = data.amount ?? existing.amount;
  const newNote = data.note !== undefined ? data.note : existing.note;
  const newDate = data.date ?? existing.date;

  // 3. Update transaction record
  await db.runAsync(
    `UPDATE transactions 
     SET wallet_id = ?, category_id = ?, type = ?, amount = ?, note = ?, date = ?, updated_at = (datetime('now', 'localtime'))
     WHERE id = ?`,
    [newWalletId, newCategoryId, newType, newAmount, newNote, newDate, id]
  );

  // 4. Apply new wallet balance impact
  const applyDelta = newType === 'income' ? newAmount : -newAmount;
  await updateWalletBalance(newWalletId, applyDelta);

  const updated = await getTransactionById(id);
  if (!updated) throw new Error('Failed to retrieve updated transaction');
  return updated;
}

export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDatabase();
  const existing = await getTransactionById(id);
  if (!existing) return;

  // Revert balance impact
  const revertDelta = existing.type === 'income' ? -existing.amount : existing.amount;
  await updateWalletBalance(existing.wallet_id, revertDelta);

  await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
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

  const result: { date: string; income: number; expense: number }[] = [];
  for (const [date, val] of map.entries()) {
    result.push({ date, income: val.income, expense: val.expense });
  }
  return result;
}

// Monthly trends for Dashboard 6 (last N months)
export async function getMonthlyTrends(
  bookId: number,
  limitMonths: number = 6
): Promise<{ month: string; income: number; expense: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    month: string;
    type: TransactionType;
    total: number;
  }>(
    `SELECT substr(date, 1, 7) AS month, type, SUM(amount) AS total
     FROM transactions
     WHERE book_id = ?
     GROUP BY month, type
     ORDER BY month DESC
     LIMIT ?`,
    [bookId, limitMonths * 2]
  );

  const map = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const entry = map.get(r.month) ?? { income: 0, expense: 0 };
    if (r.type === 'income') entry.income += r.total;
    if (r.type === 'expense') entry.expense += r.total;
    map.set(r.month, entry);
  }

  const result: { month: string; income: number; expense: number }[] = [];
  for (const [month, val] of map.entries()) {
    result.push({ month, income: val.income, expense: val.expense });
  }
  // Sort ascending by month for display
  result.sort((a, b) => a.month.localeCompare(b.month));
  return result;
}
