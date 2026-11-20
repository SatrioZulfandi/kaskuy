const assert = require('node:assert/strict');
const test = require('node:test');

const parser = import('../src/lib/parseReceipt.ts');

test('recovers a date with missing separators when layout retains the transaction time', async () => {
  const { parseReceipt } = await parser;
  const raw = 'INDOMARET\n17 08 24-09:35/SAMPLE\nTOTAL 15000';
  const reconstructedLines = raw.split('\n');

  assert.equal(parseReceipt(raw).date, null);
  assert.equal(parseReceipt(raw, { corrections: false, reconstructedLines }).date, null);
  assert.equal(parseReceipt(raw, { reconstructedLines }).date, '2024-08-17');
});

test('requires a valid date and clock at the start of the line or after the date label', async () => {
  const { parseReceipt } = await parser;
  for (const line of [
    'ITEM 17 08 24-09:35',
    '17 08 24',
    '31 02 24 09:35',
    '17 08 24-25:35',
    '17 08 2409:35',
  ]) {
    assert.equal(parseReceipt(line, { reconstructedLines: [line] }).date, null);
  }

  const dated = 'Tanggal: 17 08 2024 09:35';
  assert.equal(parseReceipt(dated, { reconstructedLines: [dated] }).date, '2024-08-17');
});
test('store-owned footer context supplies a missing merchant without replacing a printed name', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const indomaret = ['KONTAKQJNDOMARET.C0.ID', 'BELANJA LEBIH MUDAH DI KLIKINDOMARE'];
  const alfamart = ['STRUK ANDA DIKIRIM KE APLIKASI ALFAGIFT'];
  assert.equal(parseReceipt('', { reconstructedLines: indomaret }).merchant, 'Indomaret');
  assert.equal(parseReceipt('', { reconstructedLines: alfamart }).merchant, 'Alfamart');
  assert.equal(parseReceipt('', { reconstructedLines: [...indomaret, ...alfamart] }).merchant, null);
  assert.equal(parseReceipt('Alfamidi', { reconstructedLines: alfamart }).merchant, 'Alfamidi');
});
