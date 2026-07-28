/** Inclusive day count between two Y-m-d dates (UTC calendar). */
function daysInclusiveYmd(fromYmd, toYmd) {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

/**
 * Payment History scope uses dd/mm/yyyy; some callers may pass yyyy-mm-dd.
 * @returns {{ y: number, mo: number, d: number, style: 'dmy' | 'ymd' } | null}
 */
export function parseHistoryDate(value) {
  const s = String(value || "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, mo, d, style: "ymd" };
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y, mo, d, style: "dmy" };
  }
  return null;
}

function formatYmd({ y, mo, d }) {
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatHistoryDate({ y, mo, d }, style) {
  if (style === "dmy") {
    return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${String(y).padStart(4, "0")}`;
  }
  return formatYmd({ y, mo, d });
}

function lastDayOfMonth({ y, mo }) {
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { y, mo, d: dim };
}

function addOneDay({ y, mo, d }) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function ymdNum({ y, mo, d }) {
  return y * 10000 + mo * 100 + d;
}

/**
 * Split a long inclusive date range into calendar-month chunks so Payment History
 * can paint the first month before the rest of "This Year" finishes loading.
 * Accepts dd/mm/yyyy (scope default) or yyyy-mm-dd; chunk output keeps input style.
 * Short ranges stay a single request.
 */
export function splitHistoryDateChunks(dateFrom, dateTo, { minDaysToChunk = 40 } = {}) {
  const from = String(dateFrom || "").trim();
  const to = String(dateTo || "").trim();
  if (!from || !to) return [{ dateFrom: from, dateTo: to }];

  const start = parseHistoryDate(from);
  const end = parseHistoryDate(to);
  if (!start || !end || ymdNum(start) > ymdNum(end)) {
    return [{ dateFrom: from, dateTo: to }];
  }

  const style = start.style === "dmy" || end.style === "dmy" ? "dmy" : "ymd";
  const span = daysInclusiveYmd(formatYmd(start), formatYmd(end));
  if (span <= minDaysToChunk) {
    return [{ dateFrom: from, dateTo: to }];
  }

  const chunks = [];
  let cur = { y: start.y, mo: start.mo, d: start.d };
  while (ymdNum(cur) <= ymdNum(end)) {
    const monthEnd = lastDayOfMonth(cur);
    const chunkEnd = ymdNum(monthEnd) <= ymdNum(end) ? monthEnd : end;
    chunks.push({
      dateFrom: formatHistoryDate(cur, style),
      dateTo: formatHistoryDate(chunkEnd, style),
    });
    cur = addOneDay(chunkEnd);
  }
  return chunks;
}

export function isHistoryBfRow(row) {
  return row?.row_type === "bf";
}

/**
 * Merge a later date-chunk into accumulated rows.
 * Keep B/F only from the first chunk; later chunks drop their own opening rows
 * (their txn balances already continue from that month's opening).
 */
export function mergeHistoryChunkRows(existing, incoming, { isFirstChunk }) {
  const next = Array.isArray(incoming) ? incoming : [];
  if (isFirstChunk || !existing.length) {
    return next.slice();
  }
  const withoutBf = next.filter((row) => !isHistoryBfRow(row));
  return existing.concat(withoutBf);
}

/** Default page size when callers use API limit/offset. */
export const HISTORY_PAGE_LIMIT = 200;
