/** Use one shared scale so chart bar heights remain proportional to their values. */
export function getTrendBarHeight(amount: number, maxAmount: number, maxHeight = 70): number {
  if (!Number.isFinite(amount) || !Number.isFinite(maxAmount) || !Number.isFinite(maxHeight)
    || amount <= 0 || maxAmount <= 0 || maxHeight <= 0) {
    return 0;
  }
  return Math.min(amount / maxAmount, 1) * maxHeight;
}
