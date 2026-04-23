import type { DashboardApiPayload } from '../types/dashboard'
import type { ChartData } from 'chart.js'

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 与 `js/dashboard.js` `shouldAggregateByMonth` 一致：
 * - `currentRangeType === 'year'`（本年至今日 / 去年整年 等）→ 按月份
 * - 或跨越月份数 ≥ 3
 */
export function shouldAggregateByMonth(
  startYmd: string,
  endYmd: string,
  currentRangeType: 'year' | null = null,
): boolean {
  if (currentRangeType === 'year') return true
  try {
    const start = parseYmd(startYmd)
    const end = parseYmd(endYmd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return false
    }
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    const monthSpan =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      1
    return monthSpan >= 3
  } catch {
    return false
  }
}

/** 与图表「按日」X 轴顺序一致，供 card point 细调对齐。 */
export function listYmdInClosedRange(
  startYmd: string,
  endYmd: string,
): string[] {
  const start = parseYmd(startYmd)
  const end = parseYmd(endYmd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  const all: string[] = []
  const c = new Date(start)
  while (c <= end) {
    all.push(formatYmd(c))
    c.setDate(c.getDate() + 1)
  }
  return all
}

function earningsMultiplierForChart(data: DashboardApiPayload): number {
  const ownershipPercentage =
    parseFloat(String(data?.ownership_percentage ?? 0)) || 0
  const groupEquityPercentage =
    parseFloat(String(data?.group_equity_percentage ?? 0)) || 0
  const groupAccountPercentage =
    parseFloat(String(data?.group_account_percentage ?? 0)) || 0
  const hasGroupOwnership = !!data?.has_group_ownership
  const directPct = ownershipPercentage / 100
  if (directPct > 0) return directPct
  if (hasGroupOwnership) {
    return (groupEquityPercentage / 100) * (groupAccountPercentage / 100)
  }
  return 0
}

const LINE = {
  profit: { b: 'rgb(59, 130, 246)', f: 'rgba(59, 130, 246, 0.12)' },
  expenses: { b: 'rgb(239, 68, 68)', f: 'rgba(239, 68, 68, 0.12)' },
  net: { b: 'rgb(16, 185, 129)', f: 'rgba(16, 185, 129, 0.12)' },
  earnings: { b: 'rgb(245, 158, 11)', f: 'rgba(245, 158, 11, 0.12)' },
} as const

/**
 * 与 `js/dashboard.js` `updateChart` 主线路一致；按日细调在 `refineChartDataWithCardPoints` 中补全。
 */
export function buildTrendChartData(
  data: DashboardApiPayload,
  startYmd: string,
  endYmd: string,
  currentRangeType: 'year' | null = null,
): ChartData<'line'> {
  const emul = earningsMultiplierForChart(data)
  const daily = data.daily_data || {}
  const exp = daily.expenses && typeof daily.expenses === 'object' ? daily.expenses : {}
  const prof = daily.profit && typeof daily.profit === 'object' ? daily.profit : {}
  const strict = daily.profit_payment_flow_daily &&
      typeof daily.profit_payment_flow_daily === 'object'
    ? (daily.profit_payment_flow_daily as Record<string, number | string>)
    : null

  const profit: number[] = []
  const expenses: number[] = []
  const net: number[] = []
  const earn: number[] = []
  const labels: string[] = []
  const start = parseYmd(startYmd)
  const end = parseYmd(endYmd)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  const aggregate = shouldAggregateByMonth(startYmd, endYmd, currentRangeType)

  if (aggregate) {
    const months: { year: number; month: number; key: string }[] = []
    const cur = new Date(start)
    while (cur <= end) {
      const y = cur.getFullYear()
      const m = cur.getMonth() + 1
      const monthKey = `${y}-${String(m).padStart(2, '0')}`
      months.push({ year: y, month: m, key: monthKey })
      cur.setMonth(cur.getMonth() + 1)
    }
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    for (const { year, month } of months) {
      let mExp = 0
      let mProf = 0
      const lastDay = new Date(year, month, 0).getDate()
      for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const dateObj = parseYmd(dateStr)
        if (dateObj < start || dateObj > end) continue
        const pRaw = parseFloat(String(prof[dateStr] ?? 0)) || 0
        const eRaw = parseFloat(String(exp[dateStr] ?? 0)) || 0
        const hasStrict = strict && Object.prototype.hasOwnProperty.call(strict, dateStr)
        const sProf = hasStrict
          ? parseFloat(String(strict![dateStr] ?? 0)) || 0
          : pRaw
        mProf += sProf
        mExp += eRaw > 0 ? -eRaw : eRaw
      }
      const monthLabel = monthNames[month - 1] ?? String(month)
      labels.push(monthLabel)
      profit.push(mProf)
      expenses.push(mExp)
      const np = mProf + mExp
      net.push(np)
      earn.push(np * emul)
    }
  } else {
    const all = listYmdInClosedRange(startYmd, endYmd)
    for (const dateStr of all) {
      const pD = parseFloat(String(prof[dateStr] ?? 0)) || 0
      const eD = parseFloat(String(exp[dateStr] ?? 0)) || 0
      const disP = pD
      const disE = eD > 0 ? -eD : eD
      const np = disP + disE
      const d = new Date(dateStr)
      labels.push(`${d.getDate()}/${d.getMonth() + 1}`)
      profit.push(disP)
      expenses.push(disE)
      net.push(np)
      earn.push(np * emul)
    }
  }

  const mk = (label: string, d: number[], k: keyof typeof LINE) => ({
    label,
    data: d,
    borderColor: LINE[k].b,
    backgroundColor: LINE[k].f,
    fill: true,
    tension: 0.4,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 6,
  })

  return {
    labels,
    datasets: [
      mk('Profit', profit, 'profit'),
      mk('Expenses', expenses, 'expenses'),
      mk('NET PROFIT', net, 'net'),
      mk('Earnings', earn, 'earnings'),
    ],
  }
}
