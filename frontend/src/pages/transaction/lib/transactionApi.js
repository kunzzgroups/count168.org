import { buildApiUrl } from "../../../utils/core/apiUrl.js";

export const transactionQueryKeys = {
  searchRoot: () => ["tx-search"],
  search: ({
    companyId,
    dateFrom,
    dateTo,
    showInactive,
    showCaptureOnly,
    hideZeroBalance,
    categories,
    currencyCodes,
  }) => [
    "tx-search",
    {
      companyId: Number(companyId ?? 0),
      dateFrom: String(dateFrom || ""),
      dateTo: String(dateTo || ""),
      showInactive: !!showInactive,
      showCaptureOnly: !!showCaptureOnly,
      hideZeroBalance: !!hideZeroBalance,
      categories: Array.isArray(categories) ? [...categories].sort() : [],
      currencyCodes: Array.isArray(currencyCodes) ? [...currencyCodes].sort() : [],
    },
  ],
  categories: () => ["tx-categories"],
  accounts: (companyId) => ["tx-accounts", Number(companyId ?? 0)],
  companyCurrencies: (companyId) => ["tx-company-currencies", Number(companyId ?? 0)],
  userCurrencyOrder: () => ["tx-user-currency-order"],
  history: ({ companyId, accountDbId, dateFrom, dateTo, currency, virtualCompanyCode }) => [
    "tx-history",
    Number(companyId ?? 0),
    String(accountDbId || ""),
    String(dateFrom || ""),
    String(dateTo || ""),
    String(currency || "").toUpperCase().trim(),
    String(virtualCompanyCode || "").toUpperCase().trim(),
  ],
  contraInbox: (companyId) => ["tx-contra-inbox", Number(companyId ?? 0)],
  contraInboxRoot: () => ["tx-contra-inbox"],
};

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function getCategories() {
  const res = await fetch(buildApiUrl("api/transactions/get_categories_api.php"), { credentials: "include" });
  return safeJson(res);
}

export async function getAccounts({ companyId, role, status = "active", currency } = {}) {
  const params = new URLSearchParams();
  if (companyId != null) params.set("company_id", String(companyId));
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  if (currency) params.set("currency", currency);
  const res = await fetch(buildApiUrl(`api/transactions/get_accounts_api.php?${params.toString()}`), { credentials: "include" });
  return safeJson(res);
}

