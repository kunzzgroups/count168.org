import { useCallback, useEffect, useState } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import { resolvePostLoginRedirect } from '../lib/resolvePostLoginRedirect'
import { publicAsset } from '../lib/publicAsset'
import type { ApiResult } from '../types/api'
import './DashboardPage.css'

type DashboardBootstrap = {
  userData?: unknown
  companyId?: number | null
  canViewAnalytics?: boolean
  redirect?: string
}

type ViewState = 'loading' | 'error' | 'ready'

async function readBootstrap(
  onRedirect: (url: string) => void,
): Promise<'ok' | 'needRedirect' | 'fail'> {
  const res = await apiFetch('/api/dashboard/bootstrap_api.php')
  let json: ApiResult<DashboardBootstrap>
  try {
    json = await res.json()
  } catch {
    return 'fail'
  }
  if (!json.success) {
    const d = json.data as { redirect?: string } | null | undefined
    if (d && typeof d.redirect === 'string' && d.redirect) {
      onRedirect(resolvePostLoginRedirect(d.redirect))
      return 'needRedirect'
    }
    onRedirect(apiUrl('/index.php'))
    return 'needRedirect'
  }
  const d = json.data
  if (d && typeof d === 'object' && 'redirect' in d && d.redirect) {
    onRedirect(resolvePostLoginRedirect(d.redirect as string))
    return 'needRedirect'
  }
  return 'ok'
}

/**
 * 对应 `dashboard.php`：校验会话后全屏内嵌 `dashboard_classic.php`（不再叠第二层「数据面板」加载层）。
 */
export function DashboardPage() {
  const [view, setView] = useState<ViewState>('loading')
  const [errorHint, setErrorHint] = useState('')
  const [classicSrc, setClassicSrc] = useState('')

  const goRedirect = useCallback((url: string) => {
    window.location.assign(url)
  }, [])

  const runBootstrap = useCallback(
    async (opts?: { isAlive?: () => boolean }) => {
      const isAlive = opts?.isAlive ?? (() => true)
      setView('loading')
      setErrorHint('')
      const redirect = (url: string) => {
        if (isAlive()) goRedirect(url)
      }
      try {
        const r = await readBootstrap(redirect)
        if (!isAlive()) return
        if (r === 'needRedirect' || r === 'fail') {
          if (r === 'fail') {
            setErrorHint('无法连接服务器，请检查网络后重试。')
            setView('error')
          }
          return
        }
        setClassicSrc(resolvePostLoginRedirect('dashboard_classic.php'))
        setView('ready')
      } catch {
        if (!isAlive()) return
        setErrorHint('网络异常，请重试。')
        setView('error')
      }
    },
    [goRedirect],
  )

  useEffect(() => {
    let alive = true
    void runBootstrap({ isAlive: () => alive })
    return () => {
      alive = false
    }
  }, [runBootstrap])

  if (view === 'error') {
    return (
      <div className="dashboardSpa dashboardSpa--center">
        <div className="dashboardSpa__card" role="alert">
          <p className="dashboardSpa__errTitle">Dashboard 未就绪</p>
          <p className="dashboardSpa__errText">{errorHint || '请重试'}</p>
          <div className="dashboardSpa__errActions">
            <button
              type="button"
              className="dashboardSpa__btn"
              onClick={() => {
                void runBootstrap()
              }}
            >
              重试
            </button>
            <a className="dashboardSpa__link" href={apiUrl('/index.php')}>
              回到登录
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'loading') {
    return (
      <div className="dashboardSpa" aria-busy="true" aria-label="正在加载">
        <div className="dashboardSpa__loading">
          <img
            className="dashboardSpa__logo"
            src={publicAsset('images/count_logo.png')}
            alt=""
            width={56}
            height={56}
            decoding="async"
          />
          <div className="dashboardSpa__skeleton" aria-hidden>
            <div className="dashboardSpa__skeletonLine dashboardSpa__skeletonLine--l" />
            <div className="dashboardSpa__skeletonLine" />
            <div className="dashboardSpa__skeletonLine dashboardSpa__skeletonLine--s" />
          </div>
          <p className="dashboardSpa__loadText">正在验证登录…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboardSpa">
      <iframe
        className="dashboardSpa__frame"
        title="EazyCount Dashboard"
        src={classicSrc}
      />
    </div>
  )
}
