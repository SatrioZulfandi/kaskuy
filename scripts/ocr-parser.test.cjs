const assert = require('node:assert/strict');
const { test } = require('node:test');

async function parseBoth(text) {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  return {
    baseline: parseReceipt(text, { corrections: false }),
    corrected: parseReceipt(text),
  };
}

test('both modes extract identical values from clear labeled text', async () => {
  const { baseline, corrected } = await parseBoth([
    'INDOMARET', '18/11/2024', 'TOTAL BELANJA:', 'Rp 23.500,00',
    'TUNAI: 50.000', 'KE MBALI: 26.500',
  ].join('\n'));

  assert.deepEqual(baseline, corrected);
  assert.equal(baseline.merchant, 'Indomaret');
  assert.equal(baseline.date, '2024-11-18');
  assert.equal(baseline.total, 23500);
  assert.equal(baseline.tunai, 50000);
  assert.equal(baseline.kembali, 26500);
  assert.equal(baseline.arithmeticOk, true);
});

test('only corrected mode repairs a misspelled merchant and confusable amount digits', async () => {
  const { baseline, corrected } = await parseBoth('INDOMRET\n18/11/2024\nTOTAL 23.5O0');

  assert.equal(baseline.merchant, null);
  assert.equal(baseline.total, null);
  assert.deepEqual(baseline.amountCandidates, []);
  assert.equal(corrected.merchant, 'Indomaret');
  assert.equal(corrected.total, 23500);
  assert.equal(corrected.date, baseline.date);
});

test('only corrected mode infers a missing total from consistent amounts', async () => {
  const { baseline, corrected } = await parseBoth('ALFAMART\n23.500\nTUNAI 50.000\nKEMBALI 26.500');

  assert.equal(baseline.total, null);
  assert.equal(baseline.tunai, 50000);
  assert.equal(baseline.kembali, 26500);
  assert.equal(baseline.arithmeticOk, null);
  assert.equal(corrected.total, 23500);
  assert.equal(corrected.arithmeticOk, true);
});

test('only corrected mode suggests a solitary unlabeled amount for confirmation', async () => {
  const { baseline, corrected } = await parseBoth('ALFAMART\n18/11/2024\n27.500');

  assert.equal(baseline.total, null);
  assert.equal(corrected.total, 27500);
  assert.equal(corrected.confidence, 'low');
  assert.equal(corrected.needsConfirmation, true);
});

test('separated payment columns select the settlement near the end and keep zero or short change', async () => {
  for (const [cash, change] of [['Rp 23.500', '0'], ['23, 800', '300']]) {
    const { corrected } = await parseBoth([
      'ALFAMART', '18/11/2024', 'TOTAL ITEM 3', 'TOTAL BELANJA', 'IUNAI', '2',
      'KENBALIAN', 'PPN ( 2.328)', '8.500', '15.000', '23, 500', cash, change,
    ].join('\n'));
    assert.equal(corrected.total, 23500);
    assert.equal(corrected.tunai, 23500 + Number(change));
    assert.equal(corrected.kembali, Number(change));
    assert.equal(corrected.arithmeticOk, true);
    assert.equal(corrected.needsConfirmation, true);
  }
});

test('savings and tax stay outside the cash settlement and missing change stays empty', async () => {
  const { corrected } = await parseBoth([
    'INDOMARET', 'HARGA JUAL', 'TOTAL', 'TUNAI', 'ANDA HEMAT', 'PPN: DPP=7.658 PPN=842',
    '3.100', '(1.000)', '8.500', '8.500', '8.500', '1.000',
  ].join('\n'));
  assert.equal(corrected.total, 8500);
  assert.equal(corrected.tunai, 8500);
  assert.equal(corrected.kembali, null);
  assert.equal(corrected.arithmeticOk, null);
});

test('cashless and mixed tenders preserve the total without guessing the cash column', async () => {
  const cashless = await parseBoth('TOTAL BELANJA\nSHOPEEPAY\nKEMBALI\n6.000\n6.000\n0');
  const mixed = await parseBoth('TOTAL BELANJA\nQRIS\nTUNAI\nKEMBALI\n6.000\n3.500\n2.500\n0');

  for (const { corrected } of [cashless, mixed]) {
    assert.equal(corrected.total, 6000);
    assert.equal(corrected.tunai, null);
    assert.equal(corrected.kembali, 0);
    assert.equal(corrected.arithmeticOk, null);
    assert.equal(corrected.needsConfirmation, true);
  }
});

test('unlabeled prices, tax, and pre-discount subtotal cannot fabricate a payment', async () => {
  const { corrected } = await parseBoth([
    'INDOMARET', 'SUBTOTAL 20.000', 'TOTAL ITEM 4', 'PPN 1.980', '-2.000', '8.000', '10.000', '2.000',
  ].join('\n'));
  assert.equal(corrected.total, null);
  assert.equal(corrected.tunai, null);
  assert.equal(corrected.kembali, null);
  assert.equal(corrected.needsConfirmation, true);
});

