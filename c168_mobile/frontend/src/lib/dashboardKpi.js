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

export function viewerHasEarningsConfig(dashboardData, options = {}) {
  if (!dashboardData) return false;
  const subsidiaryGroupDrillDown = !!options.subsidiaryGroupDrillDown;
  if (subsidiaryGroupDrillDown && !dashboardData.has_ownership_setup) return false;
  const directPct = parseFloat(dashboardData.ownership_percentage) || 0;
  if (subsidiaryGroupDrillDown) {
    if (directPct > 0) return true;
    const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
    if (linkMul > 0 && linkMul !== 1) return true;
    const groupEquityPct = parseFloat(dashboardData.group_equity_percentage) || 0;
    const groupAccPct = parseFloat(dashboardData.group_account_percentage) || 0;
    return groupEquityPct > 0 && groupAccPct > 0;
  }
  const linkMul = parseFloat(dashboardData._link_multiplier || 0) || 0;
  if (linkMul > 0 && linkMul !== 1) return true;
  if (directPct > 0) return true;
  if (options.groupsAllCompaniesAggregate) return false;
  if (dashboardData._group_aggregate_earnings || options.groupAggregateEarnings) {
    if (dashboardData.has_group_ownership) return true;
    const groupAccPct = parseFloat(dashboardData.group_account_percentage) || 0;
    return groupAccPct > 0;
  }
  if (dashboardData.has_group_ownership) return true;
  return false;
}

function resolveGroupAccountMultiplier(dashboardData) {
  const accPct = parseFloat(dashboardData?.group_account_percentage) || 0;
  return accPct > 0 ? accPct / 100 : 1;
}

function isGroupAggregateEarningsPayload(dashboardData, options = {}) {
  if (!dashboardData) return false;
  if (options.groupAggregateEarnings) return true;
  return dashboardData._group_aggregate_earnings === true;
}

export function resolveEarningsMultiplier(dashboardData, requireViewerConfig, options = {}) {
  if (!dashboardData) return 0;
  if (isGroupAggregateEarningsPayload(dashboardData, options)) {
    return resolveGroupAccountMultiplier(dashboardData);
  }
  const ownershipPercentage = parseFloat(dashboardData?.ownership_percentage) || 0;
  const groupEquityPercentage = parseFloat(dashboardData?.group_equity_percentage) || 0;
  const groupAccountPercentage = parseFloat(dashboardData?.group_account_percentage) || 0;
  const hasGroupOwnership = !!dashboardData?.has_group_ownership;
  const linkMul = parseFloat(dashboardData?._link_multiplier || 0) || 0;
  const hasLinkOwnership = linkMul > 0 && linkMul !== 1;
  const directPct = ownershipPercentage / 100;
  const subsidiaryGroupDrillDown = !!options.subsidiaryGroupDrillDown;

  if (subsidiaryGroupDrillDown) {
    if (!dashboardData.has_ownership_setup && requireViewerConfig) return 0;
    if (directPct > 0) return directPct;
    if (hasLinkOwnership) {
      const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 1;
      return linkMul * viewerGroupShare;
    }
    if (groupEquityPercentage > 0) {
      const viewerGroupShare = groupAccountPercentage > 0 ? groupAccountPercentage / 100 : 0;
      return (groupEquityPercentage / 100) * viewerGroupShare;
    }
    return 0;
  }
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

function sumSubsidiaryCompanyEarnings(dashboardData) {
  if (!dashboardData) return 0;
  const rows = dashboardData.subsidiary_earnings_by_company;
  if (Array.isArray(rows) && rows.length) {
    return rows.reduce((sum, row) => {
      const companyEarning = parseFloat(row.company_earning);
      if (Number.isFinite(companyEarning)) return sum + companyEarning;
      const fallbackProfit = parseFloat(row.profit);
      if (Number.isFinite(fallbackProfit)) return sum + fallbackProfit;
      return sum + (parseFloat(row.net_profit) || 0);
    }, 0);
  }
  const explicit = parseFloat(dashboardData.subsidiary_company_earnings_total);
  return Number.isFinite(explicit) ? explicit : 0;
}

function computeGroupAggregateProfit(dashboardData) {
  return sumSubsidiaryCompanyEarnings(dashboardData);
}

function computeGroupAggregateNetProfit(dashboardData) {
  const profitSum = computeGroupAggregateProfit(dashboardData);
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses) || 0;
  const displayExpenses = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  return profitSum + displayExpenses;
}

function computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig = true } = {}) {
  if (!dashboardData) return 0;
  const groupAccPct = parseFloat(dashboardData.group_account_percentage) || 0;
  if (requireViewerConfig && !dashboardData.has_group_ownership && groupAccPct <= 0) return 0;
  return computeGroupAggregateNetProfit(dashboardData) * resolveGroupAccountMultiplier(dashboardData);
}

function computeGroupAllCompanyEarningsSum(dashboardData) {
  if (!dashboardData) return 0;
  const rows = dashboardData.subsidiary_earnings_by_company;
  if (Array.isArray(rows) && rows.length) {
    return rows.reduce((sum, row) => sum + (parseFloat(row.my_earning) || 0), 0);
  }
  const explicit = parseFloat(
    dashboardData?._subsidiary_earnings_total ?? dashboardData?.subsidiary_earnings_total,
  );
  return Number.isFinite(explicit) ? explicit : 0;
}

export function computeKpiMetrics(dashboardData, options = {}) {
  if (!dashboardData) return null;
  const rawProfit = parseFloat(dashboardData?.period_total?.profit ?? dashboardData.profit) || 0;
  const rawExpenses = parseFloat(dashboardData?.period_total?.expenses) || 0;
  const displayProfitNum = rawProfit;
  const displayExpensesNum = rawExpenses > 0 ? -rawExpenses : rawExpenses;
  const groupAggregate = isGroupAggregateEarningsPayload(dashboardData, options);
  const groupAllCompanyEarningsSum = !!options.groupAllCompaniesEarningsSum;
  const groupProfitSum =
    groupAggregate && !groupAllCompanyEarningsSum
      ? computeGroupAggregateProfit(dashboardData)
      : null;
  const netProfitDisplay =
    groupAggregate && !groupAllCompanyEarningsSum
      ? computeGroupAggregateNetProfit(dashboardData)
      : displayProfitNum + displayExpensesNum;
  const showEarnings = options.groupsAllCompaniesAggregate
    ? false
    : viewerHasEarningsConfig(dashboardData, options);
  const panelMultiplier = resolveEarningsMultiplier(dashboardData, false, options);
  const kpiMultiplier = resolveEarningsMultiplier(dashboardData, true, options);
  const mergedGroupAllEarnings = groupAllCompanyEarningsSum
    ? computeGroupAllCompanyEarningsSum(dashboardData)
    : null;
  const earningsDisplay = !showEarnings
    ? netProfitDisplay
    : groupAllCompanyEarningsSum
      ? mergedGroupAllEarnings
      : groupAggregate
        ? computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: false })
        : netProfitDisplay * panelMultiplier;
  const kpiCardEarnings = showEarnings
    ? groupAllCompanyEarningsSum
      ? mergedGroupAllEarnings
      : groupAggregate
        ? computeGroupAggregateEarningsAmount(dashboardData, { requireViewerConfig: true })
        : netProfitDisplay * kpiMultiplier
    : 0;

  return {
    profit: groupAggregate && !groupAllCompanyEarningsSum ? groupProfitSum : displayProfitNum,
    expenses: displayExpensesNum,
    netProfit: netProfitDisplay,
    earnings: earningsDisplay,
    kpiCardEarnings,
    showEarnings,
  };
}

export function buildTrendRows(dashboardData, maxPoints = 14, options = {}) {
  const daily = dashboardData?.daily_data;
  if (!daily?.profit || typeof daily.profit !== "object") return [];

  const dates = Object.keys(daily.profit).sort();
  const slice = dates.length > maxPoints ? dates.slice(-maxPoints) : dates;
  const multiplier = resolveEarningsMultiplier(dashboardData, false, options);

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
