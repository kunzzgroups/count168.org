import type { BankProcessRow } from './processListTypes'

export function normalizeBankIssueFlag(v: unknown): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')
}

/** 与 `processlist.js` normalizeResendDayStartToYmd 一致 */
export function normalizeResendDayStartToYmd(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const dd = String(parseInt(dmy[1], 10)).padStart(2, '0')
    const mm = String(parseInt(dmy[2], 10)).padStart(2, '0')
    const yy = dmy[3]
    return `${yy}-${mm}-${dd}`
  }
  return ''
}

/** 供 `input[type=date]` 使用（YYYY-MM-DD 或从 d/m/Y 转换；兼容 `YYYY-MM-DD HH:...`） */
export function bankDayFieldForDateInput(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const head = s.length >= 10 ? s.slice(0, 10) : String(s.split(' ')[0] || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(head) && head !== '0000-00-00') return head
  return normalizeResendDayStartToYmd(s)
}

export function isSelectedDayStartResendLockedToday(
  proc: { resend_guard_day_starts_today?: string | null } | null,
  selectedDayStartRaw: string,
): boolean {
  if (!proc) return false
  const selectedYmd = normalizeResendDayStartToYmd(selectedDayStartRaw)
  if (!selectedYmd) return false
  const lockedCsv = String(proc.resend_guard_day_starts_today || '').trim()
  if (lockedCsv) {
    const lockedSet = new Set(
      lockedCsv
        .split(',')
        .map((item) => normalizeResendDayStartToYmd(item.trim()))
        .filter(Boolean),
    )
    return lockedSet.has(selectedYmd)
  }
  return false
}

/** 与 `bank_process_list.js` bankResendScheduleDayStartForbiddenMessage 一致（当前恒不拦截） */
export function bankResendScheduleDayStartForbiddenMessage(
  _chosenTrim: string,
  _anchorRaw: string | null | undefined,
): string | null {
  return null
}

export function isBankResendDayStartBackendErrorMessage(text: string): boolean {
  const s = String(text || '')
  return (
    s.includes('不可与今天相同') ||
    s.includes('Day start cannot be today') ||
    s.includes('Resend 所填 Day start') ||
    s.includes('same calendar date as the current contract Day start')
  )
}

export function isBankInactiveLike(
  status: string | undefined,
  issueFlag: string | undefined,
): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase()
  const f = normalizeBankIssueFlag(issueFlag)
  return (
    s === 'inactive' || f === 'official' || f === 'e_invoice' || f === 'block'
  )
}

function parseIsoDate(value: string | undefined | null): Date | null {
  const t = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || t === '0000-00-00') return null
  const p = t.split('-').map(Number)
  const d = new Date(p[0], p[1] - 1, p[2])
  d.setHours(0, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseDmyRange(from: string, to: string): { f: Date; t: Date } | null {
  const pf = from.trim()
  const pt = to.trim()
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(pf) || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(pt))
    return null
  const [df, mf, yf] = pf.split('/').map(Number)
  const [dt, mt, yt] = pt.split('/').map(Number)
  const a = new Date(yf, mf - 1, df)
  const b = new Date(yt, mt - 1, dt)
  a.setHours(0, 0, 0, 0)
  b.setHours(0, 0, 0, 0)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return { f: a, t: b }
}

export function processMatchesSelectedDate(
  p: BankProcessRow,
  dateFrom: string,
  dateTo: string,
): boolean {
  const r = parseDmyRange(dateFrom, dateTo)
  if (!r) return true
  const d = parseIsoDate(p.date || p.day_start || null)
  if (!d) return false
  const t = d.getTime()
  return t >= r.f.getTime() && t <= r.t.getTime()
}

/**
 * 与 `bank_process_list.js` 中 matchesCurrentBankFilters 一致
 */
export function matchesCurrentBankFilters(
  process: BankProcessRow,
  opts: {
    showAll: boolean
    showInactive: boolean
    showOfficial: boolean
    showEInvoice: boolean
    showBlock: boolean
    dateFrom: string
    dateTo: string
  },
): boolean {
  if (!process) return false
  if (!processMatchesSelectedDate(process, opts.dateFrom, opts.dateTo)) {
    return false
  }
  if (opts.showAll) return true
  const status = String(process.status || '').toLowerCase()
  const issueFlag = normalizeBankIssueFlag(process.issue_flag)
  const matches: boolean[] = []
  const isPlainInactive =
    status === 'inactive' && issueFlag !== 'official' && issueFlag !== 'e_invoice' && issueFlag !== 'block'
  if (opts.showInactive) matches.push(isPlainInactive)
  if (opts.showOfficial) matches.push(issueFlag === 'official')
  if (opts.showEInvoice) matches.push(issueFlag === 'e_invoice')
  if (opts.showBlock) matches.push(issueFlag === 'block')
  if (matches.length === 0) {
    return (
      status === 'active' &&
      issueFlag !== 'official' &&
      issueFlag !== 'e_invoice' &&
      issueFlag !== 'block'
    )
  }
  return matches.some(Boolean)
}

