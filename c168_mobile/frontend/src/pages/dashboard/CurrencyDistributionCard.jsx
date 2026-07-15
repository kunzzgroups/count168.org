import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  buildEarningsPieSlices,
  buildEarningsShareByCode,
  computePieCenterMetrics,
  getCurrencyColor,
} from "../../lib/dashboardEarnings.js";

export default function CurrencyDistributionCard({ i18n, currencyCode, rows, useConverted, loading }) {
  const slices = buildEarningsPieSlices(rows, { useConverted });
  const shareByCode = buildEarningsShareByCode(rows, currencyCode, { useConverted });
  const center = computePieCenterMetrics(rows, currencyCode, { useConverted });

  const legend = rows
    .map((row, index) => ({
      code: String(row.code).toUpperCase(),
      color: getCurrencyColor(row.code, index),
      pct: shareByCode[String(row.code).toUpperCase()] ?? 0,
    }))
    .filter((item) => item.pct >= 0.05)
    .sort((a, b) => b.pct - a.pct);

  const empty = !loading && slices.length === 0;

  return (
    <section className="animate-fade-in rounded-[24px] bg-white p-5 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-100/80">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900">{i18n.currencyDistribution}</h2>
        {legend.length > 0 && (
          <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
            {legend.length} {i18n.currency}
          </span>
        )}
      </div>

      {empty ? (
        <p className="grid h-[140px] place-items-center text-[13px] font-semibold text-slate-400">
          {i18n.noData}
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative size-[148px] shrink-0">
            {loading ? (
              <div className="size-full animate-pulse rounded-full bg-slate-100" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <Pie
                      data={slices.length ? slices : [{ code: "—", value: 1, fill: "#e2e8f0" }]}
                      dataKey="value"
                      nameKey="code"
                      cx="50%"
                      cy="50%"
                      innerRadius="66%"
                      outerRadius="88%"
                      paddingAngle={slices.length > 3 ? 2 : 3}
                      stroke="#fff"
                      strokeWidth={2}
                      isAnimationActive
                      label={false}
                    >
                      {(slices.length ? slices : [{ code: "empty", fill: "#e2e8f0" }]).map((entry, index) => (
                        <Cell key={entry.code || index} fill={entry.fill} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {slices.length > 0 && (
                  <div
                    className="pointer-events-none absolute inset-0 grid place-content-center text-center"
                    aria-hidden="true"
                  >
                    <span className="text-[22px] font-bold leading-none text-slate-900">
                      {Number(center.pct).toFixed(1)}%
                    </span>
                    <span className="mt-1 text-[11px] font-bold text-slate-500">{center.code}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {(loading ? Array.from({ length: 4 }, (_, i) => ({ code: `s${i}`, pct: 0, color: "#e2e8f0" })) : legend).map(
              (item) => (
                <li key={item.code} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate font-bold text-slate-700">
                    {loading ? (
                      <span className="inline-block h-3 w-8 animate-pulse rounded bg-slate-100" />
                    ) : (
                      item.code
                    )}
                  </span>
                  <span className="ml-auto font-bold tabular-nums text-slate-500">
                    {loading ? "—" : `${item.pct.toFixed(1)}%`}
                  </span>
                </li>
              ),
            )}
            {!loading && legend.length === 0 && (
              <li className="text-[12px] font-semibold text-slate-400">{i18n.noData}</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
