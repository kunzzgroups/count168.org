import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  buildEarningsPieSlices,
  buildEarningsShareByCode,
  computePieCenterMetrics,
  getCurrencyColor,
} from "../../lib/dashboardEarnings.js";

export default function CurrencyDistributionCard({ i18n, currencyCode, rows, useConverted }) {
  const slices = buildEarningsPieSlices(rows, { useConverted });
  const shareByCode = buildEarningsShareByCode(rows, currencyCode, { useConverted });
  const center = computePieCenterMetrics(rows, currencyCode, { useConverted });

  const legend = rows
    .map((row, index) => ({
      code: String(row.code).toUpperCase(),
      color: getCurrencyColor(row.code, index),
      pct: shareByCode[String(row.code).toUpperCase()] ?? 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <section className="animate-fade-in rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="mb-2 text-[15px] font-semibold text-slate-900">{i18n.currencyDistribution}</h2>

      <div className="flex items-center gap-4">
        <div className="relative size-[150px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Pie
                data={slices.length ? slices : [{ code: "—", value: 1, fill: "#e2e8f0" }]}
                dataKey="value"
                nameKey="code"
                cx="50%"
                cy="50%"
                innerRadius="64%"
                outerRadius="86%"
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
              <span className="text-[20px] font-semibold leading-none text-slate-900">
                {Number(center.pct).toFixed(1)}%
              </span>
              <span className="mt-0.5 text-[11px] font-semibold text-slate-500">{center.code}</span>
              <span className="text-[10px] font-medium text-slate-400">{i18n.shareOfTotal}</span>
            </div>
          )}
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
          {legend.map((item) => (
            <li key={item.code} className="flex items-center gap-2 text-[13px]">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="font-semibold text-slate-700">{item.code}</span>
              <span className="ml-auto font-semibold tabular-nums text-slate-500">
                {item.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
