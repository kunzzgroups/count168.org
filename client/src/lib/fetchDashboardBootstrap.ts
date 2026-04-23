import { apiFetch, apiUrl } from './api'
import { resolvePostLoginRedirect } from './resolvePostLoginRedirect'
import type { ApiResult } from '../types/api'
import type { DashboardBootstrapData } from '../types/dashboard'

type BootstrapResponsePayload = Partial<DashboardBootstrapData> & {
  redirect?: string
}

export type FetchDashboardBootstrapResult =
  | { kind: 'success'; data: DashboardBootstrapData }
  | { kind: 'redirect'; url: string }
  | { kind: 'fail' }

function normalizeData(raw: unknown): DashboardBootstrapData | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const u = o.userData
  if (!u || typeof u !== 'object') return null
  const user = u as Record<string, unknown>
  const perms = user.permissions
  return {
    userData: {
      name: typeof user.name === 'string' ? user.name : '',
      login_id: typeof user.login_id === 'string' ? user.login_id : '',
      role: typeof user.role === 'string' ? user.role : '',
      avatar_letter:
        typeof user.avatar_letter === 'string' ? user.avatar_letter : 'U',
      permissions: Array.isArray(perms)
        ? perms.filter((x): x is string => typeof x === 'string')
        : [],
    },
    companyId:
      o.companyId === null || o.companyId === undefined
        ? null
        : Number(o.companyId),
    canViewAnalytics: o.canViewAnalytics === true,
  }
}

/**
 * 阶段 1：与 PHP `bootstrap_api.php` 对齐；失败时由调用方处理跳转或重试。
 */
export async function fetchDashboardBootstrap(): Promise<FetchDashboardBootstrapResult> {
  const res = await apiFetch('/api/dashboard/bootstrap_api.php')
  if (!res.ok) {
    return { kind: 'fail' }
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('text/html')) {
    return { kind: 'fail' }
  }
  let json: ApiResult<BootstrapResponsePayload>
  try {
    json = await res.json()
  } catch {
    return { kind: 'fail' }
  }

  if (!json.success) {
    const d = json.data as { redirect?: string } | null | undefined
    if (d && typeof d.redirect === 'string' && d.redirect) {
      return { kind: 'redirect', url: resolvePostLoginRedirect(d.redirect) }
    }
    return { kind: 'redirect', url: apiUrl('/index.php') }
  }

  const d = json.data
  if (d && typeof d === 'object' && 'redirect' in d && d.redirect) {
    return {
      kind: 'redirect',
      url: resolvePostLoginRedirect(d.redirect as string),
    }
  }

  const data = normalizeData(d)
  if (!data) return { kind: 'fail' }
  return { kind: 'success', data }
}
