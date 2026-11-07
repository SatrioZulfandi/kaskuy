// src/lib/parseReceipt.ts
// Parser v1: mengubah teks hasil OCR struk menjadi data transaksi.
// Murni TypeScript (tanpa library native), jadi bisa diuji tanpa HP.

export type Confidence = "high" | "medium" | "low";

export type ParsedReceipt = {
  merchant: string | null;
  date: string | null; // format YYYY-MM-DD
  total: number | null;
  tunai: number | null;
  kembali: number | null;
  // true jika tunai - kembali == total, false jika tidak cocok, null jika tidak bisa dicek
  arithmeticOk: boolean | null;
  confidence: Confidence;
  needsConfirmation: boolean; // true -> tampilkan layar konfirmasi ke pengguna
  amountCandidates: number[]; // semua angka uang yang ditemukan (untuk debug/evaluasi)
  notes: string[];
};

// Daftar merchant dikenal (kunci HURUF BESAR tanpa spasi). Silakan tambah sendiri.
const KNOWN_MERCHANTS: Record<string, string> = {
  INDOMARET: "Indomaret",
  ALFAMART: "Alfamart",
  ALFAMIDI: "Alfamidi",
  ALFARIA: "Alfamart", // PT Sumber Alfaria Trijaya = Alfamart
};

// Baris yang berisi angka non-uang (NPWP, telepon, dll) dilewati saat mencari nominal.
const SKIP_LINE = /NPWP|TELP|TLP|SMS|\bWA\b|KONTAK|\.CO\.ID/i;

// Huruf yang sering tertukar dengan angka oleh OCR.
const CONFUSABLE: Record<string, string> = {
  O: "0",
  o: "0",
  e: "0",
  E: "0",
  I: "1",
  l: "1",
  S: "5",
  s: "5",
  B: "8",
  Z: "2",
};

// ---------- utilitas kecil ----------

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function lettersOnly(line: string): string {
  return line.toUpperCase().replace(/[^A-Z]/g, "");
}

function isLabel(compact: string): boolean {
  return /TOTAL|TUNAI|CASH|KEMBALI|CHANGE|BAYAR|DPP|PPN|HARGAJUAL|DISKON/.test(
    compact,
  );
}

// ---------- merchant ----------

function findMerchant(lines: string[]): string | null {
  const keys = Object.keys(KNOWN_MERCHANTS);

  // 1) cocokkan sebagai potongan teks pada baris yang dipadatkan (menangani "KLIKINDOMARET")
  for (const line of lines) {
    const compact = lettersOnly(line);
    for (const k of keys) {
      if (compact.includes(k)) return KNOWN_MERCHANTS[k];
    }
  }

  // 2) pencocokan mirip (toleran 1-2 salah huruf) per kata
  let best: { name: string; dist: number } | null = null;
  for (const line of lines) {
    for (const w of line.toUpperCase().split(/[^A-Z]+/)) {
      if (w.length < 5) continue;
      for (const k of keys) {
        const d = levenshtein(w, k);
        const limit = k.length <= 8 ? 1 : 2;
        if (d <= limit && (best === null || d < best.dist)) {
          best = { name: KNOWN_MERCHANTS[k], dist: d };
        }
      }
    }
  }
  return best ? best.name : null;
}

// ---------- tanggal ----------

function findDate(lines: string[]): string | null {
  // dd.mm.yy / dd-mm-yyyy / dd/mm/yyyy
  const reDMY = /(?:^|[^\d])(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4}|\d{2})(?!\d)/g;
  // yyyy-mm-dd
  const reYMD = /(?:^|[^\d])(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/g;

  for (const line of lines) {
    for (const m of line.matchAll(reDMY)) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = Number(m[3]);
      if (m[3].length === 2) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2015 && y <= 2099) {
        return `${y}-${pad(mo)}-${pad(d)}`;
      }
    }
    for (const m of line.matchAll(reYMD)) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        return `${y}-${pad(mo)}-${pad(d)}`;
      }
    }
  }
  return null;
}

// ---------- nominal ----------

// Memperbaiki salah baca huruf->angka hanya pada token yang "tampak seperti angka".
function normalizeToken(tok: string): string {
  if (!/\d/.test(tok)) return tok;
  if (!/^[0-9OoeEIlSsBZ.,]+$/.test(tok)) return tok;
  return tok.replace(/[OoeEIlSsBZ]/g, (c) => CONFUSABLE[c]);
}

