import {
  formatFrankfurterUnitRate,
  getCurrencyColor,
  resolveEarningsRowDisplayAmounts,
} from "../../lib/dashboardEarnings.js";
import { formatCurrency } from "../../lib/dashboardFormat.js";
import { getCurrencyMeta } from "../../lib/currencyMeta.js";

export default function CurrencyListCard({
  i18n,
  lang,
  currencyCode,
  rows,
  exchangeRates,
  exchangeRatesLoading,
  useConverted,
  loading,
}) {
  return (
    <section className="animate-fade-in overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-100">
      <h2 className="px-5 pb-1 pt-5 text-[15px] font-semibold text-slate-900">{i18n.currencies}</h2>

      <ul className="divide-y divide-slate-100">
        {rows.map((row, index) => {
          const code = String(row.code).toUpperCase();
          const meta = getCurrencyMeta(code, lang);
          const color = getCurrencyColor(code, index);
          const { primary } = resolveEarningsRowDisplayAmounts(
            row,
            currencyCode,
            exchangeRates.rates,
            useConverted,
          );
          const rateLabel = formatFrankfurterUnitRate(code, currencyCode, exchangeRates.rates);
          const amount = loading ? "…" : primary != null ? formatCurrency(primary) : "—";
          const negative = Number(primary) < 0;

          return (
            <li key={code} className="flex items-center gap-3 px-5 py-3.5">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-50 text-lg ring-1 ring-slate-100"
                aria-hidden="true"
              >
                {meta.flag}
              </span>

              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {code}
                </p>
                <p className="truncate text-[12px] font-medium text-slate-400">{meta.name}</p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={`text-[15px] font-semibold tabular-nums ${
                    negative ? "text-rose-600" : "text-slate-900"
                  }`}
                >
                  {amount}
                </p>
                <p className="text-[11px] font-medium text-slate-400">
                  {i18n.rate} {exchangeRatesLoading ? "…" : rateLabel}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
