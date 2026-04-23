import { useCallback, useEffect, useState } from 'react'
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
}

export function DashboardShell({ data }: Props) {
  const { userData, companyId } = data
  const classicUrl = resolvePostLoginRedirect('dashboard_classic.php')
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

  return (
    <div className="dShell">
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
          <a className="dShell__classic" href={classicUrl}>
            经典版
          </a>
          <div className="dShell__user">
            <div className="dShell__avatar" aria-hidden>
              {userData.avatar_letter}
            </div>
            <div className="dShell__userMeta">
              <span className="dShell__name">{userData.name || userData.login_id}</span>
              <span className="dShell__role">
                {userData.role}
                {companyId != null && (
                  <span className="dShell__cid"> · company #{companyId}</span>
                )}
              </span>
            </div>
          </div>
        </div>
      </header>

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
          <DashboardMain bootstrap={data} />
        </main>
      </div>
    </div>
  )
}
