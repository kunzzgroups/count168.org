import { apiFetch, apiUrl } from './api'

export type ProcessListPermission = 'Games' | 'Bank'

/** Games 列表行（`processlist_api.php` getProcesses） */
export type GamesProcessRow = {
  id: number
  process_name: string
  description?: string | null
  status?: string | null
  currency?: string | null
  day_use?: string | null
  has_transactions?: boolean
}

/** Bank 列表行（`processlist_api.php` getBankProcesses） */
export type BankProcessRow = {
  id: number
  supplier?: string
  country?: string
  bank?: string
  types?: string
  card_lower?: string
  contract?: string
  insurance?: string | number | null
  customer?: string
  cost?: string | number | null
  price?: string | number | null
  profit?: string | number | null
  status?: string | null
  issue_flag?: string | null
  date?: string | null
  day_start?: string | null
  day_end?: string | null
  has_transactions?: boolean
}

export type ProcessListFetchFilters = {
  search: string
  /** Games：对应 API showInactive */
  showInactive: boolean
  /** Games/Bank：对应 legacy「Show All」（Games 下 API showAll；Bank 下仅影响是否分页） */
  showAll: boolean
  showOfficial: boolean
  showEInvoice: boolean
  showBlock: boolean
}

function buildListUrl(
  companyId: number,
  permission: ProcessListPermission,
  filters: ProcessListFetchFilters,
): string {
  const u = new URL(apiUrl('/api/processes/processlist_api.php'))
  u.searchParams.set('company_id', String(companyId))
  u.searchParams.set('permission', permission)
  const q = filters.search.trim()
  if (q) u.searchParams.set('search', q)

  if (permission === 'Bank') {
    u.searchParams.set('showAll', '1')
  } else {
    if (filters.showInactive) u.searchParams.set('showInactive', '1')
    if (filters.showAll) u.searchParams.set('showAll', '1')
  }
  return u.toString()
}

export async function fetchProcessListRows(
  companyId: number,
  permission: ProcessListPermission,
  filters: ProcessListFetchFilters,
): Promise<{ ok: true; rows: GamesProcessRow[] | BankProcessRow[] } | { ok: false; message: string }> {
  const url = buildListUrl(companyId, permission, filters)
  const res = await apiFetch(url, { credentials: 'include', cache: 'no-cache' })
  if (!res.ok) {
    return { ok: false, message: `HTTP ${res.status}` }
  }
  const json = (await res.json()) as {
    success?: boolean
    message?: string
    error?: string
    data?: unknown
  }
  if (!json.success) {
    return {
      ok: false,
      message: String(json.message || json.error || 'Request failed'),
    }
  }
  const data = Array.isArray(json.data) ? json.data : []
  return { ok: true, rows: data as GamesProcessRow[] | BankProcessRow[] }
}
