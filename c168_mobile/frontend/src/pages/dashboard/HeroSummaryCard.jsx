import { formatCurrencyHero, formatPercentMagnitude, formatSignedChange } from "../../lib/dashboardFormat.js";

export default function HeroSummaryCard({
  i18n,
  currency,
  value,
  compare,
  compareLabel,
  multiCurrency,
  loading,
  empty = false,
  sparklineValues = [],
}) {
  const showCompare = !loading && !empty && compare && Number.isFinite(compare?.pct);

  const sparkPath = (() => {
    if (empty || loading) return null;
    const vals = (sparklineValues || []).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const w = 120;
    const h = 40;
    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = h - ((v - min) / span) * (h - 4) - 2;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  })();

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1e4fd8] via-[#2f6bff] to-[#3ecfff] p-5 text-white shadow-[0_20px_44px_-16px_rgba(30,79,216,0.55)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 100% 0%, rgba(255,255,255,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(56,189,248,0.35), transparent 50%)",
        }}
        aria-hidden="true"
      />

      {sparkPath ? (
        <svg
          className="pointer-events-none absolute bottom-2 right-2 h-14 w-32 text-white/45"
          viewBox="0 0 120 40"
          fill="none"
          aria-hidden="true"
        >
          <path d={sparkPath} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}

      <div className={`relative flex items-start justify-between gap-3 ${sparkPath ? "pr-24" : ""}`}>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">{i18n.netProfit}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-white/90">{currency}</p>
        </div>
        {showCompare && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold backdrop-blur ${
              compare.isUp ? "bg-emerald-400/25 text-white" : "bg-rose-400/30 text-white"
            }`}
          >
            <i className={`fas fa-arrow-${compare.isUp ? "up" : "down"} text-[10px]`} aria-hidden="true" />
            {formatPercentMagnitude(compare.pct)}
          </span>
        )}
      </div>

      <p
        className={`relative mt-4 truncate text-[clamp(28px,9vw,40px)] font-bold leading-none tracking-tight tabular-nums ${
          sparkPath ? "pr-24" : ""
        }`}
      >
        {loading ? (
          <span className="inline-block h-10 w-40 animate-pulse rounded-xl bg-white/25" />
        ) : empty ? (
          <span className="text-[22px] font-semibold tracking-normal text-white/80">—</span>
        ) : (
          formatCurrencyHero(value)
        )}
      </p>

      {showCompare && (
        <p className="relative mt-3 max-w-[85%] text-[12px] font-medium leading-snug text-white/85">
          {compareLabel} <span className="font-bold">{formatSignedChange(compare.delta)}</span>
        </p>
      )}

      {empty && !loading && (
        <p className="relative mt-3 text-[12px] font-semibold text-white/75">{i18n.noData}</p>
      )}

      {multiCurrency && !empty && (
        <p className="relative mt-2 text-[11px] font-semibold text-white/70">{i18n.multiCurrencyNote}</p>
      )}
    </section>
  );
}
