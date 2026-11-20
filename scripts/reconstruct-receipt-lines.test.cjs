const assert = require('node:assert/strict');
const { test } = require('node:test');

const modulePath = '../src/lib/reconstructReceiptLines.ts';

function at(text, x, y, width = 28, height = 10) {
  return { text, boundingBox: { x, y, width, height } };
}

test('pairs separate label and amount blocks by row even when they arrive out of order', async () => {
  const { reconstructReceiptLines } = await import(modulePath);
  const labels = [at('TUNAI', 14, 41), at('TOTAL', 14, 21), at('KEMBALI', 14, 61)];
  const amounts = [at('20.000', 150, 23), at('5.000', 155, 61), at('25.000', 150, 39)];

  assert.deepEqual(reconstructReceiptLines({ blocks: [{ lines: amounts }, { lines: labels }] }),
    ['TOTAL 20.000', 'TUNAI 25.000', 'KEMBALI 5.000']);
});

test('keeps unrelated amounts with distinct vertical centers on separate rows', async () => {
  const { reconstructReceiptLines } = await import(modulePath);
  const result = { blocks: [
    { lines: [at('TUNAI', 0, 12, 35), at('KEMBALI', 0, 37, 46)] },
    { lines: [at('70.000', 90, 22), at('15.000', 90, 39)] },
  ] };

  assert.deepEqual(reconstructReceiptLines(result), ['TUNAI', '70.000', 'KEMBALI 15.000']);
});

function rotated(text, x, y, degrees, width = 28, height = 12) {
  const angle = degrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const actualWidth = Math.abs(cos) * width + Math.abs(sin) * height;
  const actualHeight = Math.abs(sin) * width + Math.abs(cos) * height;
  return at(text, x * cos - y * sin + 300 - actualWidth / 2,
    x * sin + y * cos + 300 - actualHeight / 2, actualWidth, actualHeight);
}

test('uses element positions to deskew price columns and handle quarter-turns', async () => {
  const { reconstructReceiptLines } = await import(modulePath);

  for (const rotation of [8, 90, -90, 180]) {
    const result = { blocks: [
      { lines: [
        rotated('40.000', 235, 140, rotation),
        rotated('75.000', 235, 165, rotation),
        rotated('35.000', 235, 190, rotation),
      ] },
      { lines: [
        { text: 'TOTAL BAYAR', elements: [rotated('TOTAL', 25, 140, rotation), rotated('BAYAR', 65, 140, rotation)] },
        { text: 'BAYAR TUNAI', elements: [rotated('BAYAR', 25, 165, rotation), rotated('TUNAI', 65, 165, rotation)] },
        { text: 'UANG KEMBALI', elements: [rotated('UANG', 25, 190, rotation), rotated('KEMBALI', 65, 190, rotation)] },
      ] },
    ] };

    assert.deepEqual(reconstructReceiptLines(result), ['TOTAL BAYAR 40.000', 'BAYAR TUNAI 75.000', 'UANG KEMBALI 35.000']);
  }
});

test('uses available box levels and leaves text-only recognition to the caller', async () => {
  const { reconstructReceiptLines } = await import(modulePath);
  const result = { blocks: [
    at('TOTAL', 12, 20),
    { lines: [{ text: '50.000', elements: [at('50.000', 140, 20)] }] },
    { lines: [{ text: 'invalid box', boundingBox: { x: 0, y: 0, width: Infinity, height: -5 } }] },
  ] };

  assert.deepEqual(reconstructReceiptLines(result), ['TOTAL 50.000']);
  assert.deepEqual(reconstructReceiptLines({ text: 'TOTAL 50.000', blocks: [{ text: 'TOTAL 50.000' }] }), []);
});

test('keeps an upright receipt when multiword side text runs vertically', async () => {
  const { reconstructReceiptLines } = await import(modulePath);
  const result = { blocks: [
    { lines: [at('TOTAL', 10, 20), at('TUNAI', 10, 40), at('KEMBALI', 10, 60)] },
    { lines: [at('37.000', 120, 20), at('50.000', 120, 40), at('13.000', 120, 60)] },
    { lines: [
      { text: 'PROMO TOKO', elements: [rotated('PROMO', 20, 40, 90), rotated('TOKO', 65, 40, 90)] },
      { text: 'PELANGGAN BARU', elements: [rotated('PELANGGAN', 20, 55, 90), rotated('BARU', 65, 55, 90)] },
    ] },
  ] };

  assert.deepEqual(reconstructReceiptLines(result), ['TOTAL 37.000', 'TUNAI 50.000', 'KEMBALI 13.000']);
});
