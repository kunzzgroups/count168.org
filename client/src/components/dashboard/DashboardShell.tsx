import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { publicAsset } from '../../lib/publicAsset'
import { resolvePostLoginRedirect } from '../../lib/resolvePostLoginRedirect'
import { fetchSidebarContext } from '../../lib/fetchSidebarContext'
import type { DashboardBootstrapData } from '../../types/dashboard'
import type { SidebarContext } from '../../types/sidebarContext'
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
    const onCompany = () => {
      void loadContext()
    }
    window.addEventListener('c168:company-session-updated', onCompany)
    return () => window.removeEventListener('c168:company-session-updated', onCompany)
  }, [loadContext])

  const shellClass = classicSidebarLayout ? 'dShell dShell--classicSidebar' : 'dShell'

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
              href={resolvePostLoginRedirect(classicPage ?? 'dashboard_classic.php')}
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
            className="dShell__backdrop"
            aria-label="关闭菜单"
            onClick={() => setNavOpen(false)}
          />
        )}
        <aside
          className={
            navOpen
              ? 'dShell__aside dShell__aside--open'
              : 'dShell__aside'
          }
          aria-label="侧栏"
        >
          {ctxError && (
            <p className="dShell__ctxErr" role="alert">
              菜单信息加载失败
            </p>
          )}
          {ctx ? (
            <DashboardNav
              context={ctx}
              onCloseMobile={() => setNavOpen(false)}
            />
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
