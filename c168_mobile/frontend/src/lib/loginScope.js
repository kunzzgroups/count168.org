/**
 * Group vs company login scope — mirrors desktop loginScope.js / group_company_access.php.
 */

export const LOGIN_SCOPE_GROUP = "group";
export const LOGIN_SCOPE_COMPANY = "company";

const SYSTEM_IT_LOGIN_IDS = new Set(["IT_JK", "IT_JS", "IT_MS"]);

export function isSystemMaintenanceItUser(me) {
  const loginId = String(me?.login_id || "").trim().toUpperCase();
  return SYSTEM_IT_LOGIN_IDS.has(loginId);
}

export function normalizeLoginScope(scope) {
  const s = String(scope || "").trim().toLowerCase();
  if (s === LOGIN_SCOPE_GROUP || s === LOGIN_SCOPE_COMPANY) return s;
  return null;
}

export function getLoginScope(me) {
  return normalizeLoginScope(me?.login_scope);
}

export function getLoginIdentifier(me) {
  const id = String(me?.login_identifier || "").trim().toUpperCase();
  return id || null;
}

export function isGroupLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_GROUP;
}

export function isCompanyLogin(me) {
  return getLoginScope(me) === LOGIN_SCOPE_COMPANY;
}

function readAccessibleGroupIds(me) {
  const raw = me?.accessible_group_ids;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const code of raw) {
    const g = String(code || "").trim().toUpperCase();
    if (!g || seen.has(g)) continue;
    seen.add(g);
    out.push(g);
  }
  return out.sort();
}

export function getAssignedGroupCodes(me) {
  const raw = me?.assigned_group_codes;
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const code of raw) {
    const g = String(code || "").trim().toUpperCase();
    if (!g || seen.has(g)) continue;
    seen.add(g);
    out.push(g);
  }
  return out.sort();
}

export function userHasAssignedGroupLedger(me) {
  return getAssignedGroupCodes(me).length > 0;
}

export function companyLoginHasGroupLedgerPrivilege(me) {
  if (!isCompanyLogin(me)) return false;
  const role = String(me?.role || "").trim().toLowerCase();
  const userType = String(me?.user_type || "").trim().toLowerCase();
  return role === "owner" || userType === "owner";
}

export function resolveAccessibleGroupIds(me, companies = []) {
  const set = new Set(readAccessibleGroupIds(me));
  const ident = getLoginIdentifier(me);
  if (ident && isGroupLogin(me)) set.add(ident);
  if (isCompanyLogin(me)) {
    for (const g of getAssignedGroupCodes(me)) set.add(g);
  }
  for (const c of companies || []) {
    const g = String(c?.group_id || "").trim().toUpperCase();
    if (g) set.add(g);
    const link = c?.link_source_group ? String(c.link_source_group).trim().toUpperCase() : "";
    if (link) set.add(link);
  }
  return [...set].sort();
}

function resolveCompanyLoginAccessibleGroupSet(me, companies = []) {
  const set = new Set(resolveAccessibleGroupIds(me, companies));
  for (const g of getAssignedGroupCodes(me)) set.add(g);
  return set;
}

export function userCanUseGroupLedger(me) {
  if (!me) return false;
  if (isGroupLogin(me)) return true;
  if (isCompanyLogin(me)) {
    return companyLoginHasGroupLedgerPrivilege(me) || userHasAssignedGroupLedger(me);
  }
  return Boolean(me.can_use_group_ledger) || userHasAssignedGroupLedger(me);
}

export function canAccessGroupLedgerForGroup(me, groupCode, companies = []) {
  if (!me || groupCode == null || String(groupCode).trim() === "") return false;
  const g = String(groupCode).trim().toUpperCase();
  if (isGroupLogin(me)) {
    const ident = getLoginIdentifier(me);
    if (ident === g) return true;
    return resolveAccessibleGroupIds(me, companies).includes(g);
  }
  if (isCompanyLogin(me)) {
    if (companyLoginHasGroupLedgerPrivilege(me)) {
      const set = resolveCompanyLoginAccessibleGroupSet(me, companies);
      if (set.has(g)) return true;
      if (!companies?.length) return true;
      return false;
    }
    return getAssignedGroupCodes(me).includes(g);
  }

  const role = String(me?.role || me?.user_type || "").trim().toLowerCase();
  if (role === "owner") {
    for (const c of companies || []) {
      const gid = String(c?.group_id || "").trim().toUpperCase();
      if (gid === g) return true;
    }
    return userCanUseGroupLedger(me);
  }

  return getAssignedGroupCodes(me).includes(g);
}

/**
 * May user deselect company and view group ledger for the given group?
 */
export function canUseGroupOnlyMode(me, groupCode = null, companies = null) {
  if (isSystemMaintenanceItUser(me)) return false;
  if (!me) return false;
  if (groupCode != null && String(groupCode).trim() !== "") {
    return canAccessGroupLedgerForGroup(me, groupCode, companies ?? []);
  }
  return userCanUseGroupLedger(me);
}
