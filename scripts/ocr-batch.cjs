const { spawn, spawnSync } = require('node:child_process');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const { networkInterfaces } = require('node:os');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { setTimeout: sleep } = require('node:timers/promises');
const { parseCsv, writeCsv } = require('./lib/ocr-csv.cjs');
const { scoreOcrBatch } = require('./score-ocr-batch.cjs');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE = 'com.anonymous.catatkeuangan';
const SCHEME = 'catatkeuangan';
const BATCH_PORT = 8787;
const METRO_PORT = 8091;
const FIELDS = ['merchant', 'date', 'total', 'tunai', 'kembali'];
const HEADERS = [
  'run_id', 'id', 'brand', 'relative_path', 'sha256', 'status', 'ocr_ms',
  ...['baseline', 'corrected'].flatMap((variant) => [
    ...FIELDS.map((field) => `${variant}_${field}`),
    `${variant}_confidence`, `${variant}_arithmetic_ok`, `${variant}_needs_confirmation`,
  ]),
  'error', 'raw_text',
];

function loadManifest(name) {
  const file = path.join(ROOT, 'dataset', 'manifests', `${name}.csv`);
  const raw = fs.realpathSync(path.join(ROOT, 'dataset', 'raw'));
  const ids = new Set();
  const hashes = new Set();
  return parseCsv(fs.readFileSync(file, 'utf8')).map((row) => {
    if (!/^[a-z0-9-]+$/.test(row.id) || ids.has(row.id) || !row.brand?.trim()
      || !/^[a-f0-9]{64}$/.test(row.sha256) || hashes.has(row.sha256)
      || !/^dataset\/raw\/.+\.(?:jpe?g|png)$/i.test(row.relative_path)) {
      throw new Error(`Manifest ${name} memiliki ID, gambar, atau hash yang tidak valid: ${row.id}.`);
    }
    const relativePath = row.relative_path;
    const filePath = fs.realpathSync(path.resolve(ROOT, relativePath));
    const withinRaw = path.relative(raw, filePath);
    if (withinRaw.startsWith('..') || path.isAbsolute(withinRaw)) {
      throw new Error(`Gambar ${row.id} berada di luar dataset/raw.`);
    }
    const actualHash = createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    if (actualHash !== row.sha256) throw new Error(`Isi gambar ${row.id} berbeda dari manifest.`);
    ids.add(row.id);
    hashes.add(row.sha256);
    return { id: row.id, brand: row.brand, relativePath, sha256: row.sha256, filePath };
  });
}

function checkDataset(final) {
  const items = loadManifest('development');
  const holdout = loadManifest('final-holdout');
  const reserved = new Set(holdout.map((item) => item.sha256));
  const counts = new Map();
  for (const item of items) {
    if (reserved.has(item.sha256)) throw new Error(`Gambar ${item.id} juga ada di set uji akhir.`);
    counts.set(item.brand, (counts.get(item.brand) ?? 0) + 1);
  }
  if (holdout.length !== 40 || !items.length || [...counts.values()].some((count) => count < 3 || count > 5)) {
    throw new Error('Manifest harus memuat 3–5 foto pengembangan per merek dan 40 foto uji akhir.');
  }
  console.log(`Pengembangan ${items.length} (${[...counts].map(([brand, count]) => `${brand} ${count}`).join(', ')}). Uji akhir ${holdout.length} dipisahkan.`);
  return final ? holdout : items;
}

