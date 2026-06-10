const KPI_PCT_CAP = 999.9;

/** Month-over-month % vs previous month's equivalent date range. */
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

/** Ownership multiplier for Earnings (KPI + chart), 0–1. */
export function resolveEffectiveOwnershipPct(dashboardData, selectedGroup) {
  if (!dashboardData) return 0;
  const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
  const hasGroupOwnership = !!dashboardData?.has_group_ownership;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const inGroupView = !!selectedGroup;
  const directPct = ownershipPercentage / 100;
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
    return linkMul * viewerGroupShare;
  }
  if (directPct > 0) return directPct;
  if (hasGroupOwnership) {
    return (groupEquityPercentage / 100) * (groupAccountPercentage / 100);
  }
  return directPct === 0 && inGroupView ? 1 : 0;
}

/** Copy ownership fields from primary-currency KPI into per-currency earnings payloads. */
export function mergeDashboardOwnershipFields(payload, ownershipSource) {
  if (!payload || !ownershipSource) return payload;
  return {
    ...payload,
    ownership_percentage: ownershipSource.ownership_percentage,
    has_ownership_setup: ownershipSource.has_ownership_setup,
    group_equity_percentage: ownershipSource.group_equity_percentage,
    group_account_percentage: ownershipSource.group_account_percentage,
    has_group_ownership: ownershipSource.has_group_ownership,
    _link_multiplier: ownershipSource._link_multiplier,
  };
}

/**
 * True when per-currency earnings should be refetched.
 * KPI-only fallback may fill the active currency while other rows stay 0 — not bootstrap-complete.
 */
export function dashboardEarningsRowsLookStale(
  rows,
  kpiEarnings,
  activeCurrencyCode,
  bootstrapComplete = false
) {
  if (!Array.isArray(rows) || !rows.length) return true;
  if (rows.some((row) => row.earnings == null)) return false;
  if (rows.length > 1 && !bootstrapComplete) return true;

  const kpi = parseFloat(kpiEarnings);
  if (!Number.isFinite(kpi) || Math.abs(kpi) < 0.0001) return false;

  const code = String(activeCurrencyCode || "").trim().toUpperCase();
  const allNearZero = rows.every((row) => Math.abs(parseFloat(row.earnings) || 0) < 0.0001);
  if (!code) return allNearZero;

  const active = rows.find((row) => String(row.code).trim().toUpperCase() === code);
  const activeVal = parseFloat(active?.earnings);
  if (Number.isFinite(activeVal) && Math.abs(activeVal - kpi) < 0.02) return false;
  return allNearZero || !Number.isFinite(activeVal) || Math.abs(activeVal - kpi) > 0.02;
}

export function computeKpiMetrics(dashboardData, selectedGroup) {
  if (!dashboardData) return null;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  // Expenses KPI = 本期 Win/Loss + Cr/Dr（与 Transaction List / Payment History 一致，不含 CLEAR）。
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses) || 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const netProfitDisplay = displayProfitNum + displayExpensesNum;
  const effectivePct = resolveEffectiveOwnershipPct(dashboardData, selectedGroup);
  const earningsDisplay = netProfitDisplay * effectivePct;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const showEarnings =
    !!dashboardData?.has_ownership_setup || hasLinkOwnership || !!selectedGroup;
  return {
    profit: displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    showEarnings,
  };
}
