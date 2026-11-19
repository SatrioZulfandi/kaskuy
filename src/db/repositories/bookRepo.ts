// src/db/repositories/bookRepo.ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase, withDatabaseTransaction } from '../database';
import type { Book } from '../../types';

export async function getDefaultBook(): Promise<Book | null> {
  const db = await getDatabase();
  const book = await db.getFirstAsync<Book>(
    'SELECT * FROM books WHERE is_default = 1 LIMIT 1'
  );
  return book ?? null;
}

export async function getAllBooks(): Promise<Book[]> {
  const db = await getDatabase();
  return await db.getAllAsync<Book>('SELECT * FROM books ORDER BY id ASC');
}

export async function createBook(name: string): Promise<Book> {
  const validName = validateName(name);
  return withDatabaseTransaction(async (db) => {
    await assertUniqueName(db, validName);
    const result = await db.runAsync('INSERT INTO books (name, is_default) VALUES (?, 0)', [validName]);
    await db.runAsync(
      `INSERT INTO wallets (book_id, name, type, balance, icon, color)
       VALUES (?, 'Uang Tunai', 'cash', 0, 'cash', '#10B981')`,
      [result.lastInsertRowId]
    );
    const created = await db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [result.lastInsertRowId]);
    if (!created) throw new Error('Buku keuangan gagal dibuat.');
    return created;
  });
}

function validateName(name: string): string {
  const validName = name.trim();
  if (!validName || validName.length > 60) throw new Error('Nama buku harus berisi 1–60 karakter.');
  return validName;
}

async function assertUniqueName(db: SQLiteDatabase, name: string, exceptId = 0): Promise<void> {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM books WHERE name = ? COLLATE NOCASE AND id <> ? LIMIT 1', [name, exceptId]
  );
  if (existing) throw new Error('Nama buku sudah digunakan. Pilih nama lain.');
}

export async function setDefaultBook(id: number): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    const book = await db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [id]);
    if (!book) throw new Error('Buku keuangan tidak ditemukan.');
    await db.runAsync('UPDATE books SET is_default = 0 WHERE is_default = 1');
    await db.runAsync('UPDATE books SET is_default = 1 WHERE id = ?', [id]);
  });
}

export async function updateBook(id: number, name: string): Promise<void> {
  const validName = validateName(name);
  await withDatabaseTransaction(async (db) => {
    await assertUniqueName(db, validName, id);
    const result = await db.runAsync('UPDATE books SET name = ? WHERE id = ?', [validName, id]);
    if (result.changes !== 1) throw new Error('Buku keuangan tidak ditemukan.');
  });
}

export async function deleteBook(id: number): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    const book = await db.getFirstAsync<Book>('SELECT * FROM books WHERE id = ?', [id]);
    if (!book) throw new Error('Buku keuangan tidak ditemukan.');
    if (book.is_default === 1) throw new Error('Buku aktif tidak dapat dihapus. Aktifkan buku lain terlebih dahulu.');
    const count = await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM books');
    if (!count || count.total <= 1) throw new Error('Sisakan setidaknya satu buku keuangan.');
    const used = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM transactions WHERE book_id = ?
       UNION ALL SELECT id FROM budgets WHERE book_id = ?
       UNION ALL SELECT id FROM wallets WHERE book_id = ? AND balance <> 0 LIMIT 1`, [id, id, id]
    );
    if (used) throw new Error('Buku yang memiliki transaksi, budget, atau saldo belum dapat dihapus.');
    await db.runAsync('DELETE FROM books WHERE id = ?', [id]);
  });
}

