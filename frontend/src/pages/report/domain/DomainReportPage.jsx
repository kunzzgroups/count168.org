import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  getCachedOwnerCompanies,
  loadOwnerCompaniesCached,
  normalizeOwnerCompanyRow,
  persistDashboardGroupFilter,
} from "../../../utils/company/sharedCompanyFilter.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/domain_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/maintenance_notifications.css";
import { fetchDomainReport, fetchProcesses } from "./domainReportApi.js";
import {
  fetchCompanyPermissions,
  fetchCurrencies,
  isBankOnlyCategoryCompany,
} from "../shared/reportCompanyApi.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { getReportText, REPORT_I18N } from "../../../translateFile/pages/reportTranslate.js";
import DomainReportFilters from "./DomainReportFilters.jsx";
import DomainReportTable from "./DomainReportTable.jsx";
import { useReportGcSwitcher } from "../shared/useReportGcSwitcher.js";
import { reportToastMaintenanceVariant } from "../shared/reportAmountFormat.js";
import {
  buildReportSnapshotKey,
  getReportSnapshot,
  setReportSnapshot,
} from "../shared/reportPageSnapshotCache.js";
import { useReportAbortSeq } from "../shared/useReportAbortSeq.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

const REPORT_PAGE_KEY = "domain";
const REPORT_FETCH_DEBOUNCE_MS = 150;

function resolveInitialCompanyId() {
  const cached = getCachedOwnerCompanies();
  const url = new URL(window.location.href);
  const queryCompany = url.searchParams.get("company_id");
  const id = queryCompany || cached?.[0]?.id || null;
  return id ? Number(id) : null;
}

