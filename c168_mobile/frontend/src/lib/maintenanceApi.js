import { buildApiUrl } from "../utils/apiUrl.js";
import { fetchJson, assertApiOk } from "./fetchJson.js";
import {
  appendTransactionMaintenanceScope,
  paymentMaintenanceScopeParams,
} from "./mobileMaintenanceScope.js";

export const OWNER_COMPANIES_API = "api/transactions/get_owner_companies_api.php";

/** Load accessible companies (all=1). */
export async function fetchOwnerCompanies(signal) {
  const { res, json } = await fetchJson(buildApiUrl(`${OWNER_COMPANIES_API}?all=1`), { signal });
  assertApiOk(res, json);
  return Array.isArray(json.data) ? json.data : [];
}

/** Switch PHP session company (company scope). */
export async function updateSessionCompany(companyId, signal) {
  const { res, json } = await fetchJson(
    buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`),
    { signal },
  );
  assertApiOk(res, json);
  return json.data;
}

/** Desktop parity: Bank category uses fixed payroll processes (no processlist call). */
export const PAYROLL_PROCESS_OPTIONS = ["PROFIT", "SALARY", "COMMISSION", "BONUS"];

/** Transaction Maintenance only has data for these categories (desktop parity). */
const TXN_MAINTENANCE_CATEGORIES = new Set(["games", "gambling", "bank"]);

/**
 * Company permission categories for Transaction Maintenance, filtered to
 * Games/Gambling/Bank (mirrors desktop fetchCompanyPermissions +
 * filterTransactionMaintenancePermissions). Fallback matches desktop defaults.
 * @returns {Promise<string[]>}
 */
export async function fetchMaintenanceCategories(companyCode, signal) {
  const fallback = ["Games", "Bank"];
  if (!companyCode) return fallback;
  try {
    const { res, json } = await fetchJson(buildApiUrl("api/domain/domain_api.php"), {
      method: "POST",
      body: JSON.stringify({ action: "get_company_permissions", company_id: companyCode }),
      signal,
    });
    if (res.ok && json?.success && Array.isArray(json.data?.permissions)) {
      const filtered = json.data.permissions.filter((p) =>
        TXN_MAINTENANCE_CATEGORIES.has(String(p).toLowerCase()),
      );
      return filtered.length > 0 ? filtered : ["Games"];
    }
  } catch (e) {
    if (e?.name === "AbortError") throw e;
  }
  return fallback;
}

/** Default category pick: keep current if valid, else Games/Gambling, else Bank (desktop parity). */
export function pickMaintenanceCategory(categories, current) {
  const list = Array.isArray(categories) ? categories : [];
  if (current && list.includes(current)) return current;
  return (
    list.find((p) => ["games", "gambling"].includes(String(p).toLowerCase())) ||
    list.find((p) => String(p).toLowerCase() === "bank") ||
    list[0] ||
    "Games"
  );
}

function uniqueProcessNames(rows, pickName) {
  const names = (Array.isArray(rows) ? rows : [])
    .map((row) => String(pickName(row) ?? "").trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/**
 * Process options for the Transaction Maintenance filter (mirrors desktop
 * fetchProcessesForMaintenance): Bank → fixed payroll list; group scope →
 * domain report processes; company scope → processlist_api.
 * @returns {Promise<string[]>} process names
 */
export async function fetchMaintenanceProcessOptions({ scope, category, signal }) {
  if (String(category).toLowerCase() === "bank") {
    return [...PAYROLL_PROCESS_OPTIONS];
  }
  if (scope?.mode === "group" && scope.groupId) {
    const params = new URLSearchParams();
    params.set("action", "processes");
    params.set("view_group", scope.groupId);
    params.set("group_id", scope.groupId);
    params.set("group_aggregate", "1");
    params.set("report_scope", "group");
    const { res, json } = await fetchJson(
      buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`),
      { signal },
    );
    assertApiOk(res, json);
    return uniqueProcessNames(json.data, (r) => r.process ?? r.process_id ?? r.display_text);
  }
  if (!(Number(scope?.companyId) > 0)) return [];
  const params = new URLSearchParams();
  params.set("company_id", String(scope.companyId));
  if (category) params.set("permission", category);
  const { res, json } = await fetchJson(
    buildApiUrl(`api/processes/processlist_api.php?${params.toString()}`),
    { signal },
  );
  assertApiOk(res, json);
  return uniqueProcessNames(json.data, (r) => r.process_name ?? r.process);
}

