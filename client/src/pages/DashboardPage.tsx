import { useCallback, useEffect, useState } from 'react'
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

/**
 * 背景请求用于：未登录 / member / owner 二级密码 等在顶层整页跳转，不挡首屏（iframe 立即加载经典页）。
 */
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
 * 全屏内嵌 `dashboard_classic.php`；与 `api/dashboard/bootstrap_api.php` 并行，避免「正在验证登录」整屏等待。
 */
export function DashboardPage() {
  const [classicSrc] = useState(() =>
    resolvePostLoginRedirect('dashboard_classic.php'),
  )

  const goRedirect = useCallback((url: string) => {
    window.location.assign(url)
  }, [])

  useEffect(() => {
    let alive = true
    void readBootstrap((url) => {
      if (alive) goRedirect(url)
    })
    return () => {
      alive = false
    }
  }, [goRedirect])

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
