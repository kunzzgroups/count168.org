import { apiFetch, apiUrl } from './api'
import type { BankProcessRow, GamePermission, GamesProcessRow } from './processListTypes'

export type ApiOk<T> = { success: true; data: T; error?: string; message?: string }
export type ApiErr = { success: false; error: string; data?: null }
export type ApiResult<T> = ApiOk<T> | ApiErr

async function parseJson<T>(r: Response): Promise<ApiResult<T>> {
  const j = (await r.json()) as Record<string, unknown>
  if (j.success === true) {
    return { success: true, data: j.data as T, message: (j.message as string) || '' }
  }
  return { success: false, error: (j.error as string) || (j.message as string) || 'Error' }
}

function toSearchParams(
  companyId: number,
  permission: string,
  opts: {
    search: string
    showInactive: boolean
    showAll: boolean
    showOfficial: boolean
    showEInvoice: boolean
    showBlock: boolean
    waiting?: boolean
  },
): string {
  const p = new URLSearchParams()
  p.set('company_id', String(companyId))
  p.set('permission', permission)
  if (opts.search.trim()) p.set('search', opts.search.trim())
  if (permission === 'Bank') {
    // 与 `js/processlist.js` fetchProcesses 一致：先拉全量再由前端筛选/日期/Waiting
    p.set('showAll', '1')
    if (opts.waiting) p.set('waiting', '1')
  } else {
    if (opts.showInactive) p.set('showInactive', '1')
    if (opts.showAll) p.set('showAll', '1')
  }
  return p.toString()
}

export async function fetchDomainCompanyPermissions(
  companyCode: string,
): Promise<ApiResult<GamePermission[]>> {
  const r = await apiFetch('api/domain/domain_api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get_company_permissions', company_id: companyCode }),
  })
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  const j = (await r.json()) as {
    success?: boolean
    data?: { permissions?: string[] }
  }
  if (!j.success || !j.data?.permissions) {
    return { success: true, data: ['Games', 'Bank', 'Loan', 'Rate', 'Money'] }
  }
  const perms = j.data.permissions.map((x) => (x === 'Gambling' ? 'Games' : x)) as string[]
  return { success: true, data: [...new Set(perms)] as GamePermission[] }
}

export async function fetchProcessList(
  companyId: number,
  permission: string,
  opts: {
    search: string
    showInactive: boolean
    showAll: boolean
    showOfficial: boolean
    showEInvoice: boolean
    showBlock: boolean
    waiting?: boolean
  },
): Promise<ApiResult<GamesProcessRow[] | BankProcessRow[]>> {
  const qs = toSearchParams(companyId, permission, opts)
  const r = await apiFetch(`api/processes/processlist_api.php?${qs}`)
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<GamesProcessRow[] | BankProcessRow[]>(r)
}

export async function postToggleProcessStatus(
  id: number,
  kind: 'Bank' | 'Games',
): Promise<ApiResult<{ newStatus?: string } & Record<string, unknown>>> {
  const fd = new FormData()
  fd.set('id', String(id))
  if (kind === 'Bank') fd.set('permission', 'Bank')
  const r = await apiFetch('api/processes/toggle_process_status_api.php', {
    method: 'POST',
    body: fd,
  })
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson(r)
}

export async function postDeleteProcesses(
  ids: number[],
  permission: string,
): Promise<ApiResult<unknown>> {
  const r = await apiFetch('api/processes/delete_processes_api.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, permission }),
  })
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<unknown>(r)
}

export async function postUpdateBankIssueFlag(
  id: number,
  issueFlag: string,
): Promise<ApiResult<unknown>> {
  const fd = new FormData()
  fd.set('id', String(id))
  fd.set('issue_flag', issueFlag)
  const r = await apiFetch('api/processes/update_bank_issue_flag_api.php', { method: 'POST', body: fd })
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<unknown>(r)
}

export type AddProcessFormPayload = {
  currencies: { id: number; code: string }[]
  days: { id: number; day_name: string }[]
  /** 行字段与 `getProcessesForForm` 一致：process_id 为行 id，process_name 为业务工序号 */
  processes: {
    process_id: number
    process_name: string
    description_name?: string
  }[]
  descriptions: { id: number; name: string }[]
  existingProcesses: {
    process_id: number | string
    process_name: string
    description_name: string
  }[]
}

export async function fetchAddProcessFormData(
  companyId: number,
): Promise<ApiResult<AddProcessFormPayload>> {
  const r = await apiFetch(
    `api/processes/addprocess_api.php?company_id=${encodeURIComponent(String(companyId))}`,
  )
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<AddProcessFormPayload>(r)
}

/** 与 Bank 模态中账户下拉一致：`accountlistapi.php` */
export async function fetchAccountList(companyId: number): Promise<
  ApiResult<{
    accounts: {
      id: number
      account_id: string
      name?: string
      role?: string
      status?: string
    }[]
  }>
> {
  const q = new URLSearchParams({
    company_id: String(companyId),
    showAll: 'true',
  })
  const r = await apiFetch(`api/accounts/accountlistapi.php?${q}`)
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  const j = (await r.json()) as {
    success?: boolean
    data?: { accounts?: unknown }
    error?: string
    message?: string
  }
  if (j.success && j.data && Array.isArray((j.data as { accounts?: unknown }).accounts)) {
    return {
      success: true,
      data: j.data as { accounts: { id: number; account_id: string; name?: string }[] },
    }
  }
  return {
    success: false,
    error: j.error || j.message || 'Account list error',
  }
}

export async function postAddProcess(
  formData: FormData,
): Promise<ApiResult<unknown>> {
  const r = await apiFetch('api/processes/addprocess_api.php', { method: 'POST', body: formData })
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<unknown>(r)
}

export async function postUpdateProcess(
  formData: FormData,
): Promise<ApiResult<unknown>> {
  const r = await apiFetch('api/processes/processlist_api.php?action=update_process', {
    method: 'POST',
    body: formData,
  })
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<unknown>(r)
}

export async function fetchGetProcess(
  id: number,
  permission: '' | 'Bank',
): Promise<ApiResult<Record<string, unknown>>> {
  const q = new URLSearchParams({ action: 'get_process', id: String(id) })
  if (permission) q.set('permission', permission)
  const r = await apiFetch(`api/processes/processlist_api.php?${q}`)
  if (!r.ok) return { success: false, error: `HTTP ${r.status}` }
  return parseJson<Record<string, unknown>>(r)
}

export { apiUrl }
