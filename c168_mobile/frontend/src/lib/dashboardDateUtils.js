export function formatYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function defaultDashboardDateRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Live ops: YTD gives a useful first paint; This Month is often empty mid-month
  // for companies that post later in the cycle.
  return {
    dateFrom: formatYmd(new Date(today.getFullYear(), 0, 1)),
    dateTo: formatYmd(today),
  };
}

export function periodPresetRange(preset) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let startDate = null;
  let endDate = null;

  if (preset === "today") {
    startDate = new Date(today);
    endDate = new Date(today);
  } else if (preset === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    startDate = d;
    endDate = d;
  } else if (preset === "thisWeek") {
    const dayMon0 = (today.getDay() + 6) % 7;
    startDate = new Date(today);
    startDate.setDate(today.getDate() - dayMon0);
    endDate = new Date(today);
  } else if (preset === "lastWeek") {
    const dayMon0 = (today.getDay() + 6) % 7;
    endDate = new Date(today);
    endDate.setDate(today.getDate() - dayMon0 - 1);
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);
  } else if (preset === "thisMonth") {
    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    endDate = new Date(today);
  } else if (preset === "lastMonth") {
    startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    endDate = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (preset === "thisYear") {
    startDate = new Date(today.getFullYear(), 0, 1);
    endDate = new Date(today);
  } else if (preset === "lastYear") {
    const y = today.getFullYear() - 1;
    startDate = new Date(y, 0, 1);
    endDate = new Date(y, 11, 31);
  }

  if (!startDate || !endDate) return null;
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return { dateFrom: formatYmd(startDate), dateTo: formatYmd(endDate) };
}

export function formatDisplayDate(ymd) {
  const d = parseYmd(ymd);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatChartDateRangeText(fromYmd, toYmd, toWord = "to") {
  return `${formatDisplayDate(fromYmd)} ${toWord} ${formatDisplayDate(toYmd)}`;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "01 Jun - 30 Jun 2026" — toolbar / sheet label. Display only, no logic change. */
export function formatRangeLabel(fromYmd, toYmd, { withYear = true } = {}) {
  const f = parseYmd(fromYmd);
  const t = parseYmd(toYmd);
  const fd = String(f.getDate()).padStart(2, "0");
  const td = String(t.getDate()).padStart(2, "0");
  const left = `${fd} ${MONTHS_SHORT[f.getMonth()]}`;
  const right = `${td} ${MONTHS_SHORT[t.getMonth()]}`;
  return withYear ? `${left} - ${right} ${t.getFullYear()}` : `${left} - ${right}`;
}

export function eachDateInRange(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end || start > end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Inclusive day count for a YMD range. */
export function daysInclusive(fromYmd, toYmd) {
  const start = parseYmd(fromYmd);
  const end = parseYmd(toYmd);
  if (!start || !end || start > end) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function todayYmd() {
  return formatYmd(new Date());
}

export const PERIOD_PRESET_KEYS = [
  "today",
  "yesterday",
  "thisWeek",
  "thisMonth",
  "lastMonth",
  "thisYear",
];
