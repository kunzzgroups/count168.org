import { DashboardKpiCard } from "./DashboardKpiCard.jsx";
import { formatCurrency } from "../lib/dashboardFormat.js";

export function DashboardKpiGrid({ i18n, kpi, kpiCompareLabel, kpiFooter, loading, dashboardData }) {
  const kpiLoading = loading && !dashboardData;

  return (
    <div
      className={`dashboard-kpi-grid${kpi.showEarnings ? " dashboard-kpi-grid--with-earnings" : ""}`}
    >
      <DashboardKpiCard
        variant="profit"
        label={i18n.profit}
        value={formatCurrency(kpi.profit)}
        compare={kpi.comparisons?.profit}
        compareLabel={kpiCompareLabel}
        fallbackFoot={kpiFooter}
        loading={kpiLoading}
      />
      <DashboardKpiCard
        variant="expense"
        label={i18n.expenses}
        value={formatCurrency(kpi.expenses)}
        compare={kpi.comparisons?.expenses}
        compareLabel={kpiCompareLabel}
        fallbackFoot={kpiFooter}
        loading={kpiLoading}
      />
      <DashboardKpiCard
        variant="net"
        label={i18n.netProfit}
        value={formatCurrency(kpi.netProfit)}
        compare={kpi.comparisons?.netProfit}
        compareLabel={kpiCompareLabel}
        fallbackFoot={kpiFooter}
        loading={kpiLoading}
      />
      {kpi.showEarnings && (
        <DashboardKpiCard
          variant="earnings"
          label={i18n.earnings}
          value={formatCurrency(kpi.earnings)}
          compare={kpi.comparisons?.earnings}
          compareLabel={kpiCompareLabel}
          fallbackFoot={kpiFooter}
          loading={kpiLoading}
          id="earnings-card-wrapper"
        />
      )}
    </div>
  );
}
