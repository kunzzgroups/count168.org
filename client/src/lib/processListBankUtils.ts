import type { BankProcessRow } from './processListTypes'

export function normalizeBankIssueFlag(v: unknown): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_')
}

/** 与 `js/processlist.js` / `bank_process_list.js` 中 isBankInactiveLike 对齐 */
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
