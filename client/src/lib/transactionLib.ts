import { apiFetch, apiUrl } from './api'
import type { ApiResult } from '../types/api'

export type TxSearchRow = {
  account_db_id?: string | number
  account_id?: string
  account_name?: string
  role?: string
  currency?: string
  bf?: number | string
  win_loss?: number | string
  cr_dr?: number | string
  balance?: number | string
  is_alert?: number | boolean
  has_win_loss_history?: number | boolean
  has_win_loss_transactions?: number | boolean
  has_crdr_transactions?: number | boolean
  is_rate_middleman?: number | boolean
  [k: string]: unknown
}

export type TxTotals = {
  bf: number
  win_loss: number
  cr_dr: number
  balance: number
}

export type TxSearchPayload = {
  left_table: TxSearchRow[]
  right_table: TxSearchRow[]
  totals?: {
    left: TxTotals
    right: TxTotals
    summary: TxTotals
  }
  active_currency_codes?: string[]
}

export type TxAccountOption = {
  id: number
  account_id: string
  name: string
  display_text: string
  role: string
  currency: string | null
  status: string
}

export type ContraInboxRow = {
  id: number
  transaction_date: string
  from_account_code: string | null
  from_account_name: string | null
  to_account_code: string | null
  to_account_name: string | null
  currency: string
  amount: number
  submitted_by: string
  description: string
}

export function ymdToDmY(ymd: string): string {
  const p = ymd.split('-')
  if (p.length < 3) return ymd
  const [y, m, d] = p
  return `${d}/${m}/${y}`
}

