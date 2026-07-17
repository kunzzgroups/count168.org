import { pickGroupAnchorCompany } from "./dashboardScope.js";

export function accountScopeIsGroupOnly(scope) {
  return Boolean(
    scope?.selectedGroup &&
      !scope?.groupsAllMode &&
      !scope?.groupAllMode &&
      !(Number(scope?.companyId) > 0),
  );
}

export function appendAccountScope(params, scope) {
  const group = String(scope?.selectedGroup || "").trim().toUpperCase();
  const companyId = Number(scope?.companyId);
  if (group) params.set("group_id", group);
  if (accountScopeIsGroupOnly(scope)) {
    params.set("group_only", "1");
  } else if (Number.isFinite(companyId) && companyId > 0) {
    params.set("company_id", String(companyId));
  }
  return params;
}

export function accountScopeQuery(scope, filters = {}) {
  const params = appendAccountScope(new URLSearchParams(), scope);
  if (filters.search) params.set("search", String(filters.search).trim());
  if (filters.showInactive) params.set("showInactive", "1");
  if (filters.showAll) params.set("showAll", "1");
  return params;
}

export function accountScopePayload(scope) {
  const params = appendAccountScope(new URLSearchParams(), scope);
  return Object.fromEntries(params.entries());
}

export function buildAccountScopeDraft(scope) {
  return {
    companyId: scope?.companyId ?? null,
    selectedGroup: scope?.selectedGroup ?? null,
    groupsAllMode: Boolean(scope?.groupsAllMode),
    groupAllMode: Boolean(scope?.groupAllMode),
  };
}

export function resolveAccountScopeDraft(draft, companies) {
  const selectedGroup = draft?.selectedGroup
    ? String(draft.selectedGroup).trim().toUpperCase()
    : null;
  let companyId = Number(draft?.companyId);
  if (!Number.isFinite(companyId) || companyId <= 0) companyId = null;
  if (draft?.groupsAllMode) {
    const fallback = companies?.find((row) => Number(row?.id) > 0);
    return {
      selectedGroup: null,
      groupsAllMode: true,
      groupAllMode: false,
      companyId: fallback?.id ? Number(fallback.id) : null,
    };
  }
  if (selectedGroup && draft?.groupAllMode && !companyId) {
    const anchor = pickGroupAnchorCompany(companies, selectedGroup);
    companyId = anchor?.id ? Number(anchor.id) : null;
  }
  return {
    selectedGroup,
    groupsAllMode: false,
    groupAllMode: Boolean(selectedGroup && draft?.groupAllMode),
    companyId,
  };
}
