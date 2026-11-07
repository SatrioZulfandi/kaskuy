// src/db/repositories/bookRepo.ts
import { getDatabase } from '../database';
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
  const db = await getDatabase();
  const result = await db.runAsync(
    'INSERT INTO books (name, is_default) VALUES (?, 0)',
    [name]
  );
  const created = await db.getFirstAsync<Book>(
    'SELECT * FROM books WHERE id = ?',
    [result.lastInsertRowId]
  );
  if (!created) throw new Error('Failed to create book');
  return created;
}

