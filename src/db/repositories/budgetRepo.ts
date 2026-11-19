// src/db/repositories/budgetRepo.ts
import { getDatabase, withDatabaseTransaction } from '../database';
import { isValidMonthString } from '../../lib/date';
import type { Budget, BudgetWithProgress } from '../../types';

export async function getBudgetById(id: number): Promise<Budget | null> {
  const db = await getDatabase();
  return await db.getFirstAsync<Budget>('SELECT * FROM budgets WHERE id = ?', [id]) ?? null;
}

export async function getBudgetsWithProgress(
  bookId: number,
  month: string // YYYY-MM
): Promise<BudgetWithProgress[]> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    id: number;
    book_id: number;
    category_id: number;
    amount: number;
    month: string;
    created_at: string;
    category_name: string;
    category_icon: string;
    category_color: string;
    spent: number | null;
  }>(
    `SELECT 
      b.*,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      COALESCE(
        (SELECT SUM(t.amount) 
         FROM transactions t 
         WHERE t.book_id = b.book_id 
           AND t.category_id = b.category_id 
           AND t.type = 'expense' 
           AND substr(t.date, 1, 7) = b.month), 0
      ) AS spent
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    WHERE b.book_id = ? AND b.month = ?
    ORDER BY b.amount DESC`,
    [bookId, month]
  );

  return rows.map((r) => {
    const spent = r.spent ?? 0;
    const remaining = r.amount - spent;
    const percentage = r.amount > 0 ? Math.round((spent / r.amount) * 1000) / 10 : 0;
    return {
      ...r,
      spent,
      remaining,
      percentage,
    };
  });
}

export async function setBudget(
  bookId: number,
  categoryId: number,
  month: string,
  amount: number
): Promise<void> {
  if (!isValidMonthString(month)) throw new Error('Bulan budget harus valid dengan format YYYY-MM.');
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Nominal budget harus berupa Rupiah bulat yang lebih besar dari 0.');
  }
  await withDatabaseTransaction(async (db) => {
    const category = await db.getFirstAsync<{ type: string }>('SELECT type FROM categories WHERE id = ?', [categoryId]);
    if (!category || category.type !== 'expense') throw new Error('Pilih kategori pengeluaran untuk budget.');
    await db.runAsync(
      `INSERT INTO budgets (book_id, category_id, month, amount)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(book_id, category_id, month)
       DO UPDATE SET amount = excluded.amount`,
      [bookId, categoryId, month, amount]
    );
  });
}

export async function deleteBudget(id: number): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
  });
}

export async function updateBudget(
  id: number,
  data: Pick<Budget, 'category_id' | 'month' | 'amount'>
): Promise<void> {
  if (!isValidMonthString(data.month)) throw new Error('Bulan budget harus valid dengan format YYYY-MM.');
  if (!Number.isSafeInteger(data.amount) || data.amount <= 0) {
    throw new Error('Nominal budget harus berupa Rupiah bulat yang lebih besar dari 0.');
  }
  await withDatabaseTransaction(async (db) => {
    const existing = await db.getFirstAsync<Budget>('SELECT * FROM budgets WHERE id = ?', [id]);
    if (!existing) throw new Error('Budget tidak ditemukan.');
    const category = await db.getFirstAsync<{ type: string }>('SELECT type FROM categories WHERE id = ?', [data.category_id]);
    if (!category || category.type !== 'expense') throw new Error('Pilih kategori pengeluaran untuk budget.');
    const conflict = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM budgets WHERE book_id = ? AND category_id = ? AND month = ? AND id <> ?',
      [existing.book_id, data.category_id, data.month, id]
    );
    if (conflict) throw new Error('Budget untuk kategori dan bulan tersebut sudah ada. Edit budget yang sudah tersedia.');
    await db.runAsync('UPDATE budgets SET category_id = ?, month = ?, amount = ? WHERE id = ?',
      [data.category_id, data.month, data.amount, id]);
  });
}

export async function getBudgetSummary(
  bookId: number,
  month: string
): Promise<{ totalBudget: number; totalSpent: number; remaining: number }> {
  const budgets = await getBudgetsWithProgress(bookId, month);
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  return {
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
  };
}

