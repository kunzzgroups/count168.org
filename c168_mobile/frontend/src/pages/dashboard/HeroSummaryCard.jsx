import { formatCurrency, formatPercentMagnitude, formatSignedChange } from "../../lib/dashboardFormat.js";

export default function HeroSummaryCard({ i18n, currency, value, compare, multiCurrency, loading }) {
  const showCompare = !loading && compare && Number.isFinite(compare?.pct);

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#2f6bff] via-[#3b82f6] to-[#42c0ff] p-5 text-white shadow-[0_18px_40px_-12px_rgba(47,107,255,0.6)]">
      <div
        className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-white/15 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 right-6 size-40 rounded-full bg-cyan-200/20 blur-2xl"
        aria-hidden="true"
      />
      <svg
        className="pointer-events-none absolute bottom-3 right-3 h-16 w-28 text-white/40"
        viewBox="0 0 120 60"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2 50 L26 40 L46 44 L70 22 L92 28 L114 8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M104 8 L114 8 L114 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="relative flex items-start justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/80">
          {i18n.netProfit} · {currency}
        </p>
        {showCompare && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2.5 py-1 text-[12px] font-semibold backdrop-blur">
            <i
              className={`fas fa-arrow-${compare.isUp ? "up" : "down"} text-[10px]`}
              aria-hidden="true"
            />
            {formatPercentMagnitude(compare.pct)}
          </span>
        )}
      </div>

      <p className="relative mt-3 text-[38px] font-semibold leading-none tracking-tight tabular-nums">
        {loading ? "—" : formatCurrency(value)}
      </p>

      {showCompare && (
        <p className="relative mt-3 text-[13px] font-medium text-white/85">
          {i18n.vsLastMonth} <span className="font-semibold">{formatSignedChange(compare.delta)}</span>
        </p>
      )}

      {multiCurrency && (
        <p className="relative mt-1 text-[12px] font-medium text-white/65">{i18n.multiCurrencyNote}</p>
      )}
    </section>
  );
}
