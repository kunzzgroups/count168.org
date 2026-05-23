import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatDmy, parseDdMmYyyyToYmd, parseYmd } from "../../../utils/date/dateUtils.js";
import {
  fetchDomainCompanyPermissions,
  fetchMaintenanceProcesses,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";

/** 宽日期兜底分片（后端已 SQL 分页，默认整段查询；仅超大范围才分片）。 */
const MAINTENANCE_CHUNK_DAYS = 45;
const MAINTENANCE_CHUNK_THRESHOLD_DAYS = 120;
const MAINTENANCE_PARALLEL_CHUNKS = 2;
/** Page sizes tried in order when a response is still too large. */
const MAINTENANCE_PAGE_SIZES = [1500, 1000, 750, 500, 250];
const MAINTENANCE_MAX_PAGES = 40;
const MAINTENANCE_FETCH_RETRIES = 4;
const MAINTENANCE_RETRY_BASE_MS = 400;

function isFetchAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (err?.name === "AbortError") return true;
  return false;
}

function rethrowIfAborted(err, signal) {
  if (!isFetchAbortError(err, signal)) return;
  if (err?.name === "AbortError") throw err;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMaintenanceTransferError(err) {
  if (err?.isMaintenanceTransfer) return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("http2") ||
    msg.includes("quic") ||
    msg.includes("err_quic") ||
    msg.includes("incomplete") ||
    msg.includes("unexpected end") ||
    msg.includes("search failed (502)") ||
    msg.includes("search failed (503)") ||
    msg.includes("search failed (504)") ||
    msg.includes("search failed (413)") ||
    msg.includes("search failed (524)") ||
    msg.includes("search failed (520)") ||
    msg.includes("search failed (0)")
  );
}

function throwMaintenanceTransferError(message = "Failed to fetch") {
  const err = new Error(message);
  err.isMaintenanceTransfer = true;
  throw err;
}

export async function fetchCompanyPermissions(companyCode) {
  return fetchDomainCompanyPermissions(companyCode, { credentials: true });
}

export { isBankOnlyCategoryCompany };

export async function fetchProcesses(companyId) {
  return fetchMaintenanceProcesses(companyId, { credentials: true });
}

/** Select All 误传占位文案时视为未选 Process。 */
export function normalizeMaintenanceProcessFilter(process) {
  const raw = String(process ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    lower === "select all" ||
    lower === "--select all--" ||
    raw === "全部" ||
    raw === "--全部--"
  ) {
    return "";
  }
  return raw;
}

function finalizeMaintenanceRows(rows) {
  const merged = [...rows];
  merged.sort(compareMaintenanceRows);
  merged.forEach((row, index) => {
    row.no = index + 1;
  });
  return merged;
}

/**
 * Search transaction maintenance data.
 * Automatically: splits wide date ranges → paginates each slice → retries → splits again on failure.
 */
export async function searchTransactionData({
  dateFrom,
  dateTo,
  process,
  companyId,
  category,
  signal,
  onFirstPage,
}) {
  const processFilter = normalizeMaintenanceProcessFilter(process);
  const merged = await fetchMaintenanceDateRangeResilient({
    dateFrom,
    dateTo,
    process: processFilter,
    companyId,
    category,
    signal,
    onFirstPage: (partial) => {
      if (typeof onFirstPage === "function" && partial.length) {
        onFirstPage(finalizeMaintenanceRows(partial));
      }
    },
  });
  return finalizeMaintenanceRows(merged);
}