export async function getCompanyCurrencies({ companyId } = {}) {
  const params = new URLSearchParams();
  if (companyId != null) params.set("company_id", String(companyId));
  const res = await fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?${params.toString()}`), { credentials: "include" });
  return safeJson(res);
}

export async function getUserCurrencyOrder() {
  const res = await fetch(buildApiUrl(`api/transactions/user_currency_order_api.php?_t=${Date.now()}`), { credentials: "include" });
  return safeJson(res);
}

/** Same contract as legacy JS: POST JSON `{ order: string[] }` (see api/transactions/user_currency_order_api.php). */
export async function saveUserCurrencyOrder(order) {
  const codes = Array.isArray(order) ? order.map((c) => String(c || "").trim()).filter(Boolean) : [];
  const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: codes }),
    credentials: "include",
  });
  return safeJson(res);
}

function appendTxSearchWlDebugToPath(pathWithQuery) {
  if (typeof window === "undefined") return pathWithQuery;
  const wl =
    new URLSearchParams(window.location.search || "").get("tx_debug_wl") === "1" ||
    window.DEBUG_TRANSACTION_WL_TOTAL === true;
  if (!wl) return pathWithQuery;
  const sep = pathWithQuery.includes("?") ? "&" : "?";
  return `${pathWithQuery}${sep}debug_wl_total=1`;
}

function logTxSearchResponse(body) {
  if (typeof window === "undefined" || !body) return;
  if (window.DEBUG_TRANSACTION_SEARCH && body.data) {
    console.log("✅ 搜索成功:", body.data);
    console.log(
      "📊 行数:",
      (body.data.left_table?.length || 0) + (body.data.right_table?.length || 0),
    );
  }
  const d = body.data?.debug_win_loss;
  if (!d) return;
  try {
    console.groupCollapsed("[Transaction List] Win/Loss 诊断 (debug_wl_total)");
    console.log("bucket_sums_hp", d.bucket_sums_hp);
    console.log("totals_summary_from_api", d.totals_summary_from_api);
    const small = d.nonzero_sorted_smallest_abs || [];
    console.log("nonzero 按 |W/L| 升序（前 20 条）", small.slice(0, 20));
    if ((d.bucket_mismatch_rows || []).length > 0) {
      console.warn("bucket_mismatch_rows", d.bucket_mismatch_rows);
    }
    console.log("完整 debug_win_loss", d);
    console.groupEnd();
  } catch (e) {
    console.warn("[Transaction List] debug_win_loss 打印失败", e);
  }
}

export async function searchTransactions({
  companyId,
  dateFrom,
  dateTo,
  showInactive,
  showCaptureOnly,
  hideZeroBalance,
  currencyCodes,
  categories,
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (companyId != null) params.set("company_id", String(companyId));
  params.set("date_from", String(dateFrom || ""));
  params.set("date_to", String(dateTo || ""));
  params.set("show_inactive", showInactive ? "1" : "0");
  params.set("show_capture_only", showCaptureOnly ? "1" : "0");
  params.set("hide_zero_balance", hideZeroBalance ? "1" : "0");
  if (Array.isArray(currencyCodes) && currencyCodes.length > 0) params.set("currency", currencyCodes.join(","));
  if (Array.isArray(categories) && categories.length > 0) params.set("category", categories.join(","));

  const base = `api/transactions/search_api.php?${params.toString()}`;
  const withDebug = appendTxSearchWlDebugToPath(base);
  const url = buildApiUrl(withDebug);

  const res = await fetch(url, {
    credentials: "include",
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  const body = await safeJson(res);
  logTxSearchResponse(body);
  return body;
}

export async function submitTransaction({ companyId, payload, clientRequestId }) {
  const fd = new FormData();
  if (companyId != null) fd.append("company_id", String(companyId));
  if (clientRequestId) fd.append("client_request_id", clientRequestId);
  Object.entries(payload || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, String(v));
  });
  const res = await fetch(buildApiUrl("api/transactions/submit_api.php"), {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  return safeJson(res);
}

export async function getHistory({
  companyId,
  accountId,
  dateFrom,
  dateTo,
  currency,
  virtualCompanyCode,
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (companyId != null) params.set("company_id", String(companyId));
  if (accountId != null && accountId !== "") params.set("account_id", String(accountId));
  if (dateFrom) params.set("date_from", String(dateFrom));
  if (dateTo) params.set("date_to", String(dateTo));
  if (currency) params.set("currency", String(currency));
  if (virtualCompanyCode) params.set("virtual_company_code", String(virtualCompanyCode));

  const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params.toString()}&_t=${Date.now()}`), {
    credentials: "include",
    cache: "no-cache",
    headers: { "Cache-Control": "no-cache" },
    signal,
  });
  const body = await safeJson(res);
  /** PHP returns { data: { account, date_range, history: Row[] } }; normalize to rows + meta for React. */
  if (
    body?.success &&
    body.data &&
    typeof body.data === "object" &&
    !Array.isArray(body.data) &&
    Array.isArray(body.data.history)
  ) {
    return {
      ...body,
      data: body.data.history,
      account: body.data.account,
      date_range: body.data.date_range,
    };
  }
  return body;
}

export async function loadContraInbox({ companyId, signal } = {}) {
  const params = new URLSearchParams();
  if (companyId != null) params.set("company_id", String(companyId));
  const res = await fetch(buildApiUrl(`api/transactions/contra_inbox_api.php?${params.toString()}`), {
    credentials: "include",
    cache: "no-cache",
    signal,
  });
  return safeJson(res);
}

export async function approveContra({ transactionId, companyId }) {
  const fd = new FormData();
  fd.append("transaction_id", String(transactionId));
  if (companyId != null) fd.append("company_id", String(companyId));
  const res = await fetch(buildApiUrl("api/transactions/contra_approve_api.php"), { method: "POST", body: fd, credentials: "include" });
  return safeJson(res);
}

export async function rejectContra({ transactionId, companyId }) {
  const fd = new FormData();
  fd.append("transaction_id", String(transactionId));
  if (companyId != null) fd.append("company_id", String(companyId));
  const res = await fetch(buildApiUrl("api/transactions/contra_reject_api.php"), { method: "POST", body: fd, credentials: "include" });
  return safeJson(res);
}

