import { apiFetch, apiUrl } from './api'
import type { ApiResult } from '../types/api'
import type { OwnerCompany } from '../types/dashboard'
import type { DashboardApiPayload } from '../types/dashboard'
import { getLinkMultiplierForCompany } from './dashboardSession'

type FetchParams = {
  dateFrom: string
  dateTo: string
  companyId: number
  currency: string
  viewGroup: string | null
}

function scaleData(
  data: DashboardApiPayload,
  multiplier: number,
): DashboardApiPayload {
  if (multiplier === 1) return data
  return { ...data, _link_multiplier: multiplier }
}

export async function fetchDashboardForCompany(
  p: FetchParams,
  companies: OwnerCompany[],
): Promise<DashboardApiPayload> {
  const q = new URLSearchParams({
    date_from: p.dateFrom,
    date_to: p.dateTo,
    company_id: String(p.companyId),
  })
  if (p.currency) q.set('currency', p.currency)
  if (p.viewGroup) q.set('view_group', p.viewGroup)

  const res = await apiFetch(
    apiUrl('/api/transactions/dashboard_api.php?' + q.toString()),
  )
  if (!res.ok) {
    throw new Error('HTTP ' + res.status)
  }
  const json: ApiResult<DashboardApiPayload> = await res.json()
  if (!json.success || !json.data) {
    throw new Error(json.message || json.error || 'Failed to load')
  }
  const mul = getLinkMultiplierForCompany(
    p.companyId,
    p.viewGroup,
    companies,
  )
  return scaleData(json.data, mul) as DashboardApiPayload
}