function amountsIn(line: string): number[] {
  if (SKIP_LINE.test(line)) return [];
  const out: number[] = [];
  for (const raw of line.split(" ")) {
    let tok = raw
      .replace(/^Rp\.?/i, "")
      .replace(/^[^0-9A-Za-z]+|[^0-9A-Za-z]+$/g, "");
    if (!tok) continue;
    tok = normalizeToken(tok).replace(/[.,]00$/, "");
    if (/^\d{1,3}([.,]\d{3})+$/.test(tok)) {
      out.push(Number(tok.replace(/[.,]/g, "")));
    } else if (/^[1-9]\d{3,}$/.test(tok)) {
      out.push(Number(tok));
    }
  }
  return out;
}

// Mencari angka yang menyertai sebuah kata kunci: di baris yang sama,
// atau di 1-2 baris berikutnya (karena OCR sering memisahkan label dan angka).
function amountAfterKeyword(
  lines: string[],
  test: (compact: string) => boolean,
): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!test(lettersOnly(lines[i]))) continue;
    for (let j = i; j <= Math.min(i + 2, lines.length - 1); j++) {
      if (j > i && isLabel(lettersOnly(lines[j]))) break; // sudah masuk label lain
      const nums = amountsIn(lines[j]);
      if (nums.length > 0) return nums[nums.length - 1];
    }
  }
  return null;
}

// Cadangan: cari tiga angka (total, tunai, kembali) yang memenuhi tunai - kembali = total.
function findConsistentTriple(
  nums: number[],
): { total: number; tunai: number; kembali: number } | null {
  for (let a = 0; a < nums.length; a++) {
    for (let b = 0; b < nums.length; b++) {
      for (let c = 0; c < nums.length; c++) {
        if (a === b || b === c || a === c) continue;
        if (nums[a] > 0 && nums[b] > nums[a] && nums[b] - nums[a] === nums[c]) {
          return { total: nums[a], tunai: nums[b], kembali: nums[c] };
        }
      }
    }
  }
  return null;
}

// ---------- fungsi utama ----------

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/[\u25A1\uFFFD]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length > 0);

  const notes: string[] = [];
  const merchant = findMerchant(lines);
  const date = findDate(lines);
  const amountCandidates = lines.flatMap(amountsIn);

  let total = amountAfterKeyword(
    lines,
    (c) =>
      /TOTAL|JUMLAH|TAGIHAN/.test(c) && !/SUBTOTAL|ITEM|DISKON|HEMAT/.test(c),
  );
  let tunai = amountAfterKeyword(lines, (c) => /TUNAI|CASH/.test(c));
  let kembali = amountAfterKeyword(lines, (c) => /KEMBALI|CHANGE/.test(c));

  const totalFromKeyword = total !== null;
  let usedTriple = false;

  if (total === null) {
    const triple = findConsistentTriple(amountCandidates);
    if (triple) {
      total = triple.total;
      tunai = triple.tunai;
      kembali = triple.kembali;
      usedTriple = true;
      notes.push(
        "Kata kunci TOTAL tidak terbaca; total ditentukan dari angka yang konsisten (tunai - kembali = total).",
      );
    } else if (amountCandidates.length > 0) {
      total = amountCandidates[0];
      notes.push(
        "Kata kunci TOTAL tidak terbaca; total diambil dari angka pertama (perkiraan).",
      );
    } else {
      notes.push("Tidak ada angka uang yang bisa dipakai.");
    }
  }

  let arithmeticOk: boolean | null = null;
  if (total !== null && tunai !== null && kembali !== null) {
    arithmeticOk = tunai - kembali === total;
    if (!arithmeticOk) {
      notes.push(
        `Tidak konsisten: tunai (${tunai}) - kembali (${kembali}) != total (${total}). Salah satu angka kemungkinan salah baca.`,
      );
    }
  }

  let confidence: Confidence;
  if (total === null) confidence = "low";
  else if (!totalFromKeyword) confidence = usedTriple ? "medium" : "low";
  else if (arithmeticOk === true) confidence = "high";
  else if (arithmeticOk === false) confidence = "low";
  else confidence = "medium";

  if (merchant === null) notes.push("Merchant tidak dikenali.");
  if (date === null) notes.push("Tanggal tidak ditemukan.");

  return {
    merchant,
    date,
    total,
    tunai,
    kembali,
    arithmeticOk,
    confidence,
    needsConfirmation: confidence !== "high" || date === null,
    amountCandidates,
    notes,
  };
}
