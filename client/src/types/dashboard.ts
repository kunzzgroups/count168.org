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
