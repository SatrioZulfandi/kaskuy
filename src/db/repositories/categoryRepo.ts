// src/db/repositories/categoryRepo.ts
import { getDatabase } from '../database';
import type { Category, CategoryType } from '../../types';

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
  const db = await getDatabase();
  const maxOrder = await db.getFirstAsync<{ max_order: number | null }>(
    'SELECT MAX(sort_order) as max_order FROM categories WHERE type = ?',
    [type]
  );
  const nextOrder = (maxOrder?.max_order ?? 0) + 1;

  const result = await db.runAsync(
    'INSERT INTO categories (name, type, icon, color, sort_order, is_default) VALUES (?, ?, ?, ?, ?, 0)',
    [name, type, icon, color, nextOrder]
  );
  const created = await getCategoryById(result.lastInsertRowId);
  if (!created) throw new Error('Failed to create category');
  return created;
}

export async function updateCategory(
  id: number,
  data: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'sort_order'>>
): Promise<void> {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
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

  values.push(id);
  await db.runAsync(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}

