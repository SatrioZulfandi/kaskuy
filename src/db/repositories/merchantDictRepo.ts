// src/db/repositories/merchantDictRepo.ts
import { getDatabase } from '../database';
import type { MerchantDictionaryEntry } from '../../types';

export async function getAllDictionaryEntries(): Promise<MerchantDictionaryEntry[]> {
  const db = await getDatabase();
  return await db.getAllAsync<MerchantDictionaryEntry>(
    'SELECT * FROM merchant_dictionary ORDER BY frequency DESC, normalized_name ASC'
  );
}

export async function findExactMerchantMatch(raw: string): Promise<string | null> {
  const db = await getDatabase();
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const row = await db.getFirstAsync<{ normalized_name: string }>(
    'SELECT normalized_name FROM merchant_dictionary WHERE raw_text = ? LIMIT 1',
    [clean]
  );
  return row?.normalized_name ?? null;
}

// Adaptive learning: when user corrects merchant name, record it into dictionary
export async function learnMerchantCorrection(
  rawText: string,
  normalizedName: string
): Promise<void> {
  const db = await getDatabase();
  const clean = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean.length < 3) return;

  await db.runAsync(
    `INSERT INTO merchant_dictionary (raw_text, normalized_name, frequency, updated_at)
     VALUES (?, ?, 1, (datetime('now', 'localtime')))
     ON CONFLICT(raw_text) DO UPDATE SET 
       normalized_name = excluded.normalized_name,
       frequency = frequency + 1,
       updated_at = (datetime('now', 'localtime'))`,
    [clean, normalizedName.trim()]
  );
}

export async function getTopScannedMerchants(limit: number = 5): Promise<
  { normalized_name: string; count: number }[]
> {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT normalized_name, SUM(frequency) as count
     FROM merchant_dictionary
     GROUP BY normalized_name
     ORDER BY count DESC
     LIMIT ?`,
    [limit]
  );
}
