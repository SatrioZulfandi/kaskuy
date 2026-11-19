// src/db/repositories/categoryRepo.ts
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase, withDatabaseTransaction } from '../database';
import type { Category, CategoryType } from '../../types';

export const CATEGORY_ICON_NAMES = [
  'food', 'shop', 'entertainment', 'transport', 'bill', 'health', 'education',
  'salary', 'business', 'freelance', 'savings', 'gift', 'other', 'cash', 'bank', 'phone', 'creditCard',
] as const;

function validateName(name: string): string {
  const validName = name.trim();
  if (!validName || validName.length > 40) throw new Error('Nama kategori harus berisi 1–40 karakter.');
  return validName;
}

function validateAppearance(icon?: string, color?: string): void {
  if (icon !== undefined && !CATEGORY_ICON_NAMES.some((name) => name === icon)) {
    throw new Error('Pilih ikon kategori yang tersedia.');
  }
  if (color !== undefined && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Warna kategori tidak valid.');
}

async function assertUniqueName(db: SQLiteDatabase, name: string, type: CategoryType, exceptId = 0): Promise<void> {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND type = ? AND id <> ? LIMIT 1',
    [name, type, exceptId]
  );
  if (existing) throw new Error('Nama kategori sudah digunakan untuk jenis transaksi ini.');
}

export async function getCategories(type?: CategoryType): Promise<Category[]> {
  const db = await getDatabase();
  if (type) {
    return await db.getAllAsync<Category>(
      'SELECT * FROM categories WHERE type = ? ORDER BY sort_order ASC, id ASC',
      [type]
    );
  }
  return await db.getAllAsync<Category>(
    'SELECT * FROM categories ORDER BY sort_order ASC, id ASC'
  );
}

export async function getCategoryById(id: number): Promise<Category | null> {
  const db = await getDatabase();
  const category = await db.getFirstAsync<Category>(
    'SELECT * FROM categories WHERE id = ?',
    [id]
  );
  return category ?? null;
}

export async function createCategory(
  name: string,
  type: CategoryType,
  icon: string,
  color: string
): Promise<Category> {
  const validName = validateName(name);
  if (type !== 'income' && type !== 'expense') throw new Error('Jenis kategori tidak valid.');
  validateAppearance(icon, color);
  return withDatabaseTransaction(async (db) => {
    await assertUniqueName(db, validName, type);
    const maxOrder = await db.getFirstAsync<{ max_order: number | null }>(
      'SELECT MAX(sort_order) AS max_order FROM categories WHERE type = ?', [type]
    );
    const result = await db.runAsync(
      'INSERT INTO categories (name, type, icon, color, sort_order, is_default) VALUES (?, ?, ?, ?, ?, 0)',
      [validName, type, icon, color, (maxOrder?.max_order ?? 0) + 1]
    );
    const created = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [result.lastInsertRowId]);
    if (!created) throw new Error('Kategori gagal dibuat.');
    return created;
  });
}

export async function updateCategory(
  id: number,
  data: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'sort_order'>>
): Promise<void> {
  const fields: string[] = [];
  const values: (string | number)[] = [];
  validateAppearance(data.icon, data.color);
  if (data.sort_order !== undefined && (!Number.isSafeInteger(data.sort_order) || data.sort_order < 0)) {
    throw new Error('Urutan kategori tidak valid.');
  }

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(validateName(data.name));
  }
  if (data.icon !== undefined) {
    fields.push('icon = ?');
    values.push(data.icon);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    values.push(data.color);
  }
  if (data.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(data.sort_order);
  }

  if (fields.length === 0) return;

  await withDatabaseTransaction(async (db) => {
    const category = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) throw new Error('Kategori tidak ditemukan.');
    if (data.name !== undefined) await assertUniqueName(db, validateName(data.name), category.type, id);
    await db.runAsync(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  });
}

export async function deleteCategory(id: number): Promise<void> {
  await withDatabaseTransaction(async (db) => {
    const category = await db.getFirstAsync<Category>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!category) throw new Error('Kategori tidak ditemukan.');
    if (category.is_default === 1) throw new Error('Kategori bawaan tidak dapat dihapus.');
    const used = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM transactions WHERE category_id = ? UNION ALL SELECT id FROM budgets WHERE category_id = ? LIMIT 1',
      [id, id]
    );
    if (used) throw new Error('Kategori masih digunakan oleh transaksi atau budget dan tidak dapat dihapus.');
    await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
  });
}

