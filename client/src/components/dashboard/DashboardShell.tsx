import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { publicAsset } from '../../lib/publicAsset'
import { appendCompanyIdToClassicRedirect } from '../../lib/resolvePostLoginRedirect'
import { fetchSidebarContext } from '../../lib/fetchSidebarContext'
import type { DashboardBootstrapData } from '../../types/dashboard'
import type { SidebarContext } from '../../types/sidebarContext'
import { ClassicInformationMenu } from './ClassicInformationMenu'
import { DashboardMain } from './DashboardMain'
import { DashboardNav } from './DashboardNav'
import './DashboardShell.css'

type Props = {
  data: DashboardBootstrapData
  /** 经典全页 PHP，如 `dashboard_classic.php`、`transaction_classic.php` */
  classicPage?: string
  /**
   * 与 `transaction_classic.php` 一致：仅深色侧栏 + 主区，不显示 EazyCount 顶栏。
   * 小屏保留一条深色顶条 + 汉堡键打开侧栏。
   * 新经典路由请优先用 `ClassicDashboardShell`（已含 sidebar.css 与 title）。
   */
  classicSidebarLayout?: boolean
  children?: ReactNode
}

export function DashboardShell({
  data,
  classicPage,
  classicSidebarLayout = false,
  children,
}: Props) {
  const [ctx, setCtx] = useState<SidebarContext | null>(null)
  const [ctxError, setCtxError] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [navNarrow, setNavNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  )

  const loadContext = useCallback(async () => {
    try {
      setCtxError(false)
      const c = await fetchSidebarContext()
      if (c) {
        setCtx(c)
        setCtxError(false)
      } else {
        setCtxError(true)
      }
    } catch {
      setCtxError(true)
    }
  }, [])

  useEffect(() => {
    void loadContext()
  }, [loadContext])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const onMq = () => setNavNarrow(mq.matches)
    onMq()
    mq.addEventListener('change', onMq)
    return () => mq.removeEventListener('change', onMq)
  }, [])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])

  useEffect(() => {
    const onCompany = () => {
      void loadContext()
    }
    window.addEventListener('c168:company-session-updated', onCompany)
    return () => window.removeEventListener('c168:company-session-updated', onCompany)
  }, [loadContext])

  /** 与 `sidebar.php` 中 `EAZYCOUNT_SPA_*` 一致，供 `datacapture.js` / `datacapturesummary.js` 在子路径部署下解析路由 */
  useEffect(() => {
    if (!classicSidebarLayout) return
    const pre = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    window.EAZYCOUNT_SPA_DASHBOARD = pre ? `${pre}/dashboard` : '/dashboard'
    window.EAZYCOUNT_SPA_TRANSACTION = pre ? `${pre}/transaction` : '/transaction'
    window.EAZYCOUNT_SPA_DATACAPTURE = pre ? `${pre}/datacapture` : '/datacapture'
    window.EAZYCOUNT_SPA_DATACAPTURESUMMARY = pre ? `${pre}/datacapturesummary` : '/datacapturesummary'
    window.EAZYCOUNT_SPA_ACCOUNTS = pre ? `${pre}/accounts` : '/accounts'
    window.EAZYCOUNT_SPA_PROCESSLIST = pre ? `${pre}/processlist` : '/processlist'
    return () => {
      delete window.EAZYCOUNT_SPA_DASHBOARD
      delete window.EAZYCOUNT_SPA_TRANSACTION
      delete window.EAZYCOUNT_SPA_DATACAPTURE
      delete window.EAZYCOUNT_SPA_DATACAPTURESUMMARY
      delete window.EAZYCOUNT_SPA_ACCOUNTS
      delete window.EAZYCOUNT_SPA_PROCESSLIST
    }
  }, [classicSidebarLayout])

  const shellClass = classicSidebarLayout ? 'dShell dShell--classicSidebar' : 'dShell'

  const asideClass =
    classicSidebarLayout && navNarrow
      ? navOpen
        ? 'dShell__aside informationmenu show'
        : 'dShell__aside informationmenu hide'
      : [
          'dShell__aside',
          classicSidebarLayout ? 'informationmenu' : '',
          !classicSidebarLayout || !navNarrow ? (navOpen ? 'dShell__aside--open' : '') : '',
        ]
          .filter(Boolean)
          .join(' ')

  const backdropClass = [
    'dShell__backdrop',
    classicSidebarLayout ? 'informationmenu-overlay' : '',
    classicSidebarLayout && navOpen ? 'show' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      {classicSidebarLayout ? (
        <header className="dShell__classicMobileHeader">
          <button
            type="button"
            className="dShell__burger dShell__burger--classicBar"
            aria-label="打开菜单"
            onClick={() => setNavOpen(true)}
          />
          {classicPage && (
            <a
              className="dShell__classicMobileLink"
              href={appendCompanyIdToClassicRedirect(classicPage, data.companyId)}
            >
              经典版
            </a>
          )}
        </header>
      ) : (
        <header className="dShell__header">
          <div className="dShell__headerLeft">
            <button
              type="button"
              className="dShell__burger"
              aria-label="打开菜单"
              onClick={() => setNavOpen(true)}
            />
            <div className="dShell__brand">
              <img
                className="dShell__logo"
                src={publicAsset('images/count_logo.png')}
                alt=""
                width={36}
                height={36}
                decoding="async"
              />
              <div className="dShell__brandText">
                <span className="dShell__product">EazyCount</span>
              </div>
            </div>
          </div>
          <div className="dShell__headerRight">
            <a
              className="dShell__classic"
              href={appendCompanyIdToClassicRedirect(
                classicPage ?? 'dashboard_classic.php',
                data.companyId,
              )}
            >
              经典版
            </a>
            <div className="dShell__user">
              <div className="dShell__avatar" aria-hidden>
                {data.userData.avatar_letter}
              </div>
              <div className="dShell__userMeta">
                <span className="dShell__name">
                  {data.userData.name || data.userData.login_id}
                </span>
                <span className="dShell__role">
                  {data.userData.role}
                  {data.companyId != null && (
                    <span className="dShell__cid"> · company #{data.companyId}</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </header>
      )}

      <div className="dShell__body">
        {navOpen && (
          <button
            type="button"
            className={backdropClass}
            aria-label="关闭菜单"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside className={asideClass} aria-label="侧栏">
          {ctxError && (
            <p className="dShell__ctxErr" role="alert">
              菜单信息加载失败
            </p>
          )}
          {ctx ? (
            classicSidebarLayout ? (
              <ClassicInformationMenu
                context={ctx}
                bootstrap={data}
                onCloseMobile={() => setNavOpen(false)}
                classicFullPageHref={
                  classicPage
                    ? appendCompanyIdToClassicRedirect(classicPage, data.companyId)
                    : undefined
                }
              />
            ) : (
              <DashboardNav context={ctx} onCloseMobile={() => setNavOpen(false)} />
            )
          ) : (
            !ctxError && <div className="dShell__ctxLoad" role="status" />
          )}
        </aside>
        <main className="dShell__main">
          {children ?? <DashboardMain bootstrap={data} />}
        </main>
      </div>
    </div>
  )
}
