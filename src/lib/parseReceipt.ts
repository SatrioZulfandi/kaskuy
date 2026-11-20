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

function findMerchant(lines: string[], corrections: boolean): string | null {
  const keys = Object.keys(KNOWN_MERCHANTS);

  // 1) cocokkan sebagai potongan teks pada baris yang dipadatkan (menangani "KLIKINDOMARET")
  for (const line of lines) {
    const compact = lettersOnly(line);
    for (const k of keys) {
      if (compact.includes(k)) return KNOWN_MERCHANTS[k];
    }
  }

  if (!corrections) return null;

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

function findMerchantInFooter(lines: string[]): string | null {
  const matches = new Set<string>();
  for (const line of lines) {
    const text = line.toUpperCase().normalize("NFKD").replace(/[\u0300-\u036F]/g, "");
    if (/\bAPLIKASI\s+ALFAGIFT\b/.test(text)) matches.add("Alfamart");
    const url = text.replace(/[^A-Z0-9]/g, "").match(/^KONTAK[A-Z0-9]*?([A-Z]{9})C[O0]ID$/);
    const shop = text.match(/\bKLIK\s*([A-Z]{8,10})\b/);
    if ((url && levenshtein(url[1], "INDOMARET") <= 1) ||
        (shop && levenshtein(shop[1], "INDOMARET") <= 1)) matches.add("Indomaret");
  }
  return matches.size === 1 ? (matches.values().next().value ?? null) : null;
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

function findTransactionDate(lines: string[]): string | null {
  const dateWithSeparators = /(?:^|[^\d])(\d{1,2})\s*[.,\-/]\s*(\d{1,2})\s*[.,\-/]\s*(20\d{2}|\d{2})(?!\d)/g;
  // OCR kadang menghilangkan pemisah tanggal. Bentuk ini harus mengawali baris transaksi yang memuat jam.
  const dateWithoutSeparators = /^(?:(tgl|tanggal|date)\s*[.:,]?\s*)?(\d{1,2})\s+(\d{1,2})\s+(20\d{2}|\d{2})(?:\s*-\s*|\s+)(?=(?:[01]?\d|2[0-3])\s*:\s*[0-5]\d\b)/i;
  const labeled = new Set<string>();
  const timed = new Set<string>();
  const addDate = (dayText: string, monthText: string, yearText: string, hasLabel: boolean) => {
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText) + (yearText.length === 2 ? 2000 : 0);
    if (year < 2015 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) return;
    (hasLabel ? labeled : timed).add(`${year}-${pad(month)}-${pad(day)}`);
  };

  for (const line of lines) {
    const unpunctuated = line.match(dateWithoutSeparators);
    if (unpunctuated) {
      const [, label, day, month, year] = unpunctuated;
      addDate(day, month, year, Boolean(label));
    }
    for (const match of line.matchAll(dateWithSeparators)) {
      const head = line.slice(0, match.index + 1);
      const tail = line.slice(match.index + match[0].length);
      const hasLabel = /\b(?:tgl|tanggal|date)\s*[.:,]?\s*$/i.test(head);
      if (!hasLabel && !/^\s*[- ]?\s*\d{1,2}\s*:\s*\d{2}\b/.test(tail)) continue;
      addDate(match[1], match[2], match[3], hasLabel);
    }
  }
  const candidates = labeled.size ? labeled : timed;
  return candidates.size === 1 ? (candidates.values().next().value ?? null) : null;
}

// ---------- nominal ----------

// Memperbaiki salah baca huruf->angka hanya pada token yang "tampak seperti angka".
function normalizeToken(tok: string): string {
  if (!/\d/.test(tok)) return tok;
  if (!/^[0-9OoeEIlSsBZ.,]+$/.test(tok)) return tok;
  return tok.replace(/[OoeEIlSsBZ]/g, (c) => CONFUSABLE[c]);
}

function baselineAmountsIn(line: string): number[] {
  if (SKIP_LINE.test(line)) return [];
  const out: number[] = [];
  for (const raw of line.split(" ")) {
    let tok = raw
      .replace(/^Rp\.?/i, "")
      .replace(/^[^0-9A-Za-z]+|[^0-9A-Za-z]+$/g, "");
    if (!tok) continue;
    tok = tok.replace(/[.,]00$/, "");
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
function baselineAmountAfterKeyword(
  lines: string[],
  test: (compact: string) => boolean,
): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!test(lettersOnly(lines[i]))) continue;
    for (let j = i; j <= Math.min(i + 2, lines.length - 1); j++) {
      if (j > i && isLabel(lettersOnly(lines[j]))) break; // sudah masuk label lain
      const nums = baselineAmountsIn(lines[j]);
      if (nums.length > 0) return nums[nums.length - 1];
    }
  }
  return null;
}

