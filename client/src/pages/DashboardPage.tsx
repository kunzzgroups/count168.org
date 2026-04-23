import { useEffect, useState } from 'react'
import { apiFetch, apiUrl } from '../lib/api'
import { resolvePostLoginRedirect } from '../lib/resolvePostLoginRedirect'
import type { ApiResult } from '../types/api'
import './DashboardPage.css'

type DashboardBootstrap = {
  userData?: unknown
  companyId?: number | null
  canViewAnalytics?: boolean
  redirect?: string
}

type Gate = 'loading' | 'ready'

/**
 * 对应 `dashboard.php`：校验会话后内嵌全页 `dashboard_classic.php`（PHP 与既有脚本不改业务）。
 */
export function DashboardPage() {
  const [gate, setGate] = useState<Gate>('loading')
  const [classicSrc, setClassicSrc] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/dashboard/bootstrap_api.php')
        const json: ApiResult<DashboardBootstrap> = await res.json()
        if (cancelled) return
        if (!json.success) {
          const d = json.data as { redirect?: string } | null | undefined
          if (d && typeof d.redirect === 'string' && d.redirect) {
            window.location.assign(resolvePostLoginRedirect(d.redirect))
            return
          }
          window.location.assign(apiUrl('/index.php'))
          return
        }
        const d = json.data
        if (d && typeof d === 'object' && 'redirect' in d && d.redirect) {
          window.location.assign(
            resolvePostLoginRedirect(d.redirect as string),
          )
          return
        }
        setClassicSrc(resolvePostLoginRedirect('dashboard_classic.php'))
        setGate('ready')
      } catch {
        if (!cancelled) window.location.assign(apiUrl('/index.php'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (gate === 'loading') {
    return (
      <div className="dashboardSpa__loading" role="status" aria-live="polite">
        Loading…
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
