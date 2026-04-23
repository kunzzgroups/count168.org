import type { ChartData } from 'chart.js'
import type { DashboardApiPayload } from '../types/dashboard'
import { fetchDashboardCardPoint } from './fetchDashboardCardPoint'

/**
 * 与 `js/dashboard.js` `updateChart` 中 `fetchCardPointByDate` 段一致：
 * 仅当非按月、无 Group 筛选、且为单公司视图时由上层调用。
 */
export function collectKeyYmd(
  ymdInRange: string[],
  daily: DashboardApiPayload['daily_data'] | undefined,
): string[] {
  const datesSet = new Set(ymdInRange)
  const keyDatesSet = new Set<string>()
  const cap = daily?.capital
  const exp = daily?.expenses
  const prof = daily?.profit
  if (cap && typeof cap === 'object') {
    for (const d of Object.keys(cap)) {
      if (datesSet.has(d)) keyDatesSet.add(d)
    }
  }
  if (exp && typeof exp === 'object') {
    for (const d of Object.keys(exp)) {
      if (datesSet.has(d)) keyDatesSet.add(d)
    }
  }
  if (prof && typeof prof === 'object') {
    for (const d of Object.keys(prof)) {
      if (datesSet.has(d)) keyDatesSet.add(d)
    }
  }
  if (ymdInRange.length) {
    keyDatesSet.add(ymdInRange[0]!)
    keyDatesSet.add(ymdInRange[ymdInRange.length - 1]!)
  }
  return Array.from(keyDatesSet).sort()
}

export async function refineChartDataWithCardPoints(
  base: ChartData<'line'>,
  payload: DashboardApiPayload,
  ymdInRange: string[],
  companyId: number,
  currency: string,
): Promise<ChartData<'line'>> {
  const ownershipPercentage =
    parseFloat(String(payload?.ownership_percentage ?? 0)) || 0
  const keyDates = collectKeyYmd(ymdInRange, payload.daily_data)
  if (keyDates.length === 0) return base

  const results = await Promise.allSettled(
    keyDates.map((d) => fetchDashboardCardPoint(d, companyId, currency)),
  )
  const pointMap = new Map<string, { profit: number; expenses: number }>()
  for (let i = 0; i < results.length; i++) {
    const item = results[i]!
    if (item.status === 'fulfilled' && item.value) {
      pointMap.set(keyDates[i]!, item.value)
    }
  }

  const datasets = base.datasets.map((d) => ({
    ...d,
    data: [...(d.data as number[])],
  }))

  for (let i = 0; i < ymdInRange.length; i++) {
    const dateKey = ymdInRange[i]!
    if (!pointMap.has(dateKey)) continue
    const p = pointMap.get(dateKey)!
    const prof = p.profit
    const exp = p.expenses
    const net = prof + exp
    ;(datasets[0]!.data as number[])[i] = prof
    ;(datasets[1]!.data as number[])[i] = exp
    ;(datasets[2]!.data as number[])[i] = net
    ;(datasets[3]!.data as number[])[i] = net * (ownershipPercentage / 100)
  }

  return { ...base, datasets }
}
