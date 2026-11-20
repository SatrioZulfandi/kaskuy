const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { isIPv4 } = require('node:net');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { parseArgs } = require('node:util');
const { parseCsv } = require('./lib/ocr-csv.cjs');

const requireMetroMiddleware = createRequire(require.resolve('@react-native/dev-middleware/package.json'));
const WebSocket = requireMetroMiddleware('ws');
const ROOT = path.resolve(__dirname, '..');
const PORT = 8081;
const METRO = `http://127.0.0.1:${PORT}`;
const APP_ID = 'com.anonymous.catatkeuangan';
const POCO_X6 = /\b(?:23122PCD1G|POCO X6)\b/i;
const SPLITS = { dev: 'development', final: 'final-holdout', validation: 'validation', confirmation: 'confirmation' };
const COMMAND_TIMEOUT = 10_000;
const RECEIPT_TIMEOUT = 90_000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function loadManifest(split) {
  const bytes = fs.readFileSync(path.join(ROOT, 'dataset', 'manifests', `${SPLITS[split]}.csv`));
  const rawDir = fs.realpathSync(path.join(ROOT, 'dataset', 'raw'));
  const items = new Map();
  const hashes = new Set();
  for (const row of parseCsv(bytes.toString('utf8'))) {
    const { id, brand, relative_path: relativePath, sha256: expected } = row;
    assert.match(id, new RegExp(`^${split}-[a-z0-9-]+$`));
    assert.ok(brand?.trim() && !items.has(id) && !hashes.has(expected), `Baris manifest duplikat atau tidak lengkap: ${id}.`);
    assert.match(expected, /^[0-9a-f]{64}$/);
    assert.match(relativePath, /^dataset\/raw\/(?:[\w.-]+\/)*[\w.-]+\.(?:jpe?g|png)$/i);
    const file = fs.realpathSync(path.resolve(ROOT, relativePath));
    const relative = path.relative(rawDir, file);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Gambar ${id} berada di luar dataset/raw.`);
    assert.equal(sha256(fs.readFileSync(file)), expected, `Hash foto ${id} tidak cocok.`);
    items.set(id, { id, brand, relativePath, sha256: expected });
    hashes.add(expected);
  }
  assert.ok(items.size > 0, `Manifest ${SPLITS[split]} kosong.`);
  return { items, manifestSha256: sha256(bytes) };
}

async function findTarget() {
  const response = await fetch(`${METRO}/json/list`, { signal: AbortSignal.timeout(COMMAND_TIMEOUT) });
  assert.ok(response.ok, `Daftar target Metro gagal dimuat (${response.status}).`);
  const targets = (await response.json()).filter((target) => target.appId === APP_ID && POCO_X6.test(target.deviceName));
  assert.equal(targets.length, 1, 'Buka KASKUY di satu POCO X6 yang terhubung ke Metro port 8081.');
  const [target] = targets;
  const suppliedUrl = new URL(target.webSocketDebuggerUrl);
  assert.equal(suppliedUrl.pathname, '/inspector/debug', 'Alamat WebSocket Metro tidak dikenal.');
  return {
    id: target.id,
    deviceName: target.deviceName,
    url: `ws://127.0.0.1:${PORT}${suppliedUrl.pathname}${suppliedUrl.search}`,
  };
}

function assetUrl(host, runId, item) {
  const file = item.relativePath.split('/').map(encodeURIComponent).join('/');
  return `http://${host}:${PORT}/assets/${file}?platform=android&layoutCapture=${runId}`;
}

async function verifyMetroAssets(host, runId, items) {
  for (const item of items) {
    const response = await fetch(assetUrl(host, runId, item), {
      redirect: 'error', signal: AbortSignal.timeout(COMMAND_TIMEOUT),
    });
    assert.ok(response.ok, `Metro gagal menyajikan ${item.id} (${response.status}).`);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), item.sha256, `Foto ${item.id} dari Metro memiliki hash yang berbeda.`);
  }
}

class InspectorConnectionError extends Error {}

