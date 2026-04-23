/** 与 `api/dashboard/bootstrap_api.php` 的 `userData` 一致 */
export type DashboardUserData = {
  name: string
  login_id: string
  role: string
  avatar_letter: string
  /** 权限标签，如 home、account、admin 等 */
  permissions: string[]
}

/** bootstrap 成功时的 data（member 会走 redirect，不会落到此结构） */
export type DashboardBootstrapData = {
  userData: DashboardUserData
  companyId: number | null
  canViewAnalytics: boolean
}

/** 与 `get_owner_companies_api` 行数据对齐（只列前端用到的字段） */
export type OwnerCompany = {
  id: number
  company_id: string
  group_id?: string | null
  link_percentage?: number | string | null
  expiration_date?: string | null
  [k: string]: unknown
}

/** dashboard_api.php 成功 data 的常用字段（其余字段可挂在对象上供 Tooltip） */
export type DashboardApiPayload = {
  capital: number | string
  expenses: number | string
  profit: number | string
  period_total?: { capital?: number; expenses?: number; profit?: number }
  initial_balance?: { capital?: number; expenses?: number; profit?: number }
  daily_data?: {
    capital?: Record<string, number | string>
    expenses?: Record<string, number | string>
    profit?: Record<string, number | string>
    profit_payment_flow_daily?: Record<string, number | string>
  }
  date_range: { from: string; to: string }
  ownership_percentage?: number | string
  group_equity_percentage?: number | string
  group_account_percentage?: number | string
  has_group_ownership?: boolean
  has_ownership_setup?: boolean
  _link_multiplier?: number
}
