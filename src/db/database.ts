// src/db/database.ts
import * as SQLite from 'expo-sqlite';
import { migrateDatabase } from './migrations';
import { seedInitialData } from './seeds';

const DATABASE_NAME = 'kaskuy.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writerPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let pendingWrite: Promise<void> = Promise.resolve();

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    await db.withTransactionAsync(async () => {
      const previousVersion = await migrateDatabase(db);
      await seedInitialData(db, previousVersion === 0);
    });
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}

async function getWriterDatabase(): Promise<SQLite.SQLiteDatabase> {
  await getDatabase();
  if (!writerPromise) {
    writerPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
      try {
        // Connection settings must be applied before a transaction starts.
        await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        return db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    })().catch((error: unknown) => {
      writerPromise = null;
      throw error;
    });
  }
  return writerPromise;
}

/** Keep financial writes atomic and serialize competing edits/deletes.
 * A separate connection keeps unrelated reads/writes out of the transaction.
 * Use the supplied database for every query; do not nest this helper.
 */
export function withDatabaseTransaction<T>(
  task: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  const result = pendingWrite.then(async () => {
    const db = await getWriterDatabase();
    let value!: T;
    await db.withTransactionAsync(async () => {
      value = await task(db);
    });
    return value;
  });
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
}

