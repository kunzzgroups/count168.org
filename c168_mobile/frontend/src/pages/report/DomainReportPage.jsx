import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useMaintenanceSession } from "../../hooks/useMaintenanceSession.js";
import { periodPresetRange } from "../../lib/dashboardDateUtils.js";
import {
  companyIsBankOnly,
  fetchDomainReport,
  formatReportAmount,
  reportAmountTone,
} from "../../lib/reportApi.js";
import {
  maintenanceScopeIsReady,
  maintenanceScopeKey,
} from "../../lib/mobileMaintenanceScope.js";
import { reportText } from "../../translateFile/reportTranslate.js";
import { canAccessReport } from "../../utils/mobilePermissions.js";
import { ReportFilterBar, ReportFilterSheet } from "./ReportSheets.jsx";
import "./report.css";

function defaultThisMonth() {
  return periodPresetRange("thisMonth") || { dateFrom: "", dateTo: "" };
}

function DomainTableHead({ i18n }) {
  return (
    <div className="m-rpt-table-head" role="row">
      <div>{i18n.process}</div>
      <div>{i18n.turnover}</div>
      <div>{i18n.win}</div>
      <div>{i18n.lose}</div>
      <div>{i18n.winLose}</div>
    </div>
  );
}

function DomainTotalRow({ i18n, totals }) {
  if (!totals) return null;
  return (
    <div className="m-rpt-table-total" role="row">
      <div className="m-rpt-table-total-label">{i18n.total}</div>
      <div className="m-rpt-num">
        <strong>{formatReportAmount(totals.turnover)}</strong>
      </div>
      <div className="m-rpt-num is-pos">
        <strong>{formatReportAmount(totals.win)}</strong>
      </div>
      <div className="m-rpt-num is-neg">
        <strong>{formatReportAmount(totals.lose)}</strong>
      </div>
      <div className={`m-rpt-num ${reportAmountTone(totals.win_lose)}`}>
        <strong>{formatReportAmount(totals.win_lose)}</strong>
      </div>
    </div>
  );
}

