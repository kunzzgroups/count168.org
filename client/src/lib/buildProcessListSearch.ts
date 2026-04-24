import type { SidebarContext } from '../types/sidebarContext'

/**
 * 侧栏「Process」链接 query：与 `loadPermissionButtons` 规则一致——
 * 仅 Bank 权 → `category=Bank`；仅 Games → `Games`；两者皆有 → 默认 `Games`；并附带当前 `company_id`。
 */
export function buildProcessListSearch(
  context: Pick<SidebarContext, 'companyHasGambling' | 'companyHasBank'>,
  companyId: number | null | undefined,
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
    p.set('category', 'Games')
  }
  const s = p.toString()
  return s === '' ? '' : `?${s}`
}