function openInspector(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { origin: METRO });
    const pending = new Map();
    let id = 0;

    const timeout = setTimeout(() => {
      socket.close();
      reject(new InspectorConnectionError('Koneksi inspector melewati batas waktu.'));
    }, COMMAND_TIMEOUT);

    function disconnect() {
      clearTimeout(timeout);
      const error = new InspectorConnectionError('Koneksi inspector terputus.');
      reject(error);
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(error);
      }
      pending.clear();
    }

    socket.addEventListener('message', ({ data }) => {
      const reply = JSON.parse(data);
      const request = pending.get(reply.id);
      if (!request) return;
      pending.delete(reply.id);
      clearTimeout(request.timeout);
      const details = reply.result?.exceptionDetails;
      if (reply.error || details) {
        request.reject(new Error(details?.exception?.description ?? details?.text ?? reply.error?.message ?? 'Evaluasi inspector gagal.'));
      } else if (typeof reply.result?.result?.value === 'string') {
        request.resolve(JSON.parse(reply.result.result.value));
      } else {
        request.reject(new Error('Inspector tidak mengembalikan status pengambilan data.'));
      }
    });

    socket.addEventListener('error', disconnect);
    socket.addEventListener('close', disconnect);
    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve({
        evaluate(expression) {
          return new Promise((resolveReply, rejectReply) => {
            if (socket.readyState !== WebSocket.OPEN) {
              rejectReply(new InspectorConnectionError('Koneksi inspector belum siap.'));
              return;
            }
            const requestId = ++id;
            const timeout = setTimeout(() => {
              pending.delete(requestId);
              rejectReply(new InspectorConnectionError('Jawaban inspector melewati batas waktu.'));
            }, COMMAND_TIMEOUT);
            pending.set(requestId, { resolve: resolveReply, reject: rejectReply, timeout });
            try {
              socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
            } catch {
              clearTimeout(timeout);
              pending.delete(requestId);
              rejectReply(new InspectorConnectionError('Permintaan inspector gagal dikirim.'));
            }
          });
        },
        close: () => socket.close(),
      });
    }, { once: true });
  });
}

function makeInspector(target) {
  let connection;
  return {
    async evaluate(fn, ...args) {
      const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
      for (let attempt = 0; ; attempt++) {
        try {
          connection ??= await openInspector(target.url);
          return await connection.evaluate(expression);
        } catch (error) {
          if (!(error instanceof InspectorConnectionError) || attempt === 2) throw error;
          connection?.close();
          connection = undefined;
          await sleep(500);
        }
      }
    },
    close: () => connection?.close(),
  };
}

// These expressions run inside the app's already connected Hermes runtime.
// Returning a JSON string works even when the Inspector does not await Promises.
function prepareDevice(runId, create) {
  const { ExpoImage, ExpoMlkitOcr } = globalThis.expo?.modules ?? {};
  if (!ExpoImage?.prefetch || !ExpoImage?.getCachePathAsync || !ExpoMlkitOcr?.recognizeText) {
    return JSON.stringify({ error: 'Modul Expo Image atau ML Kit belum tersedia di APK KASKUY.' });
  }
  if (create) {
    globalThis.__kaskuyLayoutCapture ??= Object.create(null);
    globalThis.__kaskuyLayoutCapture[runId] ??= Object.create(null);
  }
  return JSON.stringify({ ready: Boolean(globalThis.__kaskuyLayoutCapture?.[runId]) });
}

function inspectDeviceItem(runId, id) {
  const run = globalThis.__kaskuyLayoutCapture?.[runId];
  return JSON.stringify(run ? run[id] ?? { phase: 'not-started' } : { phase: 'session-lost' });
}

function startDeviceItem(runId, id, uri) {
  const run = globalThis.__kaskuyLayoutCapture?.[runId];
  if (!run) return JSON.stringify({ phase: 'session-lost' });
  // A lost inspector reply can repeat this request. Acknowledged OCR is never repeated.
  if (run[id] && run[id].phase !== 'transfer-error') return JSON.stringify(run[id]);
  run[id] = { phase: 'transferring' };
  void (async () => {
    const { ExpoImage, ExpoMlkitOcr } = globalThis.expo.modules;
    let imageUri;
    try {
      let cached = await ExpoImage.getCachePathAsync(uri);
      if (!cached && await ExpoImage.prefetch([uri], 'disk', {})) {
        cached = await ExpoImage.getCachePathAsync(uri);
      }
      if (!cached) throw new Error('Foto belum tersedia dalam cache privat.');
      imageUri = cached.startsWith('file://') ? cached : `file://${cached}`;
    } catch (error) {
      run[id] = { phase: 'transfer-error', error: String(error) };
      return;
    }
    run[id] = { phase: 'recognizing' };
    const started = Date.now();
    try {
      const result = await ExpoMlkitOcr.recognizeText(imageUri);
      const elapsed = Math.max(0, Date.now() - started);
      if (typeof result?.text !== 'string' || !Array.isArray(result.blocks)) {
        throw new Error('Respons ML Kit tidak memiliki teks dan blok OCR.');
      }
      run[id] = { phase: 'complete', row: { status: 'ok', ocrMs: elapsed, rawText: result.text, blocks: result.blocks } };
    } catch (error) {
      run[id] = { phase: 'complete', row: { status: 'error', ocrMs: Math.max(0, Date.now() - started), error: String(error) } };
    }
  })();
  return JSON.stringify(run[id]);
}

function validateCapture(row, item) {
  assert.equal(row.sha256, item.sha256, `Hash keluaran ${item.id} tidak cocok.`);
  assert.ok(Number.isSafeInteger(row.ocrMs) && row.ocrMs >= 0, `Waktu OCR ${item.id} tidak valid.`);
  const ok = row.status === 'ok' && typeof row.rawText === 'string' && Array.isArray(row.blocks);
  const error = row.status === 'error' && typeof row.error === 'string' && row.error.length > 0;
  assert.ok(ok || error, `Format hasil OCR ${item.id} tidak valid.`);
}

