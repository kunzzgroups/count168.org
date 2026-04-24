import { apiFetch, apiUrl } from './api'

export type ProcessListCategory = 'Games' | 'Bank'

function normalizeToGamesBank(raw: unknown): ProcessListCategory[] {
  if (!Array.isArray(raw)) return []
  const set = new Set<ProcessListCategory>()
  for (const x of raw) {
    const p = String(x || '')
    if (p === 'Gambling' || p === 'Games') set.add('Games')
    else if (p === 'Bank') set.add('Bank')
  }
  return Array.from(set).sort((a, b) => {
    const rank: Record<string, number> = { Games: 0, Bank: 1 }
    return (rank[a] ?? 99) - (rank[b] ?? 99)
  })
}

/** 与 `buildProcessListSearch` / `loadPermissionButtons` 一致：双权限时读 localStorage */
function preferredDualCategory(companyCode: string): ProcessListCategory {
  const code = String(companyCode || '')
    .trim()
    .toUpperCase()
  if (!code || typeof localStorage === 'undefined') return 'Games'
  try {
    let saved = localStorage.getItem(`selectedPermission_${code}`)
    if (saved === 'Gambling') saved = 'Games'
    if (saved === 'Bank') return 'Bank'
  } catch {
    /* ignore */
  }
  return 'Games'
}

/**
 * 按公司代码（如 CX、AG）解析 Process List 应对应的 category，与经典页 `get_company_permissions` 一致。
 */
export async function resolveProcessListCategoryForCompanyCode(
  companyCode: string,
): Promise<ProcessListCategory> {
  const code = String(companyCode || '').trim()
  if (!code) return 'Games'
  try {
    const res = await apiFetch(apiUrl('/api/domain/domain_api.php'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_company_permissions',
        company_id: code.toUpperCase(),
      }),
    })
    const json = (await res.json()) as {
      success?: boolean
      data?: { permissions?: unknown }
    }
    const perms = normalizeToGamesBank(
      json.success && json.data?.permissions != null ? json.data.permissions : [],
    )
    if (perms.length === 1) {
      return perms[0]!
    }
    if (perms.includes('Games') && perms.includes('Bank')) {
      return preferredDualCategory(code)
    }
    if (perms.includes('Bank')) return 'Bank'
    return 'Games'
  } catch {
    return 'Games'
  }
}
