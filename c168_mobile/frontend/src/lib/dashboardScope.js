export function normalizeGroupId(value) {
  return String(value || "").trim().toUpperCase();
}

export function sortedUniqueGroupIds(companies) {
  const set = new Set();
  for (const c of companies || []) {
    const g = normalizeGroupId(c?.group_id);
    if (g) set.add(g);
  }
  return [...set].sort();
}

export function resolveViewGroupForCompany(companyRow, fallbackGroup = null) {
  if (!companyRow) {
    return fallbackGroup ? normalizeGroupId(fallbackGroup) : null;
  }
  const link = companyRow.link_source_group
    ? normalizeGroupId(companyRow.link_source_group)
    : "";
  if (link) return link;
  const native = normalizeGroupId(companyRow.group_id);
  if (native) return native;
  return fallbackGroup ? normalizeGroupId(fallbackGroup) : null;
}

export function companiesInGroup(companies, groupId) {
  const gid = normalizeGroupId(groupId);
  return (companies || []).filter((c) => {
    if (!c?.company_id || String(c.company_id).trim() === "") return false;
    if (!gid) {
      return !normalizeGroupId(c.group_id);
    }
    return normalizeGroupId(c.group_id) === gid;
  });
}

export function pickGroupAnchorCompany(companies, groupId) {
  const list = companiesInGroup(companies, groupId);
  return list.find((c) => Number(c.id) > 0) || null;
}

export function companiesForPicker(companies, { selectedGroup, groupsAllMode }) {
  const rows = (companies || []).filter(
    (c) => c?.company_id && String(c.company_id).trim() !== "",
  );
  if (groupsAllMode || !selectedGroup) return rows;
  return companiesInGroup(rows, selectedGroup);
}

/** Pick subsidiary when switching group without group-only permission (desktop-aligned). */
export function resolveCompanyPickForGroup(companies, groupId, currentCompanyId = null) {
  const g = normalizeGroupId(groupId);
  if (!g) return null;
  const cid = Number(currentCompanyId);
  if (Number.isFinite(cid) && cid > 0) {
    const row = (companies || []).find((c) => Number(c.id) === cid);
    if (row) {
      const native = normalizeGroupId(row.group_id);
      const link = row.link_source_group ? normalizeGroupId(row.link_source_group) : "";
      if (native === g || link === g) return row;
    }
  }
  return pickGroupAnchorCompany(companies, g) || companiesInGroup(companies, g)[0] || null;
}

export function pickCompany(companies, sessionCompanyId) {
  if (!companies?.length) return null;
  const cid = Number(sessionCompanyId);
  if (Number.isFinite(cid) && cid > 0) {
    const match = companies.find((c) => Number(c.id) === cid);
    if (match) return match;
  }
  return companies.find((c) => Number(c.id) > 0) || null;
}

export function buildBootstrapQuery({
  dateFrom,
  dateTo,
  currency,
  currencies,
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  companies,
}) {
  const q = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
    bootstrap_scope: "full",
  });

  if (currency) q.set("currency", currency);
  if (Array.isArray(currencies) && currencies.length > 1) {
    q.set("currencies", currencies.join(","));
  }

  const group = normalizeGroupId(selectedGroup);
  const cid = Number(companyId);

  if (groupsAllMode) {
    const fallback =
      Number.isFinite(cid) && cid > 0
        ? cid
        : Number(pickCompany(companies)?.id) || null;
    if (fallback) q.set("company_id", String(fallback));
    return q;
  }

  if (group && groupAllMode) {
    const anchor = pickGroupAnchorCompany(companies, group);
    if (anchor?.id) {
      q.set("company_id", String(anchor.id));
      q.set("view_group", group);
      q.set("group_id", group);
      q.set("group_aggregate", "1");
    } else {
      q.set("view_group", group);
      q.set("group_id", group);
    }
    return q;
  }

  if (Number.isFinite(cid) && cid > 0) {
    q.set("company_id", String(cid));
    if (group) {
      q.set("view_group", group);
      q.set("group_id", group);
      q.set("subsidiary_accounts_only", "1");
    }
    return q;
  }

  if (group) {
    const anchor = pickGroupAnchorCompany(companies, group);
    q.set("view_group", group);
    q.set("group_id", group);
    if (anchor?.id) {
      q.set("company_id", String(anchor.id));
      q.set("group_aggregate", "1");
    }
    return q;
  }

  const fallback = pickCompany(companies);
  if (fallback?.id) q.set("company_id", String(fallback.id));
  return q;
}
