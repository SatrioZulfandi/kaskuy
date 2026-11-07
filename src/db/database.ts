// src/db/database.ts
import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';
import { seedInitialData } from './seeds';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const db = await SQLite.openDatabaseAsync('kaskuy.db');
  
  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON;');
  
  // Create tables and indexes
  await db.execAsync(CREATE_TABLES_SQL);
  
  // Seed initial data if needed
  await seedInitialData(db);

  dbInstance = db;
  return db;
}