export default function DomainReportPage() {
  const s = useMaintenanceSession({ canAccess: canAccessReport });
  const i18n = useMemo(() => reportText(s.lang), [s.lang]);
  const { scope } = s;

  const boot = useMemo(() => defaultThisMonth(), []);
  const [dateFrom, setDateFrom] = useState(boot.dateFrom);
  const [dateTo, setDateTo] = useState(boot.dateTo);
  const [activePreset, setActivePreset] = useState("thisMonth");
  const [processId, setProcessId] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const seqRef = useRef(0);
  const scopeReady = maintenanceScopeIsReady(scope);
  const scopeCacheKey = maintenanceScopeKey(scope);
  const isGroupScope = scope?.mode === "group";

  const loadList = useCallback(
    async (signal) => {
      if (!scopeReady) return;
      const seq = ++seqRef.current;
      setListLoading(true);
      setListError("");
      try {
        const json = await fetchDomainReport(
          {
            scope,
            dateFrom,
            dateTo,
            processId: processId || undefined,
          },
          { signal },
        );
        if (seq !== seqRef.current) return;
        setRows(Array.isArray(json?.data) ? json.data : []);
        setTotals(json?.totals || null);
      } catch (e) {
        if (e?.name === "AbortError" || seq !== seqRef.current) return;
        setListError(e?.message || i18n.loadFailed);
        setRows([]);
        setTotals(null);
      } finally {
        if (seq === seqRef.current) setListLoading(false);
      }
    },
    [scope, scopeReady, dateFrom, dateTo, processId, i18n.loadFailed],
  );

  useEffect(() => {
    if (!s.me || !scopeReady) return undefined;
    const ac = new AbortController();
    loadList(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.me, scopeCacheKey, dateFrom, dateTo, processId]);

  const displayRows = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const label = `${row.process || ""} ${row.description || ""}`.toUpperCase();
      return label.includes(q);
    });
  }, [rows, query]);

  const scopeLabel = s.groupMode
    ? s.selectedGroup || i18n.group
    : String(s.selectedCompany?.company_id || "").toUpperCase() || i18n.company;

  const applyWithBankGuard = useCallback(
    async (next) => {
      const scopeChanged =
        next.scope.mode !== scope?.mode ||
        String(next.scope.groupId ?? "") !== String(scope?.groupId ?? "") ||
        Number(next.scope.companyId ?? 0) !== Number(scope?.companyId ?? 0);

      if (scopeChanged && next.scope.mode === "company" && next.scope.companyId) {
        const row = s.companies.find((c) => Number(c.id) === Number(next.scope.companyId));
        const code = String(row?.company_id || "").trim();
        if (code && (await companyIsBankOnly(code))) {
          s.notify(i18n.bankOnlyBlocked, "error");
          return;
        }
      }

      if (scopeChanged) {
        const ok = await s.applyScope(
          next.scope.mode === "group"
            ? { mode: "group", groupId: next.scope.groupId }
            : { mode: "company", companyId: next.scope.companyId },
        );
        if (!ok) return;
      }
      setDateFrom(next.dateFrom);
      setDateTo(next.dateTo);
      setActivePreset(next.activePreset);
      setProcessId(next.processId ?? "");
    },
    [scope, s, i18n.bankOnlyBlocked],
  );

  useEffect(() => {
    if (!s.me || s.loading || s.groupMode || !s.selectedCompany) return undefined;
    const code = String(s.selectedCompany.company_id || "").trim();
    if (!code) return undefined;
    let cancelled = false;
    (async () => {
      const bankOnly = await companyIsBankOnly(code);
      if (cancelled || !bankOnly) return;
      s.notify(i18n.bankOnlyBlocked, "error");
      const candidates = s.companies.filter((c) => Number(c.id) !== Number(s.companyId));
      for (const c of candidates) {
        const ok = !(await companyIsBankOnly(String(c.company_id || "").trim()));
        if (ok) {
          await s.applyScope({ mode: "company", companyId: c.id });
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.me, s.loading, s.companyId]);

  const stickyBar = (
    <div className="m-rpt-sticky">
      <div className="m-rpt-title-row">
        <Link to="/report" className="m-rpt-title-back tap-scale" aria-label={i18n.backToHub}>
          <i className="fas fa-arrow-left" aria-hidden="true" />
        </Link>
        <div className="m-rpt-title-copy">
          <strong>{i18n.domainTitle}</strong>
        </div>
        <div className="m-rpt-search m-rpt-search--inline">
          <i className="fas fa-magnifying-glass" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={i18n.searchProcess}
            inputMode="search"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={i18n.reset}>
              <i className="fas fa-xmark" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      <ReportFilterBar
        i18n={i18n}
        dateFrom={dateFrom}
        dateTo={dateTo}
        groupMode={s.groupMode}
        selectedGroup={s.selectedGroup}
        selectedCompany={s.selectedCompany}
        onOpen={() => setFilterOpen(true)}
      />
    </div>
  );

  if (s.blocked) return null;

  return (
    <MobileShell
      i18n={i18n}
      me={s.me}
      companyCode={scopeLabel}
      onLogout={s.logout}
      onRefresh={() => loadList()}
      refreshing={listLoading}
      stickyBar={stickyBar}
      lang={s.lang}
      onLangChange={s.setLang}
      overlayOpen={filterOpen}
      overlay={
        <ReportFilterSheet
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          i18n={i18n}
          variant="domain"
          dateFrom={dateFrom}
          dateTo={dateTo}
          activePreset={activePreset}
          groupMode={s.groupMode}
          selectedGroup={s.selectedGroup}
          companyId={s.companyId}
          companies={s.companies}
          groupIds={s.groupIds}
          allowedGroupIds={s.allowedGroupIds}
          processId={processId}
          onApply={applyWithBankGuard}
        />
      }
    >
      <div className="m-rpt-content m-rpt-content--domain">
        {s.toast ? (
          <div className={`m-rpt-toast${s.toast.tone === "error" ? " is-error" : ""}`}>
            {s.toast.message}
          </div>
        ) : null}
        {listError ? <div className="m-rpt-error">{listError}</div> : null}

        {listLoading && displayRows.length === 0 ? (
          <div className="m-rpt-state">
            <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            <p>{i18n.loading}</p>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="m-rpt-state">
            <i className="fas fa-inbox" aria-hidden="true" />
            <p>{scopeReady ? i18n.noData : i18n.needCompany}</p>
          </div>
        ) : (
          <div className="m-rpt-hscroll">
            <div className="m-rpt-table-board">
              <div className="m-rpt-table-chrome">
                <DomainTableHead i18n={i18n} />
                <DomainTotalRow i18n={i18n} totals={totals} />
              </div>
              <div className="m-rpt-table" role="table">
                {displayRows.map((row, idx) => {
                  const label =
                    !isGroupScope && row.description
                      ? `${row.process} (${row.description})`
                      : row.process;
                  const wlTone = reportAmountTone(row.win_lose);
                  return (
                    <div
                      key={`${row.process}|${row.description}|${idx}`}
                      className="m-rpt-table-row"
                      role="row"
                    >
                      <div className="m-rpt-table-process" title={label || ""}>
                        {label || i18n.process}
                      </div>
                      <div className="m-rpt-num">
                        <strong>{formatReportAmount(row.turnover)}</strong>
                      </div>
                      <div className="m-rpt-num is-pos">
                        <strong>{formatReportAmount(row.win)}</strong>
                      </div>
                      <div className="m-rpt-num is-neg">
                        <strong>{formatReportAmount(row.lose)}</strong>
                      </div>
                      <div className={`m-rpt-num ${wlTone}`}>
                        <strong>{formatReportAmount(row.win_lose)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