/**
 * Transaction Maintenance search (read-only audit list).
 * @returns {Promise<Array>} rows
 */
export async function searchTransactionMaintenance({
  scope,
  dateFrom,
  dateTo,
  category,
  process,
  signal,
}) {
  const params = new URLSearchParams();
  params.set("date_from", dateFrom);
  params.set("date_to", dateTo);
  // Desktop resolveTransactionMaintenanceCategory: Gambling data is stored under Games.
  const apiCategory = String(category).toLowerCase() === "gambling" ? "Games" : category;
  if (apiCategory) params.set("category", apiCategory);
  if (process) params.set("process", process);
  appendTransactionMaintenanceScope(params, scope);

  const { res, json } = await fetchJson(
    buildApiUrl(`api/transactions/maintenance_search_api.php?${params.toString()}`),
    { signal },
  );
  assertApiOk(res, json, "Search failed");
  return Array.isArray(json.data) ? json.data : [];
}

/** Virtual rollup rows use transaction_id 0 — not real DB rows, not selectable for delete. */
export function isPaymentRowSelectable(row) {
  const id = row?.transaction_id;
  if (id === null || id === undefined || id === "") return false;
  const n = Number(id);
  return Number.isFinite(n) && n !== 0;
}

export function paymentRowKey(row, index) {
  if (isPaymentRowSelectable(row)) return `t-${row.transaction_id}`;
  return `v-${index}-${String(row.dts_created ?? "")}-${String(row.amount ?? "")}`;
}

function parsePaymentSortTime(row) {
  const m = String(row?.dts_created || "").match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})$/,
  );
  if (!m) return 0;
  const ts = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}`);
  return Number.isFinite(ts) ? ts : 0;
}

function sortPaymentRows(rows) {
  return [...rows].sort((a, b) => {
    const cmp = parsePaymentSortTime(b) - parsePaymentSortTime(a);
    if (cmp !== 0) return cmp;
    return Number(b?.transaction_id || 0) - Number(a?.transaction_id || 0);
  });
}

/**
 * Payment Maintenance search (payment/rate rows + deleted history + virtual rollups).
 * @returns {Promise<Array>} rows
 */
export async function searchPaymentMaintenance({
  scope,
  dateFrom,
  dateTo,
  transactionType,
  query,
  currency,
  signal,
}) {
  const params = new URLSearchParams();
  params.set("date_from", dateFrom);
  params.set("date_to", dateTo);
  if (transactionType) params.set("transaction_type", transactionType);
  if (query && query.trim()) params.set("q", query.trim().toUpperCase());
  if (currency) params.set("currency", currency);
  Object.entries(paymentMaintenanceScopeParams(scope)).forEach(([k, v]) => params.set(k, v));

  const { res, json } = await fetchJson(
    buildApiUrl(`api/payment_maintenance/search_api.php?${params.toString()}`),
    { signal },
  );
  assertApiOk(res, json, "Search failed");
  return sortPaymentRows(Array.isArray(json.data) ? json.data : []);
}

/** Delete selected payment records (soft-archive + cascade handled server-side). */
export async function deletePaymentRecords({ scope, transactionIds, signal }) {
  const payload = {
    transaction_ids: transactionIds,
    ...paymentMaintenanceScopeParams(scope),
  };
  const { res, json } = await fetchJson(buildApiUrl("api/payment_maintenance/delete_api.php"), {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
  assertApiOk(res, json, "Delete failed");
  return json.data || {};
}

export function formatMaintenanceAmount(value) {
  if (value === null || value === undefined || value === "") return "-";
  const val = parseFloat(value);
  if (Number.isNaN(val)) return "-";
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
