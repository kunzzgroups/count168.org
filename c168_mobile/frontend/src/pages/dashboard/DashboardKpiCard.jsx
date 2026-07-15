import { formatCurrency, formatPercentMagnitude, formatSignedChange } from "../../lib/dashboardFormat.js";

const VARIANTS = {
  profit: {
    icon: "fa-dollar-sign",
    tint: "text-blue-600",
    ring: "bg-blue-50",
    accent: "from-blue-500/10 to-transparent",
  },
  expense: {
    icon: "fa-arrow-trend-down",
    tint: "text-rose-600",
    ring: "bg-rose-50",
    accent: "from-rose-500/10 to-transparent",
  },
  net: {
    icon: "fa-chart-line",
    tint: "text-emerald-600",
    ring: "bg-emerald-50",
    accent: "from-emerald-500/10 to-transparent",
  },
  earnings: {
    icon: "fa-hand-holding-dollar",
    tint: "text-amber-600",
    ring: "bg-amber-50",
    accent: "from-amber-500/10 to-transparent",
  },
};

export default function DashboardKpiCard({ variant, label, value, compare, compareLabel, loading }) {
  const meta = VARIANTS[variant] || VARIANTS.net;
  const display = loading ? null : formatCurrency(value);
  const pct = compare?.pct;
  const showCompare = !loading && compare && Number.isFinite(pct);

  return (
    <article className="tap-scale relative flex w-[46%] min-w-[150px] max-w-[178px] shrink-0 snap-start flex-col gap-1.5 overflow-hidden rounded-[20px] bg-white px-3.5 py-3 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.18)] ring-1 ring-slate-100/90">
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b ${meta.accent}`} aria-hidden="true" />

      <div className="relative flex items-center gap-2">
        <span className={`grid size-8 place-items-center rounded-lg ${meta.ring}`}>
          <i className={`fas ${meta.icon} ${meta.tint} text-[13px]`} aria-hidden="true" />
        </span>
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      </div>

      <p className="relative text-[20px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
        {display ?? <span className="inline-block h-5 w-20 animate-pulse rounded-lg bg-slate-100" />}
      </p>

      {showCompare ? (
        <div className="relative flex items-center gap-1.5">
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              compare.isUp ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            <i className={`fas fa-arrow-${compare.isUp ? "up" : "down"} text-[8px]`} aria-hidden="true" />
            {formatPercentMagnitude(pct)}
          </span>
          <span className={`truncate text-[10px] font-bold ${compare.isUp ? "text-emerald-600" : "text-rose-600"}`}>
            {formatSignedChange(compare.delta)}
          </span>
        </div>
      ) : (
        <p className="relative truncate text-[10px] font-medium leading-tight text-slate-400">{compareLabel}</p>
      )}
    </article>
  );
}
