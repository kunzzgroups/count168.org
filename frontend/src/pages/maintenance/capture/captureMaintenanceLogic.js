import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  fetchDomainCompanyPermissions,
  fetchMaintenanceProcesses,
} from "../shared/maintenanceCompanyApi.js";

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode);
}

export async function fetchProcesses(companyId) {
  return fetchMaintenanceProcesses(companyId);
}

/**
 * Search capture data
 * @param {AbortSignal} [options.signal] — 切换公司等场景取消过时请求，避免列表闪动与竞态
 */
export async function searchCaptureData({ dateFrom, dateTo, process, companyId, category }, options = {}) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (process) {
    params.append("process", process);
  }
  if (companyId) {
    params.append("company_id", companyId);
  }
  if (category) {
    params.append("category", category);
  }
  
  const url = buildApiUrl(`api/capture_maintenance/search_api.php?${params.toString()}`);
  const response = await fetch(url, { signal, credentials: "include" });
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.message || data.error || 'Search failed');
  }
  return data.data || [];
}

/**
 * Delete selected capture items
 */
export async function deleteCaptureItems({ items, dateFrom, dateTo }) {
  const payload = {
    date_from: dateFrom,
    date_to: dateTo,
    items: items
  };
  
  const response = await fetch(buildApiUrl('api/capture_maintenance/delete_api.php'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || data.error || 'Delete failed');
  }
  return data;
}

/**
 * Update session company
 */
export async function updateSessionCompany(companyId) {
  const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`), {
    credentials: "include",
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update session company');
  }
  return result.data;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
