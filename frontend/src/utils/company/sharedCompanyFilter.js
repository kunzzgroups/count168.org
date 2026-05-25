/**
 * Pure helpers mirroring legacy `js/shared_company_filter.js` + PHP `api/company/company_filter.php` (SSR, unused by SPA).
 * React pages should use these for session key `dashboard_group_filter` and group/company visibility logic.
 */

export const DASHBOARD_GROUP_FILTER_KEY = "dashboard_group_filter";

/** In-memory cache so report/maintenance remounts do not re-block on companies API. */
let ownerCompaniesCache = null;
let ownerCompaniesInflight = null;

export function getCachedOwnerCompanies() {
  return ownerCompaniesCache;
}

export function setCachedOwnerCompanies(rows) {
  ownerCompaniesCache = Array.isArray(rows) ? rows : null;
}

/** @param {() => Promise<object[]>} fetcher */
export async function loadOwnerCompaniesCached(fetcher) {
  if (ownerCompaniesCache) return ownerCompaniesCache;
  if (!ownerCompaniesInflight) {
    ownerCompaniesInflight = fetcher()
      .then((rows) => {
        ownerCompaniesCache = rows;
        ownerCompaniesInflight = null;
        return rows;
      })
      .catch((err) => {
        ownerCompaniesInflight = null;
        throw err;
      });
  }
  return ownerCompaniesInflight;
}

/**
 * Normalize keys from `get_owner_companies_api` (and any proxy) so `company_id` / `group_id`
 * match Account List and Maintenance pages — otherwise Transaction filters stay empty.
 */
export function normalizeOwnerCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  const company_id = row.company_id ?? row.companyId ?? row.code ?? "";
  const group_id = row.group_id ?? row.groupId ?? row.group ?? null;
  return {
    ...row,
    company_id,
    group_id,
  };
}

/** One pill per company code; prefer the row matching `preferredCompanyId` when duplicates exist (same as maintenance transaction filters). */
export function dedupeOwnerCompaniesByCode(companies, preferredCompanyId) {
  const list = filterCompaniesWithDisplayId(companies);
  const byCode = new Map();
  const norm = (v) => String(v || "").toUpperCase().trim();
  for (const comp of list) {
    const key = norm(comp.company_id);
    if (!key) continue;
    const existing = byCode.get(key);
    if (!existing) {
      byCode.set(key, comp);
      continue;
    }
    const existingIsCurrent = Number(existing.id) === Number(preferredCompanyId);
    const currentIsCurrent = Number(comp.id) === Number(preferredCompanyId);
    if (!existingIsCurrent && currentIsCurrent) byCode.set(key, comp);
  }
  return Array.from(byCode.values());
}

export function normalizeCompanyGroupId(comp) {
  return String(comp?.group_id ?? "").trim().toUpperCase();
}

/** Sorted unique non-empty group ids from company rows. */
export function sortedUniqueGroupIds(companies) {
  const set = new Set();
  for (const c of companies || []) {
    const g = normalizeCompanyGroupId(c);
    if (g) set.add(g);
  }
  return [...set].sort();
}

export function persistDashboardGroupFilter(selectedGroup) {
  if (selectedGroup) sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selectedGroup);
  else sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
}

/**
 * Boot-time resolution (matches transaction/maintenance pages): honour session only when it matches current company's group.
 */
export function resolveInitialSelectedGroupFromSession(companies, currentCompany) {
  const savedGroup = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
  const groups = sortedUniqueGroupIds(companies);
  let selGroup = null;
  if (
    savedGroup &&
    groups.includes(savedGroup) &&
    currentCompany?.group_id &&
    normalizeCompanyGroupId(currentCompany) === savedGroup
  ) {
    selGroup = savedGroup;
  } else if (savedGroup && !groups.includes(savedGroup)) {
    sessionStorage.removeItem(DASHBOARD_GROUP_FILTER_KEY);
  }
  if (!selGroup && currentCompany?.group_id?.trim()) {
    selGroup = normalizeCompanyGroupId(currentCompany);
    sessionStorage.setItem(DASHBOARD_GROUP_FILTER_KEY, selGroup);
  }
  return selGroup;
}

export function filterCompaniesWithDisplayId(companies) {
  return (companies || []).filter((c) => c?.company_id && String(c.company_id).trim() !== "");
}

