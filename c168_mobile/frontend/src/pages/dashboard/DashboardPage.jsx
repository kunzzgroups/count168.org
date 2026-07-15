import { useEffect, useMemo, useState } from "react";
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
  const { i18n, kpi, loading, refreshing, error, me, blocked, compareLabel } = dash;
  const [filterOpen, setFilterOpen] = useState(false);
  const [ratesHintDismissed, setRatesHintDismissed] = useState(false);
  const ratesHint = dash.ratesWarning && !ratesHintDismissed ? dash.ratesWarning : "";

  useEffect(() => {
    if (!dash.ratesWarning) setRatesHintDismissed(false);
  }, [dash.ratesWarning]);

  const sparklineValues = useMemo(() => {
    const rows = dash.chartRows || [];
    if (rows.length < 2) return [];
    const step = Math.max(1, Math.floor(rows.length / 24));
    return rows.filter((_, i) => i % step === 0 || i === rows.length - 1).map((r) => Number(r.netProfit) || 0);
  }, [dash.chartRows]);

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

  const companyCode = String(dash.selectedCompany?.company_id || "").toUpperCase();
  const groupId = String(
    dash.selectedGroup || dash.selectedCompany?.group_id || dash.selectedCompany?.link_source_group || "",
  )
    .trim()
    .toUpperCase();

  // Prefer explicit All / group-only scope over the session company's code.
  const scopeChip = dash.groupsAllMode
    ? i18n.all
    : dash.groupAllMode
      ? groupId
        ? `${i18n.all}·${groupId}`
        : i18n.all
      : dash.groupOnlyMode
        ? groupId || i18n.all
        : companyCode;
  const scopeGroupBadge = dash.groupsAllMode ? "" : dash.groupOnlyMode ? "" : groupId;

  const viewingCompanyCode = dash.groupsAllMode || dash.groupAllMode
    ? i18n.all
    : dash.groupOnlyMode
      ? groupId
      : companyCode;

  const stickyBar = (
    <button
      type="button"
      onClick={() => setFilterOpen(true)}
      className="tap-scale flex w-full items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)] ring-1 ring-slate-100"
      aria-label={i18n.filter}
    >
      <i className="far fa-calendar shrink-0 text-[#2f6bf6]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left text-[13px] font-bold text-slate-700">
        {dash.dateRangeText}
      </span>
      {scopeChip ? (
        <span
          className={`max-w-[5.5rem] shrink-0 truncate rounded-lg px-1.5 py-1 text-[11px] font-bold tracking-wide ${
            dash.groupsAllMode || dash.groupAllMode || dash.groupOnlyMode
              ? "bg-violet-50 text-violet-700"
              : "bg-[#2f6bf6]/10 text-[#2f6bf6]"
          }`}
        >
          {scopeChip}
        </span>
      ) : null}
      <span className="shrink-0 rounded-lg bg-slate-100 px-1.5 py-1 text-[11px] font-bold tracking-wide text-slate-600">
        {dash.currency}
      </span>
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#2f6bf6] text-white">
        <i className="fas fa-filter text-[12px]" aria-hidden="true" />
      </span>
    </button>
  );

  return (
    <MobileShell
      i18n={i18n}
      me={me}
      companyCode={viewingCompanyCode}
      groupId={dash.groupOnlyMode ? "" : scopeGroupBadge}
      onLogout={dash.logout}
      stickyBar={stickyBar}
      lang={dash.lang}
      onLangChange={dash.setLang}
      onChromeOpen={() => setFilterOpen(false)}
      overlayOpen={filterOpen}
      overlay={<FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} dash={dash} />}
    >
      <div className="relative w-full max-w-full overflow-x-hidden px-3.5 pb-3 pt-3">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-90"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 10% -10%, rgba(47,107,255,0.12), transparent 55%), radial-gradient(ellipse 60% 50% at 90% 10%, rgba(56,189,248,0.1), transparent 50%)",
          }}
          aria-hidden="true"
        />

        {error && (
          <div className="relative mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="min-w-0 flex-1 text-[13px] font-semibold text-rose-700">{error}</div>
            <button
              type="button"
              onClick={dash.retry}
              className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-[12px] font-bold text-rose-600 ring-1 ring-rose-200"
            >
              Retry
            </button>
          </div>
        )}

        {ratesHint && (
          <div
            className="relative mb-3 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5"
            role="status"
          >
            <i className="fas fa-exclamation-triangle mt-0.5 text-[12px] text-amber-600" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-amber-800">{ratesHint}</p>
            <button
              type="button"
              onClick={() => setRatesHintDismissed(true)}
              className="shrink-0 grid size-7 place-items-center rounded-full text-amber-700/70"
              aria-label={i18n.closeMenu || "Close"}
            >
              <i className="fas fa-xmark text-[12px]" aria-hidden="true" />
            </button>
          </div>
        )}

        {refreshing && (
          <div
            className="relative mb-3 h-0.5 overflow-hidden rounded-full bg-slate-100"
            aria-live="polite"
            aria-label={i18n.loading}
          >
            <div className="h-full w-1/3 animate-[mDashRefresh_1.1s_ease-in-out_infinite] rounded-full bg-[#2f6bf6]" />
          </div>
        )}

        <div className={`relative space-y-4 transition-opacity duration-200 ${refreshing ? "opacity-90" : ""}`}>
          <HeroSummaryCard
            i18n={i18n}
            currency={dash.currency}
            value={dash.summaryValue}
            compare={dash.heroCompare}
            compareLabel={compareLabel}
            multiCurrency={dash.showMultiCurrencyNote}
            loading={loading}
            empty={!loading && !dash.hasData}
            sparklineValues={sparklineValues}
          />

          {!loading && !dash.hasData && (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-white/80 px-4 py-4 text-center">
              <p className="text-[13px] font-semibold text-slate-500">{i18n.noData}</p>
              {dash.activePreset !== "thisYear" ? (
                <button
                  type="button"
                  className="mt-3 tap-scale rounded-xl bg-[#2f6bf6] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
                  disabled={Boolean(refreshing)}
                  onClick={() => dash.applyPreset("thisYear")}
                >
                  {refreshing ? i18n.loading : i18n.viewThisYear || i18n.thisYear}
                </button>
              ) : refreshing ? (
                <p className="mt-3 inline-flex items-center justify-center gap-2 text-[12px] font-bold text-slate-500">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-[#2f6bf6]" />
                  {i18n.loading}
                </p>
              ) : null}
            </div>
          )}

          {(loading || dash.hasData) && (
            <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-slate-900">{i18n.overview}</h2>
            </div>
            <div className="no-scrollbar -mx-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3.5 pb-1">
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
            loading={loading}
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
            </>
          )}
        </div>

        {loading && !dash.hasData && (
          <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center pb-[calc(env(safe-area-inset-bottom,0px)+8px)]" aria-live="polite">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-[12px] font-bold text-white shadow-lg">
              <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {i18n.loading}
            </span>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
