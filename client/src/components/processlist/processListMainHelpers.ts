import type { GamePermission } from '../../lib/processListTypes'

const STORAGE_PREFIX = 'selectedPermission_'

export function permissionStorageKey(companyCode: string): string {
  return `${STORAGE_PREFIX}${companyCode}`
}

export function readStoredCategory(companyCode: string | null): string | null {
  if (!companyCode) return null
  try {
    const v = localStorage.getItem(permissionStorageKey(companyCode))
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function writeStoredCategory(companyCode: string, category: string): void {
  try {
    localStorage.setItem(permissionStorageKey(companyCode), category)
  } catch {
    /* ignore */
  }
}

/** 路由 + 公司与域名权限决定当前类别；Bank / Games 专页会强制。 */
export function resolveActiveCategory(
  pathname: string,
  companyCode: string | null,
  domainPerms: GamePermission[],
): GamePermission {
  if (pathname.includes('/process/bank')) {
    if (domainPerms.includes('Bank')) return 'Bank'
  }
  if (pathname.includes('/process/games')) {
    if (domainPerms.includes('Games')) return 'Games'
  }
  const stored = readStoredCategory(companyCode)
  if (stored && domainPerms.includes(stored as GamePermission)) {
    return stored as GamePermission
  }
  const first = domainPerms[0]
  return (first || 'Games') as GamePermission
}

export function routeForCategory(cat: string): string {
  const c = String(cat || '').trim()
  if (c === 'Bank') return '/process/bank'
  if (c === 'Games') return '/process/games'
  return '/process'
}