export default function DomainReportPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);
  const r = useMemo(() => REPORT_I18N[lang] || REPORT_I18N.en, [lang]);

  const [companies, setCompanies] = useState(() => getCachedOwnerCompanies() || []);

  const [companyId, setCompanyId] = useState(resolveInitialCompanyId);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [companyHighlightId, setCompanyHighlightId] = useState(null);
  const switchCompanySeqRef = useRef(0);
  const [processId, setProcessId] = useState("");
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);
  /** Avoid report fetch before currency filter is resolved (prevents double load on entry). */
  const [currencyFilterReady, setCurrencyFilterReady] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  const [processes, setProcesses] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const reportDataRef = useRef(null);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const { begin: beginReportFetch, invalidate: invalidateReportFetch, isCurrent: isReportFetchCurrent } =
    useReportAbortSeq();
  const { begin: beginMetaFetch, invalidate: invalidateMetaFetch, isCurrent: isMetaFetchCurrent } =
    useReportAbortSeq();
  const pageBootOnceRef = useRef(false);
  const prevCompanyIdRef = useRef(null);
  /** Per-company currency filter: { [companyId]: { selectedCurrencies, showAllCurrencies } } */
  const currencyPrefsByCompanyRef = useRef({});
  const selectedCurrenciesRef = useRef(selectedCurrencies);
  const showAllCurrenciesRef = useRef(showAllCurrencies);

  useEffect(() => {
    selectedCurrenciesRef.current = selectedCurrencies;
  }, [selectedCurrencies]);

  useEffect(() => {
    showAllCurrenciesRef.current = showAllCurrencies;
  }, [showAllCurrencies]);

  useEffect(() => {
    reportDataRef.current = reportData;
  }, [reportData]);

  const { allCompanyButtons, groupIds, selectedGroupKey, companyButtons } = useReportGcSwitcher(
    companies,
    companyId,
    groupFilterKind,
  );

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const nextLang = e?.detail?.lang;
      setLang(nextLang === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "report-page");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];
    for (const href of links) {
      if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) continue;
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    }

    return () => {
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!me || companyId != null) return;
    const cached = getCachedOwnerCompanies();
    const url = new URL(window.location.href);
    const queryCompany = url.searchParams.get("company_id");
    let effective = queryCompany || me.company_id || cached?.[0]?.id || null;
    effective = effective ? Number(effective) : null;
    if (effective) setCompanyId(effective);
  }, [me, companyId]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (pageBootOnceRef.current) return;
    pageBootOnceRef.current = true;

    const u = me;
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const hasFull = perms.length === 0;
    const canReport = hasFull || perms.includes("report");
    if (!canReport || !u.company_has_gambling) {
      navigate("/dashboard", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await loadOwnerCompaniesCached(async () => {
          const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
            credentials: "include",
          });
          const compJson = await compRes.json();
          return Array.isArray(compJson?.data) ? compJson.data.map(normalizeOwnerCompanyRow) : [];
        });
        if (cancelled) return;
        setCompanies(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;
        if (effective) {
          setCompanyId((prev) => (prev != null ? prev : effective));
          setGroupFilterKind("follow");
          void checkBankOnly(effective);
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  const reportParams = useMemo(
    () => ({
      processId,
      dateFrom,
      dateTo,
      companyId,
      selectedCurrencies,
      showAllCurrencies,
    }),
    [processId, dateFrom, dateTo, companyId, selectedCurrencies, showAllCurrencies],
  );

  const loadReport = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    const { signal, seq } = beginReportFetch();
    const quietRefresh = reportDataRef.current != null;
    if (quietRefresh) setReportSyncing(true);
    setError("");
    try {
      const data = await fetchDomainReport(reportParams, { signal });
      if (!isReportFetchCurrent(seq)) return;
      startTransition(() => {
        setReportData(data);
      });
      setReportSnapshot(REPORT_PAGE_KEY, buildReportSnapshotKey(reportParams), data);
      if (!data?.data?.length) {
        notify(t("noDataAdjustSearch"), "info");
      }
    } catch (err) {
      if (err?.name === "AbortError" || !isReportFetchCurrent(seq)) return;
      const msg = err.message || t("loadReportFailed");
      setError(msg);
      notify(msg, "error");
      startTransition(() => {
        setReportData(null);
      });
    } finally {
      if (isReportFetchCurrent(seq)) {
        setReportSyncing(false);
      }
    }
  }, [companyId, dateFrom, dateTo, reportParams, beginReportFetch, isReportFetchCurrent, t, notify]);

  const checkBankOnly = useCallback(async (compId) => {
    if (!compId) return;
    try {
      const comp = companies.find(c => Number(c.id) === Number(compId));
      const perms = await fetchCompanyPermissions(comp?.company_id || "");
      if (isBankOnlyCategoryCompany(perms)) {
        window.location.assign(new URL("/process-list", window.location.origin).href);
      }
    } catch (err) {
      console.error("Bank only check error:", err);
    }
  }, [companies]);

  const persistCurrencyPrefs = useCallback((compId, currencies, showAll) => {
    if (!compId) return;
    currencyPrefsByCompanyRef.current[Number(compId)] = {
      selectedCurrencies: currencies,
      showAllCurrencies: showAll,
    };
  }, []);

  const applySavedCurrencyPrefs = useCallback((compId, curs) => {
    const saved = currencyPrefsByCompanyRef.current[Number(compId)];
    if (!saved) return false;
    if (saved.showAllCurrencies) {
      setShowAllCurrencies(true);
      setSelectedCurrencies([]);
      return true;
    }
    if (saved.selectedCurrencies?.length > 0) {
      const valid = saved.selectedCurrencies.filter((code) =>
        curs.some((c) => c.code === code),
      );
      if (valid.length > 0) {
        setSelectedCurrencies(valid);
        setShowAllCurrencies(false);
        return true;
      }
    }
    return false;
  }, []);

  const loadMetaData = useCallback(async () => {
    if (!companyId) return;
    const { signal, seq } = beginMetaFetch();
    try {
      const [procs, curs] = await Promise.all([
        fetchProcesses(companyId, { signal }),
        fetchCurrencies(companyId, { signal }),
      ]);
      if (!isMetaFetchCurrent(seq)) return;
      setProcesses(procs);
      setCurrencyList(curs);

      if (applySavedCurrencyPrefs(companyId, curs)) return;

      if (
        curs.length > 0 &&
        selectedCurrenciesRef.current.length === 0 &&
        !showAllCurrenciesRef.current
      ) {
        const myr = curs.find((c) => c.code === "MYR");
        const def = myr || curs[0];
        const codes = [def.code];
        setSelectedCurrencies(codes);
        setShowAllCurrencies(false);
        persistCurrencyPrefs(companyId, codes, false);
      }
    } catch (err) {
      if (err?.name === "AbortError" || !isMetaFetchCurrent(seq)) return;
      console.error("Meta data load error:", err);
    } finally {
      if (isMetaFetchCurrent(seq)) {
        setCurrencyFilterReady(true);
      }
    }
  }, [
    companyId,
    applySavedCurrencyPrefs,
    persistCurrencyPrefs,
    beginMetaFetch,
    isMetaFetchCurrent,
  ]);

  useEffect(() => {
    if (!companyId) return;
    const prev = prevCompanyIdRef.current;
    if (prev != null && Number(prev) !== Number(companyId)) {
      invalidateReportFetch();
      setReportSyncing(false);
      persistCurrencyPrefs(
        prev,
        selectedCurrenciesRef.current,
        showAllCurrenciesRef.current,
      );
      const saved = currencyPrefsByCompanyRef.current[Number(companyId)];
      if (saved?.showAllCurrencies) {
        setShowAllCurrencies(true);
        setSelectedCurrencies([]);
        setCurrencyFilterReady(true);
      } else if (saved?.selectedCurrencies?.length) {
        setSelectedCurrencies([...saved.selectedCurrencies]);
        setShowAllCurrencies(false);
        setCurrencyFilterReady(true);
      } else {
        setSelectedCurrencies([]);
        setShowAllCurrencies(false);
        setCurrencyFilterReady(false);
      }
      setProcessId("");
      if (reportDataRef.current != null) setReportSyncing(true);
    }
    prevCompanyIdRef.current = companyId;
  }, [companyId, persistCurrencyPrefs, invalidateReportFetch]);

  useEffect(() => {
    if (!currencyFilterReady) {
      invalidateReportFetch();
      setReportSyncing(false);
    }
  }, [currencyFilterReady, invalidateReportFetch]);

  useEffect(() => {
    if (companyId) loadMetaData();
  }, [companyId, loadMetaData]);

  useEffect(() => {
    if (!companyId || !currencyFilterReady) return undefined;
    const handler = window.setTimeout(() => {
      loadReport();
    }, REPORT_FETCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handler);
      invalidateReportFetch();
    };
  }, [companyId, currencyFilterReady, loadReport, invalidateReportFetch]);

  useEffect(() => {
    if (!companyId || !currencyFilterReady) return;
    const key = buildReportSnapshotKey(reportParams);
    const snap = getReportSnapshot(REPORT_PAGE_KEY);
    if (snap?.key === key && snap.data && reportDataRef.current == null) {
      reportDataRef.current = snap.data;
      startTransition(() => {
        setReportData(snap.data);
      });
    }
  }, [companyId, currencyFilterReady, reportParams]);

  const onSwitchCompany = useCallback(async (c) => {
    const effectiveId = companyHighlightId ?? companyId;
    if (!c?.id || Number(c.id) === Number(effectiveId)) return;
    const reqId = ++switchCompanySeqRef.current;
    setCompanyHighlightId(Number(c.id));
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (reqId !== switchCompanySeqRef.current) return;
      if (!json.success) {
        setCompanyHighlightId(null);
        notify(json.error || t("switchFailed"), "danger");
        return;
      }
      if (reportDataRef.current != null) setReportSyncing(true);
      setCompanyId(Number(c.id));
      setGroupFilterKind((prev) => (prev === "all" || prev === "ungrouped" ? prev : "follow"));
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      persistDashboardGroupFilter(newGroup || null);
      setCompanyHighlightId(null);
      void checkBankOnly(c.id);
      notifyCompanySessionUpdated();
    } catch {
      if (reqId === switchCompanySeqRef.current) setCompanyHighlightId(null);
      notify(t("switchFailed"), "danger");
    }
  }, [companyId, companyHighlightId, notify, t, checkBankOnly]);

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (groupFilterKind === "follow" && g === selectedGroupKey) {
        setGroupFilterKind("ungrouped");
        persistDashboardGroupFilter(null);
        return;
      }
      setGroupFilterKind("follow");
      persistDashboardGroupFilter(g);
      if (g === selectedGroupKey) return;
      const first = allCompanyButtons.find((row) => String(row.group_id || "").trim().toUpperCase() === g);
      if (first) void onSwitchCompany(first);
    },
    [allCompanyButtons, groupFilterKind, onSwitchCompany, selectedGroupKey],
  );

  const handlePickAllGroups = useCallback(() => {
    setGroupFilterKind((k) => (k === "all" ? "ungrouped" : "all"));
  }, []);

  const toggleCurrency = (code) => {
    setShowAllCurrencies(false);
    setSelectedCurrencies((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      persistCurrencyPrefs(companyId, next, false);
      return next;
    });
  };

  const toggleAllCurrencies = () => {
    const nextAll = !showAllCurrencies;
    setShowAllCurrencies(nextAll);
    if (nextAll) {
      setSelectedCurrencies([]);
      persistCurrencyPrefs(companyId, [], true);
    } else {
      persistCurrencyPrefs(companyId, selectedCurrenciesRef.current, false);
    }
  };

  if (!sessionReady || !me) return null;

  return (
    <div className="container">
      <div className="content">
        <div className="report-header">
        </div>

        <DomainReportFilters
          companyId={companyId}
          highlightCompanyId={companyHighlightId}
          onSwitchCompany={onSwitchCompany}
          groupIds={groupIds}
          groupFilterKind={groupFilterKind}
          selectedGroupKey={selectedGroupKey}
          onPickAllGroups={handlePickAllGroups}
          onPickGroup={handlePickGroup}
          companyButtons={companyButtons}
          processId={processId}
          setProcessId={setProcessId}
          processes={processes}
          currencyList={currencyList}
          selectedCurrencies={selectedCurrencies}
          toggleCurrency={toggleCurrency}
          showAllCurrencies={showAllCurrencies}
          toggleAllCurrencies={toggleAllCurrencies}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          t={t}
          monthLabels={r.monthsShort}
          weekdaysShort={r.weekdaysShort}
        />

        <div className="domain-report-table-region">
          {reportSyncing && reportData != null && (
            <div className="domain-report-sync-track" aria-hidden>
              <div className="domain-report-sync-bar" />
            </div>
          )}
          <DomainReportTable
            reportData={reportData}
            reportSyncing={reportSyncing}
            error={error}
            t={t}
          />
        </div>
      </div>

      {toast && (
        <div id="domainReportNotificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${reportToastMaintenanceVariant(toast.type)} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
