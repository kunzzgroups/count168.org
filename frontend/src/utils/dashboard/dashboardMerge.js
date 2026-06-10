function mergeDailyMap(target, source) {
  if (!source || typeof source !== "object") return;
  Object.keys(source).forEach((date) => {
    target[date] = (target[date] || 0) + parseFloat(source[date] || 0);
  });
}

/**
 * Merge dashboard_api.php payloads for multiple companies (group "All" mode).
 * Mirrors js/dashboard.js mergeGroupData.
 */
export function mergeGroupData(dataList, dateRange) {
  let capital = 0;
  let expenses = 0;
  let profit = 0;
  let periodCapital = 0;
  let periodExpenses = 0;
  let periodProfit = 0;
  let bfCapital = 0;
  let bfExpenses = 0;
  let bfProfit = 0;
  const dailyCapital = {};
  const dailyExpenses = {};
  const dailyProfit = {};
  const dailyProfitFlow = {};
  let hasOwnershipSetup = false;

  const companyEarnings = [];

  dataList.forEach((d) => {
    capital += parseFloat(d.capital || 0);
    expenses += parseFloat(d?.period_total?.expenses ?? 0);
    profit += parseFloat(d.profit || 0);

    if (d.period_total) {
      periodCapital += parseFloat(d.period_total.capital || 0);
      periodExpenses += parseFloat(d.period_total.expenses || 0);
      periodProfit += parseFloat(d.period_total.profit || 0);
    }
    if (d.initial_balance) {
      bfCapital += parseFloat(d.initial_balance.capital || 0);
      bfExpenses += parseFloat(d.initial_balance.expenses || 0);
      bfProfit += parseFloat(d.initial_balance.profit || 0);
    }
    if (d.daily_data) {
      mergeDailyMap(dailyCapital, d.daily_data.capital);
      mergeDailyMap(dailyExpenses, d.daily_data.expenses);
      mergeDailyMap(dailyProfit, d.daily_data.profit);
      mergeDailyMap(dailyProfitFlow, d.daily_data.profit_payment_flow_daily);
    }
    if (d.has_ownership_setup) {
      hasOwnershipSetup = true;
    }

    const pct = parseFloat(d.ownership_percentage || 0);
    const grpPct = parseFloat(d.group_equity_percentage || 0);
    const grpAccPct = parseFloat(d.group_account_percentage || 0);
    const hasGrp = !!d.has_group_ownership;
    const rawP = parseFloat(d?.period_total?.profit ?? d.profit) || 0;
    const rawE = parseFloat(d?.period_total?.expenses ?? d.expenses) || 0;
    const displayE = rawE > 0 ? -rawE : rawE;
    const netProfit = rawP + displayE;
    const linkMul = parseFloat(d?._link_multiplier || 0) || 0;
    const hasLink = linkMul > 0 && linkMul !== 1;
    const directPct = pct / 100;
    let effectivePct;
    if (hasLink) {
      const viewerGroupShare = grpAccPct > 0 ? grpAccPct / 100 : 1;
      effectivePct = linkMul * viewerGroupShare;
    } else if (directPct > 0) {
      effectivePct = directPct;
    } else {
      const chainPct = hasGrp ? (grpPct / 100) * (grpAccPct / 100) : 0;
      effectivePct = chainPct === 0 ? 1 : chainPct;
    }
    const earningsVal = netProfit * effectivePct;
    hasOwnershipSetup = true;
    companyEarnings.push({ netProfit, pct, grpPct, grpAccPct, hasGrp, earnings: earningsVal });
  });

  const totalEarnings = companyEarnings.reduce((sum, c) => sum + c.earnings, 0);

  const mergedRawProfit = periodProfit;
  const mergedRawExpenses = periodExpenses;
  const mergedDisplayExpenses = mergedRawExpenses > 0 ? -mergedRawExpenses : mergedRawExpenses;
  const mergedNetProfit = mergedRawProfit + mergedDisplayExpenses;

  let effectiveOwnershipPct = 0;
  if (mergedNetProfit !== 0) {
    effectiveOwnershipPct = (totalEarnings / mergedNetProfit) * 100;
  } else if (companyEarnings.length > 0) {
    const totalPct = companyEarnings.reduce((sum, c) => sum + c.pct, 0);
    effectiveOwnershipPct = totalPct / companyEarnings.length;
  }

  return {
    capital,
    expenses: periodExpenses,
    profit,
    period_total: { capital: periodCapital, expenses: periodExpenses, profit: periodProfit },
    initial_balance: { capital: bfCapital, expenses: bfExpenses, profit: bfProfit },
    daily_data: {
      capital: dailyCapital,
      expenses: dailyExpenses,
      profit: dailyProfit,
      profit_payment_flow_daily: dailyProfitFlow,
    },
    date_range: dataList[0]?.date_range || { from: dateRange.startDate, to: dateRange.endDate },
    ownership_percentage: effectiveOwnershipPct,
    has_ownership_setup: hasOwnershipSetup,
    has_group_ownership: false,
    group_equity_percentage: 0,
    group_account_percentage: 0,
  };
}

/** Sum per-currency earnings rows from multiple company scopes (group "All"). */
export function mergeEarningsByCurrency(lists, codes = null) {
  const codeSet = new Set();
  for (const list of lists) {
    for (const row of list || []) {
      const c = String(row?.code || "").toUpperCase();
      if (c) codeSet.add(c);
    }
  }
  const ordered = codes?.length
    ? codes.map((c) => String(c).toUpperCase())
    : [...codeSet];
  return ordered.map((code) => {
    let sum = 0;
    let found = false;
    for (const list of lists) {
      const row = (list || []).find((r) => String(r.code).toUpperCase() === code);
      if (row?.earnings != null) {
        sum += Number(row.earnings) || 0;
        found = true;
      }
    }
    return { code, earnings: found ? sum : null };
  });
}