type AmountRole = "total" | "subtotal" | "itemsTotal" | "discount" | "tunai" | "kembali" | "electronic" | "savings" | "changeAllocation";
type Amounts = Pick<ParsedReceipt, "total" | "tunai" | "kembali">;

const AMOUNT_LABELS: Partial<Record<string, AmountRole>> = {
  TOTAL: "total", TOTALBELANJA: "total", TOTALBAYAR: "total", TOTALTAGIHAN: "total",
  TOTALHARGA: "total", TOTALPEMBAYARAN: "total", GRANDTOTAL: "total", JUMLAH: "total",
  JUMLAHBAYAR: "total", JUMLAHPEMBAYARAN: "total", JUMLAHBELANJA: "total", TAGIHAN: "total",
  HARGAJUAL: "subtotal", SUBTOTAL: "subtotal", TOTALITEM: "itemsTotal",
  TUNAI: "tunai", BAYARTUNAI: "tunai", PEMBAYARANTUNAI: "tunai", UANGTUNAI: "tunai", CASH: "tunai",
  KEMBALI: "kembali", KEMBALIAN: "kembali", UANGKEMBALI: "kembali", CHANGE: "kembali",
  DANA: "electronic", DANAQRIS: "electronic", QRIS: "electronic", SHOPEEPAY: "electronic",
  GOPAY: "electronic", OVO: "electronic", DEBIT: "electronic", KARTUDEBIT: "electronic", KARTUKREDIT: "electronic",
  ANDAHEMAT: "savings", TOTALHEMAT: "savings", PENGHEMATAN: "savings",
};
const FUZZY_AMOUNT_LABELS = ["TOTAL", "TOTALBELANJA", "TOTALITEM", "TUNAI", "KEMBALI", "KEMBALIAN", "DANAQRIS"];

type AmountLabel = { role: AmountRole; clipped: boolean };
type AmountLine = { label: AmountLabel | null; inline: number | null; standalone: number | null; token: string; isolated: boolean };

function amountLabel(key: string, layout = false): AmountLabel | null {
  const exact = AMOUNT_LABELS[key];
  if (exact) return { role: exact, clipped: false };
  if (layout) {
    if (key === "VOUCHER" || key === "CARD") return { role: "electronic", clipped: false };
    if (/^TOTAL(?:DISC|DISKON)$/.test(key)) return { role: "discount", clipped: false };
    if (/^TOPUP(?:UANG)?KE[MN]BALIAN/.test(key)) return { role: "changeAllocation", clipped: false };
    if (/^HA[A-Z]{2,3}JUAL$/.test(key) || /^HARGA[A-Z]{4}$/.test(key) && levenshtein(key, "HARGAJUAL") <= 2) {
      return { role: "subtotal", clipped: false };
    }
  }
  if (key.length >= 5 && key.length <= 14) {
    const sameRole = new Set(FUZZY_AMOUNT_LABELS.filter((name) => {
      const limit = name.length >= 9 ? 2 : 1;
      return Math.abs(key.length - name.length) <= limit && levenshtein(key, name) <= limit;
    }).map((name) => AMOUNT_LABELS[name]));
    const role = sameRole.values().next().value;
    if (sameRole.size === 1 && role) return { role, clipped: false };
  }

  // Tepi cetakan yang terpotong hanya dipakai sebagai petunjuk untuk satu blok pembayaran.
  if (layout) {
    if (/^U[NR]AI$/.test(key)) return { role: "tunai", clipped: true };
    if (/^K[EI][A-Z]{4,6}$/.test(key) && levenshtein(key, "KEMBALI") <= 2) return { role: "kembali", clipped: true };
    if (/^[A-Z]{1,2}TAL$/.test(key) || /^(?!.*(?:SUB|DISC|ITEM|HEMAT|PAJAK))[A-Z]{1,5}TOTAL$/.test(key)) {
      return { role: "total", clipped: true };
    }
  }
  if (key === "NAI") return { role: "tunai", clipped: true };
  if (/^[A-Z]{0,3}BALIAN$/.test(key)) return { role: "kembali", clipped: true };
  if (/^(?:T?AL)ITE[MN]$/.test(key)) return { role: "itemsTotal", clipped: true };
  return null;
}

