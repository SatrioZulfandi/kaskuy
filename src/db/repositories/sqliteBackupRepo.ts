import { deserializeDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { Book, Budget, Category, Wallet } from '../../types';
import { openDatabaseConnection } from '../database';
import { BACKUP_BATCH_SIZE, restoreBackupRows, type BackupProgress, type BackupTransaction, type RestoreResult, type RestoredBook } from './backupRepo';

const APPLICATION_ID = 0x4b534b59; // KSKY
const FORMAT_VERSION = 1;
const BACKUP_SCHEMA = 'financial_backup';
const SAFE_INTEGER_MAX = Number.MAX_SAFE_INTEGER;
const SQLITE_HEADER = 'SQLite format 3\0';
const ID_COLUMN = `id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND ${SAFE_INTEGER_MAX})`;
const AMOUNT_COLUMN = `amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND ${SAFE_INTEGER_MAX})`;
const TYPE_COLUMN = `type TEXT NOT NULL CHECK (type IN ('income', 'expense'))`;

// The backup has its own versioned schema. Receipt images, raw OCR data, and
// settings stay outside it, even as the live app database gains new tables.
const TABLES = [
  {
    name: 'backup_info',
    definition: 'id INTEGER PRIMARY KEY CHECK (id = 1), created_at TEXT NOT NULL',
  },
  {
    name: 'books',
    columns: 'id, name, is_default, created_at',
    definition: `${ID_COLUMN},
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL`,
  },
  {
    name: 'wallets',
    columns: 'id, book_id, name, type, balance, icon, color, is_archived, created_at',
    definition: `${ID_COLUMN},
      book_id INTEGER NOT NULL REFERENCES books(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'ewallet', 'credit_card')),
      balance INTEGER NOT NULL CHECK (balance BETWEEN -${SAFE_INTEGER_MAX} AND ${SAFE_INTEGER_MAX}),
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_archived INTEGER NOT NULL CHECK (is_archived IN (0, 1)),
      created_at TEXT NOT NULL`,
  },
  {
    name: 'categories',
    columns: 'id, name, type, icon, color, sort_order, is_default',
    definition: `${ID_COLUMN},
      name TEXT NOT NULL,
      ${TYPE_COLUMN},
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND ${SAFE_INTEGER_MAX}),
      is_default INTEGER NOT NULL CHECK (is_default IN (0, 1))`,
  },
  {
    name: 'transactions',
    columns: 'id, book_id, wallet_id, category_id, type, amount, note, date, created_at, updated_at',
    definition: `${ID_COLUMN},
      book_id INTEGER NOT NULL REFERENCES books(id),
      wallet_id INTEGER NOT NULL REFERENCES wallets(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      ${TYPE_COLUMN},
      ${AMOUNT_COLUMN},
      note TEXT,
      date TEXT NOT NULL CHECK (date GLOB '[1-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(date, '+0 days') IS date),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL`,
  },
  {
    name: 'budgets',
    columns: 'id, book_id, category_id, amount, month, created_at',
    definition: `${ID_COLUMN},
      book_id INTEGER NOT NULL REFERENCES books(id),
      category_id INTEGER NOT NULL REFERENCES categories(id),
      ${AMOUNT_COLUMN},
      month TEXT NOT NULL CHECK (month GLOB '[1-9][0-9][0-9][0-9]-[0-9][0-9]' AND date(month || '-01') IS (month || '-01')),
      created_at TEXT NOT NULL,
      UNIQUE (book_id, category_id, month)`,
  },
] as const;

export type SqliteBackupPreview = {
  createdAt: string;
  books: Book[];
  walletCount: number;
  transactionCount: number;
  budgetCount: number;
};

export type SqliteRestoreResult = RestoreResult & { restoredBooks: RestoredBook[] };

function schemaStatement(table: typeof TABLES[number], prefix = ''): string {
  return `CREATE TABLE ${prefix}${table.name} (${table.definition}) STRICT`;
}

async function writeBackup<T>(targetPath: string, finish: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await openDatabaseConnection();
  try {
    await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    await db.runAsync(`ATTACH DATABASE ? AS ${BACKUP_SCHEMA}`, [targetPath]);
    await db.execAsync(`PRAGMA ${BACKUP_SCHEMA}.journal_mode = DELETE;`);
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        PRAGMA ${BACKUP_SCHEMA}.application_id = ${APPLICATION_ID};
        PRAGMA ${BACKUP_SCHEMA}.user_version = ${FORMAT_VERSION};
        ${TABLES.map((table) => schemaStatement(table, `${BACKUP_SCHEMA}.`)).join(';\n')};
        ${TABLES.filter((table) => 'columns' in table).map(({ name, columns }) =>
          `INSERT INTO ${BACKUP_SCHEMA}.${name} (${columns}) SELECT ${columns} FROM main.${name}`
        ).join(';\n')};
      `);
      await db.runAsync(`INSERT INTO ${BACKUP_SCHEMA}.backup_info VALUES (1, ?)`, [new Date().toISOString()]);
    });
    return await finish(db);
  } finally {
    await db.closeAsync();
  }
}

export function createSqliteBackup(): Promise<Uint8Array> {
  return writeBackup(':memory:', (db) => db.serializeAsync(BACKUP_SCHEMA));
}

function diskLocation(filename: string, directory: string): { path: string; directory: string } {
  if (!filename || filename === '.' || filename === '..' || /[\\/\0]/.test(filename) || !directory) {
    throw new Error('Lokasi file cadangan tidak valid.');
  }
  const raw = directory.startsWith('file://') ? decodeURIComponent(directory.slice('file://'.length)) : directory;
  const normalized = raw.replace(/[/\\]+$/, '');
  return { path: `${normalized}/${filename}`, directory: normalized };
}

export function createSqliteBackupFile(filename: string, directory: string): Promise<void> {
  return writeBackup(diskLocation(filename, directory).path, async () => undefined);
}

function invalid(reason: string): never {
  throw new Error(`Cadangan tidak valid: ${reason}`);
}

async function readPreview(db: SQLiteDatabase): Promise<SqliteBackupPreview> {
  const application = await db.getFirstAsync<{ application_id: number }>('PRAGMA application_id');
  if (application?.application_id !== APPLICATION_ID) invalid('pilih file cadangan yang dibuat KASKUY.');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version !== FORMAT_VERSION) invalid('versi cadangan belum didukung.');

  const objects = await db.getAllAsync<{ type: string; name: string; sql: string }>(
    'SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL'
  );
  const expected = new Map<string, string>(TABLES.map((table) => [table.name, schemaStatement(table)]));
  if (objects.length !== expected.size || objects.some((object) => object.type !== 'table' || expected.get(object.name) !== object.sql)) {
    invalid('struktur file cadangan tidak cocok.');
  }
  const integrity = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check(1)');
  if (integrity?.quick_check !== 'ok' || await db.getFirstAsync('PRAGMA foreign_key_check')) {
    invalid('file rusak atau relasi data tidak lengkap.');
  }
  const mismatch = await db.getFirstAsync(`
    SELECT 1 FROM transactions t JOIN wallets w ON w.id = t.wallet_id JOIN categories c ON c.id = t.category_id
    WHERE t.book_id <> w.book_id OR t.type <> c.type
    UNION ALL
    SELECT 1 FROM budgets b JOIN categories c ON c.id = b.category_id WHERE c.type <> 'expense'
    LIMIT 1
  `);
  if (mismatch) invalid('transaksi atau anggaran tidak cocok dengan buku, dompet, dan kategorinya.');
  const info = await db.getFirstAsync<{ created_at: string }>('SELECT created_at FROM backup_info WHERE id = 1');
  if (!info || !Number.isFinite(Date.parse(info.created_at))) invalid('tanggal cadangan tidak ditemukan.');
  const books = await db.getAllAsync<Book>('SELECT * FROM books ORDER BY id');
  if (books.filter((book) => book.is_default === 1).length !== 1 || books.some((book) => !book.name.trim())) {
    invalid('daftar buku tidak lengkap.');
  }
  const counts = await db.getFirstAsync<Pick<SqliteBackupPreview, 'walletCount' | 'transactionCount' | 'budgetCount'>>(`
    SELECT (SELECT count(*) FROM wallets) AS walletCount,
           (SELECT count(*) FROM transactions) AS transactionCount,
           (SELECT count(*) FROM budgets) AS budgetCount
  `);
  if (!counts) invalid('ringkasan data tidak ditemukan.');
  return { createdAt: info.created_at, books, ...counts };
}

async function readBackup<T>(open: () => Promise<SQLiteDatabase>, action: (db: SQLiteDatabase, preview: SqliteBackupPreview) => Promise<T>): Promise<T> {
  let db: SQLiteDatabase | undefined;
  try {
    let preview: SqliteBackupPreview;
    try {
      db = await open();
      await db.execAsync('PRAGMA trusted_schema = OFF; PRAGMA query_only = ON;');
      preview = await readPreview(db);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Cadangan tidak valid:')) throw error;
      invalid('file rusak atau tidak bisa dibaca.');
    }
    return await action(db, preview);
  } finally {
    await db?.closeAsync();
  }
}

function openBytes(bytes: Uint8Array): Promise<SQLiteDatabase> {
  if (bytes.byteLength < 100 || [...SQLITE_HEADER].some((character, index) => character.charCodeAt(0) !== bytes[index])) {
    invalid('pilih file SQLite yang dibuat KASKUY.');
  }
  return deserializeDatabaseAsync(bytes, { useNewConnection: true });
}

function openFile(filename: string, directory: string): Promise<SQLiteDatabase> {
  return openDatabaseAsync(filename, { useNewConnection: true }, diskLocation(filename, directory).directory);
}

export function inspectSqliteBackup(bytes: Uint8Array): Promise<SqliteBackupPreview> {
  return readBackup(() => openBytes(bytes), async (_db, preview) => preview);
}

export function inspectSqliteBackupFile(filename: string, directory: string): Promise<SqliteBackupPreview> {
  return readBackup(() => openFile(filename, directory), async (_db, preview) => preview);
}

async function* readBatches<T extends { id: number }>(db: SQLiteDatabase, table: 'transactions' | 'budgets'): AsyncGenerator<T[]> {
  let lastId = 0;
  let rows: T[];
  do {
    rows = await db.getAllAsync<T>(`SELECT * FROM ${table} WHERE id > ? ORDER BY id LIMIT ?`, [lastId, BACKUP_BATCH_SIZE]);
    if (rows.length) {
      lastId = rows[rows.length - 1].id;
      yield rows;
    }
  } while (rows.length === BACKUP_BATCH_SIZE);
}

async function importBackup(db: SQLiteDatabase, preview: SqliteBackupPreview, onProgress?: BackupProgress): Promise<SqliteRestoreResult> {
  const [wallets, categories] = await Promise.all([
    db.getAllAsync<Wallet>('SELECT * FROM wallets ORDER BY id'),
    db.getAllAsync<Category>('SELECT * FROM categories ORDER BY id'),
  ]);
  if (wallets.some((item) => !item.name.trim()) || categories.some((item) => !item.name.trim())) {
    invalid('nama dompet atau kategori kosong.');
  }
  const { counts, restoredBooks } = await restoreBackupRows({
    books: preview.books,
    wallets,
    categories,
    transactionCount: preview.transactionCount,
    budgetCount: preview.budgetCount,
    transactions: readBatches<BackupTransaction>(db, 'transactions'),
    budgets: readBatches<Budget>(db, 'budgets'),
  }, onProgress);
  return { ...counts, restoredBooks };
}

export function restoreSqliteBackup(bytes: Uint8Array, onProgress?: BackupProgress): Promise<SqliteRestoreResult> {
  return readBackup(() => openBytes(bytes), (db, preview) => importBackup(db, preview, onProgress));
}

export function restoreSqliteBackupFile(filename: string, directory: string, onProgress?: BackupProgress): Promise<SqliteRestoreResult> {
  return readBackup(() => openFile(filename, directory), (db, preview) => importBackup(db, preview, onProgress));
}
