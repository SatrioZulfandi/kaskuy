// src/db/repositories/walletRepo.ts
import { getDatabase, withDatabaseTransaction } from '../database';
import type { Wallet, WalletType } from '../../types';

export async function getWallets(bookId: number, includeArchived = false): Promise<Wallet[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Wallet>(
    `SELECT * FROM wallets WHERE book_id = ? ${includeArchived ? '' : 'AND is_archived = 0'} ORDER BY is_archived ASC, id ASC`,
    [bookId]
  );
}

export async function getWalletById(id: number): Promise<Wallet | null> {
  const db = await getDatabase();
  const wallet = await db.getFirstAsync<Wallet>(
    'SELECT * FROM wallets WHERE id = ?',
    [id]
  );
  return wallet ?? null;
}

export async function createWallet(
  bookId: number,
  name: string,
  type: WalletType,
  balance: number,
  icon: string,
  color: string
): Promise<Wallet> {
  if (!name.trim()) throw new Error('Nama dompet tidak boleh kosong.');
  if (!Number.isSafeInteger(balance)) throw new Error('Saldo awal harus berupa nominal Rupiah bulat yang valid.');
  return withDatabaseTransaction(async (db) => {
    const result = await db.runAsync(
      'INSERT INTO wallets (book_id, name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?, ?)',
      [bookId, name.trim(), type, balance, icon, color]
    );
    const created = await db.getFirstAsync<Wallet>('SELECT * FROM wallets WHERE id = ?', [result.lastInsertRowId]);
    if (!created) throw new Error('Failed to create wallet');
    return created;
  });
}

export async function updateWallet(
  id: number,
  data: Partial<Pick<Wallet, 'name' | 'type' | 'icon' | 'color' | 'is_archived'>>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    if (!data.name.trim()) throw new Error('Nama dompet tidak boleh kosong.');
    fields.push('name = ?');
    values.push(data.name.trim());
  }
  if (data.type !== undefined) {
    if (!['cash', 'bank', 'ewallet', 'credit_card'].includes(data.type)) throw new Error('Tipe dompet tidak valid.');
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.icon !== undefined) {
    fields.push('icon = ?');
    values.push(data.icon);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    values.push(data.color);
  }
  if (data.is_archived !== undefined) {
    if (data.is_archived !== 0 && data.is_archived !== 1) throw new Error('Status arsip dompet tidak valid.');
    fields.push('is_archived = ?');
    values.push(data.is_archived);
  }

  if (fields.length === 0) return;

  values.push(id);
  await withDatabaseTransaction(async (db) => {
    const result = await db.runAsync(`UPDATE wallets SET ${fields.join(', ')} WHERE id = ?`, values);
    if (result.changes !== 1) throw new Error('Dompet tidak ditemukan.');
  });
}

export async function getWalletSummary(id: number): Promise<{ count: number; income: number; expense: number }> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number; income: number; expense: number }>(
    `SELECT COUNT(*) AS count,
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions WHERE wallet_id = ?`,
    [id]
  );
  return result ?? { count: 0, income: 0, expense: 0 };
}

export async function updateWalletBalance(id: number, delta: number): Promise<void> {
  if (!Number.isSafeInteger(delta)) throw new Error('Perubahan saldo harus berupa Rupiah bulat yang valid.');
  await withDatabaseTransaction(async (db) => {
    const wallet = await db.getFirstAsync<Wallet>('SELECT * FROM wallets WHERE id = ?', [id]);
    if (!wallet || !Number.isSafeInteger(wallet.balance + delta)) {
      throw new Error('Dompet tidak ditemukan atau saldo melebihi batas nominal.');
    }
    await db.runAsync('UPDATE wallets SET balance = balance + ? WHERE id = ?', [delta, id]);
  });
}

export async function getTotalBalance(bookId: number): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(balance) as total FROM wallets WHERE book_id = ? AND is_archived = 0',
    [bookId]
  );
  return row?.total ?? 0;
}

export async function deleteWallet(id: number): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    const transaction = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM transactions WHERE wallet_id = ? LIMIT 1', [id]
    );
    if (transaction) throw new Error('Dompet masih memiliki transaksi dan tidak dapat dihapus.');
    await db.runAsync('DELETE FROM wallets WHERE id = ?', [id]);
  });
}