test('a labeled total accepts standard rupiah punctuation and a trailing tax-class suffix', async () => {
  const { corrected } = await parseBoth('INDOMARET\nTOTAL PEMBAYARAN Rp 21 . 500,- A\nTUNAI 25.000\nKEMBALI 3.500');
  assert.equal(corrected.total, 21500);
  assert.equal(corrected.tunai, 25000);
  assert.equal(corrected.kembali, 3500);
  assert.equal(corrected.arithmeticOk, true);
});

test('reconstructed payment rows recover a mixed payment without guessing cash order', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const raw = 'ALFAMART\nTOTAL BELANJA\nQRIS\nTUNAI\nKEMBALI\n6.000\n3.500\n2.500\n0';
  const reconstructedLines = ['TOTAL BELANJA 6.000', 'QRIS 3.500', 'TUNAI 2.500', 'KEMBALI 0'];
  assert.equal(parseReceipt(raw).tunai, null);
  const corrected = parseReceipt(raw, { reconstructedLines });
  assert.deepEqual([corrected.total, corrected.tunai, corrected.kembali], [6000, 2500, 0]);
  assert.equal(corrected.arithmeticOk, null);
  assert.deepEqual(parseReceipt(raw, { corrections: false, reconstructedLines }), parseReceipt(raw, { corrections: false }));
});

test('mismatched isolated layout amounts do not replace a reconciled cash settlement', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const raw = 'ALFAMART\nTOTAL 12.000\nTUNAI 20.000\nKEMBALI 8.000';
  assert.deepEqual(parseReceipt(raw, { reconstructedLines: ['TOTAL 21.000'] }), parseReceipt(raw));
});

test('receipt date near the transaction time takes precedence over the version date', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const raw = 'ALFAMART\nTgl. 17-06- 2020 12:30 V.2020.3.2';
  assert.equal(parseReceipt(raw, { reconstructedLines: ['Tgl. 17-06-2020 12:30'] }).date, '2020-06-17');
  assert.equal(parseReceipt('INDOMARET\n17,11.24-14:41', { reconstructedLines: ['INDOMARET', '17,11.24-14:41'] }).date, '2024-11-17');
});

test('payment arithmetic can complete a clipped total when its printed digits match', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const reconstructedLines = ['TOTAL BELANJA 31, 40', 'TUNAI 50.000', 'KEMBALIAN 18.600'];
  const corrected = parseReceipt('ALFAMART', { reconstructedLines });
  assert.deepEqual([corrected.total, corrected.tunai, corrected.kembali], [31400, 50000, 18600]);
  assert.equal(corrected.needsConfirmation, true);
});

test('a printed change label and a fully paid electronic total can establish zero', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const layout = ['TOTAL BELANJA 25.000', 'VOUCHER 25.000'];
  assert.equal(parseReceipt('ALFAMART', { reconstructedLines: layout }).kembali, null);
  const result = parseReceipt('ALFAMART', { reconstructedLines: [...layout, 'KEMBALIAN'] });
  assert.equal(result.kembali, 0);
  assert.equal(result.tunai, null);
  assert.equal(result.needsConfirmation, true);
});

test('cash change excludes an explicitly allocated top-up and can confirm the item total', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const reconstructedLines = ['TOTAL ITEM 2 31.700', 'TUNAI 40.000', 'TOP UP KEMBALIAN DOMPET 300', 'KEMBALIAN 8, 00'];
  const corrected = parseReceipt('ALFAMART', { reconstructedLines });
  assert.deepEqual([corrected.total, corrected.tunai, corrected.kembali], [31700, 40000, 8000]);
  assert.equal(corrected.arithmeticOk, true);
  assert.equal(corrected.needsConfirmation, true);
});

test('a column of shortened thousands groups cannot validate a fabricated low-value payment', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const reconstructedLines = ['TOTAL 16, 00', 'TUNAI 50, 00', 'KEMBALI 34, 00'];
  const corrected = parseReceipt('INDOMARET\n06/03/2024', { reconstructedLines });
  assert.deepEqual([corrected.total, corrected.tunai, corrected.kembali], [null, null, null]);
  assert.equal(corrected.needsConfirmation, true);
});

test('sale and total rows corroborate clipped payment labels', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const reconstructedLines = ['HAFA JUAL: 15.400', 'T0TAL: 15.400', 'UNAI: 20.000', 'KENBALI: 4.600'];
  const corrected = parseReceipt('INDOMARET', { reconstructedLines });
  assert.deepEqual([corrected.total, corrected.tunai, corrected.kembali], [15400, 20000, 4600]);
  assert.equal(corrected.needsConfirmation, true);
});

test('an independent item total and discount can restore a missing leading digit', async () => {
  const { parseReceipt } = await import('../src/lib/parseReceipt.ts');
  const reconstructedLines = ['TOTAL ITEM 2 23.500', 'TOTAL DISC 2.000', 'TOTAL BELANJA 1.500'];
  const corrected = parseReceipt('ALFAMART', { reconstructedLines });
  assert.equal(corrected.total, 21500);
  assert.equal(corrected.needsConfirmation, true);
});
