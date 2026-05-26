import { formatAmount } from "./domainReportApi.js";

function cellUpperOrDash(v) {
  if (v == null || String(v).trim() === "") return "-";
  return String(v).trim().toUpperCase();
}

function rowKey(item, idx) {
  const p = String(item.process ?? "").trim();
  const d = String(item.description ?? "").trim();
  const c = String(item.currency ?? "").trim();
  const g = String(item.group_id ?? "").trim();
  const co = String(item.company_id ?? "").trim();
  return `${p}|${d}|${c}|${g}|${co}|${idx}`;
}

export default function DomainReportTable({ reportData, reportSyncing = false, error, t }) {
  const tableHeader = (
    <div className="domain-report-table-header">
      <div>{t("colProcess")}</div>
      <div>{t("colGroupId")}</div>
      <div>{t("colCompanyId")}</div>
      <div>{t("colCurrency")}</div>
      <div>{t("colTurnover")}</div>
      <div>{t("colWin")}</div>
      <div>{t("colLose")}</div>
      <div>{t("colWinLose")}</div>
    </div>
  );

  const renderEmpty = (message) => (
    <div className="domain-report-list-container">
      {tableHeader}
      <div className="domain-report-cards">
        <div className="domain-report-card">
          <div className="domain-report-card-item" style={{ gridColumn: "1 / -1", textAlign: "center", justifyContent: "center", padding: 20 }}>
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="domain-report-list-container">
        {tableHeader}
        <div className="domain-report-cards">
          <div className="domain-report-card">
            <div
              className="domain-report-card-item"
              style={{ gridColumn: "1 / -1", textAlign: "center", justifyContent: "center", padding: 20, color: "red" }}
            >
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !reportData?.data?.length;
  if (isEmpty) {
    const awaitingData = reportData == null && !error;
    if (awaitingData || reportSyncing) {
      return (
        <div className="domain-report-list-container">
          {tableHeader}
          <div className="domain-report-cards" />
        </div>
      );
    }
    return renderEmpty(t("noDataFound"));
  }

  const data = reportData.data;
  const totals = reportData.totals;

  return (
    <div className="domain-report-list-container">
      {tableHeader}

      <div className="domain-report-cards">
        {data.map((item, idx) => {
          const label = item.description ? `${item.process} (${item.description})` : item.process;
          const wl = parseFloat(item.win_lose || 0);
          const winLoseClass = wl > 0 ? "domain-report-win-lose-positive" : (wl < 0 ? "domain-report-win-lose-negative" : "");

          return (
            <div key={rowKey(item, idx)} className="domain-report-card">
              <div className="domain-report-card-item">{label}</div>
              <div className="domain-report-card-item">{cellUpperOrDash(item.group_id)}</div>
              <div className="domain-report-card-item">{cellUpperOrDash(item.company_id)}</div>
              <div className="domain-report-card-item">{cellUpperOrDash(item.currency)}</div>
              <div className="domain-report-card-item domain-report-amount"><strong>{formatAmount(item.turnover)}</strong></div>
              <div className="domain-report-card-item domain-report-amount"><strong>{formatAmount(item.win)}</strong></div>
              <div className="domain-report-card-item domain-report-amount"><strong>{formatAmount(item.lose)}</strong></div>
              <div className={`domain-report-card-item domain-report-amount ${winLoseClass}`}><strong>{formatAmount(item.win_lose)}</strong></div>
            </div>
          );
        })}
      </div>

      {totals && (
        <div className="domain-report-total" style={{ display: "grid" }}>
          <div className="domain-report-total-label">{t("total")}</div>
          <div className="domain-report-amount"><strong>{formatAmount(totals.turnover)}</strong></div>
          <div className="domain-report-amount"><strong>{formatAmount(totals.win)}</strong></div>
          <div className="domain-report-amount"><strong>{formatAmount(totals.lose)}</strong></div>
          <div className={`domain-report-amount ${parseFloat(totals.win_lose || 0) > 0 ? "domain-report-win-lose-positive" : (parseFloat(totals.win_lose || 0) < 0 ? "domain-report-win-lose-negative" : "")}`}>
            <strong>{formatAmount(totals.win_lose)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
