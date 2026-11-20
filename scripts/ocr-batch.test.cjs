const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createCollector, prepareLanImages } = require('./ocr-batch.cjs');
const { parseCsv } = require('./lib/ocr-csv.cjs');

test('collector checkpoints only after CSV is saved and accepts an identical retry', async (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'kaskuy-ocr-test-'));
  const runId = 'synthetic-run';
  const filePath = path.join(output, 'fixture.jpg');
  const originalBytes = Buffer.from([0xFF, 0xD8, 0x00, 0x80, 0xFF, 0xD9]);
  fs.writeFileSync(filePath, originalBytes);
  const image = {
    id: 'dev-example-01', brand: 'Example', relativePath: 'dataset/raw/example.jpg', filePath,
    sha256: createHash('sha256').update(originalBytes).digest('hex'),
  };
  assert.throws(() => prepareLanImages([{ ...image, sha256: '0'.repeat(64) }], runId), /berubah/);
  const { items, images } = prepareLanImages([image], runId);
  const manifest = { runId, items };
  const token = 'synthetic-batch-token';
  const collector = createCollector(manifest, token, output, undefined, images);
  t.after(() => {
    collector.server.closeAllConnections();
    collector.server.close();
    for (const name of fs.readdirSync(output)) {
      const entry = path.join(output, name);
      if (fs.statSync(entry).isDirectory()) fs.rmdirSync(entry);
      else fs.unlinkSync(entry);
    }
    fs.rmdirSync(output);
  });
  await new Promise((resolve, reject) => {
    collector.server.once('error', reject);
    collector.server.listen(0, '127.0.0.1', resolve);
  });
  const baseUrl = `http://127.0.0.1:${collector.server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const prediction = {
    merchant: null, date: null, total: null, tunai: null, kembali: null,
    confidence: 'low', arithmeticOk: null, needsConfirmation: true,
  };
  const row = {
    id: 'dev-example-01',
    runId: manifest.runId,
    status: 'ok',
    ocrMs: 14,
    rawText: '=1+1\n"contoh"',
    baseline: prediction,
    corrected: { ...prediction, total: 3000 },
    error: null,
  };
  const post = (data) => fetch(`${baseUrl}/result`, { method: 'POST', headers, body: JSON.stringify(data) });
  const checkpoint = async () => (await (await fetch(`${baseUrl}/manifest`, { headers })).json()).completedIds;
  assert.equal((await fetch(`${baseUrl}/manifest`)).status, 401);
  assert.equal(items[0].imagePath, `/image/${runId}/${image.id}`);
  assert.equal(Object.hasOwn(items[0], 'filePath'), false);
  const imageUrl = `${baseUrl}${items[0].imagePath}`;
  assert.equal((await fetch(imageUrl)).status, 401);
  const storedImage = await fetch(imageUrl, { headers });
  assert.equal(storedImage.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await storedImage.arrayBuffer()), originalBytes);
  assert.equal((await fetch(`${baseUrl}/image/${runId}/final-holdout-01`, { headers })).status, 404);
  fs.mkdirSync(`${collector.csvFile}.tmp`);
  assert.equal((await post(row)).status, 500);
  assert.deepEqual(await checkpoint(), []);
  assert.equal(collector.received.size, 0);
  fs.rmdirSync(`${collector.csvFile}.tmp`);
  assert.equal((await post(row)).status, 200);
  assert.equal((await post(row)).status, 200);
  assert.equal((await post({ ...row, ocrMs: 15 })).status, 409);
  assert.deepEqual(await checkpoint(), [row.id]);
  const [csvRow] = parseCsv(fs.readFileSync(collector.csvFile, 'utf8'));
  assert.equal(csvRow.baseline_total, '');
  assert.equal(csvRow.corrected_total, '3000');
  assert.equal(csvRow.raw_text, `'${row.rawText}`);
  const lines = fs.readFileSync(path.join(output, 'results.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).rawText, row.rawText);
});
