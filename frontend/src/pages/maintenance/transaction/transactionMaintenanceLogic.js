import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatDmy, parseDdMmYyyyToYmd, parseYmd } from "../../../utils/date/dateUtils.js";
import {
  fetchDomainCompanyPermissions,
  fetchMaintenanceProcesses,
  isBankOnlyCategoryCompany,
} from "../shared/maintenanceCompanyApi.js";

/** 宽日期兜底分片（游标分页下通常整段一次查完；仅超范围或失败再分片）。 */
const MAINTENANCE_CHUNK_DAYS = 90;
const MAINTENANCE_CHUNK_THRESHOLD_DAYS = 400;
/** 首屏尽快出表；后续大批量游标拉取（后端 UNION 单查询，每页只扫 page_size 行）。 */
const MAINTENANCE_FIRST_PAGE_SIZE = 800;
const MAINTENANCE_PAGE_SIZES = [5000, 3500, 2000, 1000, 500];
const MAINTENANCE_MAX_PAGES = 100;
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

/** Transaction Maintenance 仅 Games/Gambling/Bank 有数据；Loan/Rate/Money 与其它维护页共用 localStorage 时会误传。 */
const TXN_MAINTENANCE_SEARCH_CATEGORIES = new Set(["games", "gambling", "bank"]);
const TXN_MAINTENANCE_EMPTY_CATEGORIES = new Set(["loan", "rate", "money"]);

/** 本页可选的 Category 按钮（过滤 Loan/Rate/Money）。 */
export function filterTransactionMaintenancePermissions(permissions) {
  const perms = Array.isArray(permissions) ? permissions : [];
  const filtered = perms.filter((p) =>
    TXN_MAINTENANCE_SEARCH_CATEGORIES.has(String(p).toLowerCase()),
  );
  return filtered.length > 0 ? filtered : perms;
}

/** 选择默认 Category：优先 Games/Gambling，忽略 Loan/Rate/Money 的 localStorage。 */
export function pickTransactionMaintenancePermission(permissions, saved) {
  const perms = filterTransactionMaintenancePermissions(permissions);
  const savedLower = String(saved ?? "").toLowerCase();
  if (
    saved &&
    perms.includes(saved) &&
    !TXN_MAINTENANCE_EMPTY_CATEGORIES.has(savedLower)
  ) {
    return saved;
  }
  return (
    perms.find((p) => {
      const lower = String(p).toLowerCase();
      return lower === "games" || lower === "gambling";
    }) ||
    perms.find((p) => String(p).toLowerCase() === "bank") ||
    perms[0] ||
    ""
  );
}

/** 传给 maintenance_search_api 的 category（Loan/Rate/Money → Games）。 */
export function resolveTransactionMaintenanceCategory(permission) {
  const raw = String(permission ?? "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (TXN_MAINTENANCE_EMPTY_CATEGORIES.has(lower)) return "Games";
  if (lower === "gambling") return "Games";
  return raw;
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

function renumberMaintenanceRows(rows) {
  rows.forEach((row, index) => {
    row.no = index + 1;
  });
  return rows;
}

function finalizeMaintenanceRows(rows) {
  const merged = [...rows];
  merged.sort(compareMaintenanceRows);
  return renumberMaintenanceRows(merged);
}

/** 两段均已按 compareMaintenanceRows 降序时 O(n) 归并。 */
function mergeSortedMaintenanceRows(left, right) {
  if (!left.length) return renumberMaintenanceRows([...right]);
  if (!right.length) return renumberMaintenanceRows([...left]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compareMaintenanceRows(left[i], right[j]) <= 0) {
      out.push(left[i++]);
    } else {
      out.push(right[j++]);
    }
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return renumberMaintenanceRows(out);
}

/** 同日期段内分页结果可直接追加（API 已全局降序）。 */
function appendMaintenancePageRows(existing, pageRows) {
  if (!pageRows.length) return existing;
  if (!existing.length) return renumberMaintenanceRows([...pageRows]);
  return renumberMaintenanceRows(existing.concat(pageRows));
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
  onProgress,
}) {
  const processFilter = normalizeMaintenanceProcessFilter(process);
  const categoryFilter = resolveTransactionMaintenanceCategory(category);
  const emitProgress = (rows) => {
    if (!rows.length) return;
    const snapshot = renumberMaintenanceRows([...rows]);
    if (typeof onProgress === "function") onProgress(snapshot);
    else if (typeof onFirstPage === "function") onFirstPage(snapshot);
  };
  const merged = await fetchMaintenanceDateRangeResilient({
    dateFrom,
    dateTo,
    process: processFilter,
    companyId,
    category: categoryFilter,
    signal,
    onProgress: emitProgress,
  });
  return renumberMaintenanceRows(merged);
}

async function fetchMaintenanceDateRangeResilient({
  dateFrom,
  dateTo,
  process,
  companyId,
  category,
  signal,
  onProgress,
}) {
  const daySpan = maintenanceDateSpanDays(dateFrom, dateTo);
  const ranges =
    daySpan > MAINTENANCE_CHUNK_THRESHOLD_DAYS
      ? splitMaintenanceDateRange(dateFrom, dateTo, MAINTENANCE_CHUNK_DAYS)
      : [{ dateFrom, dateTo }];
  const rangesNewestFirst = [...ranges].reverse();

  if (rangesNewestFirst.length === 1) {
    return fetchMaintenanceRangeWithSplit({
      dateFrom: rangesNewestFirst[0].dateFrom,
      dateTo: rangesNewestFirst[0].dateTo,
      process,
      companyId,
      category,
      signal,
      onProgress,
    });
  }

  let merged = [];
  for (const range of rangesNewestFirst) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const part = await fetchMaintenanceRangeWithSplit({
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      process,
      companyId,
      category,
      signal,
    });
    if (!part.length) continue;
    merged = merged.length
      ? mergeSortedMaintenanceRows(merged, finalizeMaintenanceRows(part))
      : finalizeMaintenanceRows(part);
    if (typeof onProgress === "function") onProgress(merged);
  }
  return merged;
}

