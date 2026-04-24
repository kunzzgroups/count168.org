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
  date?: string
  has_transactions?: boolean
}

export type GamePermission = 'Games' | 'Bank' | 'Loan' | 'Rate' | 'Money' | string

export const BANK_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'ACTIVE' },
  { value: 'inactive', label: 'INACTIVE' },
  { value: 'official', label: 'OFFICIAL' },
  { value: 'e_invoice', label: 'E-INVOICE' },
  { value: 'block', label: 'BLOCK' },
]
