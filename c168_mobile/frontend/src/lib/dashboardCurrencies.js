import { buildApiUrl } from "../utils/apiUrl.js";
import {
  companiesForPicker,
  normalizeGroupId,
  resolveViewGroupForCompany,
} from "./dashboardScope.js";

function normalizeCodes(rows) {
  return [
    ...new Set(
      (rows || [])
        .map((row) => String(row?.code ?? row ?? "")
          .trim()
          .toUpperCase())
        .filter(Boolean),
    ),
  ];
}

async function fetchCompanyCurrencySettingCodes(companyId, viewGroup = "") {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return [];

  const vg = normalizeGroupId(viewGroup);
  const queries = [];
  if (vg) {
    const subQ = new URLSearchParams({
      company_id: String(cid),
      subsidiary_accounts_only: "1",
      view_group: vg,
    });
    queries.push(subQ);
  }
  queries.push(new URLSearchParams({ company_id: String(cid) }));

  for (const q of queries) {
    try {
      const res = await fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?${q}`), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json?.success && Array.isArray(json.data) && json.data.length) {
        return normalizeCodes(json.data);
      }
    } catch {
      /* try next */
    }
  }
  return [];
}

/**
 * Load currency pills like desktop: company Currency Setting (+ subsidiary scope when Group selected).
 * Company/Group "All" unions codes from visible companies.
 */
export async function fetchMobileCurrencyCodes({
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  companies,
}) {
  const group = normalizeGroupId(selectedGroup);

  if (groupsAllMode || groupAllMode) {
    const rows = companiesForPicker(companies, { selectedGroup, groupsAllMode });
    const ids = rows
      .map((c) => Number(c.id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 30);
    if (!ids.length) return ["MYR"];

    const parts = await Promise.all(
      ids.map(async (id) => {
        const row = (companies || []).find((c) => Number(c.id) === id);
        const vg = groupsAllMode ? resolveViewGroupForCompany(row, selectedGroup) : group;
        return fetchCompanyCurrencySettingCodes(id, vg);
      }),
    );
    const merged = [...new Set(parts.flat())];
    return merged.length ? merged : ["MYR"];
  }

  const codes = await fetchCompanyCurrencySettingCodes(companyId, group);
  return codes.length ? codes : ["MYR"];
}
