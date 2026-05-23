import { formatDmy } from "../../../utils/date/dateUtils.js";

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

export function eachDateInRange(startYmd, endYmd) {
  const out = [];
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  for (let x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) {
    out.push(formatYmd(new Date(x)));
  }
  return out;
}

export function chartMonthSpan(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  if (!start || !end) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

export function shouldAggregateChartByMonth(startYmd, endYmd) {
  return chartMonthSpan(startYmd, endYmd) >= 3;
}

export function eachMonthInRange(startYmd, endYmd) {
  const start = parseYmd(startYmd);
  const end = parseYmd(endYmd);
  const months = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= endMonth) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

export function formatChartMonthLabel(year, month, locale = "en-US") {
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short", year: "numeric" });
}

export function formatDisplayDate(ymd) {
  const d = parseYmd(ymd);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function formatChartTooltipLabel(dateKey, locale = "en-US") {
  if (!dateKey) return "";
  if (/^\d{4}-\d{2}$/.test(dateKey)) {
    const [y, m] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
  }
  return formatDisplayDate(dateKey);
}

export function ymdToDmy(ymd) {
  const d = parseYmd(ymd);
  return d ? formatDmy(d) : "";
}

export function previousPeriodRange(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  const dayMs = 86400000;
  const dayCount = Math.max(1, Math.round((to - from) / dayMs) + 1);
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (dayCount - 1) * dayMs);
  return { from: formatYmd(prevFrom), to: formatYmd(prevTo) };
}

export function isFullCalendarMonth(fromYmd, toYmd) {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (from.getDate() !== 1) return false;
  const lastDay = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  return (
    to.getDate() === lastDay &&
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear()
  );
}

export function defaultDashboardDateRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    dateFrom: formatYmd(new Date(today.getFullYear(), today.getMonth(), 1)),
    dateTo: formatYmd(today),
  };
}
