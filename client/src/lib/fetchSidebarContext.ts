import { apiFetch, apiUrl } from './api'
import type { ApiResult } from '../types/api'
import type { SidebarContext } from '../types/sidebarContext'

export async function fetchSidebarContext(): Promise<SidebarContext | null> {
  const res = await apiFetch('/api/dashboard/sidebar_context_api.php')
  if (res.status === 401) {
    const url = apiUrl('/index.php')
    window.location.assign(url)
    return null
  }
  const json: ApiResult<SidebarContext> = await res.json()
  if (json.success && json.data) {
    return json.data
  }
  if (!json.success) {
    const d = json.data as { redirect?: string } | undefined
    if (d?.redirect) {
      window.location.assign(apiUrl('/' + String(d.redirect).replace(/^\//, '')))
    }
  }
  return null
}