/**
 * Legacy group-button click: toggle off → independent companies + first independent active;
 * select group → first company in that group active.
 * @returns {{ selectedGroup: string|null, companyToActivate: object|null }}
 */
export function applySharedGroupButtonClick({ clickedGroupId, currentSelectedGroup, companies }) {
  const gid = String(clickedGroupId || "").trim().toUpperCase();
  const list = filterCompaniesWithDisplayId(companies);

  if (currentSelectedGroup === gid) {
    const independents = list.filter((c) => !normalizeCompanyGroupId(c));
    const first = independents[0] ?? null;
    return { selectedGroup: null, companyToActivate: first };
  }

  const inGroup = list.filter((c) => normalizeCompanyGroupId(c) === gid);
  const first = inGroup[0] ?? null;
  return { selectedGroup: gid, companyToActivate: first };
}

/**
 * Whether a company row should be visible for the shared filter strip (when group strip is shown).
 * @param {"follow"|"all"|"ungrouped"} [groupViewMode="follow"] — same semantics as User List `groupFilterKind`.
 */
export function isCompanyVisibleForSharedFilter(comp, selectedGroup, hideGroupFilter, groupViewMode = "follow") {
  if (hideGroupFilter) return true;
  if (groupViewMode === "all") return true;
  const g = normalizeCompanyGroupId(comp);
  if (groupViewMode === "ungrouped") return !g;
  if (!selectedGroup) return !g;
  return g === selectedGroup;
}

/** Process List / Account List 同款：All 模式下按 group 排序展示全部公司 */
export function sortCompaniesForAllGroupView(companies, groupIds) {
  const list = [...(companies || [])];
  const groupOrder = new Map((groupIds || []).map((gid, idx) => [String(gid).toUpperCase(), idx]));
  return list.sort((a, b) => {
    const ga = normalizeCompanyGroupId(a);
    const gb = normalizeCompanyGroupId(b);
    const ra = groupOrder.has(ga) ? groupOrder.get(ga) : Number.MAX_SAFE_INTEGER;
    const rb = groupOrder.has(gb) ? groupOrder.get(gb) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return String(a.company_id || "").localeCompare(String(b.company_id || ""), undefined, { numeric: true });
  });
}

/** Maintenance 各页公司 pill 可见性（对齐 Process List groupFilterKind 语义） */
export function filterMaintenanceVisibleCompanies(
  companies,
  { groupFilterKind = "follow", selectedGroup = null, groupIds = [], preferredCompanyId = null } = {},
) {
  const list = dedupeOwnerCompaniesByCode(companies, preferredCompanyId);
  const gids = groupIds.length ? groupIds : sortedUniqueGroupIds(list);

  if (groupFilterKind === "all") {
    return sortCompaniesForAllGroupView(list, gids);
  }
  if (groupFilterKind === "ungrouped") {
    return list.filter((c) => !normalizeCompanyGroupId(c));
  }

  const sel = selectedGroup ? String(selectedGroup).trim().toUpperCase() : "";
  if (gids.length === 0) return list;
  if (!sel) {
    const ung = list.filter((c) => !normalizeCompanyGroupId(c));
    return ung.length ? ung : list;
  }
  const inG = list.filter((c) => normalizeCompanyGroupId(c) === sel);
  return inG.length ? inG : list;
}

/** All 按钮：在 all ↔ ungrouped 间切换（与 Process List 一致） */
export function toggleGroupFilterKind(current) {
  return current === "all" ? "ungrouped" : "all";
}

/**
 * Full legacy group-button behaviour: update filter + session, optionally switch active company.
 * @param {(comp: object) => Promise<void>|void} params.switchCompany receives full company row ({ id, company_id, group_id, … }).
 */
export async function applySharedGroupClickWithCompanySwitch({
  clickedGroupId,
  currentSelectedGroup,
  companies,
  currentCompanyId,
  setSelectedGroup,
  switchCompany,
}) {
  const { selectedGroup: nextGroup, companyToActivate } = applySharedGroupButtonClick({
    clickedGroupId,
    currentSelectedGroup,
    companies,
  });
  persistDashboardGroupFilter(nextGroup);
  setSelectedGroup(nextGroup);
  if (companyToActivate && Number(companyToActivate.id) !== Number(currentCompanyId)) {
    await switchCompany(companyToActivate);
  }
}
