import { formatCurrency, formatPercentMagnitude, formatSignedChange } from "../../lib/dashboardFormat.js";

const VARIANTS = {
  profit: { icon: "fa-dollar-sign", tint: "text-blue-500", ring: "bg-blue-50" },
  expense: { icon: "fa-arrow-trend-down", tint: "text-rose-500", ring: "bg-rose-50" },
  net: { icon: "fa-chart-line", tint: "text-emerald-500", ring: "bg-emerald-50" },
  earnings: { icon: "fa-hand-holding-dollar", tint: "text-amber-500", ring: "bg-amber-50" },
};

export default function DashboardKpiCard({ variant, label, value, compare, compareLabel, loading }) {
  const meta = VARIANTS[variant] || VARIANTS.net;
  const display = loading ? "—" : formatCurrency(value);
  const pct = compare?.pct;
  const showCompare = !loading && compare && Number.isFinite(pct);

  return (
    <article className="tap-scale flex w-[44%] min-w-[152px] max-w-[180px] shrink-0 snap-start flex-col gap-2.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      <div className="flex items-center gap-2">
        <span className={`grid size-8 place-items-center rounded-lg ${meta.ring}`}>
          <i className={`fas ${meta.icon} ${meta.tint} text-[13px]`} aria-hidden="true" />
        </span>
        <p className="truncate text-[13px] font-semibold text-slate-500">{label}</p>
      </div>

      <p className="text-[21px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
        {display}
      </p>

      {showCompare ? (
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            compare.isUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          }`}
        >
          <i className={`fas fa-arrow-${compare.isUp ? "up" : "down"} text-[9px]`} aria-hidden="true" />
          {formatPercentMagnitude(pct)}
        </span>
      ) : (
        <span className="h-[18px]" aria-hidden="true" />
      )}

      <div className="text-[11px] font-medium leading-tight text-slate-400">
        <p>{compareLabel}</p>
        {showCompare && (
          <p className={`font-semibold ${compare.isUp ? "text-emerald-600" : "text-rose-600"}`}>
            {formatSignedChange(compare.delta)}
          </p>
        )}
      </div>
    </article>
  );
}