function readAmount(token: string): number | null {
  const amount = normalizeToken(token.replace(/^Rp\.?/i, "").replace(/[.,]-$/, "")).replace(/[.,]00$/, "");
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(amount)) return null;
  const value = Number(amount.replace(/[.,]/g, ""));
  return Number.isSafeInteger(value) ? value : null;
}

function readAmountLine(line: string, layout = false): AmountLine {
  // Pada baris berkoordinat, pertahankan kelompok digit yang tidak lengkap sebagai satu token.
  const joined = layout
    ? line.replace(/(\d)\s*([.,])\s*(?=[0-9OoeEIlSsBZC)\]]{1,3}(?:[.,]|\s|$))/g, "$1$2")
    : line.replace(/([0-9OoeEIlSsBZ])\s*([.,])\s*(?=[0-9OoeEIlSsBZ]{3}(?:[.,]|\b))/g, "$1$2");
  const tokens = joined
    .split(/[\s:=]+/)
    .filter((token) => token && !/^Rp\.?$/i.test(token));
  const firstNumber = tokens.findIndex((token) => /^(?:Rp\.?)?[+(-]?\d/i.test(token) || readAmount(token) !== null);
  const prefix = tokens.slice(0, firstNumber < 0 ? undefined : firstNumber).join("");
  const key = lettersOnly(layout ? prefix.replace(/!$/, "I").replace(/([a-z])0(?=[a-z])/gi, "$1O") : prefix);
  const label = amountLabel(key, layout);
  const last = tokens.at(-1) ?? "";
  // Sebagian kasir mencetak kode kelas pajak berupa satu huruf sesudah nominal.
  const lastToken = firstNumber > 0 && /^[A-Z]$/.test(last) ? (tokens.at(-2) ?? "") : last;
  const token = layout && /\d[.,][0-9C)\]]+$/i.test(lastToken) ? lastToken.replace(/[C)\]]/g, "0") : lastToken;
  const ambiguousGroup = layout && /^\d{1,3}[.,]00$/.test(token);
  const amount = ambiguousGroup ? null : readAmount(token);
  const isItemCount = label?.role === "itemsTotal" && /^\d{1,3}$/.test(lastToken) && !/\brp\.?\s*/i.test(line);
  return {
    label,
    inline: firstNumber > 0 && label && !label.clipped && !isItemCount ? amount : null,
    standalone: tokens.length === 1 ? amount : null,
    token: firstNumber >= 0 && !isItemCount ? token : "",
    isolated: tokens.length === 1 && firstNumber === 0,
  };
}

function linkedAmount(rows: AmountLine[], index: number): number | null {
  const row = rows[index];
  if (!row?.label || row.label.clipped) return null;
  if (row.inline !== null) return row.inline;
  const neighboring = rows[index + 1]?.standalone ?? null;
  if (neighboring === null || rows[index + 2]?.standalone != null) return null;
  // Angka kecil sesudah TOTAL ITEM bisa berupa jumlah barang.
  return row.label.role === "itemsTotal" && neighboring < 1000 ? null : neighboring;
}

