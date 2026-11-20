import { parseReceipt, type ParsedReceipt } from './parseReceipt';
import { readReceiptOcr } from './receiptOcr';

export const DEFAULT_OCR_BATCH_HOST = '127.0.0.1';
const HOST_PORT = 8787;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const TOKEN = /^[a-zA-Z0-9_-]{16,128}$/;
const PRIVATE_PATH = /^file:\/\/\/data\/(?:data|user\/\d+)\/com\.anonymous\.catatkeuangan\/cache\/kaskuy-ocr\//;
const DOWNLOAD_PATH = /^file:\/\/\/(?:sdcard|storage\/emulated\/0)\/Download\/KaskuyOCR\//;

type BatchItem = {
  id: string;
  brand: string;
  relativePath: string;
  sha256: string;
} & ({ uri: string; imagePath?: never } | { uri?: never; imagePath: string });

type BatchManifest = {
  runId: string;
  items: BatchItem[];
  completedIds: string[];
};

export type OcrBatchResult = {
  runId: string;
  id: string;
  ocrMs: number;
  status: 'ok' | 'error';
  rawText: string | null;
  reconstructedLines?: string[];
  baseline: ParsedReceipt | null;
  corrected: ParsedReceipt | null;
  error: string | null;
};

export type OcrBatchProgress = {
  runId: string;
  total: number;
  completed: number;
  errors: number;
  currentId: string | null;
  phase: 'downloading' | 'recognizing' | 'sending' | 'completed';
};

type RunBatchOptions = {
  host?: string;
  token: string;
  recognizeText: (uri: string) => Promise<unknown>;
  downloadImage?: (url: string, headers: Record<string, string>) => Promise<string>;
  onProgress: (progress: OcrBatchProgress) => void;
};

// Keep an unacknowledged row in memory so a retry can resend it unchanged.
// Acknowledged rows are checkpointed on the host and skipped on reconnect.
let checkpoint: { hostUrl: string; token: string; sha256: string; row: OcrBatchResult } | null = null;
let running = false;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getHostUrl(host: string): string {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) {
    throw new Error('Masukkan alamat IPv4 dari runner batch di komputer.');
  }

  const [first, second] = parts.map(Number);
  const privateLan = first === 10 || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
  if (host !== DEFAULT_OCR_BATCH_HOST && !privateLan) {
    throw new Error('Gunakan IP jaringan lokal komputer atau 127.0.0.1 untuk ADB.');
  }
  return `http://${host}:${HOST_PORT}`;
}

function validateManifest(value: unknown): BatchManifest {
  if (!isObject(value) || typeof value.runId !== 'string' || !IDENTIFIER.test(value.runId) ||
      !Array.isArray(value.items)) {
    throw new Error('Daftar gambar batch tidak valid.');
  }

  const runId = value.runId;
  const ids = new Set<string>();
  const items = value.items.map((item: unknown): BatchItem => {
    if (!isObject(item) || typeof item.id !== 'string' || !IDENTIFIER.test(item.id) ||
        typeof item.brand !== 'string' || !item.brand ||
        typeof item.relativePath !== 'string' || !item.relativePath.startsWith('dataset/raw/') ||
        typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(item.sha256) || ids.has(item.id)) {
      throw new Error('Ada gambar dengan metadata tidak valid atau ID ganda.');
    }

    ids.add(item.id);
    const metadata = {
      id: item.id,
      brand: item.brand,
      relativePath: item.relativePath,
      sha256: item.sha256,
    };

    if (item.uri === undefined && item.imagePath === `/image/${runId}/${item.id}`) {
      return { ...metadata, imagePath: item.imagePath };
    }

    if (typeof item.uri === 'string' && item.imagePath === undefined) {
      const prefix = PRIVATE_PATH.exec(item.uri) ?? DOWNLOAD_PATH.exec(item.uri);
      const fileName = item.uri.slice(prefix?.[0].length);
      const stem = `${runId}/${item.id}.`;
      if (prefix && fileName.startsWith(stem) && /^[a-zA-Z0-9]{2,6}$/.test(fileName.slice(stem.length))) {
        return { ...metadata, uri: item.uri };
      }
    }
    throw new Error(`Lokasi gambar ${item.id} tidak cocok dengan batch ini.`);
  });

  const completedIds: unknown = value.completedIds ?? [];
  if (!Array.isArray(completedIds) ||
      completedIds.some((id: unknown) => typeof id !== 'string' || !ids.has(id))) {
    throw new Error('Daftar hasil yang sudah tersimpan tidak cocok dengan batch.');
  }

  return { runId, items, completedIds };
}

