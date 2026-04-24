import type { BankProcessRow, GamesProcessRow } from './processListApi'

export function normalizeBankIssueFlag(value: unknown): string {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]/g, '_')
  if (s === 'official' || s === 'e_invoice' || s === 'block') return s
  return ''
}

/**
 * 与 `bank_process_list.js` `matchesCurrentBankFilters` 对齐（无日期区间时视为通过）。
 */
export function bankRowMatchesFilters(
  process: BankProcessRow,
  opts: {
    showAll: boolean
    showInactive: boolean
    showOfficial: boolean
    showEInvoice: boolean
    showBlock: boolean
  },
): boolean {
  if (!process) return false
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
      status === 'active' && issueFlag !== 'official' && issueFlag !== 'e_invoice' && issueFlag !== 'block'
    )
  }
  return matches.some(Boolean)
}

export function sortGamesProcesses(rows: GamesProcessRow[]): GamesProcessRow[] {
  return [...rows].sort((a, b) => {
    const aKey = String(a.process_name || '').toLowerCase()
    const bKey = String(b.process_name || '').toLowerCase()
    if (aKey < bKey) return -1
    if (aKey > bKey) return 1
    const aDesc = String(a.description || '').toLowerCase()
    const bDesc = String(b.description || '').toLowerCase()
    if (aDesc < bDesc) return -1
    if (aDesc > bDesc) return 1
    return 0
  })
}

export function sortBankBySupplier(rows: BankProcessRow[], direction: 'asc' | 'desc'): BankProcessRow[] {
  const m = direction === 'asc' ? 1 : -1
  return [...rows].sort(
    (a, b) =>
      String(a.supplier || '').toLowerCase().localeCompare(String(b.supplier || '').toLowerCase()) * m,
  )
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

export function formatBankContract(raw: unknown): string {
  if (raw == null) return ''
  const key = String(raw).trim()
  if (!key) return ''
  return CONTRACT_MAP[key] || key
}

function todayYmd(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 与 legacy `getContractStateClass` 一致，用于 badge className */
export function bankContractStateClass(dayStart: string | null | undefined, dayEnd: string | null | undefined): string {
  const todayStr = todayYmd()
  const hasDayStart = dayStart != null && String(dayStart).trim() !== ''
  if (!hasDayStart) return 'contract-pending'
  const ds = String(dayStart).trim()
  if (todayStr < ds) return 'contract-pending'
  if (dayEnd && String(dayEnd).trim() !== '' && todayStr > String(dayEnd).trim()) return 'contract-expired'
  if (dayStart && dayEnd && todayStr >= ds && todayStr <= String(dayEnd).trim()) return 'contract-active'
  if (dayStart && todayStr >= ds) return 'contract-active'
  return 'contract-expired'
}