function detachedAmounts(
  rows: AmountLine[],
  start: number,
  labeled: Amounts,
): Amounts | null {
  const from = Math.max(0, start - 6);
  const to = start + 10;
  const nearby = rows.slice(from, to);
  const paymentRoles = new Set(["tunai", "kembali", "electronic"]);
  const roles = new Set(nearby.map((row) => row.label?.role));
  const hasCash = roles.has("tunai");
  const hasChange = roles.has("kembali");
  const hasElectronic = roles.has("electronic");
  if ((!hasCash && !hasElectronic) || (!hasChange && !hasCash)) return null;

  const afterLabels = rows.findLastIndex((row, i) => i >= from && i < to &&
    row.label !== null && paymentRoles.has(row.label.role));
  const trailing = rows.slice(afterLabels + 1, afterLabels + 41);
  const nextTotal = trailing.findIndex((row) => row.label?.role === "total" || row.label?.role === "itemsTotal");
  const values = (nextTotal < 0 ? trailing : trailing.slice(0, nextTotal)).flatMap(({ standalone }, i) =>
    standalone === null ? [] : [{ amount: standalone, line: i }]);
  const candidates = new Map<string, Amounts>();
  const endOffsets = roles.has("savings") ? [0, 1] : [0];
  const electronicAndCash = hasElectronic && hasCash;
  const width = hasChange ? (electronicAndCash ? 4 : 3) : 2;
  for (const offset of endOffsets) {
    const end = values.length - offset;
    const index = end - width;
    if (index < 0) continue;
    const group = values.slice(index, end);
    if (group.some((entry, i) => i > 0 && entry.line - group[i - 1].line > 3)) continue;
    const [total, paid, third, fourth] = group.map(({ amount }) => amount);
    const kembali = hasChange ? (electronicAndCash ? fourth : third) : null;
    // Dua pembayaran lepas tidak menunjukkan mana yang tunai, kecuali label tunai terbaca bersama nilainya.
    const tunai = electronicAndCash ? labeled.tunai : hasCash ? paid : null;
    const sumPaid = electronicAndCash ? paid + third : paid;
    if (total <= 0 || sumPaid - (kembali ?? 0) !== total) continue;
    if (electronicAndCash && tunai !== null && tunai !== paid && tunai !== third) continue;
    if (!hasChange && (hasElectronic || (labeled.total === null && labeled.tunai === null &&
        (!roles.has("subtotal") || values[index - 1]?.amount !== total)))) continue;
    if ((labeled.total !== null && labeled.total !== total) || (labeled.tunai !== null && labeled.tunai !== tunai) ||
        (labeled.kembali !== null && labeled.kembali !== kembali)) continue;
    const candidate = { total, tunai, kembali };
    candidates.set(JSON.stringify(candidate), candidate);
  }
  return candidates.size === 1 ? (candidates.values().next().value ?? null) : null;
}