export function getContractStateClass(
  dayStart: string | null | undefined,
  dayEnd: string | null | undefined,
  todayYmd: string,
): string {
  const hasDayStart = dayStart != null && String(dayStart).trim() !== ''
  if (!hasDayStart) return 'contract-pending'
  const ds = String(dayStart).trim()
  if (todayYmd < ds) return 'contract-pending'
  if (dayEnd && String(dayEnd).trim() !== '' && todayYmd > String(dayEnd).trim()) {
    return 'contract-expired'
  }
  if (dayStart && dayEnd) {
    const dse = String(dayEnd).trim()
    if (todayYmd >= ds && todayYmd <= dse) return 'contract-active'
  }
  if (dayStart && todayYmd >= ds) return 'contract-active'
  return 'contract-expired'
}

const CONTRACT_MAP: Record<string, string> = {
  '1': '1 MONTH',
  '1 month': '1 MONTH',
  '2': '2 MONTHS',
  '2 months': '2 MONTHS',
  '3': '3 MONTHS',
  '3 months': '3 MONTHS',
  '6': '6 MONTHS',
  '6 months': '6 MONTHS',
  '1+1': '1+1 MONTH',
  '1+2': '1+2 MONTHS',
  '1+3': '1+3 MONTHS',
}

export function formatContractLabel(raw: string | undefined | null): string {
  if (!raw) return ''
  const s = String(raw).trim()
  return CONTRACT_MAP[s] || CONTRACT_MAP[s.toLowerCase()] || s
}

export function isGrayContractActive(
  contractLabel: string,
  baseClass: string,
): string {
  const gray = new Set(['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'])
  if (gray.has(contractLabel) && baseClass === 'contract-active') {
    return 'contract-1month-active'
  }
  return baseClass
}

export function ymdToday(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function getBankStatusSelectValue(p: BankProcessRow): string {
  const f = normalizeBankIssueFlag(p.issue_flag)
  if (f) return f
  return String(p.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active'
}

const BANK_FORM_ROLE_SET = new Set([
  'PARTNER',
  'SUPPLIER',
  'UPLINE',
  'STAFF',
  'AGENT',
  'MEMBER',
  'PROFIT',
])

export function normalizeBankAccountRole(role: unknown): string {
  return String(role || '')
    .trim()
    .toUpperCase()
}

export function isAllowedBankFormRole(role: unknown): boolean {
  return BANK_FORM_ROLE_SET.has(normalizeBankAccountRole(role))
}

/** 与 `js/processlist.js` formatBankAccountDisplay 一致 */
export function formatBankAccountDisplay(
  codeRaw: unknown,
  nameRaw: unknown,
  fallbackRaw?: unknown,
): string {
  const code = String(codeRaw || '').trim()
  const name = String(nameRaw || '').trim()
  const fallback = String(fallbackRaw || '').trim()
  if (code) {
    const safeName = name || code
    return `${code}[${safeName}]`
  }
  if (name) return name
  return fallback
}

export type ProfitSharingEntry = {
  accountId: number
  accountText: string
  amount: string
}

/** 解析 `bank_profit_sharing` 存库串（与 classic `split(',')` + `' - '` 一致） */
export function parseProfitSharingString(raw: unknown): ProfitSharingEntry[] {
  const s = String(raw || '').trim()
  if (!s) return []
  const out: ProfitSharingEntry[] = []
  for (const part of s.split(',')) {
    const t = part.trim()
    if (!t) continue
    const d = t.lastIndexOf(' - ')
    if (d > -1) {
      out.push({
        accountId: 0,
        accountText: t.slice(0, d).trim(),
        amount: t.slice(d + 3).trim(),
      })
    }
  }
  return out
}

export function serializeProfitSharingEntries(entries: ProfitSharingEntry[]): string {
  const parts: string[] = []
  for (const e of entries) {
    const text = (e.accountText || '').trim()
    const raw = (e.amount || '').trim()
    if (!text || raw === '') continue
    const num = parseFloat(raw)
    const amount = Number.isFinite(num) ? num.toFixed(2) : raw
    parts.push(`${text} - ${amount}`)
  }
  return parts.join(', ')
}
