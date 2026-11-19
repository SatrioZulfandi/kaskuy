import type { SQLiteDatabase } from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';

export const DATABASE_VERSION = 1;

export async function migrateDatabase(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version > DATABASE_VERSION) throw new Error('Data dibuat dengan versi aplikasi yang lebih baru.');
  await db.execAsync(CREATE_TABLES_SQL);
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      UPDATE books SET is_default = CASE WHEN id = COALESCE(
        (SELECT id FROM books WHERE is_default = 1 ORDER BY id LIMIT 1),
        (SELECT MIN(id) FROM books)
      ) THEN 1 ELSE 0 END;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_books_single_active ON books(is_default) WHERE is_default = 1;
      PRAGMA user_version = 1;
    `);
  }
  return version;
}
