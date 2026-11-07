// src/lib/currency.ts

/**
 * Format a number to Indonesian Rupiah representation: "Rp 125.000" or "-Rp 50.000"
 */
export function formatRupiah(amount: number | null | undefined, showSign = false): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Rp 0';
  }

  const isNegative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (showSign) {
    if (amount > 0) return `+Rp ${formatted}`;
    if (amount < 0) return `-Rp ${formatted}`;
  }

  return (isNegative ? '-Rp ' : 'Rp ') + formatted;
}

/**
 * Parse an Indonesian rupiah string into a raw integer
 */
export function parseRupiah(str: string): number {
  const clean = str.replace(/[^0-9-]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