function correctedAmounts(lines: string[], notes: string[]) {
  const rows = lines.map((line) => readAmountLine(line));
  const indexFor = (role: AmountRole) => rows.findIndex((row) => row.label?.role === role);
  const totalIndex = indexFor("total");
  const itemsIndex = indexFor("itemsTotal");
  const summaryIndex = totalIndex >= 0 ? totalIndex : itemsIndex;
  const cashIndex = indexFor("tunai");
  const changeIndex = indexFor("kembali");
  const amountCandidates = rows.flatMap(({ standalone, inline }) => standalone ?? inline ?? []);
  const hasElectronic = indexFor("electronic") >= 0;
  const labeled: Amounts = {
    total: linkedAmount(rows, totalIndex),
    tunai: linkedAmount(rows, cashIndex),
    kembali: linkedAmount(rows, changeIndex),
  };

  const inline: Amounts = {
    total: rows[summaryIndex]?.inline ?? null,
    tunai: rows[cashIndex]?.inline ?? null,
    kembali: rows[changeIndex]?.inline ?? null,
  };
  if (summaryIndex >= 0 && (inline.total === null || inline.tunai === null || inline.kembali === null)) {
    const detached = detachedAmounts(rows, summaryIndex, inline);
    if (detached) {
      notes.push("Label dan nominal pembayaran terbaca terpisah. Periksa pasangan nominal yang disarankan.");
      return { ...detached, amountCandidates, foundByLabel: true, inferred: true, hasElectronic };
    }
  }
  if (labeled.total !== null) return { ...labeled, amountCandidates, foundByLabel: true, inferred: false, hasElectronic };

  if (!hasElectronic && labeled.tunai !== null && labeled.kembali !== null) {
    const total = labeled.tunai - labeled.kembali;
    if (total > 0 && (inline.total === total || rows.some((row) => row.standalone === total))) {
      notes.push("Label total tidak terbaca; nominal total cocok dengan selisih tunai dan kembalian.");
      return { ...labeled, total, amountCandidates, foundByLabel: false, inferred: true, hasElectronic };
    }
  }
  if (summaryIndex < 0 && cashIndex < 0 && changeIndex < 0 && !hasElectronic && amountCandidates.length === 1) {
    const total = amountCandidates[0];
    if (total >= 100 && lines.some((line, i) => /[.,]|^Rp/i.test(line) && rows[i].standalone === total)) {
      notes.push("Label total tidak terbaca; satu nominal yang ditemukan ditampilkan untuk diperiksa.");
      return { ...labeled, total, amountCandidates, foundByLabel: false, inferred: false, hasElectronic };
    }
  }
  notes.push("Total belanja belum dapat dipasangkan dengan nominal.");
  return { ...labeled, amountCandidates, foundByLabel: false, inferred: false, hasElectronic };
}

function reconciledCash({ total, tunai, kembali }: Amounts): boolean {
  return total !== null && total > 0 && tunai !== null && kembali !== null && tunai - kembali === total;
}

function supportsAmount(token: string, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0) return false;
  if (readAmount(token) === amount) return true;
  // A short final group can confirm a calculated value, never supply its missing digits alone.
  const pattern = normalizeToken(token.replace(/^Rp\.?/i, ""));
  if (/^\d{1,3}(?:[.,]\d{3})+[.,]$/.test(pattern)) {
    const digits = pattern.replace(/[.,]/g, "");
    return String(amount).length === digits.length + 1 && String(amount).endsWith(digits);
  }
  if (!/^\d{1,3}(?:[.,]\d{3})*[.,]\d{1,2}$/.test(pattern)) return false;
  const digits = pattern.replace(/[.,]/g, "");
  const expected = String(amount);
  const finalGroupLength = pattern.length - Math.max(pattern.lastIndexOf(","), pattern.lastIndexOf(".")) - 1;
  return expected.length === digits.length + 3 - finalGroupLength && expected.startsWith(digits);
}

