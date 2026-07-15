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
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 text-[11px] font-bold text-slate-500">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={entry.dataKey} className="flex items-center justify-between gap-4 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
              <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden="true" />
              {entry.name}
            </span>
            <span className="font-bold tabular-nums text-slate-900">{formatCurrency(entry.value)}</span>
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
    <section className="animate-fade-in rounded-[24px] bg-white p-4 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-slate-900">{label}</h2>
        <span className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {dateRangeText}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={label}>
        {series.map((s) => {
          const on = Boolean(visible[s.idx]);
          return (
            <button
              key={s.dataKey}
              type="button"
              aria-pressed={on}
              className={`tap-scale inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                on
                  ? "border-transparent text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
              style={on ? { backgroundColor: s.color } : undefined}
              onClick={() => onToggleSeries(s.idx)}
            >
              <span
                className={`size-1.5 rounded-full ${on ? "bg-white/90" : ""}`}
                style={!on ? { backgroundColor: s.color } : undefined}
                aria-hidden="true"
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="h-[248px] min-w-0">
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
          <p className="grid h-full place-items-center text-[13px] font-semibold text-slate-400">
            {rows?.length && !hasSeriesOn ? emptyText || "—" : emptyText}
          </p>
        )}
      </div>
    </section>
  );
}
