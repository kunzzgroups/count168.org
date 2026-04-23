import type { OwnerCompany } from '../types/dashboard'

const GROUP_KEY = 'dashboard_group_filter'

export function readStoredGroupFilter(): string | null {
  try {
    return sessionStorage.getItem(GROUP_KEY)
  } catch {
    return null
  }
}

export function writeStoredGroupFilter(group: string | null) {
  try {
    if (group) sessionStorage.setItem(GROUP_KEY, group)
    else sessionStorage.removeItem(GROUP_KEY)
  } catch {
    /* ignore */
  }
}

function ownerHasGroupFilterUi(list: OwnerCompany[] | null): boolean {
  if (!list || list.length === 0) return false
  return list.some(
    (c) => c.group_id && String(c.group_id).trim() !== '',
  )
}

/**
 * 与 `js/dashboard.js` 的 isDashboardDataScopeValid 一致（未实现 Group-All 汇总模式）。
 */
export function isDashboardDataScopeValid(
  companies: OwnerCompany[] | null,
  activeCompanyId: number | null,
  selectedGroup: string | null,
): boolean {
  if (activeCompanyId == null) return false
  if (!ownerHasGroupFilterUi(companies)) return true

  if (selectedGroup) {
    return companies!.some(
      (c) =>
        Number(c.id) === Number(activeCompanyId) &&
        c.group_id &&
        String(c.group_id).toUpperCase() === selectedGroup,
    )
  }

  const cur = companies!.find((c) => Number(c.id) === Number(activeCompanyId))
  if (!cur) return false
  return !cur.group_id || String(cur.group_id).trim() === ''
}

export function uniqueGroupIds(companies: OwnerCompany[]): string[] {
  const s = new Set<string>()
  for (const c of companies) {
    if (c.group_id && String(c.group_id).trim() !== '') {
      s.add(String(c.group_id).toUpperCase())
    }
  }
  return [...s].sort()
}

export function getLinkMultiplierForCompany(
  companyId: number,
  groupFilter: string | null,
  companies: OwnerCompany[],
): number {
  if (!groupFilter || !companies.length) return 1
  const gf = String(groupFilter).toUpperCase()
  const row = companies.find(
    (c) =>
      Number(c.id) === Number(companyId) &&
      c.group_id &&
      String(c.group_id).toUpperCase() === gf,
  )
  if (row && row.link_percentage !== undefined && row.link_percentage !== null) {
    const pct = parseFloat(String(row.link_percentage))
    if (!Number.isNaN(pct) && pct >= 0) return pct / 100
  }
  return 1
}

/**
 * 初始化/恢复 group 与 company 选择（逻辑对齐 `loadOwnerCompanies` 核心分支，略去虚拟行极细节）。
 */
export function resolveInitialGroupSelection(
  companies: OwnerCompany[],
  sessionCompanyId: number | null,
): { selectedGroup: string | null; activeCompanyId: number | null } {
  const groups = uniqueGroupIds(companies)
  let selectedGroup: string | null = null
  const saved = readStoredGroupFilter()

  if (saved && groups.includes(saved)) {
    const ok = companies.some(
      (c) =>
        Number(c.id) === Number(sessionCompanyId) &&
        c.group_id &&
        String(c.group_id).toUpperCase() === saved,
    )
    if (ok) selectedGroup = saved
    else writeStoredGroupFilter(null)
  } else if (saved) {
    writeStoredGroupFilter(null)
  }

  if (!selectedGroup && sessionCompanyId) {
    const current = companies.find((c) => Number(c.id) === Number(sessionCompanyId))
    if (current?.group_id && String(current.group_id).trim() !== '') {
      selectedGroup = String(current.group_id).toUpperCase()
      writeStoredGroupFilter(selectedGroup)
    }
  }

  let activeCompanyId: number | null = sessionCompanyId
  if (companies.length === 1) {
    activeCompanyId = companies[0].id
  } else if (activeCompanyId == null && companies.length > 0) {
    activeCompanyId = companies[0].id
  }

  return { selectedGroup, activeCompanyId }
}
