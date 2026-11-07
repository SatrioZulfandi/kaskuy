// src/db/repositories/walletRepo.ts
import { getDatabase } from '../database';
import type { Wallet, WalletType } from '../../types';

export async function getWallets(bookId: number): Promise<Wallet[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Wallet>(
    'SELECT * FROM wallets WHERE book_id = ? AND is_archived = 0 ORDER BY id ASC',
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
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO wallets (book_id, name, type, balance, icon, color) VALUES (?, ?, ?, ?, ?, ?)',
    [bookId, name, type, balance, icon, color]
  );
  const created = await getWalletById(result.lastInsertRowId);
  if (!created) throw new Error('Failed to create wallet');
  return created;
}

export async function updateWallet(
  id: number,
  data: Partial<Pick<Wallet, 'name' | 'type' | 'icon' | 'color' | 'is_archived'>>
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.type !== undefined) {
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
    fields.push('is_archived = ?');
    values.push(data.is_archived);
  }

  if (fields.length === 0) return;

  values.push(id);
  await db.runAsync(
    `UPDATE wallets SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function updateWalletBalance(id: number, delta: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE wallets SET balance = balance + ? WHERE id = ?',
    [delta, id]
  );
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
  const db = await getDatabase();
  await db.runAsync('DELETE FROM wallets WHERE id = ?', [id]);
}

