const KPI_PCT_CAP = 999.9;

export function kpiPercentChange(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  if (p === 0) {
    if (c === 0) return 0;
    return c > 0 ? 100 : -100;
  }
  const raw = ((c - p) / Math.abs(p)) * 100;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-KPI_PCT_CAP, Math.min(KPI_PCT_CAP, Math.round(raw * 10) / 10));
}

export function buildKpiCompare(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  const delta = c - p;
  return {
    delta,
    pct: kpiPercentChange(current, previous),
    isUp: delta >= 0,
  };
}

export function viewerHasEarningsConfig(dashboardData) {
  if (!dashboardData) return false;
  const directPct = parseFloat(dashboardData.ownership_percentage) || 0;
  if (directPct > 0) return true;
  const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
  if (linkMul > 0 && linkMul !== 1) return true;
  if (dashboardData.has_group_ownership) return true;
  return false;
}

export function resolveEarningsMultiplier(dashboardData, requireViewerConfig) {
  if (!dashboardData) return 0;
  const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
  const hasGroupOwnership = !!dashboardData?.has_group_ownership;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const directPct = ownershipPercentage / 100;

  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    return linkMul * viewerGroupShare;
  }
  if (directPct > 0) return directPct;
  if (hasGroupOwnership) {
    return (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  }
  if (requireViewerConfig) return 0;
  return 0;
}

export function computeKpiMetrics(dashboardData) {
  if (!dashboardData) return null;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses) || 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const netProfitDisplay = displayProfitNum + displayExpensesNum;
  const showEarnings = viewerHasEarningsConfig(dashboardData);
  const panelMultiplier = resolveEarningsMultiplier(dashboardData, false);
  const kpiMultiplier = resolveEarningsMultiplier(dashboardData, true);
  const earningsDisplay = !showEarnings ? netProfitDisplay : netProfitDisplay * panelMultiplier;
  const kpiCardEarnings = showEarnings ? netProfitDisplay * kpiMultiplier : 0;

  return {
    profit: displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    kpiCardEarnings,
    showEarnings,
  };
}

export function buildTrendRows(dashboardData, maxPoints = 14) {
  const daily = dashboardData?.daily_data;
  if (!daily?.profit || typeof daily.profit !== "object") return [];

  const dates = Object.keys(daily.profit).sort();
  const slice = dates.length > maxPoints ? dates.slice(-maxPoints) : dates;
  const multiplier = resolveEarningsMultiplier(dashboardData, false);

  return slice.map((date) => {
    const profitDelta = parseFloat(daily.profit?.[date] || 0) || 0;
    const expensesDelta = parseFloat(daily.expenses?.[date] || 0) || 0;
    const displayExpenses = expensesDelta > 0 ? -expensesDelta : expensesDelta;
    const netProfit = profitDelta + displayExpenses;
    const label = date.slice(5);
    return {
      date,
      label,
      netProfit,
      earnings: netProfit * multiplier,
    };
  });
}
