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
  expiration: SidebarExpiration | null
  isExternalView: boolean
}
