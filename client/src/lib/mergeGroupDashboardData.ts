import type { DashboardApiPayload } from '../types/dashboard'

function mergeDailyMap(
  target: Record<string, number>,
  source: Record<string, number | string> | undefined,
) {
  if (!source || typeof source !== 'object') return
  for (const date of Object.keys(source)) {
    const v = parseFloat(String(source[date] ?? 0)) || 0
    target[date] = (target[date] || 0) + v
  }
}

type CompanyEarningPart = {
  netProfit: number
  pct: number
  grpPct: number
  grpAccPct: number
  hasGrp: boolean
  earnings: number
}

/**
 * 与 `js/dashboard.js` `mergeGroupData` 一致（Group-All 多公司合并）。
 */
export function mergeGroupDashboardData(
  dataList: DashboardApiPayload[],
  fallbackRange: { from: string; to: string },
): DashboardApiPayload {
  let capital = 0
  let expenses = 0
  let profit = 0
  let periodCapital = 0
  let periodExpenses = 0
  let periodProfit = 0
  let bfCapital = 0
  let bfExpenses = 0
  let bfProfit = 0
  const dailyCapital: Record<string, number> = {}
  const dailyExpenses: Record<string, number> = {}
  const dailyProfit: Record<string, number> = {}
  const dailyProfitFlow: Record<string, number> = {}
  let hasOwnershipSetup = false

  const companyEarnings: CompanyEarningPart[] = []

  for (const d of dataList) {
    capital += parseFloat(String(d.capital || 0)) || 0
    expenses += parseFloat(String(d.expenses || 0)) || 0
    profit += parseFloat(String(d.profit || 0)) || 0

    if (d.period_total) {
      periodCapital += parseFloat(String(d.period_total.capital || 0)) || 0
      periodExpenses += parseFloat(String(d.period_total.expenses || 0)) || 0
      periodProfit += parseFloat(String(d.period_total.profit || 0)) || 0
    }
    if (d.initial_balance) {
      bfCapital += parseFloat(String(d.initial_balance.capital || 0)) || 0
      bfExpenses += parseFloat(String(d.initial_balance.expenses || 0)) || 0
      bfProfit += parseFloat(String(d.initial_balance.profit || 0)) || 0
    }
    if (d.daily_data) {
      mergeDailyMap(
        dailyCapital,
        d.daily_data.capital as Record<string, number | string> | undefined,
      )
      mergeDailyMap(
        dailyExpenses,
        d.daily_data.expenses as Record<string, number | string> | undefined,
      )
      mergeDailyMap(
        dailyProfit,
        d.daily_data.profit as Record<string, number | string> | undefined,
      )
      mergeDailyMap(
        dailyProfitFlow,
        d.daily_data.profit_payment_flow_daily as
          | Record<string, number | string>
          | undefined,
      )
    }
    if (d.has_ownership_setup) {
      hasOwnershipSetup = true
    }

    const pct = parseFloat(String(d.ownership_percentage || 0)) || 0
    const grpPct = parseFloat(String(d.group_equity_percentage || 0)) || 0
    const grpAccPct = parseFloat(String(d.group_account_percentage || 0)) || 0
    const hasGrp = !!d.has_group_ownership
    const rawP =
      parseFloat(String(d?.period_total?.profit ?? d.profit)) || 0
    const rawE =
      parseFloat(String(d?.period_total?.expenses ?? d.expenses)) || 0
    const displayE = rawE > 0 ? -rawE : rawE
    const netProfit = rawP + displayE
    const linkMul = parseFloat(String(d._link_multiplier ?? ''))
    const hasLink = !Number.isNaN(linkMul) && linkMul > 0 && linkMul !== 1
    const directPct = pct / 100
    let effectivePct: number
    if (hasLink) {
      const viewerGroupShare = grpAccPct > 0 ? grpAccPct / 100 : 1
      effectivePct = linkMul * viewerGroupShare
    } else if (directPct > 0) {
      effectivePct = directPct
    } else {
      const chainPct = hasGrp ? (grpPct / 100) * (grpAccPct / 100) : 0
      effectivePct = chainPct === 0 ? 1 : chainPct
    }
    const earningsVal = netProfit * effectivePct
    hasOwnershipSetup = true
    companyEarnings.push({
      netProfit,
      pct,
      grpPct,
      grpAccPct,
      hasGrp,
      earnings: earningsVal,
    })
  }

  const totalEarnings = companyEarnings.reduce(
    (sum, c) => sum + c.earnings,
    0,
  )
  const mergedRawProfit = periodProfit
  const mergedRawExpenses = periodExpenses
  const mergedDisplayExpenses =
    mergedRawExpenses > 0 ? -mergedRawExpenses : mergedRawExpenses
  const mergedNetProfit = mergedRawProfit + mergedDisplayExpenses

  let effectiveOwnershipPct = 0
  if (mergedNetProfit !== 0) {
    effectiveOwnershipPct = (totalEarnings / mergedNetProfit) * 100
  } else if (companyEarnings.length > 0) {
    const totalPct = companyEarnings.reduce((sum, c) => sum + c.pct, 0)
    effectiveOwnershipPct = totalPct / companyEarnings.length
  }

  return {
    capital,
    expenses,
    profit,
    period_total: {
      capital: periodCapital,
      expenses: periodExpenses,
      profit: periodProfit,
    },
    initial_balance: {
      capital: bfCapital,
      expenses: bfExpenses,
      profit: bfProfit,
    },
    daily_data: {
      capital: dailyCapital,
      expenses: dailyExpenses,
      profit: dailyProfit,
      profit_payment_flow_daily: dailyProfitFlow,
    },
    date_range: dataList[0]?.date_range || {
      from: fallbackRange.from,
      to: fallbackRange.to,
    },
    ownership_percentage: effectiveOwnershipPct,
    has_ownership_setup: hasOwnershipSetup,
  }
}
