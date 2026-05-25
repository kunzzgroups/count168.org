import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatReportAmount } from "../shared/reportAmountFormat.js";

export const formatAmount = formatReportAmount;

export async function fetchDomainReport(
  { dateFrom, dateTo, processId, companyId, selectedCurrencies = [], showAllCurrencies = true },
  options = {},
) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (processId) params.append("process_id", processId);
  if (companyId) params.append("company_id", companyId);
  if (!showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

export async function fetchProcesses(companyId, options = {}) {
  const { signal } = options;
  const params = new URLSearchParams();
  params.append("action", "processes");
  if (companyId) params.append("company_id", companyId);
  const url = buildApiUrl(`api/reports/domain_report_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load processes");
  }
  return json.data || [];
}
