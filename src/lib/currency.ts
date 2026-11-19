// src/lib/currency.ts

/**
 * Format a number to Indonesian Rupiah representation: "Rp 125.000" or "-Rp 50.000"
 */
export function formatRupiah(amount: number | null | undefined, showSign = false): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return 'Rp 0';
  }

  const abs = Math.round(Math.abs(amount));
  const isNegative = amount < 0 && abs > 0;
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (showSign) {
    if (abs > 0) return `${isNegative ? '-' : '+'}Rp ${formatted}`;
  }

  return (isNegative ? '-Rp ' : 'Rp ') + formatted;
}

/**
 * Parse an Indonesian rupiah string into a raw integer
 */
export function parseRupiah(str: string): number {
  return parseRupiahInput(str) ?? 0;
}

/** Parse whole Rupiah without silently truncating malformed or fractional input. */
export function parseRupiahInput(value: string): number | null {
  let text = value.trim();
  if (!text) return null;

  let sign = 1;
  let hasSign = false;
  const consumeSign = () => {
    if (text[0] !== '-' && text[0] !== '+') return true;
    if (hasSign) return false;
    hasSign = true;
    sign = text[0] === '-' ? -1 : 1;
    text = text.slice(1).trimStart();
    return true;
  };

  consumeSign();
  text = text.replace(/^Rp\.?\s*/i, '');
  if (!consumeSign()) return null;

  // A period separates thousands; only a zero sen suffix is accepted.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,00)?$/.test(text)) return null;
  const amount = Number(text.replace(/\./g, '').replace(/,00$/, ''));
  if (!Number.isSafeInteger(amount)) return null;
  return amount === 0 ? 0 : sign * amount;
}
