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

  return (
    <section className="animate-fade-in rounded-[24px] bg-white p-5 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold text-slate-900">{label}</h2>
        <span className="shrink-0 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {dateRangeText}
        </span>
      </div>

      <div className="mb-1 flex flex-wrap justify-center gap-4" role="group" aria-label={label}>
        {series.map((s) => (
          <button
            key={s.dataKey}
            type="button"
            className={`inline-flex items-center gap-1.5 border-0 bg-transparent text-[12px] font-semibold transition-opacity ${
              visible[s.idx] ? "opacity-100" : "opacity-35"
            }`}
            onClick={() => onToggleSeries(s.idx)}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="text-slate-600">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="h-[224px] min-w-0">
        {rows?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 6, left: -6, bottom: xAxisLayout.marginBottom }}>
              <defs>
                <linearGradient id="mGProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGExp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.16} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mGEarn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              <XAxis
                dataKey="label"
                interval={xAxisLayout.interval}
                minTickGap={xAxisLayout.minTickGap}
                height={xAxisLayout.height}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v) => formatCompactAxis(v)}
                width={40}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelStyle={{ color: "#0f172a", fontWeight: 700 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }}
              />
              {series.map((s) =>
                visible[s.idx] ? (
                  <Area
                    key={s.dataKey}
                    type="monotone"
                    dataKey={s.dataKey}
                    name={s.label}
                    stroke={s.color}
                    fill={s.fill}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: s.color, fill: "#fff" }}
                  />
                ) : null,
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="grid h-full place-items-center text-[13px] font-semibold text-slate-400">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}
