export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) {
    return '$0.00'
  }

  const absValue = Math.abs(value)

  if (absValue === 0) {
    return '$0.00'
  }

  const fractionDigits = absValue < 0.01 ? 6 : absValue < 1 ? 4 : 2

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}