// src/db/repositories/scanResultRepo.ts
import { getDatabase } from '../database';
import type { Confidence, ScanResult } from '../../types';

export async function createScanResult(data: {
  image_uri: string;
  raw_ocr_text: string;
  reconstructed_lines: string;
  parsed_data: string;
  confidence: Confidence;
  needs_confirmation: number;
  ocr_duration_ms: number;
}): Promise<ScanResult> {
  const db = await getDatabase();
  const result = await db.runAsync(
    `INSERT INTO scan_results (
      image_uri, raw_ocr_text, reconstructed_lines, parsed_data,
      confidence, needs_confirmation, ocr_duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.image_uri,
      data.raw_ocr_text,
      data.reconstructed_lines,
      data.parsed_data,
      data.confidence,
      data.needs_confirmation,
      data.ocr_duration_ms,
    ]
  );

  const created = await getScanResultById(result.lastInsertRowId);
  if (!created) throw new Error('Failed to retrieve created scan result');
  return created;
}

export async function getScanResultById(id: number): Promise<ScanResult | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ScanResult>(
    'SELECT * FROM scan_results WHERE id = ?',
    [id]
  );
  return row ?? null;
}

export async function markScanResultCorrected(
  id: number,
  correctedData: string
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE scan_results 
     SET was_corrected = 1, corrected_data = ? 
     WHERE id = ?`,
    [correctedData, id]
  );
}

export async function getAllScanResults(limit: number = 50): Promise<ScanResult[]> {
  const db = await getDatabase();
  return await db.getAllAsync<ScanResult>(
    'SELECT * FROM scan_results ORDER BY id DESC LIMIT ?',
    [limit]
  );
}

// Statistical aggregation for Dashboard 8 (Research Output)
export async function getOcrEvaluationStats(): Promise<{
  totalScans: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  correctedCount: number;
  uncorrectedCount: number;
  avgDurationMs: number;
  accuracyRate: number; // percentage not requiring manual correction
}> {
  const db = await getDatabase();

  const totalRow = await db.getFirstAsync<{ count: number; avg_ms: number | null }>(
    'SELECT count(*) as count, AVG(ocr_duration_ms) as avg_ms FROM scan_results'
  );
  const totalScans = totalRow?.count ?? 0;
  const avgDurationMs = Math.round(totalRow?.avg_ms ?? 0);

  if (totalScans === 0) {
    return {
      totalScans: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      correctedCount: 0,
      uncorrectedCount: 0,
      avgDurationMs: 0,
      accuracyRate: 100,
    };
  }

  const confRows = await db.getAllAsync<{ confidence: Confidence; count: number }>(
    'SELECT confidence, count(*) as count FROM scan_results GROUP BY confidence'
  );

  let high = 0;
  let medium = 0;
  let low = 0;
  for (const r of confRows) {
    if (r.confidence === 'high') high = r.count;
    if (r.confidence === 'medium') medium = r.count;
    if (r.confidence === 'low') low = r.count;
  }

  const correctedRow = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM scan_results WHERE was_corrected = 1'
  );
  const correctedCount = correctedRow?.count ?? 0;
  const uncorrectedCount = totalScans - correctedCount;
  const accuracyRate = Math.round((uncorrectedCount / totalScans) * 100);

  return {
    totalScans,
    highConfidence: high,
    mediumConfidence: medium,
    lowConfidence: low,
    correctedCount,
    uncorrectedCount,
    avgDurationMs,
    accuracyRate,
  };
}

