// src/db/repositories/ocrCorrectionRepo.ts
import { getDatabase } from '../database';
import type { OcrCorrection } from '../../types';

export async function recordCorrection(
  scanResultId: number,
  field: 'merchant' | 'total' | 'tunai' | 'kembali' | 'items' | 'date',
  originalValue: string | null,
  correctedValue: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO ocr_corrections (scan_result_id, field, original_value, corrected_value)
     VALUES (?, ?, ?, ?)`,
    [scanResultId, field, originalValue, correctedValue]
  );
}

export async function getCorrectionsByScanResult(
  scanResultId: number
): Promise<OcrCorrection[]> {
  const db = await getDatabase();
  return await db.getAllAsync<OcrCorrection>(
    'SELECT * FROM ocr_corrections WHERE scan_result_id = ? ORDER BY id ASC',
    [scanResultId]
  );
}

// Field-level error frequency for research analysis (Dashboard 8)
export async function getFieldCorrectionFrequency(): Promise<
  { field: string; error_count: number }[]
> {
  const db = await getDatabase();
  return await db.getAllAsync(
    `SELECT field, COUNT(*) AS error_count
     FROM ocr_corrections
     GROUP BY field
     ORDER BY error_count DESC`
  );
}
