import { reconstructReceiptLines } from './reconstructReceiptLines';

export function readReceiptOcr(result: unknown) {
  const rawText = result !== null && typeof result === 'object' && 'text' in result && typeof result.text === 'string'
    ? result.text
    : (JSON.stringify(result, null, 2) ?? '');

  return { rawText, reconstructedLines: reconstructReceiptLines(result) };
}
