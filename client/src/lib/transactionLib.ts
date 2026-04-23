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

/** `history_api.php` → `data.account` / `data.history` */
export type TxPaymentHistoryAccount = {
  id?: number
  account_id?: string
  name?: string
  currency?: string
}

export type TxPaymentHistoryRow = {
  row_type: string
  date: string
  product?: string
  card_owner?: string
  is_bank_process_transaction?: boolean
  currency?: string
  rate?: string | number
  win_loss: string | number
  cr_dr: string | number
  balance: string | number
  description?: string
  sms?: string | null
  remark?: string | null
  created_by?: string | null
}

export type TxPaymentHistoryPayload = {
  account: TxPaymentHistoryAccount
  history: TxPaymentHistoryRow[]
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

/** 与 `js/transaction.js` `parseRateExpression` 一致（支持 `*`、`/`、`/3` 除法语义） */
export function parseRateExpression(rawValue: unknown): {
  valid: boolean
  value: number
} {
  const raw = String(rawValue ?? '').trim()
  if (!raw) {
    return { valid: false, value: 0 }
  }

  const normalized = raw.replace(/÷/g, '/').replace(/\s+/g, '')
  if (!normalized) {
    return { valid: false, value: 0 }
  }

  if (/^\/\d*\.?\d+$/.test(normalized)) {
    const divisor = parseFloat(normalized.slice(1))
    if (!Number.isFinite(divisor) || divisor <= 0) {
      return { valid: false, value: 0 }
    }
    return { valid: true, value: 1 / divisor }
  }

  if (!/^[0-9.*/]+$/.test(normalized)) {
    return { valid: false, value: 0 }
  }
  if (/^[*/]|[*/]$|[*/]{2,}/.test(normalized)) {
    return { valid: false, value: 0 }
  }

  const tokens = normalized.split(/([*/])/).filter(Boolean)
  if (tokens.length === 0) {
    return { valid: false, value: 0 }
  }
  if (!/^\d*\.?\d+$/.test(tokens[0]!)) {
    return { valid: false, value: 0 }
  }

  let result = parseFloat(tokens[0]!)
  if (!Number.isFinite(result) || result <= 0) {
    return { valid: false, value: 0 }
  }

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const numToken = tokens[i + 1]
    if (!numToken || !/^\d*\.?\d+$/.test(numToken)) {
      return { valid: false, value: 0 }
    }
    const value = parseFloat(numToken)
    if (!Number.isFinite(value)) {
      return { valid: false, value: 0 }
    }
    if (op === '*') {
      result *= value
    } else if (op === '/') {
      if (value === 0) {
        return { valid: false, value: 0 }
      }
      result /= value
    } else {
      return { valid: false, value: 0 }
    }
  }

  if (!Number.isFinite(result) || result <= 0) {
    return { valid: false, value: 0 }
  }
  return { valid: true, value: result }
}