export function dmyToYmd(dmy: string): string {
  const p = dmy.split('/')
  if (p.length < 3) return dmy
  const [d, m, y] = p
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function formatTxNumber(n: number | string | undefined): string {
  const v = parseFloat(String(n ?? '').replace(/,/g, ''))
  if (Number.isNaN(v)) return '0.00'
  return v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function getRoleClass(role: string): string {
  const r = String(role || '').toLowerCase().trim()
  const roleMap: Record<string, string> = {
    capital: 'transaction-role-capital',
    bank: 'transaction-role-bank',
    cash: 'transaction-role-cash',
    profit: 'transaction-role-profit',
    expenses: 'transaction-role-expenses',
    company: 'transaction-role-company',
    partner: 'transaction-role-partner',
    staff: 'transaction-role-staff',
    supplier: 'transaction-role-upline',
    upline: 'transaction-role-upline',
    agent: 'transaction-role-agent',
    member: 'transaction-role-member',
    debtor: 'transaction-role-none',
    none: 'transaction-role-none',
  }
  return roleMap[r] || ''
}

function getRoleSortOrder(role: string): number {
  const roleLower = String(role || '').toLowerCase().trim()
  const roleOrder: Record<string, number> = {
    capital: 1,
    bank: 2,
    cash: 3,
    profit: 4,
    expenses: 5,
    company: 6,
    staff: 7,
    upline: 8,
    supplier: 8,
    agent: 9,
    member: 10,
    none: 11,
  }
  return roleOrder[roleLower] ?? 999
}

export function sortTxRowsByRole<T extends TxSearchRow>(data: T[]): T[] {
  return [...data].sort((a, b) => {
    const roleA = getRoleSortOrder(String(a.role || ''))
    const roleB = getRoleSortOrder(String(b.role || ''))
    if (roleA !== roleB) return roleA - roleB
    return String(a.account_id || '').localeCompare(String(b.account_id || ''))
  })
}

export function calculateTxTotals(rows: TxSearchRow[]): TxTotals {
  const zero: TxTotals = { bf: 0, win_loss: 0, cr_dr: 0, balance: 0 }
  return rows.reduce<TxTotals>((totals, row) => {
    let bf = parseFloat(String(row.bf)) || 0
    let winLoss = parseFloat(String(row.win_loss)) || 0
    let crDr = parseFloat(String(row.cr_dr)) || 0
    let balance = parseFloat(String(row.balance)) || 0
    const isRateMiddleman =
      row.is_rate_middleman === 1 || row.is_rate_middleman === true
    if (isRateMiddleman) {
      winLoss = Math.abs(winLoss)
    }
    return {
      bf: totals.bf + bf,
      win_loss: totals.win_loss + winLoss,
      cr_dr: totals.cr_dr + crDr,
      balance: totals.balance + balance,
    }
  }, zero)
}

function rowPassesHideZeroBalanceFilter(showZero: boolean, row: TxSearchRow): boolean {
  if (showZero) return true
  const eps = 0.00001
  const num = parseFloat(String(row.balance))
  if (Number.isNaN(num)) return true
  if (Math.abs(num) > eps) return true
  const flagToBool = (v: unknown) => {
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    return parseInt(String(v || '0'), 10) !== 0
  }
  const absVal = (v: unknown) => {
    const n = parseFloat(String(v))
    if (Number.isNaN(n)) return 0
    return Math.abs(n)
  }
  const hasTxnFlag =
    flagToBool(row.has_win_loss_history) ||
    flagToBool(row.has_win_loss_transactions) ||
    flagToBool(row.has_crdr_transactions)
  return (
    hasTxnFlag ||
    absVal(row.bf) > eps ||
    absVal(row.win_loss) > eps ||
    absVal(row.cr_dr) > eps
  )
}

export function applyTxDisplayFilters(
  rawLeft: TxSearchRow[],
  rawRight: TxSearchRow[],
  opts: {
    showZeroBalance: boolean
    showPaymentOnly: boolean
    showWinLossOnly: boolean
  },
): { left: TxSearchRow[]; right: TxSearchRow[] } {
  let filteredLeft = rawLeft
  let filteredRight = rawRight

  if (opts.showPaymentOnly) {
    const eps = 0.00001
    const hasCrdr = (row: TxSearchRow) => {
      const byFlag =
        typeof row.has_crdr_transactions === 'boolean'
          ? row.has_crdr_transactions
          : typeof row.has_crdr_transactions === 'number'
            ? row.has_crdr_transactions !== 0
            : parseInt(String(row.has_crdr_transactions || '0'), 10) !== 0
      const crdr = parseFloat(String(row.cr_dr))
      const byValue = !Number.isNaN(crdr) && Math.abs(crdr) > eps
      return byFlag || byValue
    }
    const hasWinLoss = (row: TxSearchRow) => {
      const byFlag =
        typeof row.has_win_loss_transactions === 'boolean'
          ? row.has_win_loss_transactions
          : typeof row.has_win_loss_transactions === 'number'
            ? row.has_win_loss_transactions !== 0
            : parseInt(String(row.has_win_loss_transactions || '0'), 10) !== 0
      const wl = parseFloat(String(row.win_loss))
      const byValue = !Number.isNaN(wl) && Math.abs(wl) > 0.00001
      return byFlag || byValue
    }
    const shouldShow = opts.showWinLossOnly
      ? (row: TxSearchRow) => hasCrdr(row) || hasWinLoss(row)
      : hasCrdr
    filteredLeft = rawLeft.filter(shouldShow)
    filteredRight = rawRight.filter(shouldShow)
  }

  const zf = (row: TxSearchRow) =>
    rowPassesHideZeroBalanceFilter(opts.showZeroBalance, row)
  return {
    left: filteredLeft.filter(zf),
    right: filteredRight.filter(zf),
  }
}

export async function fetchTxCategories(): Promise<string[]> {
  const res = await apiFetch('/api/transactions/get_categories_api.php')
  const json: ApiResult<string[]> = await res.json()
  if (json.success && Array.isArray(json.data)) return json.data
  return []
}

export async function fetchTxSearch(params: {
  dateFromDmY: string
  dateToDmY: string
  categoryCsv: string | null
  companyId: number
  currencyCsv: string | null
  showInactive: boolean
  showCaptureOnly: boolean
  hideZeroBalance: boolean
  signal?: AbortSignal
}): Promise<{ ok: true; data: TxSearchPayload } | { ok: false; error: string }> {
  const q = new URLSearchParams()
  q.set('date_from', params.dateFromDmY)
  q.set('date_to', params.dateToDmY)
  q.set('show_inactive', params.showInactive ? '1' : '0')
  q.set('show_capture_only', params.showCaptureOnly ? '1' : '0')
  q.set('hide_zero_balance', params.hideZeroBalance ? '1' : '0')
  q.set('company_id', String(params.companyId))
  if (params.categoryCsv) q.set('category', params.categoryCsv)
  if (params.currencyCsv) q.set('currency', params.currencyCsv)
  q.set('_t', String(Date.now()))
  try {
    const res = await apiFetch(
      apiUrl(`/api/transactions/search_api.php?${q.toString()}`),
      { signal: params.signal },
    )
    const json = await res.json()
    if (json.success && json.data) {
      return { ok: true, data: json.data as TxSearchPayload }
    }
    return {
      ok: false,
      error: String(json.error || json.message || 'Search failed'),
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'AbortError' }
    }
    throw e
  }
}

export async function fetchTxAccounts(
  companyId: number,
): Promise<TxAccountOption[]> {
  const res = await apiFetch(
    apiUrl(
      `/api/transactions/get_accounts_api.php?company_id=${encodeURIComponent(String(companyId))}`,
    ),
  )
  const json: ApiResult<TxAccountOption[]> = await res.json()
  if (json.success && Array.isArray(json.data)) return json.data
  return []
}

export async function submitStandardTransaction(body: {
  companyId: number
  transactionType: string
  accountId: number
  fromAccountId: number | ''
  amount: string
  transactionDateDmY: string
  description: string
  sms: string
  currency: string
}): Promise<{ ok: true; message: string; data?: unknown } | { ok: false; error: string }> {
  const fd = new FormData()
  fd.append('transaction_type', body.transactionType)
  fd.append('account_id', String(body.accountId))
  fd.append('from_account_id', body.fromAccountId === '' ? '' : String(body.fromAccountId))
  fd.append('amount', body.amount)
  fd.append('transaction_date', body.transactionDateDmY)
  fd.append('description', body.description)
  fd.append('sms', body.sms)
  fd.append('currency', body.currency)
  fd.append('company_id', String(body.companyId))
  const rid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  fd.append('client_request_id', rid)
  const res = await apiFetch(apiUrl('/api/transactions/submit_api.php'), {
    method: 'POST',
    body: fd,
  })
  const json = await res.json()
  if (json.success) {
    return { ok: true, message: String(json.message || 'OK'), data: json.data }
  }
  return { ok: false, error: String(json.error || json.message || 'Submit failed') }
}

export async function fetchContraInbox(
  companyId: number,
): Promise<ContraInboxRow[]> {
  const res = await apiFetch(
    apiUrl(
      `/api/transactions/contra_inbox_api.php?company_id=${encodeURIComponent(String(companyId))}`,
    ),
  )
  const json: ApiResult<ContraInboxRow[]> = await res.json()
  if (json.success && Array.isArray(json.data)) return json.data
  return []
}

export async function postContraApprove(
  companyId: number,
  transactionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const fd = new FormData()
  fd.append('company_id', String(companyId))
  fd.append('transaction_id', String(transactionId))
  const res = await apiFetch(apiUrl('/api/transactions/contra_approve_api.php'), {
    method: 'POST',
    body: fd,
  })
  const json = await res.json()
  return json.success ? { ok: true } : { ok: false, error: json.error || json.message }
}

export async function postContraReject(
  companyId: number,
  transactionId: number,
): Promise<{ ok: boolean; error?: string }> {
  const fd = new FormData()
  fd.append('company_id', String(companyId))
  fd.append('transaction_id', String(transactionId))
  const res = await apiFetch(apiUrl('/api/transactions/contra_reject_api.php'), {
    method: 'POST',
    body: fd,
  })
  const json = await res.json()
  return json.success ? { ok: true } : { ok: false, error: json.error || json.message }
}

/**
 * Map UI slots to PHP `submit_api.php` fields (parity with `transaction.js` submitAction):
 * - `action_account_from` = To Account → `account_id`
 * - `action_account_id` = From Account → `from_account_id`
 */
export function resolveSubmitAccountIds(
  transactionType: string,
  profitSide: 'WIN' | 'LOSE',
  toAccountDbId: number | null,
  fromAccountDbId: number | null,
): { effectiveType: string; accountId: number; fromAccountId: number | '' } {
  const t = transactionType
  if (t === 'PROFIT') {
    return {
      effectiveType: profitSide,
      accountId: toAccountDbId || 0,
      fromAccountId: fromAccountDbId || '',
    }
  }
  const needsFromTo = ['CONTRA', 'PAYMENT', 'RECEIVE', 'CLAIM', 'CLEAR'].includes(t)
  if (needsFromTo) {
    return {
      effectiveType: t,
      accountId: toAccountDbId || 0,
      fromAccountId: fromAccountDbId || 0,
    }
  }
  return {
    effectiveType: t,
    accountId: toAccountDbId || 0,
    fromAccountId: '',
  }
}
