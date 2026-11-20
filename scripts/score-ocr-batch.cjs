const { readFileSync } = require('node:fs');
const { parseCsv } = require('./lib/ocr-csv.cjs');

const fields = ['merchant', 'date', 'total', 'tunai', 'kembali'];
const fieldStatuses = ['readable', 'unreadable', 'not_applicable'];
const truthColumns = ['id', 'review_status', ...fields.flatMap((field) => [field, `${field}_status`])];
const resultColumns = ['id', 'brand', 'status', ...fields.flatMap((field) => [`baseline_${field}`, `corrected_${field}`])];

function indexRows(rows, columns, label) {
  if (rows.length === 0) throw new Error(`${label} tidak berisi baris data.`);
  const missing = columns.filter((column) => !Object.hasOwn(rows[0], column));
  if (missing.length) throw new Error(`${label} tidak memiliki kolom ${missing.join(', ')}.`);

  const index = new Map();
  for (const row of rows) {
    if (!row.id.trim() || row.id !== row.id.trim()) throw new Error(`Ada ID kosong atau berspasi di ${label}.`);
    if (index.has(row.id)) throw new Error(`ID ganda di ${label}: ${row.id}.`);
    index.set(row.id, row);
  }
  return index;
}

function normalizeValue(field, value) {
  if (field === 'merchant') return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase() || null;
  if (field === 'date') {
    if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
  }
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function validateReference(row, field) {
  const status = row[`${field}_status`];
  const value = row[field].trim();
  if (!fieldStatuses.includes(status)) {
    throw new Error(`Status acuan ${row.id}.${field}_status harus readable, unreadable, atau not_applicable.`);
  }
  if (status === 'readable') {
    const normalized = normalizeValue(field, value);
    if (normalized === null) throw new Error(`Nilai acuan ${row.id}.${field} kosong atau formatnya tidak valid.`);
    return { status, value: normalized };
  }
  if (value) throw new Error(`Acuan ${row.id}.${field} harus kosong apabila statusnya ${status}.`);
  return { status, value: null };
}

function createCounts() {
  return {
    eligible: 0,
    excluded_unreadable: 0,
    excluded_not_applicable: 0,
    ocr_error_eligible: 0,
    baseline_correct: 0,
    corrected_correct: 0,
    baseline_missing: 0,
    corrected_missing: 0,
    improved: 0,
    regressed: 0,
    both_correct: 0,
    both_incorrect: 0,
  };
}

function createSummary() {
  return { images: 0, ocr_errors: 0, all_fields: createCounts(), by_field: Object.fromEntries(fields.map((field) => [field, createCounts()])) };
}

function countField(counts, reference, ocrError, baseline, corrected) {
  if (reference.status !== 'readable') {
    counts[`excluded_${reference.status}`]++;
    return;
  }
  counts.eligible++;
  if (ocrError) counts.ocr_error_eligible++;
  if (baseline === null) counts.baseline_missing++;
  if (corrected === null) counts.corrected_missing++;

  const baselineCorrect = baseline === reference.value;
  const correctedCorrect = corrected === reference.value;
  if (baselineCorrect) counts.baseline_correct++;
  if (correctedCorrect) counts.corrected_correct++;
  if (baselineCorrect && correctedCorrect) counts.both_correct++;
  else if (baselineCorrect) counts.regressed++;
  else if (correctedCorrect) counts.improved++;
  else counts.both_incorrect++;
}

function finalizeCounts(counts) {
  const percent = (numerator, denominator) => denominator === 0 ? null : Math.round(10_000 * numerator / denominator) / 100;
  const excluded = counts.excluded_unreadable + counts.excluded_not_applicable;
  return {
    ...counts,
    excluded,
    reference_coverage_pct: percent(counts.eligible, counts.eligible + excluded),
    baseline_accuracy_pct: percent(counts.baseline_correct, counts.eligible),
    corrected_accuracy_pct: percent(counts.corrected_correct, counts.eligible),
    delta_percentage_points: percent(counts.corrected_correct - counts.baseline_correct, counts.eligible),
  };
}

function finalizeSummary(summary) {
  return {
    images: summary.images,
    ocr_errors: summary.ocr_errors,
    all_fields: finalizeCounts(summary.all_fields),
    by_field: Object.fromEntries(fields.map((field) => [field, finalizeCounts(summary.by_field[field])])),
  };
}

function scoreOcrBatch(resultRows, referenceRows) {
  const results = indexRows(resultRows, resultColumns, 'CSV hasil');
  const references = indexRows(referenceRows, truthColumns, 'CSV acuan');
  for (const id of references.keys()) {
    if (!results.has(id)) throw new Error(`ID acuan ${id} tidak ada di CSV hasil.`);
  }

  const overall = createSummary();
  const brands = new Map();
  for (const [id, result] of results) {
    const referenceRow = references.get(id);
    if (!referenceRow) throw new Error(`Acuan untuk hasil ${id} tidak ditemukan.`);
    if (referenceRow.review_status !== 'verified') throw new Error(`Acuan ${id} belum terverifikasi. Selesaikan tinjauan gambar sebelum menghitung akurasi.`);
    const brand = result.brand.trim();
    if (!brand) throw new Error(`Merek untuk hasil ${id} kosong.`);
    if (result.status !== 'ok' && result.status !== 'error') throw new Error(`Status hasil ${id} harus ok atau error.`);
    const ocrError = result.status === 'error';
    if (!brands.has(brand)) brands.set(brand, createSummary());
    const group = brands.get(brand);
    overall.images++;
    group.images++;
    if (ocrError) {
      overall.ocr_errors++;
      group.ocr_errors++;
    }

    for (const field of fields) {
      const reference = validateReference(referenceRow, field);
      const baseline = ocrError ? null : normalizeValue(field, result[`baseline_${field}`].trim());
      const corrected = ocrError ? null : normalizeValue(field, result[`corrected_${field}`].trim());
      for (const summary of [overall, group]) {
        countField(summary.all_fields, reference, ocrError, baseline, corrected);
        countField(summary.by_field[field], reference, ocrError, baseline, corrected);
      }
    }
  }
  if (overall.all_fields.eligible === 0) throw new Error('Tidak ada nilai acuan terbaca yang bisa dinilai.');
  return {
    overall: finalizeSummary(overall),
    by_brand: Object.fromEntries([...brands].map(([brand, summary]) => [brand, finalizeSummary(summary)])),
  };
}

function main(args) {
  if (args.length !== 2) throw new Error('Penggunaan: node scripts/score-ocr-batch.cjs <hasil.csv> <acuan-terverifikasi.csv>');
  const [resultsFile, referencesFile] = args;
  const output = scoreOcrBatch(parseCsv(readFileSync(resultsFile, 'utf8')), parseCsv(readFileSync(referencesFile, 'utf8')));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { scoreOcrBatch };
