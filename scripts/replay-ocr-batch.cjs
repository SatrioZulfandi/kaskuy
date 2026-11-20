const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { HEADERS, toCsvRow, validateResult } = require('./ocr-batch.cjs');
const { parseCsv, writeCsv } = require('./lib/ocr-csv.cjs');
const { scoreOcrBatch } = require('./score-ocr-batch.cjs');

const ROOT = path.resolve(__dirname, '..');
const PARSER_FILE = path.join(ROOT, 'src', 'lib', 'parseReceipt.ts');
const DEVELOPMENT_FILE = path.join(ROOT, 'dataset', 'manifests', 'development.csv');
const TRUTH_FILE = path.join(ROOT, 'dataset', 'ground-truth', 'development.verified.csv');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJson(text, description) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${description} bukan JSON yang valid.`);
  }
}

function indexById(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${label} kosong atau tidak valid.`);
  const byId = new Map();
  for (const row of rows) {
    if (!row || typeof row.id !== 'string' || !/^dev-[a-z0-9-]+$/.test(row.id)) {
      throw new Error(`ID ${label} harus berasal dari set pengembangan.`);
    }
    if (byId.has(row.id)) throw new Error(`ID ganda pada ${label}: ${row.id}.`);
    byId.set(row.id, row);
  }
  return byId;
}

function requireSameIds(actual, expected, label) {
  if (actual.size !== expected.size || [...expected.keys()].some((id) => !actual.has(id))) {
    throw new Error(`ID ${label} tidak lengkap atau berbeda dari manifest pengembangan.`);
  }
}

function checkOriginalRows(sourceDir, manifest, sourceBytes, development) {
  const manifestById = indexById(manifest.items, 'manifest hasil asli');
  const rows = sourceBytes.toString('utf8').split(/\r?\n/).flatMap((line, index) =>
    line.trim() ? [parseJson(line, `JSONL hasil asli baris ${index + 1}`)] : []);
  const originals = indexById(rows, 'JSONL hasil asli');
  const csvById = indexById(parseCsv(fs.readFileSync(path.join(sourceDir, 'results.csv'), 'utf8')), 'CSV hasil asli');
  requireSameIds(manifestById, development, 'manifest hasil asli');
  requireSameIds(originals, development, 'JSONL hasil asli');
  requireSameIds(csvById, development, 'CSV hasil asli');

  for (const [id, entry] of development) {
    const item = manifestById.get(id);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256) || !entry.brand?.trim() ||
        !entry.relative_path?.startsWith('dataset/raw/') ||
        item.brand !== entry.brand || item.relativePath !== entry.relative_path || item.sha256 !== entry.sha256) {
      throw new Error(`Metadata gambar ${id} tidak cocok dengan manifest pengembangan.`);
    }
    const row = originals.get(id);
    if (!validateResult(row, manifest.runId, manifestById)) {
      throw new Error(`Bentuk hasil asli ${id} tidak valid.`);
    }
    const expected = toCsvRow(item, row);
    const csv = csvById.get(id);
    if (HEADERS.some((key) => csv[key] !== String(expected[key] ?? ''))) {
      throw new Error(`CSV dan JSONL hasil asli berbeda untuk ${id}.`);
    }
  }
  return { originals, items: [...development.keys()].map((id) => manifestById.get(id)) };
}

async function readParser() {
  const parserSha256 = sha256(fs.readFileSync(PARSER_FILE));
  const url = pathToFileURL(PARSER_FILE);
  url.searchParams.set('sha256', parserSha256);
  let module;
  try {
    module = await import(url.href);
  } catch (error) {
    if (error.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      throw new Error('Jalankan replay dengan Node.js 22 dan opsi --experimental-strip-types.');
    }
    throw error;
  }
  assert.equal(sha256(fs.readFileSync(PARSER_FILE)), parserSha256, 'Parser berubah saat replay dimulai.');
  if (typeof module.parseReceipt !== 'function') throw new Error('Fungsi parseReceipt tidak ditemukan.');
  return { parseReceipt: module.parseReceipt, parserSha256 };
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
}

