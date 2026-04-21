import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate } from 'react-router-dom'

import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '@/constants/authStorage'

type ModuleSidebarLayoutProps = {
  children: ReactNode
}

type NavItem = {
  key: string
  to: string
}

export function ModuleSidebarLayout({ children }: ModuleSidebarLayoutProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const navItems = useMemo<NavItem[]>(
    () => [
      { key: 'dashboard', to: '/dashboard' },
      { key: 'modules', to: '/modules' },
      { key: 'transaction', to: '/modules/transaction' },
      { key: 'accountList', to: '/modules/account-list' },
      { key: 'member', to: '/modules/member' },
      { key: 'processList', to: '/modules/process-list' },
    ],
    [],
  )

  const onLogout = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_USER_KEY)
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-zinc-50">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 p-4 md:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-zinc-200 bg-white p-3">
          <p className="mb-3 text-sm font-semibold text-zinc-700">{t('nav.title')}</p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm ${
                    isActive ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
                  }`
                }
              >
                {t(`nav.items.${item.key}`)}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={onLogout}
            className="mt-4 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            {t('nav.logout')}
          </button>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  )
}
