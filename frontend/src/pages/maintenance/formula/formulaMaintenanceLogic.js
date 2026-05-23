import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  fetchFormulaCompanyPermissionsRaw,
  fetchMaintenanceProcesses,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";

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

/**
 * Fetch accounts for a specific company
 */
export async function fetchAccounts(companyId) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  params.append("status", "active");
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);
  
  const response = await fetch(url);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Failed to load accounts');
  return data.data || [];
}

/**
 * List formula templates
 */
export async function listFormulaTemplates({ companyId, category, process, search }) {
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  if (category) params.append("category", category);
  if (process) params.append("process", process);
  if (search) params.append("search", search);
  params.append("_t", Date.now()); // Prevent caching
  
  const url = buildApiUrl(`api/formula_maintenance/list_api.php?${params.toString()}`);
  const response = await fetch(url, { cache: 'no-cache' });
  const data = await response.json();
  
  if (!data.success) throw new Error(data.message || data.error || 'Search failed');
  return (data.data && data.data.list) ? data.data.list : (data.data || []);
}

/**
 * Update formula template
 */
export async function updateFormulaTemplate(payload) {
  const response = await fetch(buildApiUrl('api/formula_maintenance/update_api.php'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || 'Update failed');
  return data.data;
}

/**
 * Delete formula templates
 */
export async function deleteFormulaTemplates(companyId, templateIds) {
  const response = await fetch(buildApiUrl('api/formula_maintenance/delete_api.php'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: companyId, template_ids: templateIds })
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || data.error || 'Delete failed');
  return data;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'Failed to update session company');
  return result.data;
}

export const INPUT_METHOD_OPTIONS = [
  { value: '', text: 'Select Input Method (Optional)' },
  { value: 'positive_to_negative_negative_to_positive', text: 'Positive to negative, negative to positive' },
  { value: 'positive_to_negative_negative_to_zero', text: 'Positive to negative, negative to zero' },
  { value: 'negative_to_positive_positive_to_zero', text: 'Negative to positive, positive to zero' },
  { value: 'positive_unchanged_negative_to_zero', text: 'Positive unchanged, negative to zero' },
  { value: 'negative_unchanged_positive_to_zero', text: 'Negative unchanged, positive to zero' },
  { value: 'change_to_positive', text: 'Change to positive' },
  { value: 'change_to_negative', text: 'Change to negative' },
  { value: 'change_to_zero', text: 'Change to zero' }
];

export const toUpperDisplay = (val) => {
  if (val === null || val === undefined) return '-';
  const str = String(val).trim();
  return str ? str.toUpperCase() : '-';
};

/** Loose id match (API may return number, UI may hold string). */
export function formulaRowIdsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Merge save payload + API response into one list row (keeps scroll position; no full reload). */
export function patchFormulaRowAfterSave(row, { id, editForm, accountLabel, serverData }) {
  if (!formulaRowIdsMatch(row.id, id)) return row;
  const next = {
    ...row,
    account_id: editForm.account_id,
    account: accountLabel || row.account,
    source_ref: serverData?.source_ref ?? editForm.source_columns,
    source: serverData?.source_summary_display ?? editForm.source_columns ?? row.source,
    input_method: editForm.input_method ?? "",
    formula: serverData?.formula_display_paren ?? editForm.formula,
    formula_edit: serverData?.formula_edit ?? editForm.formula,
    description: editForm.description ?? "",
  };
  return prepareFormulaRowsForDisplay([next])[0];
}

/** Precompute display strings once per row to avoid repeated toUpperDisplay during scroll. */
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
