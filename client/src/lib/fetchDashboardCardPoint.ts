import { apiFetch, apiUrl } from './api'
import type { ApiResult } from '../types/api'
import type { DashboardApiPayload } from '../types/dashboard'

export type DayCardPoint = { profit: number; expenses: number }

const cache = new Map<string, DayCardPoint>()

/**
 * 与 `js/dashboard.js` `fetchCardPointByDate` 一致：单日、无 `view_group`。
 * 使用 period_total 口径 profit / expenses。
 */
export async function fetchDashboardCardPoint(
  ymd: string,
  companyId: number,
  currency: string,
): Promise<DayCardPoint> {
  const key = `${companyId}|${currency || ''}|${ymd}`
  const hit = cache.get(key)
  if (hit) return hit

  const q = new URLSearchParams({
    date_from: ymd,
    date_to: ymd,
    company_id: String(companyId),
  })
  if (currency) q.set('currency', currency)

  const res = await apiFetch(
    apiUrl('/api/transactions/dashboard_api.php?' + q.toString()),
  )
  if (!res.ok) {
    throw new Error('HTTP ' + res.status)
  }
  const json: ApiResult<DashboardApiPayload> = await res.json()
  if (!json.success || !json.data) {
    throw new Error(json.message || json.error || 'Invalid payload')
  }
  const d = json.data
  const rawProfit =
    parseFloat(String(d?.period_total?.profit ?? d.profit)) || 0
  const rawExpenses =
    parseFloat(String(d?.period_total?.expenses ?? d.expenses)) || 0
  const point: DayCardPoint = {
    profit: rawProfit,
    expenses: rawExpenses > 0 ? -rawExpenses : rawExpenses,
  }
  cache.set(key, point)
  return point
}
