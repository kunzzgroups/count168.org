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
import { formatChartTooltipLabel } from "../lib/dashboardDateUtils.js";
import { formatCurrency } from "../lib/dashboardFormat.js";

export function DashboardTrendChart({
  i18n,
  chartRows,
  chartSeries,
  chartVisible,
  onToggleSeries,
  chartDateRangeText,
  chartXAxisLayout,
}) {
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
      <div className="dashboard-panel-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartRows}
            margin={{ top: 8, right: 16, left: 0, bottom: chartXAxisLayout.marginBottom }}
          >
            <defs>
              <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(59,130,246,0.35)" />
                <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
              </linearGradient>
              <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(239,68,68,0.35)" />
                <stop offset="100%" stopColor="rgba(239,68,68,0.02)" />
              </linearGradient>
              <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0.02)" />
              </linearGradient>
              <linearGradient id="gEarn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(245,158,11,0.35)" />
                <stop offset="100%" stopColor="rgba(245,158,11,0.02)" />
              </linearGradient>
            </defs>
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
            {chartSeries.map(
              (s) =>
                chartVisible[s.idx] && (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.label}
                    stroke={s.color}
                    fill={s.fill}
                    strokeWidth={2}
                  />
                )
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