async function fetchMaintenanceDateRangeResilient({
  dateFrom,
  dateTo,
  process,
  companyId,
  category,
  signal,
  onFirstPage,
}) {
  const daySpan = maintenanceDateSpanDays(dateFrom, dateTo);
  const ranges =
    daySpan > MAINTENANCE_CHUNK_THRESHOLD_DAYS
      ? splitMaintenanceDateRange(dateFrom, dateTo, MAINTENANCE_CHUNK_DAYS)
      : [{ dateFrom, dateTo }];

  if (ranges.length === 1) {
    return fetchMaintenanceRangeWithSplit({
      dateFrom: ranges[0].dateFrom,
      dateTo: ranges[0].dateTo,
      process,
      companyId,
      category,
      signal,
      onFirstPage,
    });
  }

  const merged = [];
  for (let i = 0; i < ranges.length; i += MAINTENANCE_PARALLEL_CHUNKS) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const batch = ranges.slice(i, i + MAINTENANCE_PARALLEL_CHUNKS);
    const parts = await Promise.all(
      batch.map((range) =>
        fetchMaintenanceRangeWithSplit({
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          process,
          companyId,
          category,
          signal,
          onFirstPage: i === 0 ? onFirstPage : undefined,
        }),
      ),
    );
    for (const part of parts) {
      if (part.length) merged.push(...part);
    }
  }
  return merged;
}

async function fetchMaintenanceRangeWithSplit(params) {
  const { onFirstPage, ...rest } = params;
  try {
    return await fetchAllPagesForRange(rest, 0, onFirstPage);
  } catch (err) {
    rethrowIfAborted(err, params.signal);
    if (!isMaintenanceTransferError(err)) throw err;

    const daySpan = maintenanceDateSpanDays(params.dateFrom, params.dateTo);
    if (daySpan <= 1) {
      return fetchAllPagesForRange(rest, MAINTENANCE_PAGE_SIZES.length - 1, onFirstPage);
    }

    const [leftRange, rightRange] = splitMaintenanceDateRangeHalf(params.dateFrom, params.dateTo);
    const left = await fetchMaintenanceRangeWithSplit({
      ...rest,
      dateFrom: leftRange.dateFrom,
      dateTo: leftRange.dateTo,
      onFirstPage,
    });
    const right = await fetchMaintenanceRangeWithSplit({
      ...rest,
      dateFrom: rightRange.dateFrom,
      dateTo: rightRange.dateTo,
    });
    return left.concat(right);
  }
}

