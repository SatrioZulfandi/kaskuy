// scripts/testParser.ts
// Jalankan dari folder proyek:
//   node --experimental-strip-types scripts/testParser.ts
// (alternatif: npx tsx scripts/testParser.ts)

// @ts-ignore - ekstensi .ts diperlukan agar bisa dijalankan langsung oleh Node
import { parseReceipt } from '../src/lib/parseReceipt.ts';

type Case = {
  name: string;
  text: string;
  expect: {
    merchant: string | null;
    date: string | null;
    total: number | null;
    needsConfirmation: boolean;
  };
};

// Teks di bawah adalah hasil OCR asli dari HP (foto struk Indomaret dan Alfamart).
const cases: Case[] = [
  {
    name: 'Indomaret (foto jelas)',
    text: [
      'GRATIS ONGKIR 1 JAM SAMPAI',
      'BELANJA LEBIH MUDAH DI KLIKINDOMARET',
      'KONTAK\u25A1INDO%ARET.CO.ID',
      'SMS/WA 0811.1500.280 TELP 1500280',
      'LAYANAN KONSUMEN',
      'HARGA JUAL: 18,378',
      'FON',
      ': DPP= 16,847 PPN= 2,022',
      'KE MBALI :',
      '79,600',
      'TUNAI:',
      '100,000',
      'TOTAL BELANJA :',
      '20,400',
      '490TA SEAWEED 1156',
      '1 16500',
      '16,500',
      'RGUA AIR MIN 600 ML',
      '1',
      '3900',
      '3,900',
      '30.09.26-14:47/4.5.0/125U-949372/HUHAM/',
      '0:',
      'KEC, JATI SANPURNA, KOTA BEKASI, 17432',
      'JL RY KRAMAT SANCENG RIZ/6.KEL.',
      'JATIRANGGUH',
      'JATI RANGEO 3',
      'NPWP 001337 9946-092.000',
      'AkaF TA UTARA',
      'GEDUNG MEARA',
      'PANTAL INDAHIPUR',
      'iNDOMARET BOULEVAR',
      'PNOMARLPRIG1AA4A',
    ].join('\n'),
    expect: { merchant: 'Indomaret', date: '2026-09-30', total: 20400, needsConfirmation: false },
  },
  {
    name: 'Alfamart (foto kecil/buram)',
    text: [
      'JL, RAYA RAWA DoLLAR RUKO EILU',
      'NPWP : 74. 170.1e6. 6-447.00',
      'LRAYA RAWA DOLLAR AUKU B I\u0118 JATI SAMPU',
      'On',
      'PT. SUMEER ALFARIA TRLJAYA, TBK',
      'RAWA DOLLAR [RADo]',
      'JDE2-567-23093W9E Kaslr DIAZ F',
      'SoSRO CRI 458AL',
      'unal',
      'ot:al Iicm',
      'edlla',
      'PP:',
      '1 7, 708',
      '6, S36 PPN.',
      '7,700',
      '7,74',
      '1e,800',
      '2,306',
      '23-09-2026 08:05:02 V.2020 7.2',
    ].join('\n'),
    // Total 7.700 diambil dari angka pertama (perkiraan), jadi pengguna HARUS konfirmasi.
    // Tunai asli 10.000 dan kembali asli 2.300 terbaca salah oleh OCR (catatan untuk evaluasi).
    expect: { merchant: 'Alfamart', date: '2026-09-23', total: 7700, needsConfirmation: true },
  },
];

let failed = 0;

for (const c of cases) {
  const r = parseReceipt(c.text);
  console.log(`\n=== ${c.name} ===`);
  console.log(JSON.stringify(r, null, 2));

  const checks: [string, unknown, unknown][] = [
    ['merchant', r.merchant, c.expect.merchant],
    ['date', r.date, c.expect.date],
    ['total', r.total, c.expect.total],
    ['needsConfirmation', r.needsConfirmation, c.expect.needsConfirmation],
  ];
  for (const [field, got, want] of checks) {
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? 'OK  ' : 'GAGAL'} ${field}: dapat=${JSON.stringify(got)} harapan=${JSON.stringify(want)}`);
  }
}

console.log(failed === 0 ? '\nSemua pemeriksaan lolos.' : `\n${failed} pemeriksaan gagal.`);
process.exit(failed === 0 ? 0 : 1);
