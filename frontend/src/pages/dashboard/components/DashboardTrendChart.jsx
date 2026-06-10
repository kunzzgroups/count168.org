import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardChartBaseline } from "../lib/dashboardChart.jsx";
import {
  DashboardChartFlowTravelers,
  DashboardChartSeriesPulse,
  DashboardTrendFlowDefs,
  resolveTrendFlowFill,
} from "../lib/dashboardChartFx.jsx";
import { formatChartTooltipLabel } from "../lib/dashboardDateUtils.js";
import { formatCurrency } from "../lib/dashboardFormat.js";

function DashboardTrendFlowLayers(props) {
  return (
    <>
      <DashboardChartSeriesPulse {...props} />
      <DashboardChartFlowTravelers {...props} />
    </>
  );
}

export function DashboardTrendChart({
  i18n,
  chartRows,
  chartSeries,
  chartVisible,
  onToggleSeries,
  chartDateRangeText,
  chartXAxisLayout,
}) {
  const [chartVisitKey] = useState(() => Date.now());
  const [flowIdle, setFlowIdle] = useState(false);
  const chartAnimReady = chartRows.length > 0;
  const chartAnimKey = `${chartVisitKey}-${chartDateRangeText}-${chartAnimReady ? "ready" : "pending"}`;

  useEffect(() => {
    if (!chartAnimReady) {
      setFlowIdle(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setFlowIdle(true), 1150);
    return () => window.clearTimeout(timer);
  }, [chartAnimKey, chartAnimReady]);

  return (
    <div className="dashboard-panel-card dashboard-panel-card--chart">
      <div className="dashboard-panel-head">
        <h3 className="dashboard-panel-title">{i18n.trendChart}</h3>
        <div className="dashboard-panel-legend" role="group" aria-label={i18n.trendChart}>
          {chartSeries.map((s) => (
            <button
              key={s.dataKey}
              type="button"
              className={`dashboard-legend-item${chartVisible[s.idx] ? " is-on" : ""}`}
              aria-pressed={chartVisible[s.idx]}
              onClick={() => onToggleSeries(s.idx)}
            >
              <span className="dashboard-legend-dot" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="dashboard-panel-period-pill" id="chart-date-range">
          {chartDateRangeText}
        </div>
      </div>
      <div
        className={`dashboard-panel-chart-body${chartAnimReady ? " is-enter is-flow-active" : ""}${
          flowIdle ? " is-flow-idle" : ""
        }`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            key={chartAnimKey}
            data={chartRows}
            margin={{ top: 8, right: 16, left: 0, bottom: chartXAxisLayout.marginBottom }}
          >
            <DashboardTrendFlowDefs />
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <Customized component={DashboardChartBaseline} />
            <XAxis
              dataKey="label"
              interval={chartXAxisLayout.interval}
              minTickGap={chartXAxisLayout.minTickGap}
              tick={chartXAxisLayout.tick}
              height={chartXAxisLayout.height}
              tickMargin={0}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => formatCurrency(v)} width={72} />
            <Tooltip
              formatter={(value) => formatCurrency(value)}
              labelFormatter={(_, items) => {
                const d = items?.[0]?.payload?.date;
                return formatChartTooltipLabel(d, i18n.locale);
              }}
            />
            {chartSeries.flatMap((s) => {
              if (!chartVisible[s.idx]) return [];
              const flowFill = resolveTrendFlowFill(s.dataKey);
              const baseFill = flowFill?.base || s.fill;
              const seriesKey = `${s.dataKey}-${chartAnimKey}`;
              const begin = 80 + s.idx * 120;

              const layers = [
                <Area
                  key={`${seriesKey}-base`}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.label}
                  stroke={s.color}
                  fill={baseFill}
                  strokeWidth={2.5}
                  isAnimationActive={chartAnimReady}
                  animationBegin={begin}
                  animationDuration={1050}
                  animationEasing="ease-out"
                  className="dashboard-trend-area-base"
                />,
              ];

              if (flowFill?.flow) {
                layers.push(
                  <Area
                    key={`${seriesKey}-flow`}
                    type="monotone"
                    dataKey={s.dataKey}
                    legendType="none"
                    tooltipType="none"
                    stroke="none"
                    fill={flowFill.flow}
                    fillOpacity={0.38}
                    isAnimationActive={chartAnimReady}
                    animationBegin={begin + 180}
                    animationDuration={980}
                    animationEasing="ease-out"
                    className="dashboard-trend-area-flow"
                  />
                );
              }

              return layers;
            })}
            <Customized
              component={(props) => (
                <DashboardTrendFlowLayers
                  {...props}
                  flowActive={flowIdle}
                  chartAnimKey={chartAnimKey}
                />
              )}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
