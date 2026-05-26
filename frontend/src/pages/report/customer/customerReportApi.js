import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatReportAmount, reportAmountAdd } from "../shared/reportAmountFormat.js";

export const formatAmount = formatReportAmount;
export const reportAdd = reportAmountAdd;

export async function fetchCustomerReport(
  { accountId, dateFrom, dateTo, showAll, companyId, selectedCurrencies, showAllCurrencies },
  options = {},
) {
  const { signal } = options;
  const params = new URLSearchParams();
  if (accountId) params.append("account_id", accountId);
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  if (showAll) params.append("show_all", "1");
  if (companyId) params.append("company_id", companyId);
  if (!showAllCurrencies && selectedCurrencies.length > 0) {
    params.append("currency", selectedCurrencies.join(","));
  }

  const res = await fetch(buildApiUrl(`api/reports/customer_report_api.php?${params.toString()}`), {
    credentials: "include",
    signal,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load report");
  }
  return json;
}

export async function fetchAccounts(companyId, options = {}) {
  const { signal } = options;
  const params = new URLSearchParams();
  if (companyId) params.append("company_id", companyId);
  const url = buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`);
  const res = await fetch(url, { credentials: "include", signal });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || "Failed to load accounts");
  }
  return json.data || [];
}
