export function parseMoneyNumber(n: number | string | undefined): number {
  const cleaned =
    typeof n === 'string' ? n.replace(/,/g, '').trim() : String(n ?? '')
  const parsed = parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export function isValidMoneyInput(n: number | string | undefined): boolean {
  if (typeof n === 'number') return Number.isFinite(n)
  const cleaned = String(n ?? '')
    .replace(/,/g, '')
    .trim()
  if (!cleaned) return false
  return /^-?(?:\d+|\d*\.\d+)$/.test(cleaned)
}

export function roundMoneyHalfUp2(value: number): number {
  const sign = value < 0 ? -1 : 1
  return (Math.floor(Math.abs(value) * 100 + 0.5) / 100) * sign
}

/** 2位小数，HALF_UP，可选千分位。 */
export function formatMoney2(
  n: number | string | undefined,
  opts?: { useGrouping?: boolean },
): string {
  const rounded = roundMoneyHalfUp2(parseMoneyNumber(n))
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: opts?.useGrouping !== false,
  })
}
