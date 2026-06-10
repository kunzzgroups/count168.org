import { formatCurrency, formatI18nTemplate } from "../lib/dashboardFormat.js";

export function EarningsPieSectorTooltip({
  slice,
  sharePct,
  displayConverted,
  baseCode,
  useConverted,
  convertedApproxTemplate,
  placeAbove = true,
}) {
  if (!slice?.code) return null;
  const displayAmount = slice.originalEarnings ?? slice.earnings ?? 0;
  const convertedAmount =
    displayConverted != null ? displayConverted : slice.earningsConverted;
  const showConverted =
    useConverted &&
    convertedAmount != null &&
    String(slice.code).toUpperCase() !== String(baseCode || "").toUpperCase();

  return (
    <div className={`dashboard-summary-pie-tooltip-stack${placeAbove ? "" : " is-below"}`}>
      <div className="dashboard-summary-pie-tooltip dashboard-summary-pie-tooltip--sector">
        <div className="dashboard-summary-pie-tooltip-label">{slice.code}</div>
        <div className="dashboard-summary-pie-tooltip-value">{formatCurrency(displayAmount)}</div>
        {showConverted && (
          <div className="dashboard-summary-pie-tooltip-converted">
            {formatI18nTemplate(convertedApproxTemplate, {
              amount: formatCurrency(convertedAmount),
              code: baseCode,
            })}
          </div>
        )}
        {sharePct != null && (
          <div className="dashboard-summary-pie-tooltip-pct">{sharePct.toFixed(1)}%</div>
        )}
      </div>
      <div className="dashboard-summary-pie-tooltip-arrow" aria-hidden="true" />
    </div>
  );
}