function adb(args, input) {
  const result = spawnSync('adb', args, { input, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  if (result.error) throw new Error(`ADB tidak dapat dijalankan: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`ADB gagal: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout.trim();
}

function listDevices() {
  const output = adb(['devices', '-l']).split(/\r?\n/);
  const header = output.findIndex((line) => line.startsWith('List of devices attached'));
  if (header < 0) throw new Error('Keluaran daftar perangkat ADB tidak dikenali.');
  return output.slice(header + 1).filter(Boolean).map((line) => {
    const [serial, status] = line.trim().split(/\s+/);
    return { serial, status };
  });
}

function selectDevice(serial) {
  const devices = listDevices();
  const authorized = devices.filter((device) => device.status === 'device');
  if (!authorized.length) {
    throw new Error(devices.length
      ? 'Perangkat ADB belum berstatus device. Buka kunci HP dan setujui dialog debug USB.'
      : 'Daftar ADB kosong. Sambungkan POCO X6 dengan kabel data dan aktifkan USB debugging.');
  }
  const matches = serial ? authorized.filter((device) => device.serial === serial) : authorized.filter((device) => {
    const get = (key) => adb(['-s', device.serial, 'shell', 'getprop', key]);
    const name = get('ro.product.marketname');
    const model = get('ro.product.model');
    return /^POCO X6(?: 5G)?$/i.test(name) || /^POCO X6(?: 5G)?$/i.test(model);
  });
  if (matches.length !== 1) throw new Error('POCO X6 belum teridentifikasi secara unik. Periksa adb devices -l, lalu gunakan --serial SERIAL untuk memilih HP.');
  return matches[0].serial;
}

function selectLanHost(requested) {
  const addresses = [...new Set(Object.values(networkInterfaces()).flat()
    .filter((entry) => entry.family === 'IPv4' && !entry.internal
      && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(entry.address))
    .map((entry) => entry.address))];
  if (requested && addresses.includes(requested)) return requested;
  if (!requested && addresses.length === 1) return addresses[0];
  if (!addresses.length) throw new Error('Komputer belum memiliki alamat IPv4 jaringan lokal.');
  throw new Error(`Pilih IP komputer yang dipakai Expo dengan --lan --host IP. IP tersedia: ${addresses.join(', ')}.`);
}

function installReverse(device, port, installed) {
  const endpoint = `tcp:${port}`;
  const current = device('reverse', '--list').split(/\r?\n/).map((line) => line.trim().split(/\s+/));
  const mapping = current.find((parts) => parts.at(-2) === endpoint);
  if (mapping) {
    if (mapping.at(-1) !== endpoint) throw new Error(`Port HP ${port} sudah digunakan oleh penerusan ADB lain.`);
    return;
  }
  device('reverse', '--no-rebind', endpoint, endpoint);
  installed.push(endpoint);
}

function stageImages(serial, items, runId, staged) {
  const home = adb(['-s', serial, 'shell', 'run-as', PACKAGE, 'pwd']);
  if (!/^\/data\/(?:user\/\d+|data)\/com\.anonymous\.catatkeuangan$/.test(home)) {
    throw new Error('Direktori privat KASKUY tidak dapat dikenali. Gunakan development APK yang sudah terpasang.');
  }
  const cacheDir = `cache/kaskuy-ocr/${runId}`;
  adb(['-s', serial, 'shell', 'run-as', PACKAGE, 'mkdir', '-p', cacheDir]);
  staged.dir = cacheDir;
  return items.map(({ filePath, ...item }) => {
    const suffix = path.extname(filePath).toLowerCase();
    const target = `${cacheDir}/${item.id}${suffix}`;
    staged.files.push(target);
    // ADB streams the original bytes to a private app file, avoiding gallery permissions.
    adb(['-s', serial, 'shell', '-T', `run-as ${PACKAGE} sh -c 'cat > ${target}'`], fs.readFileSync(filePath));
    const checksum = adb(['-s', serial, 'shell', 'run-as', PACKAGE, 'sha256sum', target]).split(/\s+/)[0];
    if (checksum !== item.sha256) throw new Error(`Gambar ${item.id} gagal disalin utuh ke HP.`);
    return { ...item, uri: `file://${home}/${target}` };
  });
}

function prepareLanImages(sources, runId) {
  const images = new Map();
  const items = sources.map(({ filePath, ...item }) => {
    const imagePath = `/image/${runId}/${item.id}`;
    const bytes = fs.readFileSync(filePath);
    if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
      throw new Error(`Isi gambar ${item.id} berubah setelah manifest diperiksa.`);
    }
    const contentType = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    images.set(imagePath, { bytes, contentType });
    return { ...item, imagePath };
  });
  return { items, images };
}

function validateResult(row, runId, itemsById) {
  if (!row || row.runId !== runId || !itemsById.has(row.id) || !['ok', 'error'].includes(row.status)
    || !Number.isFinite(row.ocrMs) || row.ocrMs < 0) return false;
  if (row.status === 'error') return typeof row.error === 'string' && row.error.length > 0;
  if (typeof row.rawText !== 'string') return false;
  if (row.reconstructedLines !== undefined && (!Array.isArray(row.reconstructedLines)
      || row.reconstructedLines.some((line) => typeof line !== 'string'))) return false;
  return ['baseline', 'corrected'].every((variant) => {
    const result = row[variant];
    return result && [result.merchant, result.date].every((value) => value === null || typeof value === 'string')
      && [result.total, result.tunai, result.kembali].every((value) => value === null || Number.isInteger(value))
      && ['high', 'medium', 'low'].includes(result.confidence)
      && [null, true, false].includes(result.arithmeticOk) && typeof result.needsConfirmation === 'boolean';
  });
}

function asSpreadsheetText(value) {
  return typeof value === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function toCsvRow(item, row) {
  const result = {
    run_id: row.runId,
    id: row.id,
    brand: item.brand,
    relative_path: item.relativePath,
    sha256: item.sha256,
    status: row.status,
    ocr_ms: row.ocrMs,
    error: asSpreadsheetText(row.error),
    raw_text: asSpreadsheetText(row.rawText),
  };
  for (const variant of ['baseline', 'corrected']) {
    const prediction = row[variant];
    for (const field of FIELDS) result[`${variant}_${field}`] = prediction?.[field];
    result[`${variant}_confidence`] = prediction?.confidence;
    result[`${variant}_arithmetic_ok`] = prediction?.arithmeticOk;
    result[`${variant}_needs_confirmation`] = prediction?.needsConfirmation;
  }
  return result;
}

function createCollector(manifest, token, outputDir, onProgress = () => {}, images = new Map()) {
  const { runId, items } = manifest;
  const secret = Buffer.from(`Bearer ${token}`);
  const byId = new Map(items.map((item) => [item.id, item]));
  const received = new Map();
  const journaled = new Map();
  const csvFile = path.join(outputDir, 'results.csv');
  const jsonlFile = path.join(outputDir, 'results.jsonl');
  fs.writeFileSync(jsonlFile, '', { flag: 'wx' });
  const writeRows = () => {
    const rows = items.filter((item) => journaled.has(item.id)).map((item) => toCsvRow(item, journaled.get(item.id)));
    fs.writeFileSync(`${csvFile}.tmp`, writeCsv(HEADERS, rows), 'utf8');
    fs.renameSync(`${csvFile}.tmp`, csvFile);
  };
  writeRows();
  let manifestReads = 0;
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    const auth = Buffer.from(req.headers.authorization ?? '');
    if (auth.length !== secret.length || !timingSafeEqual(auth, secret)) return send(res, 401, { error: 'Token batch tidak valid.' });
    if (req.method === 'GET' && req.url === '/manifest') {
      manifestReads++;
      return send(res, 200, { ...manifest, completedIds: [...received.keys()] });
    }
    if (req.method === 'GET' && images.has(req.url)) {
      const { bytes, contentType } = images.get(req.url);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': bytes.length,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(bytes);
    }
    if (req.method !== 'POST' || req.url !== '/result') return send(res, 404, { error: 'Rute tidak ditemukan.' });
    let row;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_000_000) return send(res, 413, { error: 'Hasil gambar terlalu besar.' });
        chunks.push(chunk);
      }
      row = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(res, 400, { error: 'Payload hasil bukan JSON yang valid.' });
    }
    if (!validateResult(row, runId, byId)) return send(res, 422, { error: 'Hasil gambar tidak cocok dengan batch.' });
    const previous = journaled.get(row.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      return send(res, 409, { error: 'Hasil berbeda untuk gambar yang sudah disimpan.' });
    }
    try {
      if (!previous) {
        fs.appendFileSync(jsonlFile, `${JSON.stringify(row)}\n`, 'utf8');
        journaled.set(row.id, row);
      }
      writeRows();
    } catch {
      return send(res, 500, { error: 'Hasil belum dapat ditulis di komputer.' });
    }
    const wasAcknowledged = received.has(row.id);
    received.set(row.id, row);
    send(res, 200, { ok: true });
    if (!wasAcknowledged) onProgress(row, received.size, items.length);
  });
  return { server, received, csvFile, get manifestReads() { return manifestReads; } };
}

