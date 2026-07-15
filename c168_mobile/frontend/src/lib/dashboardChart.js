import { eachDateInRange, parseYmd } from "./dashboardDateUtils.js";
import { resolveEarningsMultiplier, viewerHasEarningsConfig } from "./dashboardKpi.js";

export function resolveDailyChartXAxisTicks(dayCount) {
  if (dayCount <= 10) return { interval: 0, minTickGap: 6, height: 22, marginBottom: 8 };
  if (dayCount <= 31) return { interval: "preserveStartEnd", minTickGap: 20, height: 24, marginBottom: 10 };
  if (dayCount <= 100) return { interval: "preserveStartEnd", minTickGap: 36, height: 28, marginBottom: 12 };
  // YTD / long ranges — keep ends + sparse mid ticks readable on ~360px width.
  return { interval: "preserveStartEnd", minTickGap: 52, height: 30, marginBottom: 14 };
}

export function computeTrendYDomain(rows, dataKeys) {
  if (!rows?.length || !dataKeys?.length) return [0, 1];
  let min = 0;
  let max = 0;
  rows.forEach((row) => {
    dataKeys.forEach((key) => {
      const value = Number(row[key]) || 0;
      if (value < min) min = value;
      if (value > max) max = value;
    });
  });
  if (min === 0 && max === 0) return [-1, 1];
  const span = max - min || Math.max(Math.abs(max), Math.abs(min), 1);
  const pad = span * 0.08;
  return [min < 0 ? min - pad : 0, max > 0 ? max + pad : 0];
}

function buildChartMetricRow(date, label, dailyData, earningsMultiplier) {
  const profitDelta = parseFloat(dailyData.profit?.[date] || 0) || 0;
  const expensesDelta = parseFloat(dailyData.expenses?.[date] || 0) || 0;
  const displayProfit = profitDelta;
  const displayExpenses = expensesDelta > 0 ? -expensesDelta : expensesDelta;
  const netProfit = displayProfit + displayExpenses;
  const earnings = netProfit * earningsMultiplier;
  return {
    date,
    label,
    profit: displayProfit,
    expenses: displayExpenses,
    netProfit,
    earnings,
  };
}

export function buildChartRows(data, startYmd, endYmd) {
  if (!data?.daily_data) return [];
  const dailyData = data.daily_data;
  const earningsMultiplier = viewerHasEarningsConfig(data)
    ? resolveEarningsMultiplier(data, false)
    : 0;

  const rangeStart = parseYmd(startYmd);
  const rangeEnd = parseYmd(endYmd);
  const dates = eachDateInRange(startYmd, endYmd);
  const sameCalendarMonth =
    rangeStart &&
    rangeEnd &&
    rangeStart.getFullYear() === rangeEnd.getFullYear() &&
    rangeStart.getMonth() === rangeEnd.getMonth();

  return dates.map((date) => {
    const d = parseYmd(date);
    const label = sameCalendarMonth
      ? String(d.getDate())
      : `${d.getDate()}/${d.getMonth() + 1}`;
    return buildChartMetricRow(date, label, dailyData, earningsMultiplier);
  });
}
