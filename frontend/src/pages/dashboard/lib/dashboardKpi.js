/** Month-over-month change % vs previous period (not the cumulative footnote delta). */
export function kpiPercentChange(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  if (p === 0) {
    if (c === 0) return 0;
    return c > 0 ? 100 : -100;
  }
  return ((c - p) / Math.abs(p)) * 100;
}

export function buildKpiCompare(current, previous) {
  const c = parseFloat(current) || 0;
  const p = parseFloat(previous) || 0;
  const delta = c + p;
  return {
    delta,
    pct: kpiPercentChange(current, previous),
    isUp: delta >= 0,
  };
}

export function computeKpiMetrics(dashboardData, selectedGroup) {
  if (!dashboardData) return null;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses ?? dashboardData.expenses) || 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const netProfitDisplay = displayProfitNum + displayExpensesNum;
  const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
  const hasGroupOwnership = !!dashboardData?.has_group_ownership;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const inGroupView = !!selectedGroup;
  const directPct = ownershipPercentage / 100;
  let effectivePct;
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    effectivePct = linkMul * viewerGroupShare;
  } else if (directPct > 0) {
    effectivePct = directPct;
  } else if (hasGroupOwnership) {
    effectivePct = (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  } else {
    effectivePct = directPct === 0 && inGroupView ? 1 : 0;
  }
  const earningsDisplay = netProfitDisplay * effectivePct;
  const showEarnings = !!dashboardData?.has_ownership_setup || hasLinkOwnership || inGroupView;
  return {
    profit: displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    showEarnings,
  };
}
