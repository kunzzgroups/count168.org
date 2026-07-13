import { useState } from "react";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMobileDashboard } from "../../hooks/useMobileDashboard.js";
import CurrencyDistributionCard from "./CurrencyDistributionCard.jsx";
import CurrencyListCard from "./CurrencyListCard.jsx";
import DashboardKpiCard from "./DashboardKpiCard.jsx";
import DashboardTrendChart from "./DashboardTrendChart.jsx";
import FilterSheet from "./FilterSheet.jsx";
import HeroSummaryCard from "./HeroSummaryCard.jsx";

export default function DashboardPage() {
  const dash = useMobileDashboard();
  const { i18n, kpi, loading, error, me, blocked, compareLabel } = dash;
  const [filterOpen, setFilterOpen] = useState(false);

  if (blocked) return null;

  const kpiCards = [
    { variant: "profit", label: i18n.profit, value: kpi?.profit, compare: kpi?.comparisons?.profit },
    { variant: "expense", label: i18n.expenses, value: kpi?.expenses, compare: kpi?.comparisons?.expenses },
    { variant: "net", label: i18n.netProfit, value: kpi?.netProfit, compare: kpi?.comparisons?.netProfit },
  ];
  if (kpi?.showEarnings) {
    kpiCards.push({
      variant: "earnings",
      label: i18n.earnings,
      value: kpi?.kpiCardEarnings,
      compare: kpi?.comparisons?.earnings,
    });
  }

  return (
    <MobileShell
      i18n={i18n}
      me={me}
      overlay={<FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} dash={dash} />}
    >
      <div
        className="w-full max-w-full overflow-x-hidden px-3 pb-2"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}
      >
        <header className="flex items-center justify-between py-1.5">
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">{i18n.dashboard}</h1>
        </header>

        <div className="mb-4 mt-1 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="tap-scale flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100"
          >
            <i className="far fa-calendar text-[#2f6bf6]" aria-hidden="true" />
            <span className="truncate text-[13px] font-semibold text-slate-700">{dash.dateRangeText}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="tap-scale flex shrink-0 items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100"
          >
            <i className="fas fa-filter text-[#2f6bf6]" aria-hidden="true" />
            <span className="text-[13px] font-semibold text-slate-700">{i18n.filter}</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <HeroSummaryCard
            i18n={i18n}
            currency={dash.currency}
            value={dash.summaryValue}
            compare={kpi?.comparisons?.netProfit}
            compareLabel={compareLabel}
            multiCurrency={dash.useConvertedEarnings}
            loading={loading}
          />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-slate-900">{i18n.overview}</h2>
              <span className="text-[12px] font-medium text-slate-400">
                {i18n.swipe} <i className="fas fa-arrow-right-long text-[10px]" aria-hidden="true" />
              </span>
            </div>
            <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1">
              {kpiCards.map((card) => (
                <DashboardKpiCard
                  key={card.variant}
                  variant={card.variant}
                  label={card.label}
                  value={card.value}
                  compare={card.compare}
                  compareLabel={compareLabel}
                  loading={loading}
                />
              ))}
            </div>
          </section>

          <CurrencyDistributionCard
            i18n={i18n}
            currencyCode={dash.currency}
            rows={dash.earningsCurrencyRows}
            useConverted={dash.useConvertedEarnings}
          />

          <DashboardTrendChart
            rows={dash.chartRows}
            series={dash.chartSeries}
            visible={dash.chartVisible}
            onToggleSeries={dash.toggleChartSeries}
            label={i18n.trendChart}
            dateRangeText={dash.dateRangeShort}
            xAxisLayout={dash.chartXAxisLayout}
            emptyText={loading ? i18n.loading : i18n.noData}
          />

          <CurrencyListCard
            i18n={i18n}
            lang={dash.lang}
            currencyCode={dash.currency}
            rows={dash.earningsCurrencyRows}
            exchangeRates={dash.exchangeRates}
            exchangeRatesLoading={dash.exchangeRatesLoading}
            useConverted={dash.useConvertedEarnings}
            loading={loading}
          />
        </div>

        {loading && (
          <div className="sticky bottom-4 z-30 flex justify-center" aria-live="polite">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-slate-600 shadow-lg ring-1 ring-slate-100">
              <span className="size-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              {i18n.loading}
            </span>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