class BatchHostError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 || status === 403
      ? 'Token batch ditolak. Gunakan token yang ditampilkan perintah batch di komputer.'
      : `Komputer menolak permintaan batch (HTTP ${status}). Periksa keluaran runner.`);
  }
}

async function requestHost(hostUrl: string, token: string, path: '/manifest' | '/result', body?: string): Promise<unknown> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${hostUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new BatchHostError(response.status);
      return path === '/manifest' ? await response.json() : undefined;
    } catch (error) {
      if (error instanceof BatchHostError && error.status < 500 &&
          error.status !== 408 && error.status !== 429) throw error;
      if (attempt === MAX_ATTEMPTS) {
        if (error instanceof BatchHostError) throw error;
        throw new Error('Runner komputer tidak dapat dijangkau. Cek IP dan koneksi Wi-Fi atau ADB, lalu coba lagi.');
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250 * attempt));
  }
  throw new Error('Permintaan batch gagal.');
}

export async function recognizeBatchItem(
  runId: string,
  item: BatchItem,
  uri: string,
  recognizeText: RunBatchOptions['recognizeText'],
): Promise<OcrBatchResult> {
  let rawText: string | null = null;
  let ocrMs: number | null = null;
  const start = Date.now();
  try {
    const recognition = await recognizeText(uri);
    ocrMs = Math.max(0, Date.now() - start);
    const receipt = readReceiptOcr(recognition);
    rawText = receipt.rawText;
    return {
      runId, id: item.id, ocrMs, status: 'ok', rawText,
      reconstructedLines: receipt.reconstructedLines,
      baseline: parseReceipt(rawText, { corrections: false }),
      corrected: parseReceipt(rawText, { reconstructedLines: receipt.reconstructedLines }),
      error: null,
    };
  } catch (error) {
    return {
      runId, id: item.id, ocrMs: ocrMs ?? Math.max(0, Date.now() - start),
      status: 'error', rawText, baseline: null, corrected: null,
      error: error instanceof Error && error.message ? error.message : 'OCR atau parser gagal.',
    };
  }
}

export async function runOcrBatch({
  host = DEFAULT_OCR_BATCH_HOST,
  token,
  recognizeText,
  downloadImage,
  onProgress,
}: RunBatchOptions): Promise<void> {
  if (!TOKEN.test(token)) throw new Error('Masukkan token dari runner batch di komputer.');
  const hostUrl = getHostUrl(host.trim());
  if (running) throw new Error('Batch masih berjalan di perangkat ini.');
  running = true;
  try {
    const { runId, items, completedIds } = validateManifest(await requestHost(hostUrl, token, '/manifest'));
    const completed = new Set(completedIds);
    let errors = 0;
    if (checkpoint && (checkpoint.hostUrl !== hostUrl || checkpoint.token !== token || checkpoint.row.runId !== runId ||
        completed.has(checkpoint.row.id))) {
      checkpoint = null;
    }

    for (const item of items) {
      if (completed.has(item.id)) continue;

      let result: OcrBatchResult;
      if (checkpoint?.row.id === item.id && checkpoint.sha256 === item.sha256) {
        result = checkpoint.row;
      } else {
        let uri = item.uri;
        if (uri === undefined) {
          if (!downloadImage) throw new Error('Pengunduh gambar Wi-Fi belum tersedia.');
          onProgress({ runId, total: items.length, completed: completed.size, errors,
            currentId: item.id, phase: 'downloading' });
          // Transfer failures stop at this image. Only recognition and parsing failures count in the CSV.
          uri = await downloadImage(`${hostUrl}${item.imagePath}`, { Authorization: `Bearer ${token}` });
        }
        onProgress({ runId, total: items.length, completed: completed.size, errors,
          currentId: item.id, phase: 'recognizing' });
        result = await recognizeBatchItem(runId, item, uri, recognizeText);
        checkpoint = { hostUrl, token, sha256: item.sha256, row: result };
      }

      onProgress({ runId, total: items.length, completed: completed.size, errors,
        currentId: item.id, phase: 'sending' });
      await requestHost(hostUrl, token, '/result', JSON.stringify(result));
      checkpoint = null;
      completed.add(item.id);
      if (result.status === 'error') errors++;
    }

    onProgress({ runId, total: items.length, completed: completed.size, errors,
      currentId: null, phase: 'completed' });
  } finally {
    running = false;
  }
}