function readCapture(file, items) {
  const done = new Set();
  if (!fs.existsSync(file)) return done;
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content === '' || content.endsWith('\n'), 'Baris terakhir capture.jsonl tidak lengkap.');
  for (const line of content.split(/\r?\n/).filter(Boolean)) {
    const row = JSON.parse(line);
    const item = items.get(row.id);
    assert.ok(item && !done.has(row.id), `ID hasil ${row.id} tidak dikenal atau duplikat.`);
    validateCapture(row, item);
    done.add(row.id);
  }
  return done;
}

async function captureItem(inspector, runId, url, item) {
  let state = await inspector.evaluate(startDeviceItem, runId, item.id, url);
  const deadline = Date.now() + RECEIPT_TIMEOUT;
  for (;;) {
    if (state.phase === 'complete') return state.row;
    if (state.phase === 'transfer-error') throw new Error(`Transfer ${item.id} gagal. ${state.error}`);
    if (state.phase === 'session-lost' || state.phase === 'not-started') {
      throw new Error('Sesi KASKUY pada HP berubah. Pengambilan dihentikan agar foto tidak diproses ulang.');
    }
    if (Date.now() >= deadline) throw new Error(`OCR ${item.id} belum selesai. Jalankan ulang dengan --output yang sama.`);
    await sleep(250);
    state = await inspector.evaluate(inspectDeviceItem, runId, item.id);
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    split: { type: 'string' }, host: { type: 'string' }, output: { type: 'string' },
    check: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Penggunaan: node scripts/capture-ocr-layout.cjs --split dev|final|validation|confirmation --host IP_METRO [--output FOLDER] [--check]');
    return;
  }
  const { split, host } = values;
  if (!Object.hasOwn(SPLITS, split)) throw new Error('Pilih --split dev, final, validation, atau confirmation secara eksplisit.');
  if (!host || !isIPv4(host) || !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)) {
    throw new Error('Isi --host dengan alamat IPv4 Metro pada jaringan lokal HP.');
  }
  const { items, manifestSha256 } = loadManifest(split);
  const target = await findTarget();
  const generatedId = `${split}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  const output = path.resolve(values.output ?? path.join(ROOT, 'dataset', 'results', `layout-${generatedId}`));
  const infoFile = path.join(output, 'capture-info.json');
  const resultFile = path.join(output, 'capture.jsonl');
  const resume = fs.existsSync(infoFile);
  const prior = resume ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : null;
  if (prior) {
    assert.equal(prior.split, split, 'Set manifest untuk melanjutkan batch harus sama.');
    assert.equal(prior.manifestSha256, manifestSha256, 'Manifest berubah setelah batch dimulai.');
    assert.equal(prior.deviceId, target.id, 'Target inspector berbeda dari batch asli.');
    assert.match(prior.runId, new RegExp(`^${split}-[0-9]+-[0-9a-f]{12}$`));
  }
  const runId = prior?.runId ?? generatedId;
  if (!resume && fs.existsSync(resultFile)) throw new Error('Folder keluaran berisi hasil tanpa metadata. Pilih folder baru.');
  const done = readCapture(resultFile, items);
  const remaining = [...items.values()].filter(({ id }) => !done.has(id));
  await verifyMetroAssets(host, runId, remaining);
  console.log(`${target.deviceName} | ${SPLITS[split]} | ${items.size} foto | ${done.size} hasil tersimpan`);
  if (values.check || remaining.length === 0) return;

  fs.mkdirSync(output, { recursive: true });
  const lock = path.join(output, 'capture.lock');
  const lockFd = fs.openSync(lock, 'wx');
  const inspector = makeInspector(target);
  try {
    fs.writeFileSync(lockFd, `${process.pid}\n`);
    const written = readCapture(resultFile, items);
    if (written.size === items.size) return;
    console.log(`Keluaran: ${output}`);
    const device = await inspector.evaluate(prepareDevice, runId, !resume);
    if (!device.ready) throw new Error(device.error ?? 'Sesi sebelumnya hilang dari HP. Hasil yang tersimpan tetap tersedia.');
    if (!resume) {
      const metadata = { runId, split, manifestSha256, deviceId: target.id, deviceName: target.deviceName,
        startedAt: new Date().toISOString(), transport: 'metro-lan-inspector', imageCount: items.size };
      fs.writeFileSync(infoFile, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
    }
    const resultFd = fs.openSync(resultFile, 'a');
    try {
      for (const item of remaining) {
        if (written.has(item.id)) continue;
        const capture = await captureItem(inspector, runId, assetUrl(host, runId, item), item);
        const row = { ...item, ...capture };
        validateCapture(row, item);
        fs.appendFileSync(resultFd, `${JSON.stringify(row)}\n`);
        fs.fsyncSync(resultFd);
        written.add(item.id);
        console.log(`[${written.size}/${items.size}] ${item.id} ${row.status} (${row.ocrMs} ms)`);
      }
    } finally {
      fs.closeSync(resultFd);
    }
  } finally {
    inspector.close();
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
