import type { TransactionWithDetails } from '../types';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const PACKAGE_NS = 'http://schemas.openxmlformats.org/package/2006';
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SHEET_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const HEADERS = ['ID', 'Tanggal', 'Jenis', 'Dompet', 'Kategori', 'Nominal (IDR)', 'Catatan'];
const MAX_WORKSHEET_ROWS = 1_048_576;
const MAX_CELL_TEXT = 32_767;
const MILLISECONDS_PER_DAY = 86_400_000;
const EXCEL_DATE_ORIGIN = Date.UTC(1899, 11, 31);
const EXCEL_LEAP_DAY_CUTOFF = Date.UTC(1900, 2, 1);

const WORKBOOK_PARTS = {
  '[Content_Types].xml': `${XML}<Types xmlns="${PACKAGE_NS}/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/xl/workbook.xml" ContentType="${SHEET_CONTENT_TYPE}.sheet.main+xml"/>
    <Override PartName="/xl/worksheets/sheet1.xml" ContentType="${SHEET_CONTENT_TYPE}.worksheet+xml"/>
    <Override PartName="/xl/styles.xml" ContentType="${SHEET_CONTENT_TYPE}.styles+xml"/>
  </Types>`,
  '_rels/.rels': `${XML}<Relationships xmlns="${PACKAGE_NS}/relationships">
    <Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/officeDocument" Target="xl/workbook.xml"/>
  </Relationships>`,
  'xl/workbook.xml': `${XML}<workbook xmlns="${SHEET_NS}" xmlns:r="${RELATIONSHIPS_NS}">
    <bookViews><workbookView/></bookViews>
    <sheets><sheet name="Transaksi" sheetId="1" r:id="rId1"/></sheets>
  </workbook>`,
  'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PACKAGE_NS}/relationships">
    <Relationship Id="rId1" Type="${RELATIONSHIPS_NS}/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="${RELATIONSHIPS_NS}/styles" Target="styles.xml"/>
  </Relationships>`,
  'xl/styles.xml': `${XML}<styleSheet xmlns="${SHEET_NS}">
    <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
    <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
    <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
    <borders count="1"><border/></borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="4">
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
      <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
      <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
      <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    </cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  </styleSheet>`,
};

function textCell(ref: string, value: string, style = ''): string {
  if (value.length > MAX_CELL_TEXT) throw new Error(`Isi sel ${ref} melebihi batas teks Excel.`);
  const escaped = value
    .replace(/_x[0-9a-f]{4}_/gi, (token) => `_x005f_${token.slice(1)}`)
    // SpreadsheetML escapes XML-invalid controls and preserves carriage returns.
    .replace(/[\u0000-\u0008\u000b-\u001f\ufffe\uffff]/g, (character) => `_x${character.charCodeAt(0).toString(16).padStart(4, '0')}_`)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escaped}</t></is></c>`;
}

function numericCell(ref: string, value: number, style = ''): string {
  // Excel keeps at most 15 significant digits in numeric cells.
  if (Math.abs(value) >= 1e15) return textCell(ref, String(value));
  return `<c r="${ref}"${style}><v>${value}</v></c>`;
}

function dateCell(ref: string, date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || timestamp <= EXCEL_DATE_ORIGIN) return textCell(ref, date);
  const serial = (timestamp - EXCEL_DATE_ORIGIN) / MILLISECONDS_PER_DAY;
  // The Excel 1900 calendar reserves serial 60 for the nonexistent 29 February.
  return numericCell(ref, serial + Number(timestamp >= EXCEL_LEAP_DAY_CUTOFF), ' s="2"');
}

function createWorksheet(transactions: readonly TransactionWithDetails[]): string {
  const rows = transactions.map((transaction, index) => {
    const row = index + 2;
    return `<row r="${row}">${numericCell(`A${row}`, transaction.id)}${dateCell(`B${row}`, transaction.date)}`
      + `${textCell(`C${row}`, transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran')}`
      + `${textCell(`D${row}`, transaction.wallet_name)}${textCell(`E${row}`, transaction.category_name)}`
      + `${numericCell(`F${row}`, transaction.amount, ' s="3"')}${textCell(`G${row}`, transaction.note ?? '')}</row>`;
  });
  const header = HEADERS.map((label, column) => textCell(`${'ABCDEFG'[column]}1`, label, ' s="1"')).join('');
  const range = `A1:G${rows.length + 1}`;
  return `${XML}<worksheet xmlns="${SHEET_NS}"><dimension ref="${range}"/>
    <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
    <cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="3" width="16" customWidth="1"/>
      <col min="4" max="5" width="24" customWidth="1"/><col min="6" max="6" width="20" customWidth="1"/>
      <col min="7" max="7" width="42" customWidth="1"/></cols>
    <sheetData><row r="1">${header}</row>${rows.join('')}</sheetData><autoFilter ref="${range}"/>
  </worksheet>`;
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
const DOS_DATE = 33; // 1 January 1980, the first representable ZIP timestamp.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Write ZIP records using the stored method for this fixed set of XML parts. */
function zipWorkbook(parts: Record<string, string>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files = Object.entries(parts).map(([path, xml]) => ({ name: encoder.encode(path), bytes: encoder.encode(xml) }));
  const centralStart = files.reduce((size, file) => size + LOCAL_HEADER + file.name.length + file.bytes.length, 0);
  const centralSize = files.reduce((size, file) => size + CENTRAL_HEADER + file.name.length, 0);
  const archive = new Uint8Array(centralStart + centralSize + END_RECORD);
  const view = new DataView(archive.buffer);
  let local = 0;
  let central = centralStart;

  for (const { name, bytes } of files) {
    const checksum = crc32(bytes);
    view.setUint32(local, 0x04034b50, true);
    view.setUint16(local + 4, 10, true);
    view.setUint16(local + 12, DOS_DATE, true);
    view.setUint32(local + 14, checksum, true);
    view.setUint32(local + 18, bytes.length, true);
    view.setUint32(local + 22, bytes.length, true);
    view.setUint16(local + 26, name.length, true);
    archive.set(name, local + LOCAL_HEADER);
    archive.set(bytes, local + LOCAL_HEADER + name.length);

    view.setUint32(central, 0x02014b50, true);
    view.setUint16(central + 4, 20, true);
    view.setUint16(central + 6, 10, true);
    view.setUint16(central + 14, DOS_DATE, true);
    view.setUint32(central + 16, checksum, true);
    view.setUint32(central + 20, bytes.length, true);
    view.setUint32(central + 24, bytes.length, true);
    view.setUint16(central + 28, name.length, true);
    view.setUint32(central + 42, local, true);
    archive.set(name, central + CENTRAL_HEADER);

    local += LOCAL_HEADER + name.length + bytes.length;
    central += CENTRAL_HEADER + name.length;
  }

  view.setUint32(central, 0x06054b50, true);
  view.setUint16(central + 8, files.length, true);
  view.setUint16(central + 10, files.length, true);
  view.setUint32(central + 12, centralSize, true);
  view.setUint32(central + 16, centralStart, true);
  return archive;
}

export function buildTransactionsXlsx(transactions: readonly TransactionWithDetails[]): Uint8Array<ArrayBuffer> {
  if (transactions.length + 1 > MAX_WORKSHEET_ROWS) {
    throw new Error('Jumlah transaksi melebihi kapasitas satu lembar Excel.');
  }

  return zipWorkbook({ ...WORKBOOK_PARTS, 'xl/worksheets/sheet1.xml': createWorksheet(transactions) });
}
