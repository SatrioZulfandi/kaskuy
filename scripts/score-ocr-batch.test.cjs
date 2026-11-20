const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseCsv, writeCsv } = require('./lib/ocr-csv.cjs');
const { scoreOcrBatch } = require('./score-ocr-batch.cjs');

const fields = ['merchant', 'date', 'total', 'tunai', 'kembali'];
const ids = ['dev-a1', 'dev-a2', 'dev-i1'];

function referenceRow(id, values, overrides = {}) {
  const row = { id, review_status: 'verified', notes: '', ...overrides };
  for (const field of fields) {
    row[field] = values[field] ?? '';
    row[`${field}_status`] = Object.hasOwn(values, field) ? 'readable' : 'not_applicable';
  }
  return row;
}

function resultRow(id, brand, baseline, corrected, status = 'ok') {
  const row = { id, brand, status };
  for (const field of fields) {
    row[`baseline_${field}`] = baseline[field] ?? '';
    row[`corrected_${field}`] = corrected[field] ?? '';
  }
  return row;
}

function fixture() {
  return {
    results: [
      resultRow(ids[0], 'Alfamart', { merchant: ' ALFAMART ', date: '2024-02-30', total: '20000' }, { merchant: 'Alfamart', date: '2024-02-29', total: '22000' }),
      resultRow(ids[1], 'Alfamart', { total: '8500' }, { total: '8500', kembali: '0' }, 'error'),
      resultRow(ids[2], 'Indomaret', { merchant: 'Indomaret', kembali: '0' }, { merchant: 'Indomaret', kembali: '0' }),
    ],
    references: [
      { ...referenceRow(ids[0], { merchant: 'Alfamart', date: '2024-02-29', total: '20000' }), kembali_status: 'unreadable' },
      referenceRow(ids[1], { total: '8500', kembali: '0' }),
      referenceRow(ids[2], { merchant: 'Indomaret', kembali: '0' }),
    ],
  };
}

test('CSV helper round-trips exact OCR text, quotes, and blank cells', () => {
  const headers = ['id', 'raw_text', 'status', 'error'];
  const rows = [{ id: 'dev-a1', raw_text: 'a,"b"\r\n\nlast line', status: 'ok', error: '' }];
  assert.deepEqual(parseCsv(`\uFEFF${writeCsv(headers, rows)}`), rows);
  assert.deepEqual(parseCsv('id,brand,error\rdev-a1,Alfamart,\r'), [{ id: 'dev-a1', brand: 'Alfamart', error: '' }]);
  for (const bad of ['id,id\nx,y', 'id,brand\nx,y,z', 'id\n"unclosed', 'id\n"hello"x', 'id\nx"y']) {
    assert.throws(() => parseCsv(bad));
  }
});

test('paired metrics share verified denominators and include OCR failures as incorrect', () => {
  const { results, references } = fixture();
  const score = scoreOcrBatch(results, references.reverse());

  assert.equal(score.overall.images, 3);
  assert.equal(score.overall.ocr_errors, 1);
  assert.equal(score.overall.all_fields.eligible, 7);
  assert.equal(score.overall.all_fields.excluded_unreadable, 1);
  assert.equal(score.overall.all_fields.excluded_not_applicable, 7);
  assert.equal(score.overall.all_fields.ocr_error_eligible, 2);
  assert.equal(score.overall.all_fields.baseline_correct, 4);
  assert.equal(score.overall.all_fields.corrected_correct, 4);
  assert.equal(score.overall.all_fields.baseline_accuracy_pct, 57.14);
  assert.equal(score.overall.all_fields.corrected_accuracy_pct, 57.14);
  assert.equal(score.overall.all_fields.reference_coverage_pct, 46.67);
  assert.equal(score.overall.all_fields.improved, 1);
  assert.equal(score.overall.all_fields.regressed, 1);
  assert.equal(score.overall.by_field.total.regressed, 1);
  assert.equal(score.overall.by_field.date.improved, 1);
  assert.equal(score.overall.by_field.tunai.baseline_accuracy_pct, null);
  assert.equal(score.overall.by_field.kembali.corrected_correct, 1);
  assert.equal(score.by_brand.Alfamart.images, 2);
  assert.equal(score.by_brand.Indomaret.all_fields.corrected_accuracy_pct, 100);
});

test('drafts, unmatched IDs, duplicates, and missing columns block scoring', () => {
  const { results, references } = fixture();
  assert.throws(() => scoreOcrBatch(results, [{ ...references[0], review_status: 'draft' }, ...references.slice(1)]), /belum terverifikasi/);
  assert.throws(() => scoreOcrBatch(results.slice(1), references), /tidak ada di CSV hasil/);
  assert.throws(() => scoreOcrBatch(results, references.slice(1)), /tidak ditemukan/);
  assert.throws(() => scoreOcrBatch([...results, results[0]], references), /ID ganda/);
  assert.throws(() => scoreOcrBatch(results, [...references, references[0]]), /ID ganda/);
  assert.throws(() => scoreOcrBatch([{ id: 'dev-a1' }], references), /tidak memiliki kolom/);
});

test('invalid reference values and no eligible fields block scoring', () => {
  const { results, references } = fixture();
  for (const overrides of [
    { date: '2023-02-29' }, { total: '20.000' }, { total: '9007199254740992' },
    { total: '' }, { total_status: 'unknown' }, { kembali: '1000' },
  ]) {
    assert.throws(() => scoreOcrBatch(results, [{ ...references[0], ...overrides }, ...references.slice(1)]), /acuan/i);
  }
  assert.throws(() => scoreOcrBatch(results, ids.map((id) => referenceRow(id, {}))), /Tidak ada nilai acuan terbaca/);
});