async function replayOcrBatch({
  input, output, developmentFile = DEVELOPMENT_FILE, truthFile = TRUTH_FILE,
}) {
  const inputPath = fs.realpathSync(input);
  const sourceDir = fs.statSync(inputPath).isDirectory() ? inputPath : path.dirname(inputPath);
  const sourceFile = fs.statSync(inputPath).isDirectory() ? path.join(inputPath, 'results.jsonl') : inputPath;
  if (path.basename(sourceFile) !== 'results.jsonl') {
    throw new Error('Pilih folder batch asli atau berkas results.jsonl di dalamnya.');
  }
  const sourceInfoFile = path.join(sourceDir, 'run-info.json');
  const sourceInfo = fs.existsSync(sourceInfoFile)
    ? parseJson(fs.readFileSync(sourceInfoFile, 'utf8'), 'run-info.json') : {};
  if (!sourceInfo || Array.isArray(sourceInfo) || typeof sourceInfo !== 'object' || sourceInfo.mode === 'parser-replay') {
    throw new Error('Replay harus dimulai dari hasil OCR asli.');
  }

  const sourceBytes = fs.readFileSync(sourceFile);
  const sourceManifest = fs.readFileSync(path.join(sourceDir, 'manifest.json'));
  const manifest = parseJson(sourceManifest.toString('utf8'), 'manifest.json');
  if (!manifest || typeof manifest.runId !== 'string' || !/^dev-[a-z0-9-]+$/.test(manifest.runId)) {
    throw new Error('ID batch asli tidak valid.');
  }
  const developmentBytes = fs.readFileSync(developmentFile);
  const development = indexById(parseCsv(developmentBytes.toString('utf8')), 'manifest pengembangan');
  const truthBytes = fs.readFileSync(truthFile);
  const truthRows = parseCsv(truthBytes.toString('utf8'));
  requireSameIds(indexById(truthRows, 'acuan'), development, 'acuan');
  for (const row of truthRows) {
    if (row.review_status !== 'verified') throw new Error(`Acuan ${row.id} belum terverifikasi.`);
  }
  const { originals, items } = checkOriginalRows(sourceDir, manifest, sourceBytes, development);

  const { parseReceipt, parserSha256 } = await readParser();
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[^0-9]/g, '').slice(0, 14);
  const runId = `${manifest.runId}-replay-${stamp}-${randomBytes(4).toString('hex')}`;
  const outputDir = output ? path.resolve(output) : path.join(path.dirname(sourceDir), runId);
  const outputItems = items.map(({ id, brand, relativePath, sha256: imageSha256 }) =>
    ({ id, brand, relativePath, sha256: imageSha256 }));
  const outputById = new Map(outputItems.map((item) => [item.id, item]));
  const replayRows = outputItems.map((item) => {
    const original = originals.get(item.id);
    if (original.status === 'error') return { ...original, runId };
    const baseline = parseReceipt(original.rawText, { corrections: false });
    if (!isDeepStrictEqual(baseline, original.baseline)) {
      throw new Error(`Baseline ${item.id} berubah. Kembalikan perilaku mode tanpa koreksi sebelum meneruskan.`);
    }
    const corrected = parseReceipt(original.rawText, { reconstructedLines: original.reconstructedLines });
    const replayed = { ...original, runId, baseline, corrected };
    if (!validateResult(replayed, runId, outputById)) {
      throw new Error(`Keluaran replay ${item.id} tidak valid.`);
    }
    return replayed;
  });
  const csv = writeCsv(HEADERS, outputItems.map((item, index) => toCsvRow(item, replayRows[index])));
  const accuracy = scoreOcrBatch(parseCsv(csv), truthRows);
  const inputLabel = path.relative(ROOT, sourceFile).split(path.sep).join('/');

  // Create a fresh directory only after validation and scoring succeeded.
  fs.mkdirSync(outputDir);
  fs.writeFileSync(path.join(outputDir, 'results.csv'), csv, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDir, 'results.jsonl'), `${replayRows.map((row) => JSON.stringify(row)).join('\n')}\n`, { flag: 'wx' });
  writeJson(path.join(outputDir, 'manifest.json'), { runId, items: outputItems });
  writeJson(path.join(outputDir, 'accuracy.json'), accuracy);
  writeJson(path.join(outputDir, 'run-info.json'), {
    mode: 'parser-replay',
    runId,
    startedAt,
    sourceRunId: manifest.runId,
    sourceResults: inputLabel,
    sourceResultsSha256: sha256(sourceBytes),
    sourceManifestSha256: sha256(sourceManifest),
    sourceParserSha256: sourceInfo.parserSha256 ?? null,
    parserSha256,
    developmentManifestSha256: sha256(developmentBytes),
    verifiedTruthSha256: sha256(truthBytes),
    imageCount: replayRows.length,
    ocrCalls: 0,
  });
  return { outputDir, accuracy };
}

if (require.main === module) {
  const [input, output, ...extra] = process.argv.slice(2);
  if (!input || extra.length) {
    console.error('Penggunaan: node --experimental-strip-types scripts/replay-ocr-batch.cjs <folder-batch-asli-atau-results.jsonl> [folder-keluaran-baru]');
    process.exitCode = 1;
  } else {
    replayOcrBatch({ input, output }).then(({ outputDir, accuracy }) => {
      console.log(`Replay selesai untuk ${accuracy.overall.images} gambar. Hasil dan akurasi ada di ${outputDir}.`);
    }).catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

module.exports = { replayOcrBatch };