async function fetchAllPagesForRange(params, pageSizeIndex, onFirstPage) {
  const pageSize = MAINTENANCE_PAGE_SIZES[Math.min(pageSizeIndex, MAINTENANCE_PAGE_SIZES.length - 1)];

  const fetchPage = async (page) => {
    try {
      return await fetchMaintenancePageWithRetries({ ...params, page, pageSize });
    } catch (err) {
      rethrowIfAborted(err, params.signal);
      if (isMaintenanceTransferError(err) && pageSizeIndex < MAINTENANCE_PAGE_SIZES.length - 1) {
        return fetchAllPagesForRange(params, pageSizeIndex + 1, onFirstPage);
      }
      throw err;
    }
  };

  const all = [];
  let page = 1;

  while (page <= MAINTENANCE_MAX_PAGES) {
    if (params.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const result = await fetchPage(page);
    if (result.data?.length) all.push(...result.data);
    if (page === 1 && typeof onFirstPage === "function" && all.length) {
      onFirstPage(all);
    }
    if (!result.pagination?.has_more) break;
    page += 1;
  }

  return all;
}

async function fetchMaintenancePageWithRetries(params) {
  let lastErr;
  for (let attempt = 0; attempt < MAINTENANCE_FETCH_RETRIES; attempt += 1) {
    try {
      return await searchTransactionMaintenanceOnce(params);
    } catch (err) {
      lastErr = err;
      rethrowIfAborted(err, params.signal);
      if (!isMaintenanceTransferError(err)) throw err;
      if (attempt < MAINTENANCE_FETCH_RETRIES - 1) {
        await sleep(MAINTENANCE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

function splitMaintenanceDateRangeHalf(dateFrom, dateTo) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const totalDays = maintenanceDateSpanDays(dateFrom, dateTo);
  const mid = new Date(start);
  mid.setDate(mid.getDate() + Math.floor(totalDays / 2) - 1);
  const rightStart = new Date(mid);
  rightStart.setDate(rightStart.getDate() + 1);
  return [
    { dateFrom, dateTo: formatDmy(mid) },
    { dateFrom: formatDmy(rightStart), dateTo },
  ];
}

function maintenanceDateSpanDays(dateFrom, dateTo) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const end = parseMaintenanceDmyDate(dateTo);
  if (!start || !end || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function parseMaintenanceDmyDate(dmy) {
  const ymd = parseDdMmYyyyToYmd(dmy);
  return ymd ? parseYmd(ymd) : null;
}

function splitMaintenanceDateRange(dateFrom, dateTo, maxDays) {
  const start = parseMaintenanceDmyDate(dateFrom);
  const end = parseMaintenanceDmyDate(dateTo);
  if (!start || !end || start > end) return [{ dateFrom, dateTo }];

  const chunks = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    chunks.push({ dateFrom: formatDmy(cursor), dateTo: formatDmy(chunkEnd) });
    cursor.setTime(chunkEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

function parseMaintenanceDtsTimestamp(value) {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function compareMaintenanceRows(a, b) {
  const dateA = a.transaction_date ?? "";
  const dateB = b.transaction_date ?? "";
  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const tsA = parseMaintenanceDtsTimestamp(a.dts_created);
  const tsB = parseMaintenanceDtsTimestamp(b.dts_created);
  if (tsA !== tsB) return tsB - tsA;

  const capA = Number(a.capture_id ?? 0);
  const capB = Number(b.capture_id ?? 0);
  if (capA !== capB) return capB - capA;

  const detA = Number(a.capture_detail_id ?? 0);
  const detB = Number(b.capture_detail_id ?? 0);
  if (detA !== detB) return detB - detA;

  return Number(b.transaction_id ?? 0) - Number(a.transaction_id ?? 0);
}

async function searchTransactionMaintenanceOnce({
  dateFrom,
  dateTo,
  process,
  companyId,
  category,
  signal,
  page = 1,
  pageSize = MAINTENANCE_PAGE_SIZES[0],
}) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  params.append("page", String(page));
  params.append("page_size", String(pageSize));
  if (process) params.append("process", process);
  if (companyId) params.append("company_id", companyId);
  if (category) params.append("category", category);

  const url = buildApiUrl(`api/transactions/maintenance_search_api.php?${params.toString()}`);
  let response;
  try {
    response = await fetch(url, {
      credentials: "include",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    rethrowIfAborted(err, signal);
    if (isMaintenanceTransferError(err)) throw err;
    throwMaintenanceTransferError(err?.message || "Failed to fetch");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      const status = response.status || 0;
      if (status >= 500 || status === 0 || status === 413 || status === 524) {
        throwMaintenanceTransferError("Failed to fetch");
      }
      throw new Error(`HTTP ${status}`);
    }
    throwMaintenanceTransferError("Failed to fetch");
  }

  if (!response.ok || !data.success) {
    const detail = data.error || data.message;
    const status = response.status || 0;
    if (!detail && (status >= 500 || status === 0 || status === 413 || status === 524)) {
      throwMaintenanceTransferError("Failed to fetch");
    }
    throw new Error(detail || `HTTP ${status}`);
  }

  const rows = Array.isArray(data.data) ? data.data : [];
  const pagination = data.pagination ?? {
    page,
    page_size: pageSize,
    total: rows.length,
    has_more: false,
  };

  return { data: rows, pagination };
}

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

export function isMaintenanceRecoverableError(err) {
  if (!err || err?.name === "AbortError") return false;
  return isMaintenanceTransferError(err);
}

export function getMaintenanceSearchUserMessage(
  err,
  { loadingMessage = "Loading data…", narrowRangeMessage = "Loading is taking longer. Try a shorter date range or select a Process." } = {},
) {
  if (!err || isMaintenanceRecoverableError(err)) {
    return loadingMessage;
  }
  const detail = String(err?.message || "").trim();
  return detail || narrowRangeMessage;
}

export function formatAmount(value) {
  if (value === null || value === undefined || value === '') return '-';
  const val = parseFloat(value);
  if (isNaN(val)) return '-';
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
