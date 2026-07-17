import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeTrendYDomain } from "../../lib/dashboardChart.js";
import { formatCompactAxis, formatCurrency } from "../../lib/dashboardFormat.js";

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="m-dash-trend-tooltip">
      <p className="m-dash-trend-tooltip-title">{label}</p>
      <ul>
        {payload.map((entry) => (
          <li key={entry.dataKey} className="m-dash-trend-tooltip-row">
            <span className="m-dash-trend-tooltip-label">
              <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="m-dash-trend-tooltip-value">{formatCurrency(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DashboardTrendChart({
  rows,
  series,
  visible,
  onToggleSeries,
  label,
  dateRangeText,
  xAxisLayout,
  emptyText,
}) {
  const activeKeys = series.filter((s) => visible[s.idx]).map((s) => s.dataKey);
  const yDomain = computeTrendYDomain(rows, activeKeys);
  const hasSeriesOn = activeKeys.length > 0;

  return (
    <section className="m-dash-card m-dash-trend">
      <div className="m-dash-card-head m-dash-card-head--spaced">
        <h2 className="m-dash-card-title">{label}</h2>
        <span className="m-dash-card-badge">{dateRangeText}</span>
      </div>

      <div className="m-dash-trend-toggles" role="group" aria-label={label}>
        {series.map((s) => {
          const on = Boolean(visible[s.idx]);
          return (
            <button
              key={s.dataKey}
              type="button"
              aria-pressed={on}
              className={`m-dash-trend-toggle tap-scale${on ? " m-dash-trend-toggle--on" : ""}`}
              style={on ? { backgroundColor: s.color } : undefined}
              onClick={() => onToggleSeries(s.idx)}
            >
              <span
                className={`m-dash-trend-toggle-dot${on ? " m-dash-trend-toggle-dot--on" : ""}`}
                style={!on ? { backgroundColor: s.color } : undefined}
                aria-hidden="true"
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="m-dash-trend-chart">
        {rows?.length && hasSeriesOn ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={rows}
              margin={{
                top: 10,
                right: 8,
                left: 0,
                bottom: xAxisLayout.marginBottom ?? 10,
              }}
            >
              <defs>
                <linearGradient id="mGProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.16} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGEarn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.25} />
              <XAxis
                dataKey="label"
                interval={xAxisLayout.interval}
                minTickGap={xAxisLayout.minTickGap}
                height={xAxisLayout.height}
                tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }}
                tickFormatter={(v) => formatCompactAxis(v)}
                width={44}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<TrendTooltip />} />
              {series.map((s) =>
                visible[s.idx] ? (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.label}
                    stroke={s.color}
                    fill={s.fill}
                    strokeWidth={s.dataKey === "netProfit" ? 2.5 : 2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: s.color, fill: "#fff" }}
                    isAnimationActive={false}
                  />
                ) : null,
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="m-dash-card-empty">{rows?.length && !hasSeriesOn ? emptyText || "—" : emptyText}</p>
        )}
      </div>
    </section>
  );
}
