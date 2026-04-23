import { useCallback, useEffect, useRef, useState } from 'react'
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
 * 对应 `dashboard.php`：校验会话后内嵌全页 `dashboard_classic.php`（PHP 与既有脚本不改业务）。
 */
const IFRAME_LOAD_MS = 20000

export function DashboardPage() {
  const [view, setView] = useState<ViewState>('loading')
  const [iframeReady, setIframeReady] = useState(false)
  const [errorHint, setErrorHint] = useState('')
  const [classicSrc, setClassicSrc] = useState('')
  const iframeLoadFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goRedirect = useCallback((url: string) => {
    window.location.assign(url)
  }, [])

  const runBootstrap = useCallback(
    async (opts?: { isAlive?: () => boolean }) => {
      const isAlive = opts?.isAlive ?? (() => true)
      setView('loading')
      setErrorHint('')
      setIframeReady(false)
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

  /** 少数环境下 iframe 的 load 不触发，超时后仍显示内层，避免一直卡在遮罩。 */
  useEffect(() => {
    if (view !== 'ready' || !classicSrc) return
    if (iframeLoadFallbackRef.current) {
      clearTimeout(iframeLoadFallbackRef.current)
      iframeLoadFallbackRef.current = null
    }
    iframeLoadFallbackRef.current = setTimeout(() => {
      iframeLoadFallbackRef.current = null
      setIframeReady(true)
    }, IFRAME_LOAD_MS)
    return () => {
      if (iframeLoadFallbackRef.current) {
        clearTimeout(iframeLoadFallbackRef.current)
        iframeLoadFallbackRef.current = null
      }
    }
  }, [view, classicSrc])

  const onIframeLoad = useCallback(() => {
    if (iframeLoadFallbackRef.current) {
      clearTimeout(iframeLoadFallbackRef.current)
      iframeLoadFallbackRef.current = null
    }
    setIframeReady(true)
  }, [])

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
      {!iframeReady && (
        <div
          className="dashboardSpa__iframeBlock"
          aria-live="polite"
          role="status"
        >
          <div className="dashboardSpa__spinner" aria-hidden />
          <span>正在加载数据面板…</span>
          <a
            className="dashboardSpa__openFull"
            href={classicSrc}
            target="_top"
            rel="noopener"
          >
            若长时间未显示，可点此整页打开
          </a>
        </div>
      )}
      <iframe
        className={`dashboardSpa__frame${iframeReady ? ' dashboardSpa__frame--visible' : ''}`}
        title="EazyCount Dashboard"
        src={classicSrc}
        onLoad={onIframeLoad}
      />
    </div>
  )
}
