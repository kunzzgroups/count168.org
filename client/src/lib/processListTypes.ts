/** Games 行（与 processlist_api getProcesses 一致） */
export type GamesProcessRow = {
  id: number
  process_name: string
  description?: string
  status: string
  currency?: string
  day_use?: string
  has_transactions?: boolean
}

/** Bank 行（与 processlist_api getBankProcesses 主字段一致，其余可选） */
export type BankProcessRow = {
  id: number
  remark?: string
  status?: string
  issue_flag?: string | null
  card_lower?: string
  country?: string
  bank?: string
  types?: string
  supplier?: string
  customer?: string
  cost?: string | number
  price?: string | number
  profit?: string | number
  contract?: string
  insurance?: string
  day_start?: string | null
  day_end?: string | null
  /** 与 `processlist_api` getBankProcesses 一致 */
  day_start_frequency?: string | null
  /** 逗号分隔的 Y-m-d，当日已 Resend 过的 Day start（与经典 `resend_guard_day_starts_today` 一致） */
  resend_guard_day_starts_today?: string | null
  date?: string
  has_transactions?: boolean
}

export type GamePermission = 'Games' | 'Bank' | 'Loan' | 'Rate' | 'Money' | string

/** Accounting Due 弹窗行（与 `process_accounting_inbox_api.php` 输出一致） */
export type AccountingInboxRow = {
  id: number
  name?: string
  bank?: string
  country?: string
  day_start?: string | null
  start_date?: string | null
  contract?: string
  already_posted_today?: boolean
  is_manual_inactive?: boolean
  is_resend_consolidated_range?: boolean
  is_partial_first_month?: boolean
  is_day_end_tail?: boolean
  monthly_billing_month?: string | null
}

export const BANK_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'ACTIVE' },
  { value: 'inactive', label: 'INACTIVE' },
  { value: 'official', label: 'OFFICIAL' },
  { value: 'e_invoice', label: 'E-INVOICE' },
  { value: 'block', label: 'BLOCK' },
]