/** 与 `js/transaction.js` `formatNumber` 一致：千分位 + 截断到 2 位小数（非四舍五入） */
export function formatTxNumber(n: number | string | undefined): string {
  const cleaned =
    typeof n === 'string' ? n.replace(/,/g, '').trim() : String(n ?? '')
  const number = parseFloat(cleaned)
  if (Number.isNaN(number)) return '0.00'
  const truncated = Math.trunc(number * 100) / 100
  return truncated.toLocaleString('en-US', {
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
    /** 与 `js/transaction.js` `filterPaymentOnlyInRange` 一致：仅按 win_loss 数值判断 */
    const hasWinLoss = (row: TxSearchRow) => {
      const wl = parseFloat(String(row.win_loss))
      return !Number.isNaN(wl) && Math.abs(wl) > 0.00001
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

export async function fetchTxPaymentHistory(params: {
  accountId: number
  virtualCompanyCode?: string
  dateFromDmY: string
  dateToDmY: string
  rowCurrency?: string | null
  selectedCurrenciesCsv?: string | null
  companyId: number
  signal?: AbortSignal
}): Promise<
  | { ok: true; data: TxPaymentHistoryPayload }
  | { ok: false; error: string }
> {
  const q = new URLSearchParams()
  q.set('account_id', String(params.accountId))
  if (
    params.virtualCompanyCode &&
    params.virtualCompanyCode.trim() !== '' &&
    params.accountId <= 0
  ) {
    q.set('virtual_company_code', params.virtualCompanyCode.trim().toUpperCase())
  }
  q.set('date_from', params.dateFromDmY)
  q.set('date_to', params.dateToDmY)
  const rowCur = (params.rowCurrency || '').trim()
  if (rowCur) {
    q.set('currency', rowCur)
  } else if (params.selectedCurrenciesCsv) {
    q.set('currency', params.selectedCurrenciesCsv)
  }
  q.set('company_id', String(params.companyId))
  q.set('_t', String(Date.now()))
  try {
    const res = await apiFetch(
      apiUrl(`/api/transactions/history_api.php?${q.toString()}`),
      {
        signal: params.signal,
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      },
    )
    const json = await res.json()
    if (json.success && json.data) {
      return { ok: true, data: json.data as TxPaymentHistoryPayload }
    }
    return {
      ok: false,
      error: String(json.error || json.message || 'Failed to load history'),
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

/**
 * RATE 提交：FormData 字段顺序与 `js/transaction.js` `submitAction` 中 `isRate` 分支一致。
 */
export async function submitRateTransaction(body: {
  companyId: number
  transactionDateDmY: string
  description: string
  sms: string
  /** `account_id` / `rate_to_account_id`：UI `rate_account_from`（Select To） */
  rateToAccountId: number
  /** `from_account_id` / `rate_from_account_id`：UI `rate_account_to`（Select From） */
  rateFromAccountId: number
  rateFromCurrency: string
  rateToCurrency: string
  rateFromAmount: string
  rateToAmount: string
  rateFromDescription: string
  rateToDescription: string
  rateExchangeRateRaw: string
  rateExchangeRateNumeric: number
  rateTransferFromAccountId: number | ''
  rateTransferToAccountId: number | ''
  rateTransferAmount: string
  rateMiddlemanAccountId: number | ''
  rateMiddlemanRate: string
  rateMiddlemanAmount: string
  secondLeg: null | {
    rate_transfer_from_amount: string
    rate_transfer_from_description: string
    rate_transfer_to_amount: string
    rate_transfer_to_description: string
    rate_transfer_from_currency: string
    rate_transfer_to_currency: string
    middleman: null | {
      rate_middleman_currency: string
      rate_middleman_amount: string
      rate_middleman_description: string
    }
  }
}): Promise<
  { ok: true; message: string; data?: unknown } | { ok: false; error: string }
> {
  const fd = new FormData()
  fd.append('transaction_type', 'RATE')
  fd.append('account_id', String(body.rateToAccountId))
  fd.append('from_account_id', String(body.rateFromAccountId))
  fd.append('amount', body.rateFromAmount)
  fd.append('transaction_date', body.transactionDateDmY)
  fd.append('description', body.description)
  fd.append('sms', body.sms)
  fd.append('currency', body.rateFromCurrency)

  fd.append('rate_from_account_id', String(body.rateFromAccountId))
  fd.append('rate_from_currency', body.rateFromCurrency)
  fd.append('rate_from_amount', body.rateFromAmount)
  fd.append('rate_from_description', body.rateFromDescription)

  fd.append('rate_to_account_id', String(body.rateToAccountId))
  fd.append('rate_to_currency', body.rateToCurrency)
  fd.append('rate_to_amount', body.rateToAmount)
  fd.append('rate_to_description', body.rateToDescription)

  const xferFrom =
    body.rateTransferFromAccountId === '' ? '' : String(body.rateTransferFromAccountId)
  const xferTo =
    body.rateTransferToAccountId === '' ? '' : String(body.rateTransferToAccountId)
  const mmId =
    body.rateMiddlemanAccountId === '' ? '' : String(body.rateMiddlemanAccountId)

  if (body.secondLeg) {
    const s = body.secondLeg
    fd.append('rate_transfer_from_account_id', xferFrom)
    fd.append('rate_transfer_from_currency', s.rate_transfer_from_currency)
    fd.append('rate_transfer_from_amount', s.rate_transfer_from_amount)
    fd.append('rate_transfer_from_description', s.rate_transfer_from_description)

    fd.append('rate_transfer_to_account_id', xferTo)
    fd.append('rate_transfer_to_currency', s.rate_transfer_to_currency)
    fd.append('rate_transfer_to_amount', s.rate_transfer_to_amount)
    fd.append('rate_transfer_to_description', s.rate_transfer_to_description)

    if (s.middleman) {
      fd.append('rate_middleman_account_id', mmId)
      fd.append('rate_middleman_currency', s.middleman.rate_middleman_currency)
      fd.append('rate_middleman_amount', s.middleman.rate_middleman_amount)
      fd.append('rate_middleman_description', s.middleman.rate_middleman_description)
    }
  }

  fd.append('rate_currency_from', body.rateFromCurrency)
  fd.append('rate_currency_from_amount', body.rateFromAmount)
  fd.append('rate_currency_to', body.rateToCurrency)
  fd.append('rate_currency_to_amount', body.rateToAmount)
  fd.append('rate_exchange_rate', String(body.rateExchangeRateNumeric))
  fd.append('rate_transfer_from_account', xferFrom)
  fd.append('rate_transfer_to_account', xferTo)
  fd.append('rate_transfer_amount', body.rateTransferAmount)
  fd.append('rate_account_from_amount', body.rateTransferAmount)
  fd.append('rate_account_to_amount', body.rateTransferAmount)
  fd.append('rate_middleman_account', mmId)
  fd.append('rate_middleman_rate', body.rateMiddlemanRate)
  fd.append('rate_middleman_amount', body.rateMiddlemanAmount)

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
 * Map UI slots to PHP `submit_api.php` fields (parity with `transaction.js` submitAction).
 * Classic DOM：`action_account_from` = 第一个下拉（UI 「Select To」），`action_account_id` = 第二个（「Select From」）。
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

/** 与 `js/transaction.js` showNotification 一致：#notificationContainer + transaction-notification-* */
export type TxNotificationUiKind = 'ok' | 'err' | 'info'

export function showTxNotification(message: string, kind: TxNotificationUiKind): void {
  const container = document.getElementById('notificationContainer')
  if (!container) {
    console.error('Notification container not found!')
    console.log('Message:', message, 'Kind:', kind)
    return
  }
  if (!message || message.trim() === '') {
    console.error('Empty notification message!')
    return
  }

  const existing = container.querySelectorAll('.transaction-notification')
  if (existing.length >= 2) {
    existing[0]?.remove()
  }

  const classicType = kind === 'ok' ? 'success' : kind === 'err' ? 'error' : 'info'
  const el = document.createElement('div')
  el.className = `transaction-notification transaction-notification-${classicType}`
  el.textContent = message

  container.appendChild(el)
  setTimeout(() => {
    el.classList.add('show')
  }, 10)

  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => {
      el.remove()
    }, 300)
  }, 2000)
}
