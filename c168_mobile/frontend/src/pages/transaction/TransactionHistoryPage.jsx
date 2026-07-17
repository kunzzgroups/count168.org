import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useOutletContext, useSearchParams } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import {
  formatHistoryBalanceMoney,
  formatHistoryMoney,
  formatRateForHistoryDisplay,
  getHistoryRemark,
  parseBalanceValue,
  toUpperDisplay,
} from "../../lib/transactionFormat.js";
import { getHistory } from "../../lib/transactionApi.js";
import {
  paymentHistoryParamsReady,
  paymentHistoryScopeApiParams,
  paymentHistoryTitle,
  resolveHistoryAccountName,
  resolvePaymentHistoryScope,
} from "../../lib/transactionHistoryScope.js";
import { historyTypeCardClass, historyTypeLabel } from "../../lib/transactionTypeStyles.js";
import { moneyToneClass } from "../../lib/money/moneyToneClass.js";
import ExportPdfSheet from "./ExportPdfSheet.jsx";
import "./transaction-history.css";
import "./transaction-history-types.css";

/** Stable id from history API rows (field is transaction_id, not id). */
function historyRowId(row) {
  const n = Number(row?.transaction_id ?? row?.id ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Sort key for history row dates (supports DD/MM/YYYY and YYYY-MM-DD). */
function historyDateSortKey(row) {
  const raw = String(row?.date || "").trim();
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}${dmy[2].padStart(2, "0")}${dmy[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10).replace(/-/g, "");
  return raw;
}

/** Newest date first; B/F (period opening) always stays on top. */
function sortHistoryNewestFirst(rows) {
  return [...(rows || [])].sort((a, b) => {
    const aBf = a?.row_type === "bf" ? 0 : 1;
    const bBf = b?.row_type === "bf" ? 0 : 1;
    if (aBf !== bBf) return aBf - bBf;
    const byDate = historyDateSortKey(b).localeCompare(historyDateSortKey(a));
    if (byDate !== 0) return byDate;
    return historyRowId(b) - historyRowId(a);
  });
}

function MoneyTone({ value, children }) {
  return <span className={moneyToneClass(value)}>{children}</span>;
}

function HistMetric({ label, rawValue, display }) {
  return (
    <div className="m-tx-metric">
      <p className="m-tx-metric-label">{label}</p>
      <p className="m-tx-metric-value">
        <MoneyTone value={rawValue}>{display}</MoneyTone>
      </p>
    </div>
  );
}

export default function TransactionHistoryPage() {
  const { tx } = useOutletContext();
  const [searchParams] = useSearchParams();
  const scope = useMemo(() => resolvePaymentHistoryScope(searchParams), [searchParams]);
  const scopeApi = useMemo(() => paymentHistoryScopeApiParams(scope), [scope]);
  const paramsReady = paymentHistoryParamsReady(scope);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountMeta, setAccountMeta] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const m = tx.m;
  const i18n = tx.i18n;

  const exportScope = useMemo(() => {
    const companyId =
      scope.companyId ||
      (Number(tx.companyId) > 0 ? Number(tx.companyId) : undefined) ||
      (Number(tx.selectedCompany?.id) > 0 ? Number(tx.selectedCompany.id) : undefined);
    return { ...scope, companyId };
  }, [scope, tx.companyId, tx.selectedCompany]);

  useEffect(() => {
    if (!paramsReady) return undefined;
    const ac = new AbortController();
    setLoading(true);
    setError("");
    (async () => {
      try {
        const data = await getHistory({
          ...scopeApi,
          accountId: scope.accountDbId,
          dateFrom: scope.dateFrom,
          dateTo: scope.dateTo,
          currency: scope.currency,
          virtualCompanyCode: scope.virtualCompanyCode,
          pureTypeSearch: scope.pureTypeSearch,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!data?.success) {
          setError(data?.message || m.searchFailed);
          setRows([]);
          return;
        }
        setRows(Array.isArray(data.data) ? data.data : []);
        setAccountMeta(data.account || null);
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(e?.message || m.searchFailed);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [paramsReady, scope, scopeApi, m.searchFailed]);

  const title = useMemo(() => {
    const meta = accountMeta
      ? {
          ...accountMeta,
          name: resolveHistoryAccountName({
            accountName: scope.accountName,
            accountMeta,
            accountCode: scope.accountCode,
          }),
        }
      : null;
    return paymentHistoryTitle({
      accountCode: scope.accountCode,
      accountName: scope.accountName,
      accountMeta: meta,
    });
  }, [accountMeta, scope.accountCode, scope.accountName]);

  const resolvedAccountName = resolveHistoryAccountName({
    accountName: scope.accountName,
    accountMeta,
    accountCode: scope.accountCode,
  });

  const displayRows = useMemo(() => sortHistoryNewestFirst(rows), [rows]);

  if (!paramsReady) {
    return <Navigate to="/transaction" replace />;
  }

  const stickyBar = (
    <div className="m-tx-hist-sticky">
      <Link to="/transaction" className="m-tx-hist-back tap-scale" aria-label={m.backToList}>
        <i className="fas fa-arrow-left" aria-hidden="true" />
      </Link>
      <div className="m-tx-hist-head">
        <p className="m-tx-hist-title">{title}</p>
        <p className="m-tx-hist-sub">
          {scope.dateFrom} — {scope.dateTo}
          {scope.currency ? ` · ${scope.currency}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setExportOpen(true)}
        className="m-tx-hist-export tap-scale"
        aria-label={m.exportPdf}
        title={m.exportPdf}
      >
        <i className="fas fa-file-pdf" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <MobileShell
      i18n={i18n}
      me={tx.me}
      onLogout={tx.logout}
      stickyBar={stickyBar}
      lang={tx.lang}
      onLangChange={tx.setLang}
      showBottomNav={false}
      overlayOpen={exportOpen}
      overlay={
        <ExportPdfSheet
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          m={m}
          scope={exportScope}
          accountCode={scope.accountCode || accountMeta?.account_id || ""}
          accountName={resolvedAccountName}
          lang={tx.lang}
        />
      }
    >
      <div className="m-tx-hist-page">
      <p className="m-tx-hist-count">{m.paymentHistoryShowingEntries.replace("{count}", String(displayRows.length))}</p>
      <p className="m-tx-hist-hint">{m.paymentHistoryBalanceHint}</p>

      {loading ? (
        <div className="m-tx-hist-loading">{m.loadingHistory}</div>
      ) : error ? (
        <div className="m-tx-hist-error">{error}</div>
      ) : displayRows.length === 0 ? (
        <p className="m-tx-hist-empty">{m.searchCompletedNoData}</p>
      ) : (
        <ul className="m-tx-hist-list">
          {displayRows.map((row, idx) => {
            const typeLabel = historyTypeLabel(row);
            const cardCls = historyTypeCardClass(row);
            const createdRaw = row.created_by;
            const createdBy =
              createdRaw == null ||
              String(createdRaw).trim() === "" ||
              String(createdRaw).toLowerCase() === "null"
                ? "-"
                : String(createdRaw);
            const remark = getHistoryRemark(row);
            const description = toUpperDisplay(row.description);
            const cur = toUpperDisplay(row.currency);

            return (
              <li
                key={historyRowId(row) || `${idx}-${row.date || ""}-${row.balance || ""}`}
                className={`m-tx-hist-card ${cardCls}`}
              >
                <div className="m-tx-hist-card-head">
                  <span className="m-tx-hist-type-badge">{typeLabel}</span>
                  <span className="m-tx-hist-date">{row.date || "—"}</span>
                  <span className="m-tx-hist-currency">{cur || "—"}</span>
                </div>

                <div className="m-tx-card-metrics">
                  <HistMetric
                    label={m.winLossTableCompact}
                    rawValue={row.win_loss}
                    display={formatHistoryMoney(row.win_loss)}
                  />
                  <HistMetric
                    label={m.crDrTable}
                    rawValue={row.cr_dr}
                    display={formatHistoryMoney(row.cr_dr)}
                  />
                  <HistMetric
                    label={m.balanceTableCompact}
                    rawValue={row.balance}
                    display={formatHistoryBalanceMoney(row.balance)}
                  />
                </div>

                <div className="m-tx-hist-footer">
                  <p className="m-tx-hist-desc">
                    <span className="m-tx-hist-desc-label">{m.descriptionCompact}: </span>
                    {description}
                  </p>
                  {row.rate && row.rate !== "-" ? (
                    <p className="m-tx-hist-meta">
                      {m.rate}: {formatRateForHistoryDisplay(row.rate)}
                    </p>
                  ) : null}
                  {remark && remark !== "-" ? <p className="m-tx-hist-remark">{remark}</p> : null}
                  <p className="m-tx-hist-created">
                    <span className="m-tx-hist-created-label">{m.createdByCompact}: </span>
                    {createdBy}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </MobileShell>
  );
}
