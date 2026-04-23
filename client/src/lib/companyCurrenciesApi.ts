import { apiFetch, apiUrl } from './api'
import type { ApiResult } from '../types/api'

export type CompanyCurrency = { id?: number; code: string }

const LS_ORDER_GLOBAL = 'dashboard_currency_order_global'

function orderCodes(
  raw: CompanyCurrency[],
  orderFromServer: string[] | null,
  companyId: number,
): CompanyCurrency[] {
  let saved: string | null = null
  if (orderFromServer && orderFromServer.length > 0) {
    saved = JSON.stringify(orderFromServer)
  } else {
    try {
      const k = 'dashboard_currency_order_' + companyId
      saved =
        localStorage.getItem(k) || localStorage.getItem(LS_ORDER_GLOBAL)
    } catch {
      saved = null
    }
  }
  if (!saved) return raw
  try {
    const order = JSON.parse(saved) as unknown
    if (!Array.isArray(order) || order.length === 0) return raw
    const normalized: string[] = []
    for (const code of order) {
      const upper = String(code || '')
        .trim()
        .toUpperCase()
      if (!upper || normalized.includes(upper)) continue
      normalized.push(upper)
    }
    const by = new Map(raw.map((c) => [String(c.code).toUpperCase(), c]))
    const out: CompanyCurrency[] = []
    for (const u of normalized) {
      const c = by.get(u)
      if (c) {
        out.push(c)
        by.delete(u)
      }
    }
    by.forEach((c) => out.push(c))
    return out
  } catch {
    return raw
  }
}

export async function fetchOrderedCompanyCurrencies(
  companyId: number,
): Promise<CompanyCurrency[]> {
  const [curRes, orderRes] = await Promise.all([
    apiFetch(
      apiUrl(
        `/api/transactions/get_company_currencies_api.php?company_id=${encodeURIComponent(
          String(companyId),
        )}`,
      ),
    ),
    apiFetch('/api/transactions/user_currency_order_api.php').catch(() => null),
  ])
  const curJson: ApiResult<CompanyCurrency[]> = await curRes.json()
  if (!curJson.success || !Array.isArray(curJson.data) || curJson.data.length === 0) {
    return []
  }
  let order: string[] | null = null
  if (orderRes?.ok) {
    try {
      const o: ApiResult<{ order: string[] | null }> = await orderRes.json()
      if (o.success && o.data && Array.isArray(o.data.order)) {
        order = o.data.order
      }
    } catch {
      /* ignore */
    }
  }
  return orderCodes(curJson.data, order, companyId)
}
