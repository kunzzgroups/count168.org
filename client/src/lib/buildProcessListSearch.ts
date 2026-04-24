import type { SidebarContext } from '../types/sidebarContext'

/**
 * 侧栏或书签：`?company_id=`，与 Account / Process / Data Capture / Transaction SPA 一致。
 */
export function buildCompanyIdSearch(companyId: number | null | undefined): string {
  const p = new URLSearchParams()
  const id = companyId != null ? Number(companyId) : NaN
  if (Number.isFinite(id) && id > 0) {
    p.set('company_id', String(id))
  }
  const s = p.toString()
  return s === '' ? '' : `?${s}`
}

/**
 * 侧栏「Process」链接 query：与经典 `processlist.php` / `bank_process_list.php` 对应——
 * 仅 Bank → `category=Bank`；仅 Games → `Games`；两者皆有 → 优先 `localStorage` 上次类别（与 `loadPermissionButtons` 一致），否则 `Games`。
 */
export function buildProcessListSearch(
  context: Pick<SidebarContext, 'companyHasGambling' | 'companyHasBank'>,
  companyId: number | null | undefined,
  sessionCompanyCode?: string | null,
): string {
  const p = new URLSearchParams()
  const id = companyId != null ? Number(companyId) : NaN
  if (Number.isFinite(id) && id > 0) {
    p.set('company_id', String(id))
  }
  const { companyHasGambling, companyHasBank } = context
  if (companyHasBank && !companyHasGambling) {
    p.set('category', 'Bank')
  } else if (companyHasGambling && !companyHasBank) {
    p.set('category', 'Games')
  } else if (companyHasGambling && companyHasBank) {
    let cat: 'Games' | 'Bank' = 'Games'
    const code = String(sessionCompanyCode ?? '')
      .trim()
      .toUpperCase()
    if (code && typeof localStorage !== 'undefined') {
      try {
        let saved = localStorage.getItem(`selectedPermission_${code}`)
        if (saved === 'Gambling') saved = 'Games'
        if (saved === 'Bank') cat = 'Bank'
        else if (saved === 'Games') cat = 'Games'
      } catch {
        /* ignore */
      }
    }
    p.set('category', cat)
  }
  const s = p.toString()
  return s === '' ? '' : `?${s}`
}
