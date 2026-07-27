import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MobileShell from "../../components/layout/MobileShell.jsx";
import { useIncrementalList } from "../../hooks/useIncrementalList.js";
import { useMaintenanceSession } from "../../hooks/useMaintenanceSession.js";
import { periodPresetRange } from "../../lib/dashboardDateUtils.js";
import {
  companyIsBankOnly,
  fetchCustomerReport,
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

export default function CustomerReportPage() {
  const s = useMaintenanceSession({ canAccess: canAccessReport });
  const i18n = useMemo(() => reportText(s.lang), [s.lang]);
  const { scope } = s;

  const boot = useMemo(() => defaultThisMonth(), []);
  const [dateFrom, setDateFrom] = useState(boot.dateFrom);
  const [dateTo, setDateTo] = useState(boot.dateTo);
  const [activePreset, setActivePreset] = useState("thisMonth");
  const [accountId, setAccountId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(true);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const seqRef = useRef(0);
  const scopeReady = maintenanceScopeIsReady(scope);
  const scopeCacheKey = maintenanceScopeKey(scope);

  const loadList = useCallback(
    async (signal) => {
      if (!scopeReady) return;
      const seq = ++seqRef.current;
      setListLoading(true);
      setListError("");
      try {
        const json = await fetchCustomerReport(
          {
            scope,
            dateFrom,
            dateTo,
            accountId: accountId || undefined,
            showAll,
            selectedCurrencies,
            showAllCurrencies,
          },
          { signal },
        );
        if (seq !== seqRef.current) return;
        setRows(Array.isArray(json?.data) ? json.data : []);
      } catch (e) {
        if (e?.name === "AbortError" || seq !== seqRef.current) return;
        setListError(e?.message || i18n.loadFailed);
        setRows([]);
      } finally {
        if (seq === seqRef.current) setListLoading(false);
      }
    },
    [
      scope,
      scopeReady,
      dateFrom,
      dateTo,
      accountId,
      showAll,
      selectedCurrencies,
      showAllCurrencies,
      i18n.loadFailed,
    ],
  );

  useEffect(() => {
    if (!s.me || !scopeReady) return undefined;
    const ac = new AbortController();
    loadList(ac.signal);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    s.me,
    scopeCacheKey,
    dateFrom,
    dateTo,
    accountId,
    showAll,
    showAllCurrencies,
    selectedCurrencies.join(","),
  ]);

  const displayRows = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = `${row.account_id || ""} ${row.name || ""} ${row.currency || ""}`.toUpperCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of displayRows) {
      const c = String(row.currency || "-").toUpperCase();
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(row);
    }
    return [...map.entries()];
  }, [displayRows]);

  const flatForIncremental = useMemo(() => {
    const out = [];
    for (const [currency, items] of grouped) {
      out.push({ __type: "header", currency });
      for (const item of items) out.push({ __type: "row", item });
    }
    return out;
  }, [grouped]);

  const { visible, hasMore, sentinelRef, shown, total } = useIncrementalList(flatForIncremental);

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
      setAccountId(next.accountId ?? "");
      setShowAll(Boolean(next.showAll));
      setSelectedCurrencies(Array.isArray(next.selectedCurrencies) ? next.selectedCurrencies : []);
      setShowAllCurrencies(Boolean(next.showAllCurrencies));
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
          <strong>{i18n.customerTitle}</strong>
          <small>{i18n.customerFeatures}</small>
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
      <div className="m-rpt-chip-row">
        {showAll ? <span className="m-rpt-chip is-on">{i18n.showAll}</span> : null}
        {!showAllCurrencies && selectedCurrencies.length > 0
          ? selectedCurrencies.map((c) => (
              <span key={c} className="m-rpt-chip">
                {String(c).toUpperCase()}
              </span>
            ))
          : (
              <span className="m-rpt-chip">{i18n.all || "All"}</span>
            )}
      </div>
      <div className="m-rpt-search">
        <i className="fas fa-magnifying-glass" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={i18n.searchAccount}
          inputMode="search"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label={i18n.reset}>
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </div>
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
          variant="customer"
          dateFrom={dateFrom}
          dateTo={dateTo}
          activePreset={activePreset}
          groupMode={s.groupMode}
          selectedGroup={s.selectedGroup}
          companyId={s.companyId}
          companies={s.companies}
          groupIds={s.groupIds}
          allowedGroupIds={s.allowedGroupIds}
          accountId={accountId}
          showAll={showAll}
          selectedCurrencies={selectedCurrencies}
          showAllCurrencies={showAllCurrencies}
          onApply={applyWithBankGuard}
        />
      }
    >
      <div className="m-rpt-content">
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
          <>
            <div className="m-rpt-list">
              {visible.map((entry, idx) => {
                if (entry.__type === "header") {
                  return (
                    <div key={`h-${entry.currency}-${idx}`} className="m-rpt-currency-head">
                      {entry.currency}
                    </div>
                  );
                }
                const row = entry.item;
                return (
                  <article
                    key={`${row.account_id}|${row.currency}|${idx}`}
                    className="m-rpt-card m-rpt-card--customer"
                  >
                    <div className="m-rpt-card-head">
                      <strong>{String(row.account_id || "").toUpperCase() || "—"}</strong>
                      <span className="m-rpt-tag">{String(row.currency || "").toUpperCase()}</span>
                    </div>
                    <p className="m-rpt-name">{row.name || "—"}</p>
                    <div className="m-rpt-metrics m-rpt-metrics--2">
                      <div>
                        <span>{i18n.win}</span>
                        <strong className="is-pos">{formatReportAmount(row.win)}</strong>
                      </div>
                      <div>
                        <span>{i18n.lose}</span>
                        <strong className={`is-neg ${reportAmountTone(row.lose)}`}>
                          {formatReportAmount(row.lose)}
                        </strong>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {hasMore ? (
              <div ref={sentinelRef} className="m-rpt-more">
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                <span>
                  {shown} / {total}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </MobileShell>
  );
}