function amountsFromLayout(lines: string[], original: ReturnType<typeof correctedAmounts>) {
  const rows = lines.filter((line) => !SKIP_LINE.test(line)).map((line) => readAmountLine(line, true));
  const hasLabel = (role: AmountRole) => rows.some((row) => row.label?.role === role);
  const uniqueInline = (role: AmountRole) => {
    const values = new Set(rows.flatMap((row) => row.label?.role === role && row.inline !== null ? [row.inline] : []));
    return values.size === 1 ? (values.values().next().value ?? null) : null;
  };
  const matchesPrinted = (role: AmountRole, amount: number) => rows.some((row, i) => {
    if (row.label?.role !== role) return false;
    if (row.token) return supportsAmount(row.token, amount);
    const neighboring = [rows[i - 1], rows[i + 1]];
    return neighboring.some((candidate) => candidate?.isolated && supportsAmount(candidate.token, amount));
  });
  let tunai = uniqueInline("tunai");
  let kembali = uniqueInline("kembali");
  const electronic = uniqueInline("electronic");
  const hasElectronic = hasLabel("electronic") || original.hasElectronic;
  const allocatedChange = uniqueInline("changeAllocation") ?? 0;
  const hasCash = hasLabel("tunai");
  const hasChange = hasLabel("kembali");
  const noncash = hasElectronic ? electronic : 0;
  const directlyReadTotal = uniqueInline("total");
  const itemTotal = uniqueInline("itemsTotal");
  const saleAmount = uniqueInline("subtotal");
  const discount = uniqueInline("discount");
  const netAmount = itemTotal !== null && discount !== null && discount > 0 && discount < itemTotal ? itemTotal - discount : null;
  const leadingDigitMissing = directlyReadTotal !== null && netAmount !== null &&
    String(netAmount).length === String(directlyReadTotal).length + 1 && String(netAmount).endsWith(String(directlyReadTotal));
  const corroboratedTotal = saleAmount !== null && matchesPrinted("total", saleAmount) ? saleAmount : null;
  const statedTotal = leadingDigitMissing ? netAmount : directlyReadTotal ?? corroboratedTotal;
  const totalHint = statedTotal ?? itemTotal;
  let inferred = directlyReadTotal !== statedTotal;

  // If two amounts have independent labels, use the equation to confirm one damaged or detached value.
  if (tunai === null && hasCash && totalHint !== null && kembali !== null && noncash !== null) {
    const cash = totalHint + kembali + allocatedChange - noncash;
    if (cash > 0 && matchesPrinted("tunai", cash)) {
      tunai = cash;
      inferred = true;
    }
  }
  if (tunai !== null && kembali !== null && corroboratedTotal !== null && !hasElectronic) {
    const cash = corroboratedTotal + kembali + allocatedChange;
    // The printed sale and total must agree before correcting a single differing cash digit.
    if (String(tunai).length === String(cash).length && levenshtein(String(tunai), String(cash)) === 1) {
      tunai = cash;
      inferred = true;
    }
  }
  if (tunai === null && kembali === null && hasCash && hasChange && totalHint !== null && noncash !== null) {
    const candidates = rows.flatMap((row) => row.standalone === null ? [] : [row.standalone]).filter((value) =>
      matchesPrinted("kembali", value) && matchesPrinted("tunai", totalHint + value + allocatedChange - noncash));
    const changes = new Set(candidates);
    if (changes.size === 1) {
      kembali = candidates[0];
      tunai = totalHint + kembali + allocatedChange - noncash;
      inferred = true;
    }
  }
  const paid = noncash !== null && (tunai !== null || (hasElectronic && !hasCash)) ? noncash + (tunai ?? 0) : null;
  if (kembali === null && hasChange && totalHint !== null && paid !== null) {
    const change = paid - allocatedChange - totalHint;
    const blankChange = rows.every((row, i) => row.label?.role !== "kembali" ||
      (!row.token && !rows[i - 1]?.isolated && !rows[i + 1]?.isolated));
    if (change >= 0 && (matchesPrinted("kembali", change) || (change === 0 && blankChange))) {
      kembali = change;
      inferred = true;
    }
  }

  const confirmsTotal = (total: number | null) => total !== null && total > 0 && paid !== null &&
    (kembali !== null ? paid - kembali - allocatedChange === total : hasElectronic && !hasCash && paid === total);
  let total = statedTotal !== null && statedTotal > 0 ? statedTotal : confirmsTotal(itemTotal) ? itemTotal : null;
  if (total === null && paid !== null && kembali !== null) {
    const computed = paid - kembali - allocatedChange;
    const consistentWithItems = !hasLabel("total") && itemTotal !== null &&
      String(itemTotal).length === String(computed).length && levenshtein(String(itemTotal), String(computed)) === 1;
    if (computed > 0 && (matchesPrinted("total", computed) || consistentWithItems)) {
      total = computed;
      inferred = true;
    }
  }
  if (total === null && tunai === null && kembali === null) return null;

  const confirmedLayout = confirmsTotal(total);
  const agrees = (value: number | null, previous: number | null) => value === null || previous === null || value === previous;
  if (!confirmedLayout && !original.hasElectronic && reconciledCash(original) &&
      (!agrees(total, original.total) || !agrees(tunai, original.tunai) || !agrees(kembali, original.kembali))) return null;

  return {
    total: total ?? original.total,
    tunai: tunai ?? original.tunai,
    kembali: kembali ?? original.kembali,
    amountCandidates: [...new Set([...original.amountCandidates, ...rows.flatMap((row) => row.inline ?? row.standalone ?? [])])],
    foundByLabel: total !== null || original.foundByLabel,
    inferred: inferred || (!confirmedLayout && original.inferred),
    hasElectronic,
    allocatedChange,
  };
}

