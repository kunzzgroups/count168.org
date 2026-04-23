import type { DashboardApiPayload } from '../types/dashboard'

export type KpiBlock = {
  /** Profit 卡片原值 */
  displayProfit: number
  /** Expenses 显示（正支出为负，与经典一致） */
  displayExpenses: number
  netProfit: number
  earnings: number
  showEarnings: boolean
}

/**
 * 与 `js/dashboard.js` `updateDashboard` 卡片口径一致（略去 DOM）。
 */
export function kpiFromDashboardData(
  data: DashboardApiPayload,
  selectedGroup: string | null,
): KpiBlock {
  const rawProfit =
    parseFloat(String(data?.period_total?.profit ?? data.profit)) || 0
  const rawExpenses =
    parseFloat(String(data?.period_total?.expenses ?? data.expenses)) || 0

  const displayProfit = rawProfit
  const displayExpenses = rawExpenses > 0 ? -rawExpenses : rawExpenses
  const netProfit = displayProfit + displayExpenses

  const ownershipPercentage = parseFloat(
    String(data?.ownership_percentage ?? 0),
  )
  const groupEquityPercentage = parseFloat(
    String(data?.group_equity_percentage ?? 0),
  )
  const groupAccountPercentage = parseFloat(
    String(data?.group_account_percentage ?? 0),
  )
  const hasGroupOwnership = !!data?.has_group_ownership
  const linkMul = parseFloat(String(data?._link_multiplier ?? ''))
  const hasLinkOwnership =
    !Number.isNaN(linkMul) && linkMul > 0 && linkMul !== 1
  const inGroupView = !!selectedGroup

  const directPct = ownershipPercentage / 100
  let effectivePct: number
  if (hasLinkOwnership) {
    const viewerGroupShare = groupAccountPercentage > 0
      ? groupAccountPercentage / 100
      : 1
    effectivePct = linkMul * viewerGroupShare
  } else if (directPct > 0) {
    effectivePct = directPct
  } else if (hasGroupOwnership) {
    const chain =
      (groupEquityPercentage / 100) * (groupAccountPercentage / 100)
    effectivePct = chain
  } else {
    effectivePct = directPct === 0 && inGroupView ? 1 : 0
  }
  const earnings = netProfit * effectivePct
  const showEarnings = !!(
    data?.has_ownership_setup ||
    hasLinkOwnership ||
    inGroupView
  )
  return {
    displayProfit,
    displayExpenses,
    netProfit,
    earnings,
    showEarnings,
  }
}

export function formatKpiNumber(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
