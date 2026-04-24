import { NavLink, useLocation } from 'react-router-dom'
import { useCallback, useState } from 'react'
import { apiUrl } from '../../lib/api'
import { buildCompanyIdSearch, buildProcessListSearch } from '../../lib/buildProcessListSearch'
import type { SidebarContext } from '../../types/sidebarContext'
import './DashboardNav.css'

type Props = {
  context: SidebarContext
  onCloseMobile?: () => void
}

function hasPerm(permissions: string[], key: string): boolean {
  if (!permissions || permissions.length === 0) return true
  return permissions.includes(key)
}

/** 与 `sidebar.php` 中 Partnership / external 模式一致：仅屏蔽若干管理入口，不禁用 Home、Report 等查看类菜单 */
const NAV_HIDDEN_FOR_EXTERNAL = new Set([
  'admin',
  'account',
  'process',
  'datacapture',
  'payment',
  'maintenance',
])

function canNavItem(
  permissions: string[],
  key: string,
  isExternalView: boolean,
): boolean {
  if (!hasPerm(permissions, key)) return false
  if (!isExternalView) return true
  return !NAV_HIDDEN_FOR_EXTERNAL.has(key)
}

function phref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return apiUrl(p)
}

/**
 * 与 `sidebar.php` 信息架构对齐；外链为站点根 .php。Home 使用 React `/dashboard`。
 */
export function DashboardNav({ context, onCloseMobile }: Props) {
  const { pathname } = useLocation()
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({
    report: false,
    maintenance: true,
  })

  const { permissions, isMember, isExternalView: ext, hasC168DomainPageAccess, companyHasGambling, companyHasBank } =
    context

  const go = useCallback(() => {
    onCloseMobile?.()
  }, [onCloseMobile])

  const toggle = (k: string) => {
    setSubOpen((s) => ({ ...s, [k]: !s[k] }))
  }

  const showHome =
    permissions.length === 0 || permissions.includes('home')

  if (isMember) {
    return (
      <nav className="dNav" aria-label="主菜单">
        <a className="dNav__item" href={phref('member.php')} onClick={go}>
          <span>Win/Loss</span>
        </a>
      </nav>
    )
  }

  return (
    <nav className="dNav" aria-label="主菜单">
      {showHome && (
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive && pathname === '/dashboard'
              ? 'dNav__item dNav__item--active'
              : 'dNav__item'
          }
          onClick={go}
          end
        >
          <span>Home</span>
        </NavLink>
      )}

      {hasC168DomainPageAccess && (
        <a className="dNav__item" href={phref('domain.php')} onClick={go}>
          <span>Domain</span>
        </a>
      )}

      {hasC168DomainPageAccess && (
        <a className="dNav__item" href={phref('announcement.php')} onClick={go}>
          <span>Announcement</span>
        </a>
      )}

      {canNavItem(permissions, 'admin', ext) && (
        <a className="dNav__item" href={phref('userlist.php')} onClick={go}>
          <span>Admin</span>
        </a>
      )}

      {canNavItem(permissions, 'account', ext) && (
        <>
          <NavLink
            to={`/accounts${buildCompanyIdSearch(context.sessionCompanyId)}`}
            className={({ isActive }) =>
              isActive ? 'dNav__item dNav__item--active' : 'dNav__item'
            }
            onClick={go}
          >
            <span>Account</span>
          </NavLink>
          <a className="dNav__item" href={phref('ownership.php')} onClick={go}>
            <span>Ownership</span>
          </a>
        </>
      )}

      {canNavItem(permissions, 'process', ext) && (
        <NavLink
          to={`/processlist${buildProcessListSearch(context, context.sessionCompanyId)}`}
          className={({ isActive }) =>
            isActive ? 'dNav__item dNav__item--active' : 'dNav__item'
          }
          onClick={go}
        >
          <span>Process</span>
        </NavLink>
      )}

      {canNavItem(permissions, 'datacapture', ext) && companyHasGambling && (
        <NavLink
          to={`/datacapture${buildCompanyIdSearch(context.sessionCompanyId)}`}
          className={({ isActive }) =>
            isActive ? 'dNav__item dNav__item--active' : 'dNav__item'
          }
          onClick={go}
        >
          <span>Data Capture</span>
        </NavLink>
      )}

      {canNavItem(permissions, 'payment', ext) && (
        <NavLink
          to={`/transaction${buildCompanyIdSearch(context.sessionCompanyId)}`}
          className={({ isActive }) =>
            isActive ? 'dNav__item dNav__item--active' : 'dNav__item'
          }
          onClick={go}
        >
          <span>Transaction Payment</span>
        </NavLink>
      )}

      {canNavItem(permissions, 'report', ext) && companyHasGambling && (
        <div className="dNav__sub">
          <button
            type="button"
            className="dNav__subHead"
            onClick={() => toggle('report')}
            aria-expanded={subOpen.report}
          >
            <span>Report</span>
            <span className="dNav__chev">{subOpen.report ? '▼' : '▶'}</span>
          </button>
          {subOpen.report && (
            <div className="dNav__subList">
              <a href={phref('customer_report.php')} onClick={go} className="dNav__subItem">
                Customer Report
              </a>
              <a href={phref('domain_report.php')} onClick={go} className="dNav__subItem">
                Domain Report
              </a>
            </div>
          )}
        </div>
      )}

      {!ext && (
        <div className="dNav__sub">
          <button
            type="button"
            className="dNav__subHead"
            onClick={() => toggle('maintenance')}
            aria-expanded={subOpen.maintenance}
          >
            <span>Maintenance</span>
            <span className="dNav__chev">{subOpen.maintenance ? '▼' : '▶'}</span>
          </button>
          {subOpen.maintenance && (
            <div className="dNav__subList">
              {canNavItem(permissions, 'maintenance', ext) &&
                companyHasGambling && (
                <a
                  className="dNav__subItem"
                  href={phref('capture_maintenance.php')}
                  onClick={go}
                >
                  Data Capture
                </a>
              )}
              {canNavItem(permissions, 'maintenance', ext) &&
                companyHasGambling && (
                <a
                  className="dNav__subItem"
                  href={phref('transaction_maintenance.php')}
                  onClick={go}
                >
                  Transaction
                </a>
              )}
              {canNavItem(permissions, 'maintenance', ext) && (
                <a className="dNav__subItem" href={phref('payment_maintenance.php')} onClick={go}>
                  Payment
                </a>
              )}
              {companyHasGambling && (
                <a
                  className="dNav__subItem"
                  href={phref('formula_maintenance.php')}
                  onClick={go}
                >
                  Formula
                </a>
              )}
              {canNavItem(permissions, 'maintenance', ext) &&
                companyHasBank && (
                <a
                  className="dNav__subItem"
                  href={phref('bankprocess_maintenance.php')}
                  onClick={go}
                >
                  Process
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {context.expiration && (
        <div className={`dNav__exp dNav__exp--${context.expiration.status}`}>
          <span className="dNav__expLab">Exp</span>
          <span className="dNav__expTxt">{context.expiration.text}</span>
        </div>
      )}

      <a
        className="dNav__logout"
        href={phref('dashboard.php?logout=1')}
        onClick={go}
      >
        Logout
      </a>
    </nav>
  )
}
