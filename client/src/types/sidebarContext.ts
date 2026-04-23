export type SidebarExpiration = {
  text: string
  status: 'expired' | 'warning' | 'normal'
  date: string
}

export type SidebarContext = {
  isMember: boolean
  role: string
  permissions: string[]
  hasC168DomainPageAccess: boolean
  companyHasGambling: boolean
  companyHasBank: boolean
  /** 与 `sidebar.php` / `window.SIDEBAR_COMPANY_CODE` 一致，用于 Maintenance 等 localStorage 显隐 */
  companyCode?: string
  expiration: SidebarExpiration | null
  isExternalView: boolean
}
