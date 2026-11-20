const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { HEADERS, toCsvRow } = require('./ocr-batch.cjs');
const { parseCsv, writeCsv } = require('./lib/ocr-csv.cjs');
const { replayOcrBatch } = require('./replay-ocr-batch.cjs');

const inputRunId = 'dev-original-test';
const fields = ['merchant', 'date', 'total', 'tunai', 'kembali'];
const rawText = 'INDOMARET\n18/11/2024\nTOTAL 15.000\nTUNAI 20.000\nKEMBALI 5.000';

async function fixture(t) {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kaskuy-replay-'));
  const input = path.join(root, 'original');
  const output = path.join(root, 'replay');
  fs.mkdirSync(input);
  const developmentFile = path.join(root, 'development.csv');
  const truthFile = path.join(root, 'verified.csv');

  t.after(() => {
    for (const folder of [input, output]) {
      if (!fs.existsSync(folder)) continue;
      for (const file of fs.readdirSync(folder)) fs.unlinkSync(path.join(folder, file));
      fs.rmdirSync(folder);
    }
    fs.unlinkSync(developmentFile);
    fs.unlinkSync(truthFile);
    fs.rmdirSync(root);
  });

  const items = ['dev-indomaret-01', 'dev-indomaret-02'].map((id, index) => ({
    id, brand: 'Indomaret', relativePath: `dataset/raw/${id}.jpg`, sha256: String(index).repeat(64),
  }));
  const rows = [
    {
      runId: inputRunId,
      id: items[0].id,
      status: 'ok',
      ocrMs: 123,
      rawText,
      baseline: parseReceipt(rawText, { corrections: false }),
      corrected: { ...parseReceipt(rawText), total: 777 },
      error: null,
    },
    {
      runId: inputRunId,
      id: items[1].id,
      status: 'error',
      ocrMs: 80,
      rawText: null,
      baseline: null,
      corrected: null,
      error: 'Input image could not be read',
    },
  ];
  const truth = items.map((item) => ({
    id: item.id, review_status: 'verified',
    merchant: 'Indomaret', date: '2024-11-18', total: 15000, tunai: 20000, kembali: 5000,
    ...Object.fromEntries(fields.map((field) => [`${field}_status`, 'readable'])),
  }));

  fs.writeFileSync(developmentFile, writeCsv(['id', 'brand', 'sha256', 'relative_path'],
    items.map((item) => ({ ...item, relative_path: item.relativePath }))));
  fs.writeFileSync(path.join(input, 'manifest.json'), JSON.stringify({ runId: inputRunId, items }));
  fs.writeFileSync(path.join(input, 'run-info.json'), JSON.stringify({ parserSha256: 'a'.repeat(64) }));
  const source = path.join(input, 'results.jsonl');
  const writeResults = () => {
    fs.writeFileSync(source, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    fs.writeFileSync(path.join(input, 'results.csv'),
      writeCsv(HEADERS, rows.map((row, index) => toCsvRow(items[index], row))));
  };
  const writeTruth = () => fs.writeFileSync(truthFile,
    writeCsv(['id', 'review_status', ...fields.flatMap((field) => [field, `${field}_status`])], truth));
  writeResults();
  writeTruth();
  const run = (options = {}) => replayOcrBatch({ input, output, developmentFile, truthFile, ...options });
  return { input, output, source, rows, truth, run, writeResults, writeTruth };
}

test('replay preserves the raw OCR text, durations, baseline and input files', async (t) => {
  const f = await fixture(t);
  const inputBytes = fs.readFileSync(f.source);
  const { outputDir, accuracy } = await f.run({ input: f.source });
  const rows = parseCsv(fs.readFileSync(path.join(outputDir, 'results.csv'), 'utf8'));
  assert.equal(rows[0].baseline_total, '15000');
  assert.equal(rows[0].corrected_total, '15000');
  assert.equal(rows[0].raw_text, rawText);
  assert.equal(rows[0].ocr_ms, '123');
  assert.equal(rows[1].status, 'error');
  assert.equal(rows[1].ocr_ms, '80');
  assert.equal(accuracy.overall.all_fields.eligible, 10);
  assert.equal(accuracy.overall.all_fields.corrected_accuracy_pct, 50);
  assert.deepEqual(fs.readFileSync(f.source), inputBytes);
  const info = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-info.json'), 'utf8'));
  assert.equal(info.ocrCalls, 0);
  assert.equal(info.sourceRunId, inputRunId);
  assert.equal(info.sourceResultsSha256, createHash('sha256').update(inputBytes).digest('hex'));
  assert.match(info.parserSha256, /^[a-f0-9]{64}$/);
});

test('replay refuses an incomplete original or altered raw text before writing output', async (t) => {
  const f = await fixture(t);
  const original = fs.readFileSync(f.source, 'utf8');
  fs.writeFileSync(f.source, `${JSON.stringify(f.rows[0])}\n`);
  await assert.rejects(f.run(), /tidak lengkap/);
  fs.writeFileSync(f.source, original.replace('15.000', '50.000'));
  await assert.rejects(f.run(), /CSV dan JSONL hasil asli berbeda/);
  assert.equal(fs.existsSync(f.output), false);
});

test('replay refuses unverified references and changes to the frozen baseline', async (t) => {
  const f = await fixture(t);
  f.truth[0].review_status = 'draft';
  f.writeTruth();
  await assert.rejects(f.run(), /belum terverifikasi/);

  f.truth[0].review_status = 'verified';
  f.writeTruth();
  f.rows[0].baseline.total = 10000;
  f.writeResults();
  await assert.rejects(f.run(), /Baseline .* berubah/);
  assert.equal(fs.existsSync(f.output), false);
});

test('replay refuses to overwrite an existing original directory', async (t) => {
  const f = await fixture(t);
  const sourceContents = fs.readFileSync(f.source);
  await assert.rejects(f.run({ output: f.input }), { code: 'EEXIST' });
  assert.deepEqual(fs.readFileSync(f.source), sourceContents);
});
