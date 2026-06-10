import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  computeDisplayConvertedAmount,
  formatFrankfurterUnitRate,
} from "../../../utils/dashboard/frankfurterRates.js";
import {
  buildEarningsPieSlices,
  buildEarningsShareByCode,
  computeCurrencySharePct,
  computePieCenterMetrics,
  computeSectorTooltipPosition,
  getCurrencyColor,
  resolveEarningsPiePaddingAngle,
} from "../lib/dashboardEarnings.js";
import { DASHBOARD_EARNINGS_PIE_MIN_ANGLE } from "../lib/dashboardConstants.js";
import { formatCurrency, formatI18nTemplate } from "../lib/dashboardFormat.js";
import { EarningsPieSectorTooltip } from "./EarningsPieSectorTooltip.jsx";

export function DashboardEarningsSummary({
  i18n,
  currencyCode,
  currencies,
  earningsCurrencyRows,
  useConvertedEarnings,
  earningsBreakdownShowsRate = false,
  summaryEarningsValue,
  summaryConversionNote,
  summaryEarningsLoading,
  earningsPanelStable = true,
  earningsByCurrencyLoading,
  exchangeRates,
  exchangeRatesError,
  exchangeRatesLoading,
  exchangeRateScopeKey = "",
  rateFootnoteText,
}) {
  const pieAreaRef = useRef(null);
  const pieShellRef = useRef(null);
  const [pieShellLayout, setPieShellLayout] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [hoveredPieSector, setHoveredPieSector] = useState(null);

  const earningsPieSlices = useMemo(
    () => buildEarningsPieSlices(earningsCurrencyRows, { useConverted: useConvertedEarnings }),
    [earningsCurrencyRows, useConvertedEarnings]
  );

  const earningsShareByCode = useMemo(
    () =>
      buildEarningsShareByCode(earningsCurrencyRows, currencyCode, {
        useConverted: useConvertedEarnings,
      }),
    [earningsCurrencyRows, currencyCode, useConvertedEarnings]
  );

  const pieCenterMetrics = useMemo(
    () =>
      computePieCenterMetrics(earningsCurrencyRows, currencyCode, {
        useConverted: useConvertedEarnings,
      }),
    [earningsCurrencyRows, currencyCode, useConvertedEarnings]
  );

  const currencyPieFillByCode = useMemo(() => {
    const map = {};
    earningsCurrencyRows.forEach((row, index) => {
      map[row.code] = getCurrencyColor(row.code, index);
    });
    return map;
  }, [earningsCurrencyRows]);

  const piePaddingAngle = useMemo(
    () => resolveEarningsPiePaddingAngle(earningsPieSlices.length),
    [earningsPieSlices.length]
  );

  const summaryPieReady =
    earningsPanelStable && earningsPieSlices.length > 0 && !summaryEarningsLoading;

  /** Unique per page visit so pie enter animation replays when navigating back to Dashboard. */
  const [pieVisitKey] = useState(() => Date.now());
  const [pieFlowIdle, setPieFlowIdle] = useState(false);
  const pieAnimKey = `${pieVisitKey}-${exchangeRateScopeKey || "scope"}-${
    summaryPieReady ? "ready" : "pending"
  }`;

  useEffect(() => {
    if (!summaryPieReady) {
      setPieFlowIdle(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setPieFlowIdle(true), 920);
    return () => window.clearTimeout(timer);
  }, [pieAnimKey, summaryPieReady]);

  const isRowAmountLoading = useCallback(
    (code) => {
      if (currencies.length <= 1) return summaryEarningsLoading;
      const row = earningsCurrencyRows.find((r) => r.code === code);
      return row?.earnings == null;
    },
    [currencies.length, earningsCurrencyRows, summaryEarningsLoading]
  );

  const isRowRateLoading = useCallback(() => {
    if (currencies.length <= 1) return false;
    return (
      exchangeRatesLoading ||
      (exchangeRateScopeKey && exchangeRates.scopeKey !== exchangeRateScopeKey)
    );
  }, [currencies.length, exchangeRatesLoading, exchangeRates.scopeKey, exchangeRateScopeKey]);

  useEffect(() => {
    setHoveredPieSector(null);
  }, [currencyCode]);

  useLayoutEffect(() => {
    const wrap = pieAreaRef.current;
    const shell = pieShellRef.current;
    if (!wrap || !shell) return undefined;

    const syncLayout = () => {
      setPieShellLayout({
        left: shell.offsetLeft,
        top: shell.offsetTop,
        width: shell.clientWidth,
        height: shell.clientHeight,
      });
    };

    syncLayout();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncLayout) : null;
    observer?.observe(wrap);
    observer?.observe(shell);
    window.addEventListener("resize", syncLayout);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncLayout);
    };
  }, [summaryPieReady, currencyCode]);

  const handlePieSectorEnter = useCallback(
    (sectorData, index) => {
      const slice = earningsPieSlices[index];
      if (!slice || sectorData?.midAngle == null) return;
      setHoveredPieSector({
        slice,
        cx: sectorData.cx,
        cy: sectorData.cy,
        innerRadius: sectorData.innerRadius,
        outerRadius: sectorData.outerRadius,
        midAngle: sectorData.midAngle,
      });
    },
    [earningsPieSlices]
  );

  const hoveredPieTooltip = useMemo(() => {
    if (!hoveredPieSector || pieShellLayout.width <= 0) return null;
    const pos = computeSectorTooltipPosition(
      hoveredPieSector,
      pieShellLayout.width,
      pieShellLayout.height
    );
    if (!pos) return null;
    const slice = hoveredPieSector.slice;
    const row = earningsCurrencyRows.find(
      (r) => String(r.code).toUpperCase() === String(slice?.code || "").toUpperCase()
    );
    const sharePct = row ? computeCurrencySharePct(row, earningsShareByCode) : null;
    const displayConverted =
      row && useConvertedEarnings
        ? computeDisplayConvertedAmount(
            row.earnings,
            row.code,
            currencyCode,
            exchangeRates.rates
          )
        : null;
    return {
      slice,
      sharePct,
      displayConverted,
      left: pos.left + pieShellLayout.left,
      top: pos.top + pieShellLayout.top,
      placeAbove: pos.placeAbove,
      radial: pos.radial,
    };
  }, [
    hoveredPieSector,
    earningsPieSlices,
    earningsCurrencyRows,
    earningsShareByCode,
    useConvertedEarnings,
    currencyCode,
    exchangeRates.rates,
    pieShellLayout,
  ]);

  return (
    <div className="dashboard-panel-card dashboard-panel-card--summary">
      <div className="dashboard-summary-layout">
        <div className="dashboard-summary-left-col">
          <div className="dashboard-summary-hero dashboard-summary-hero--compact">
            <span className="dashboard-summary-hero-caption">
              {i18n.earnings}
              {currencyCode ? ` · ${currencyCode}` : ""}
            </span>
            <div className="dashboard-summary-hero-value">
              {summaryEarningsLoading ? "…" : formatCurrency(summaryEarningsValue)}
            </div>
            {summaryConversionNote && (
              <span className="dashboard-summary-hero-conversion-note">{summaryConversionNote}</span>
            )}
          </div>
          <div
            ref={pieAreaRef}
            className={`dashboard-summary-pie-wrap${pieFlowIdle ? " is-flow-idle" : ""}`}
            aria-hidden={!earningsPanelStable && !earningsPieSlices.length}
            onMouseLeave={() => setHoveredPieSector(null)}
          >
            <div
              ref={pieShellRef}
              className={`dashboard-summary-pie-chart-shell${
                summaryPieReady ? " is-enter is-flow-active" : ""
              }`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie
                    key={pieAnimKey}
                    data={
                      earningsPieSlices.length
                        ? earningsPieSlices
                        : [{ code: "—", earnings: 0, value: 1, fill: "#e0e7ff" }]
                    }
                    dataKey="value"
                    nameKey="code"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="84%"
                    paddingAngle={piePaddingAngle}
                    minAngle={DASHBOARD_EARNINGS_PIE_MIN_ANGLE}
                    stroke="#fff"
                    strokeWidth={2}
                    label={false}
                    activeShape={false}
                    isAnimationActive={summaryPieReady}
                    animationBegin={80}
                    animationDuration={920}
                    animationEasing="ease-out"
                    onMouseEnter={handlePieSectorEnter}
                    onMouseLeave={() => setHoveredPieSector(null)}
                  >
                    {(earningsPieSlices.length ? earningsPieSlices : [{ fill: "#e0e7ff" }]).map(
                      (entry, index) => (
                        <Cell key={entry.code || index} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                      )
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {!summaryEarningsLoading && earningsPanelStable && earningsPieSlices.length > 0 && !hoveredPieTooltip && (
                <div
                  key={pieAnimKey}
                  className="dashboard-summary-pie-center is-enter"
                  aria-hidden="true"
                >
                  <span className="dashboard-summary-pie-center-pct">{pieCenterMetrics.pct}%</span>
                  <span className="dashboard-summary-pie-center-code">{pieCenterMetrics.code}</span>
                  <span className="dashboard-summary-pie-center-caption">{i18n.shareOfTotal}</span>
                </div>
              )}
            </div>
            {hoveredPieTooltip && (
              <div
                className={`dashboard-summary-pie-tooltip-anchor${
                  hoveredPieTooltip.radial ? " is-radial" : hoveredPieTooltip.placeAbove ? "" : " is-below"
                }`}
                style={{
                  left: hoveredPieTooltip.left,
                  top: hoveredPieTooltip.top,
                }}
              >
                <EarningsPieSectorTooltip
                  slice={hoveredPieTooltip.slice}
                  sharePct={hoveredPieTooltip.sharePct}
                  displayConverted={hoveredPieTooltip.displayConverted}
                  baseCode={currencyCode}
                  useConverted={useConvertedEarnings}
                  convertedApproxTemplate={i18n.convertedApprox}
                  placeAbove={hoveredPieTooltip.placeAbove}
                />
              </div>
            )}
          </div>
        </div>
        <div
          className={`dashboard-summary-currency-list${
            currencies.length > 1 ? " is-multi-currency" : ""
          }`}
          aria-label={i18n.currencyBreakdown}
        >
          <div className="dashboard-summary-currency-list-head" aria-hidden="true">
            <span>{i18n.breakdownCurrency}</span>
            <span>{i18n.breakdownAmount}</span>
            <span>{earningsBreakdownShowsRate ? i18n.breakdownRate : i18n.breakdownShare}</span>
          </div>
          <div className="dashboard-summary-currency-list-body" role="list">
            {earningsCurrencyRows.map((row, index) => {
              const rowAmountLoading = isRowAmountLoading(row.code);
              const rowRateLoading = isRowRateLoading();
              const sharePct = computeCurrencySharePct(row, earningsShareByCode);
              const unitRateLabel = earningsBreakdownShowsRate
                ? formatFrankfurterUnitRate(row.code, currencyCode, exchangeRates.rates)
                : null;
              const unitRateTitle =
                unitRateLabel && unitRateLabel !== "—"
                  ? formatI18nTemplate(i18n.rateOneUnit, {
                      from: row.code,
                      rate: unitRateLabel,
                      base: currencyCode,
                    })
                  : undefined;
              return (
                <div
                  key={row.code}
                  role="listitem"
                  className={`dashboard-summary-currency-row${row.code === currencyCode ? " is-active" : ""}`}
                  style={
                    row.code === currencyCode
                      ? {
                          "--currency-accent":
                            currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                        }
                      : undefined
                  }
                >
                  <div className="dashboard-summary-currency-label">
                    <span
                      className="dashboard-summary-currency-dot"
                      style={{
                        backgroundColor: currencyPieFillByCode[row.code] || getCurrencyColor(row.code, index),
                      }}
                      aria-hidden="true"
                    />
                    <span className="dashboard-summary-currency-code">{row.code}</span>
                  </div>
                  <div className="dashboard-summary-currency-amount-col">
                    <span className="dashboard-summary-currency-amount">
                      {rowAmountLoading ? "…" : formatCurrency(row.earnings ?? 0)}
                    </span>
                    {useConvertedEarnings &&
                      !rowAmountLoading &&
                      row.earningsConverted != null &&
                      String(row.code).toUpperCase() !== String(currencyCode).toUpperCase() && (
                        <span className="dashboard-summary-currency-converted">
                          {formatI18nTemplate(i18n.convertedApprox, {
                            amount: formatCurrency(
                              computeDisplayConvertedAmount(
                                row.earnings,
                                row.code,
                                currencyCode,
                                exchangeRates.rates
                              ) ?? row.earningsConverted
                            ),
                            code: currencyCode,
                          })}
                        </span>
                      )}
                    {earningsBreakdownShowsRate &&
                      !useConvertedEarnings &&
                      String(row.code).toUpperCase() !== String(currencyCode).toUpperCase() && (
                        <span className="dashboard-summary-currency-converted is-placeholder" aria-hidden="true">
                          &nbsp;
                        </span>
                      )}
                  </div>
                  <span className="dashboard-summary-currency-rate" title={unitRateTitle}>
                    {rowRateLoading
                      ? "…"
                      : earningsBreakdownShowsRate
                        ? unitRateLabel && unitRateLabel !== "—"
                          ? unitRateLabel
                          : "—"
                        : rowAmountLoading
                          ? "…"
                          : `${sharePct.toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {currencies.length > 1 && rateFootnoteText && (
        <p
          className={`dashboard-summary-rate-footnote${
            exchangeRatesError || exchangeRates.unsupported?.length ? " is-warn" : ""
          }${exchangeRatesLoading ? " is-muted" : ""}`}
        >
          {rateFootnoteText}
        </p>
      )}
    </div>
  );
}