async function fetchMaintenanceRangeWithSplit(params) {
  const { onProgress, ...rest } = params;
  try {
    return await fetchAllPagesForRange(rest, 0, onProgress);
  } catch (err) {
    rethrowIfAborted(err, params.signal);
    if (!isMaintenanceTransferError(err)) throw err;

    const daySpan = maintenanceDateSpanDays(params.dateFrom, params.dateTo);
    if (daySpan <= 1) {
      return fetchAllPagesForRange(rest, MAINTENANCE_PAGE_SIZES.length - 1, onProgress);
    }

    const [olderRange, newerRange] = splitMaintenanceDateRangeHalf(params.dateFrom, params.dateTo);
    const newer = await fetchMaintenanceRangeWithSplit({
      ...rest,
      dateFrom: newerRange.dateFrom,
      dateTo: newerRange.dateTo,
      onProgress,
    });
    const older = await fetchMaintenanceRangeWithSplit({
      ...rest,
      dateFrom: olderRange.dateFrom,
      dateTo: olderRange.dateTo,
    });
    if (!newer.length) return finalizeMaintenanceRows(older);
    if (!older.length) return newer;
    return mergeSortedMaintenanceRows(newer, finalizeMaintenanceRows(older));
  }
}

function maintenancePageSizeForRequest(isFirstPage, pageSizeIndex) {
  if (isFirstPage) return MAINTENANCE_FIRST_PAGE_SIZE;
  return MAINTENANCE_PAGE_SIZES[Math.min(pageSizeIndex, MAINTENANCE_PAGE_SIZES.length - 1)];
}

async function fetchAllPagesForRange(params, pageSizeIndex, onProgress) {
  const fetchBatch = async ({ cursor, isFirstPage }) => {
    const pageSize = maintenancePageSizeForRequest(isFirstPage, pageSizeIndex);
    try {
      return await fetchMaintenancePageWithRetries({
        ...params,
        cursor,
        pageSize,
        page: isFirstPage ? 1 : undefined,
      });
    } catch (err) {
      rethrowIfAborted(err, params.signal);
      if (isMaintenanceTransferError(err) && pageSizeIndex < MAINTENANCE_PAGE_SIZES.length - 1) {
        return fetchAllPagesForRange(params, pageSizeIndex + 1, onProgress);
      }
      throw err;
    }
  };

  let all = [];
  let cursor = null;
  let isFirstPage = true;
  let loops = 0;

  while (loops < MAINTENANCE_MAX_PAGES) {
    if (params.signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const result = await fetchBatch({ cursor, isFirstPage });
    if (result.data?.length) {
      all = appendMaintenancePageRows(all, result.data);
      if (typeof onProgress === "function") onProgress(all);
    }
    if (!result.pagination?.has_more) break;
    const nextCursor = result.pagination?.next_cursor;
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
    isFirstPage = false;
    loops += 1;
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
  pageSize = MAINTENANCE_FIRST_PAGE_SIZE,
  cursor = null,
}) {
  const params = new URLSearchParams();
  params.append("date_from", dateFrom);
  params.append("date_to", dateTo);
  params.append("page_size", String(pageSize));
  if (cursor) {
    params.append("cursor", cursor);
    params.append("page", "1");
  } else {
    params.append("page", String(page));
  }
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
    next_cursor: null,
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

/** React Query 缓存：区分「加载完成」与「中途切换公司被中断的半成品」。 */
export function packMaintenanceCache(rows, complete = false) {
  return { rows: Array.isArray(rows) ? rows : [], complete: Boolean(complete) };
}

export function getMaintenanceCacheRows(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.rows) ? data.rows : [];
}

/** 仅 complete===true 视为可长期复用的完整结果；数组旧缓存视为未完成。 */
export function isMaintenanceCacheComplete(data) {
  if (!data) return true;
  if (Array.isArray(data)) return false;
  return data.complete === true;
}

/** React Query queryKey（与 TransactionMaintenancePage 一致）。 */
export function buildTransactionMaintenanceQueryKey({
  companyId,
  dateFrom,
  dateTo,
  process,
  category,
}) {
  return [
    "transaction-maintenance",
    companyId,
    dateFrom,
    dateTo,
    normalizeMaintenanceProcessFilter(process),
    category || "",
  ];
}