function cleanLine(line: string): string {
  return line.replace(/[\u25A1\uFFFD]/g, " ").replace(/\s+/g, " ").trim();
}

// ---------- fungsi utama ----------

/** Mode tanpa koreksi mempertahankan ekstraksi acuan untuk uji OCR berpasangan. */
export function parseReceipt(
  text: string,
  { corrections = true, reconstructedLines }: { corrections?: boolean; reconstructedLines?: readonly string[] } = {},
): ParsedReceipt {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const layout = corrections ? (reconstructedLines?.map(cleanLine).filter(Boolean) ?? []) : [];

  const notes: string[] = [];
  const merchant = findMerchant(lines, corrections) ??
    (layout.length ? findMerchant(layout, true) ?? findMerchantInFooter([...lines, ...layout]) : null);
  const date = (layout.length ? findTransactionDate([...lines, ...layout]) : null) ?? findDate(lines) ??
    (layout.length ? findDate(layout) : null);
  let amounts = corrections ? correctedAmounts(lines, notes) : {
    amountCandidates: lines.flatMap(baselineAmountsIn),
    total: baselineAmountAfterKeyword(lines, (c) =>
      /TOTAL|JUMLAH|TAGIHAN/.test(c) && !/SUBTOTAL|ITEM|DISKON|HEMAT/.test(c)),
    tunai: baselineAmountAfterKeyword(lines, (c) => /TUNAI|CASH/.test(c)),
    kembali: baselineAmountAfterKeyword(lines, (c) => /KEMBALI|CHANGE/.test(c)),
    foundByLabel: true,
    inferred: false,
    hasElectronic: false,
  };
  const fromLayout = layout.length ? amountsFromLayout(layout, amounts) : null;
  if (fromLayout) {
    if (fromLayout.total !== amounts.total || fromLayout.tunai !== amounts.tunai || fromLayout.kembali !== amounts.kembali) {
      if (fromLayout.total !== null) notes.length = 0;
      notes.push(fromLayout.inferred
        ? "Nominal disesuaikan berdasarkan posisi dan aritmetika pembayaran; periksa nilai yang disarankan."
        : "Nominal dipasangkan dengan label berdasarkan posisi pada struk.");
    }
    amounts = fromLayout;
  }
  const { total, tunai, kembali, amountCandidates, foundByLabel, inferred, hasElectronic } = amounts;
  const allocatedChange = fromLayout?.allocatedChange ?? 0;

  let arithmeticOk: boolean | null = null;
  if (!hasElectronic && total !== null && tunai !== null && kembali !== null) {
    arithmeticOk = tunai - kembali - allocatedChange === total;
    if (!arithmeticOk) {
      notes.push(
        `Tidak konsisten: tunai (${tunai}) - kembali (${kembali}) != total (${total}). Salah satu angka kemungkinan salah baca.`,
      );
    }
  }

  let confidence: Confidence;
  if (total === null) confidence = "low";
  else if (inferred) confidence = "medium";
  else if (!foundByLabel) confidence = "low";
  else if (arithmeticOk === true) confidence = !corrections || merchant !== null ? "high" : "medium";
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