function openLink(device, url) {
  const output = device('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', url, '-p', PACKAGE);
  if (/\bError\b|unable to resolve/i.test(output)) throw new Error('KASKUY tidak menerima tautan batch. Periksa apakah development APK sudah terpasang.');
}

async function waitForMetro(metro, signal) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (metro.exitCode !== null || metro.startError) throw new Error('Metro berhenti sebelum siap.');
    try {
      const response = await fetch(`http://127.0.0.1:${METRO_PORT}/status`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && (await response.text()).includes('packager-status:running')) return;
    } catch {
      // Metro may still be booting.
    }
    await sleep(750, undefined, { signal });
  }
  throw new Error('Metro belum siap setelah 60 detik.');
}

async function main() {
  const { values } = parseArgs({ options: {
    check: { type: 'boolean' },
    final: { type: 'boolean' },
    devices: { type: 'boolean' },
    serial: { type: 'string' },
    lan: { type: 'boolean' },
    host: { type: 'string' },
  } });
  if (values.devices) {
    const devices = listDevices();
    console.table(devices);
    if (!devices.length) process.exitCode = 1;
    return;
  }
  const sources = checkDataset(values.final);
  if (values.check) return;
  const split = values.final ? 'final' : 'development';
  const stage = values.final ? 'uji akhir' : 'pengembangan';
  const referencePath = path.join(ROOT, 'dataset', 'ground-truth', `${split}.verified.csv`);
  const referenceBytes = fs.readFileSync(referencePath);
  const references = parseCsv(referenceBytes.toString('utf8'));
  const referenceIds = new Set(references.filter((row) => row.review_status === 'verified').map((row) => row.id));
  if (references.length !== sources.length || referenceIds.size !== sources.length || sources.some((item) => !referenceIds.has(item.id))) {
    throw new Error(`Acuan ${stage} harus terverifikasi dan sesuai dengan ID manifest.`);
  }
  if (values.host && !values.lan) throw new Error('--host digunakan bersama --lan.');
  if (values.lan && values.serial) throw new Error('--serial hanya digunakan pada mode ADB.');
  const host = values.lan ? selectLanHost(values.host) : '127.0.0.1';
  const serial = values.lan ? null : selectDevice(values.serial);
  const device = (...args) => adb(['-s', serial, ...args]);
  const runId = `${values.final ? 'final' : 'dev'}-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomBytes(4).toString('hex')}`;
  const token = randomBytes(18).toString('hex');
  const outputDir = path.join(ROOT, 'dataset', 'results', runId);
  const reversed = [];
  const staged = { files: [], dir: null };
  const cancel = new AbortController();
  const interrupt = () => cancel.abort();
  process.once('SIGINT', interrupt);
  let collector;
  let metro;
  try {
    const { items, images } = values.lan
      ? prepareLanImages(sources, runId)
      : { items: stageImages(serial, sources, runId, staged), images: undefined };
    fs.mkdirSync(outputDir, { recursive: true });
    const manifest = { runId, items };
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(outputDir, 'run-info.json'), JSON.stringify({
      engine: 'expo-mlkit-ocr',
      enginePackageVersion: require('expo-mlkit-ocr/package.json').version,
      split,
      verifiedTruthSha256: createHash('sha256').update(referenceBytes).digest('hex'),
      parserSha256: createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'parseReceipt.ts'))).digest('hex'),
      transport: values.lan ? 'lan' : 'adb',
      deviceModel: serial ? device('shell', 'getprop', 'ro.product.model') : null,
      androidVersion: serial ? device('shell', 'getprop', 'ro.build.version.release') : null,
    }, null, 2), 'utf8');
    collector = createCollector(manifest, token, outputDir, (row, count, size) => {
      console.log(`[${count}/${size}] ${row.id} ${row.status} (${row.ocrMs} ms)`);
    }, images);
    await new Promise((resolve, reject) => {
      collector.server.once('error', reject);
      collector.server.listen(BATCH_PORT, host, resolve);
    });
    if (values.lan) {
      console.log(`Batch ${runId} menunggu KASKUY di http://${host}:${BATCH_PORT}.`);
      console.log(`Buka Pengaturan → Uji Batch OCR di APK KASKUY. Host: ${host}. Token: ${token}.`);
    } else {
      installReverse(device, BATCH_PORT, reversed);
      installReverse(device, METRO_PORT, reversed);
      metro = spawn(process.execPath, [
        require.resolve('expo/bin/cli'), 'start', '--dev-client', '--localhost', '--port', String(METRO_PORT),
      ], {
        cwd: ROOT, env: { ...process.env, CI: '1', EXPO_OFFLINE: '1' },
        stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
      });
      metro.on('error', (error) => { metro.startError = error; });
      await waitForMetro(metro, cancel.signal);
      const expoUrl = encodeURIComponent(`http://127.0.0.1:${METRO_PORT}`);
      openLink(device, `${SCHEME}://expo-development-client/?url=${expoUrl}`);
      console.log(`Batch ${runId}. Jika rute tidak terbuka otomatis, pilih Pengaturan → Uji Batch OCR dan masukkan token ${token}.`);
    }
    const link = `${SCHEME}:///scan/batch-ocr?token=${token}`;
    const deadline = Date.now() + 15 * 60_000;
    for (let nextLaunch = Date.now() + 5_000; collector.received.size < items.length;) {
      if (Date.now() > deadline) throw new Error('Waktu tunggu batch habis. CSV parsial tetap tersimpan.');
      if (metro && metro.exitCode !== null) throw new Error('Metro berhenti saat batch berjalan.');
      if (serial && collector.manifestReads === 0 && Date.now() >= nextLaunch) {
        openLink(device, link);
        nextLaunch = Date.now() + 20_000;
      }
      await sleep(750, undefined, { signal: cancel.signal });
    }
    const failures = [...collector.received.values()].filter((row) => row.status === 'error').length;
    console.log(`Selesai: ${items.length - failures} berhasil, ${failures} gagal. CSV: ${collector.csvFile}`);
    const scores = scoreOcrBatch(parseCsv(fs.readFileSync(collector.csvFile, 'utf8')), references);
    const scorePath = path.join(outputDir, 'accuracy.json');
    fs.writeFileSync(scorePath, JSON.stringify(scores, null, 2), 'utf8');
    console.log(`Akurasi ${stage}: ${scores.overall.all_fields.baseline_accuracy_pct}% tanpa koreksi, ${scores.overall.all_fields.corrected_accuracy_pct}% dengan koreksi dari ${scores.overall.all_fields.eligible} field. Rincian: ${scorePath}`);
    if (failures) process.exitCode = 2;
  } finally {
    process.removeListener('SIGINT', interrupt);
    if (collector) {
      collector.server.close();
      collector.server.closeAllConnections();
      if (collector.received.size < sources.length) console.log(`CSV parsial: ${collector.csvFile}`);
    }
    if (metro && metro.exitCode === null) metro.kill();
    for (const endpoint of reversed) {
      try { device('reverse', '--remove', endpoint); } catch { /* USB may be disconnected. */ }
    }
    if (staged.dir) {
      try {
        for (const file of staged.files) device('shell', 'run-as', PACKAGE, 'rm', '-f', file);
        device('shell', 'run-as', PACKAGE, 'rmdir', staged.dir);
      } catch { /* Files are isolated in a uniquely named app cache folder. */ }
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.name === 'AbortError' ? 'Batch dihentikan.' : error.message);
    process.exitCode = 1;
  });
}

module.exports = { createCollector, HEADERS, prepareLanImages, toCsvRow, validateResult };
