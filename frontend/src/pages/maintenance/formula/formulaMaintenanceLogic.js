import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  fetchFormulaCompanyPermissionsRaw,
  fetchMaintenanceProcesses,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";
import {
  buildFormulaDisplayParenFromParts,
  formatSourcePercent,
  normalizeMaintenanceFormulaInput,
} from "../../../shared/formula/index.js";

export async function fetchCompanyPermissionsRaw(companyCode) {
  return fetchFormulaCompanyPermissionsRaw(companyCode);
}

export async function fetchCompanyPermissions(companyCode) {
  const permissions = await fetchCompanyPermissionsRaw(companyCode);
  return permissions.filter((p) => p !== "Bank");
}

export { isBankOnlyCategoryCompany };

export async function fetchProcesses(companyId) {
  return fetchMaintenanceProcesses(companyId);
}

export async function fetchAccounts(companyId) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  params.append("status", "active");
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);

  const response = await fetch(url);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Failed to load accounts");
  return data.data || [];
}

export async function listFormulaTemplates({ companyId, category, process, search }) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  if (category) params.append("category", category);
  if (process) params.append("process", process);
  if (search) params.append("search", String(search).toUpperCase());
  params.append("_t", Date.now());
  const url = buildApiUrl(`api/formula_maintenance/list_api.php?${params.toString()}`);
  const response = await fetch(url, { cache: "no-cache" });
  const data = await response.json();

  if (!data.success) throw new Error(data.message || data.error || "Search failed");
  const list = data.data && data.data.list ? data.data.list : data.data || [];
  return list;
}

export async function updateFormulaTemplate(payload) {
  const normalizedFormula = normalizeMaintenanceFormulaInput(payload.formula);
  const body = { ...payload, formula: normalizedFormula };

  const response = await fetch(buildApiUrl("api/formula_maintenance/update_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || "Update failed");
  return data.data;
}

export async function deleteFormulaTemplates(companyId, templateIds) {
  const response = await fetch(buildApiUrl("api/formula_maintenance/delete_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: companyId, template_ids: templateIds }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || "Delete failed");
  return data;
}

export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Failed to update session company");
  return result.data;
}

export const INPUT_METHOD_OPTIONS = [
  { value: "", text: "Select Input Method (Optional)" },
  { value: "positive_to_negative_negative_to_positive", text: "Positive to negative, negative to positive" },
  { value: "positive_to_negative_negative_to_zero", text: "Positive to negative, negative to zero" },
  { value: "negative_to_positive_positive_to_zero", text: "Negative to positive, positive to zero" },
  { value: "positive_unchanged_negative_to_zero", text: "Positive unchanged, negative to zero" },
  { value: "negative_unchanged_positive_to_zero", text: "Negative unchanged, positive to zero" },
  { value: "change_to_positive", text: "Change to positive" },
  { value: "change_to_negative", text: "Change to negative" },
  { value: "change_to_zero", text: "Change to zero" },
];

export const toUpperDisplay = (val) => {
  if (val === null || val === undefined) return "-";
  const str = String(val).trim();
  return str ? str.toUpperCase() : "-";
};

export function formulaRowIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Edit form: formula field is base-only; strip accidental *(source) suffix. */
export function parseFormulaEditTail(raw) {
  const base = normalizeMaintenanceFormulaInput(raw);
  return { base, tail: null };
}

export function buildFormulaEditString(base) {
  return String(base ?? "").trim();
}

/** Formula 编辑框展示 = base +（Source≠1 时）* (source)，与列表 Formula 列一致。 */
export function buildEditFormFormulaDisplay(base, sourcePercent) {
  const b = normalizeMaintenanceFormulaInput(base);
  const source = formatSourcePercent(sourcePercent ?? "1");
  const enable = source !== "1" && source !== "" ? 1 : 0;
  return buildFormulaDisplayParenFromParts(b, source, enable);
}

export function resolveFormulaBaseFromRow(row) {
  const fromEdit = String(row?.formula_edit ?? "").trim();
  if (fromEdit) return normalizeMaintenanceFormulaInput(fromEdit);
  return normalizeMaintenanceFormulaInput(row?.formula ?? "");
}

export function createFormulaEditFormFromRow(row) {
  const sourcePercent =
    row?.source != null && String(row.source).trim() !== "" && String(row.source).trim() !== "-"
      ? String(row.source).trim()
      : "1";
  const base = resolveFormulaBaseFromRow(row);
  return {
    account_id: row?.account_id || "",
    source_ref: row?.source_ref != null ? String(row.source_ref) : "",
    source_percent: formatSourcePercent(sourcePercent),
    input_method: row?.input_method || "",
    formula: buildEditFormFormulaDisplay(base, sourcePercent),
    description: row?.description || "",
  };
}

/** Source 列变更：同步更新 Formula 编辑框里的 * (source) 后缀。 */
export function syncEditFormSourcePercent(form, newSourcePercent) {
  const base = normalizeMaintenanceFormulaInput(form.formula);
  const source = formatSourcePercent(newSourcePercent);
  return {
    ...form,
    source_percent: source,
    formula: buildEditFormFormulaDisplay(base, source),
  };
}

export function patchFormulaRowAfterSave(row, { id, editForm, accountLabel, serverData }) {
  if (!formulaRowIdsMatch(row.id, id)) return row;
  const source = formatSourcePercent(editForm.source_percent ?? row.source ?? "1");
  const formulaBase = normalizeMaintenanceFormulaInput(editForm.formula ?? row.formula_edit ?? "");
  const enable = source !== "1" ? 1 : 0;
  const next = {
    ...row,
    account_id: editForm.account_id,
    account: accountLabel || row.account,
    source_ref: serverData?.source_ref ?? editForm.source_ref ?? row.source_ref,
    source: serverData?.source_summary_display ?? source,
    input_method: editForm.input_method ?? "",
    formula: serverData?.formula_display_paren ?? buildFormulaDisplayParenFromParts(formulaBase, source, enable),
    formula_edit: serverData?.formula_edit ?? formulaBase,
    description: editForm.description ?? "",
  };
  return prepareFormulaRowsForDisplay([next])[0];
}

export function prepareFormulaRowsForDisplay(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    ...row,
    _process: toUpperDisplay(row.process),
    _account: toUpperDisplay(row.account),
    _currency: toUpperDisplay(row.currency),
    _source: toUpperDisplay(row.source),
    _product: toUpperDisplay(row.product),
    _inputMethod: toUpperDisplay(row.input_method),
    _formula: toUpperDisplay(row.formula),
    _description: toUpperDisplay(row.description),
  }));
}
