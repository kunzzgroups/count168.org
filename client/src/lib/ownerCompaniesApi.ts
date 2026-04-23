import { apiFetch, apiUrl } from './api'
import type { ApiResult } from '../types/api'
import type { OwnerCompany } from '../types/dashboard'

export async function fetchOwnerCompaniesList(): Promise<OwnerCompany[]> {
  const res = await apiFetch(
    '/api/transactions/get_owner_companies_api.php?all=1',
  )
  const json: ApiResult<OwnerCompany[]> = await res.json()
  if (json.success && Array.isArray(json.data)) {
    return json.data
  }
  return []
}

export async function updateSessionCompany(companyId: number): Promise<boolean> {
  const res = await apiFetch(
    apiUrl(
      `/api/session/update_company_session_api.php?company_id=${encodeURIComponent(
        String(companyId),
      )}`,
    ),
  )
  const json = await res.json()
  return !!(json && json.success === true)
}
