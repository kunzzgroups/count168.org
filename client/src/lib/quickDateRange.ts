/** 与 `js/dashboard.js` `selectQuickRange` 的日期与 `currentRangeType` 一致。 */

export type QuickRangeId =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const QUICK_RANGE_LABEL: Record<QuickRangeId, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  lastWeek: 'Last Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisYear: 'This Year',
  lastYear: 'Last Year',
}

/**
 * @returns from/to (YYYY-MM-DD) 与 currentRangeType（本年至今/去年 整年 → 'year'，否则 null）
 */
export function computeQuickDateRange(
  range: QuickRangeId,
  todayInput: Date = new Date(),
): { from: string; to: string; currentRangeType: 'year' | null } {
  const today = new Date(todayInput)
  today.setHours(0, 0, 0, 0)
  let startDate: Date
  let endDate: Date
  let currentRangeType: 'year' | null = null

  switch (range) {
    case 'today':
      startDate = new Date(today)
      endDate = new Date(today)
      break
    case 'yesterday': {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      startDate = y
      endDate = y
      break
    }
    case 'thisWeek': {
      const w = new Date(today)
      const dow = w.getDay()
      const daysToMonday = dow === 0 ? 6 : dow - 1
      w.setDate(w.getDate() - daysToMonday)
      startDate = w
      endDate = new Date(today)
      break
    }
    case 'lastWeek': {
      const lastWeekEnd = new Date(today)
      const d = lastWeekEnd.getDay()
      const toLastSun = d === 0 ? 0 : d
      lastWeekEnd.setDate(lastWeekEnd.getDate() - toLastSun - 1)
      const lastWeekStart = new Date(lastWeekEnd)
      lastWeekStart.setDate(lastWeekStart.getDate() - 6)
      startDate = lastWeekStart
      endDate = lastWeekEnd
      break
    }
    case 'thisMonth':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1)
      endDate = new Date(today)
      break
    case 'lastMonth':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      endDate = new Date(today.getFullYear(), today.getMonth(), 0)
      break
    case 'thisYear':
      startDate = new Date(today.getFullYear(), 0, 1)
      endDate = new Date(today)
      currentRangeType = 'year'
      break
    case 'lastYear':
      startDate = new Date(today.getFullYear() - 1, 0, 1)
      endDate = new Date(today.getFullYear() - 1, 11, 31)
      currentRangeType = 'year'
      break
    default: {
      const _ex: never = range
      return _ex
    }
  }

  return {
    from: formatYmd(startDate),
    to: formatYmd(endDate),
    currentRangeType,
  }
}
