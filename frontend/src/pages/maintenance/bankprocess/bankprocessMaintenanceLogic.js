import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import {
  DEFAULT_PERMISSIONS_BANKPROCESS,
  fetchDomainCompanyPermissions,
} from "../shared/maintenanceCompanyApi.js";
import { formatDmyFromDate } from "../shared/maintenanceDateHelpers.js";

export function formatDmy(d) {
  return formatDmyFromDate(d);
}

export function formatAmount(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function toUpperDisplay(value) {
  if (value === null || value === undefined) return "-";
  const str = String(value).trim();
  return str ? str.toUpperCase() : "-";
}

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, {
    excludeGames: true,
    defaultPermissions: DEFAULT_PERMISSIONS_BANKPROCESS,
  });
}

export async function fetchCompanyCurrencies(companyId) {
  let url = buildApiUrl("api/transactions/get_company_currencies_api.php");
  if (companyId) {
    url += `?company_id=${encodeURIComponent(companyId)}`;
  }
  const response = await fetch(url);
  const data = await response.json();
  return data.success ? (data.data || []) : [];
}

export async function searchBankprocessData({
  dateFrom,
  dateTo,
  companyId,
  currencyCodes,
  allCurrencies,
  query,
  signal,
}) {
  const params = new URLSearchParams({
    date_from: dateFrom,
    date_to: dateTo,
  });
  if (companyId) params.set("company_id", String(companyId));
  const codes = Array.isArray(currencyCodes) ? currencyCodes.filter(Boolean) : [];
  if (!allCurrencies && codes.length) {
    params.set("currency", codes.join(","));
  }
  if (query?.trim()) params.set("q", query.trim());

  const response = await fetch(buildApiUrl(`api/bankprocess_maintenance/search_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Search failed");
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function deleteBankprocessData(transactionIds) {
  const response = await fetch(buildApiUrl("api/bankprocess_maintenance/delete_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction_ids: transactionIds }),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Delete failed");
  }
  return result;
}

export async function updateSessionCompany(companyId) {
  const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
  const result = await res.json();
  if (!result.success) {
    throw new Error(result.error || "Switch company failed");
  }
  return result.data;
}
