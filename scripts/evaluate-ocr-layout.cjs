const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv, writeCsv } = require('./lib/ocr-csv.cjs');
const { HEADERS, toCsvRow, validateResult } = require('./ocr-batch.cjs');
const { scoreOcrBatch } = require('./score-ocr-batch.cjs');

const ROOT = path.resolve(__dirname, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main(captureDir) {
  if (!captureDir) throw new Error('Penggunaan: node --experimental-strip-types scripts/evaluate-ocr-layout.cjs FOLDER_CAPTURE');
  const dir = path.resolve(captureDir);
  const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'capture-info.json'), 'utf8'));
  const [manifestName, referenceName] = metadata.split === 'dev' ? ['development', 'development']
    : metadata.split === 'final' ? ['final-holdout', 'final']
      : ['validation', 'confirmation'].includes(metadata.split) ? [metadata.split, metadata.split] : [];
  if (!manifestName) throw new Error('Set foto pada metadata tidak dikenali.');
  const manifest = fs.readFileSync(path.join(ROOT, 'dataset/manifests', `${manifestName}.csv`));
  assert.equal(sha256(manifest), metadata.manifestSha256, 'Manifest berubah setelah pengambilan data.');
  const truth = fs.readFileSync(path.join(ROOT, 'dataset/ground-truth', `${referenceName}.verified.csv`));
  const sourceBytes = fs.readFileSync(path.join(dir, 'capture.jsonl'));
  const captures = sourceBytes.toString('utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const captureById = new Map(captures.map((row) => [row.id, row]));
  const sourceItems = parseCsv(manifest.toString('utf8'));
  assert.equal(captures.length, sourceItems.length, 'Pengambilan data belum lengkap.');
  assert.equal(captureById.size, sourceItems.length, 'ID pada pengambilan data berulang.');
  const byId = new Map(sourceItems.map(({ id, brand, relative_path, sha256: hash }) =>
    [id, { id, brand, relativePath: relative_path, sha256: hash }]));

  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const { reconstructReceiptLines } = await import('../src/lib/reconstructReceiptLines.ts');
  const parserSha256 = sha256(fs.readFileSync(path.join(ROOT, 'src/lib/parseReceipt.ts')));
  const layoutSha256 = sha256(fs.readFileSync(path.join(ROOT, 'src/lib/reconstructReceiptLines.ts')));
  const csvRows = [];
  const receiptRows = [];
  for (const item of byId.values()) {
    const captured = captureById.get(item.id);
    if (!captured || captured.sha256 !== item.sha256 || captured.relativePath !== item.relativePath || captured.brand !== item.brand) {
      throw new Error(`Metadata foto ${item.id} tidak cocok dengan manifest.`);
    }
    const row = { runId: metadata.runId, id: item.id, status: captured.status, ocrMs: captured.ocrMs,
      rawText: captured.rawText ?? null, baseline: null, corrected: null, error: captured.error ?? null };
    if (captured.status === 'ok') {
      assert.equal(typeof captured.rawText, 'string', `Teks OCR ${item.id} wajib tersedia.`);
      assert.ok(Array.isArray(captured.blocks), `Koordinat OCR ${item.id} wajib tersedia.`);
      row.reconstructedLines = reconstructReceiptLines({ blocks: captured.blocks });
      row.baseline = parseReceipt(captured.rawText);
      row.corrected = parseReceipt(captured.rawText, { reconstructedLines: row.reconstructedLines });
    }
    assert.ok(validateResult(row, metadata.runId, byId), `Hasil ${item.id} tidak valid.`);
    receiptRows.push(row);
    csvRows.push(toCsvRow(item, row));
  }

  const csv = writeCsv(HEADERS, csvRows);
  const accuracy = scoreOcrBatch(parseCsv(csv), parseCsv(truth.toString('utf8')));
  const out = path.join(dir, `evaluation-${parserSha256.slice(0, 8)}-${layoutSha256.slice(0, 8)}`);
  fs.mkdirSync(out);
  const write = (file, bytes) => fs.writeFileSync(path.join(out, file), bytes, { flag: 'wx' });
  write('results.csv', csv);
  write('results.jsonl', `${receiptRows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  write('accuracy.json', `${JSON.stringify(accuracy, null, 2)}\n`);
  write('run-info.json', `${JSON.stringify({ ...metadata, parserSha256, layoutSha256,
    verifiedTruthSha256: sha256(truth), captureSha256: sha256(sourceBytes),
    pair: { baseline: 'Koreksi teks saja', corrected: 'Koreksi dengan koordinat, aritmetika pembayaran, dan konteks tanggal' },
    ocrCallsDuringEvaluation: 0,
  }, null, 2)}\n`);
  const counts = accuracy.overall.all_fields;
  console.log(`${out}\n${counts.baseline_correct}/${counts.eligible} (${counts.baseline_accuracy_pct}%) → ${counts.corrected_correct}/${counts.eligible} (${counts.corrected_accuracy_pct}%)`);
}

main(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
