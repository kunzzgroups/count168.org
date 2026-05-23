import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { normalizeOwnerCompanyRow, persistDashboardGroupFilter } from "../../../utils/company/sharedCompanyFilter.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/maintenance_notifications.css";
import { fetchAccounts, fetchCustomerReport } from "./customerReportApi.js";
import {
  fetchCompanyPermissions,
  fetchCurrencies,
  isBankOnlyCategoryCompany,
} from "../shared/reportCompanyApi.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { getReportText, REPORT_I18N } from "../../../translateFile/pages/reportTranslate.js";
import CustomerReportFilters from "./CustomerReportFilters.jsx";
import CustomerReportTable from "./CustomerReportTable.jsx";
import { useReportGcSwitcher } from "../shared/useReportGcSwitcher.js";
import { reportToastMaintenanceVariant } from "../shared/reportAmountFormat.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";
import PageContentLoader from "../../../components/PageContentLoader.jsx";

export default function CustomerReportPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getReportText(lang, key, params), [lang]);
  const r = useMemo(() => REPORT_I18N[lang] || REPORT_I18N.en, [lang]);

  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);

  const [companyId, setCompanyId] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [companyHighlightId, setCompanyHighlightId] = useState(null);
  const switchCompanySeqRef = useRef(0);
  const [accountId, setAccountId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [showAllCurrencies, setShowAllCurrencies] = useState(false);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(formatYmd(today));
  const [dateTo, setDateTo] = useState(formatYmd(today));

  const [accounts, setAccounts] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [reportData, setReportData] = useState(null);
  const reportDataRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [reportSyncing, setReportSyncing] = useState(false);
  const [error, setError] = useState("");

  const [toast, setToast] = useState(null);
  const [cssReady, setCssReady] = useState(false);
  const toastTimerRef = useRef(null);
  const customerReportSeqRef = useRef(0);
  const customerReportAbortRef = useRef(null);

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

    let cancelled = false;
    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];

    const waitForStylesheet = (href) =>
      new Promise((resolve) => {
        const markLoaded = (el) => {
          try { el.dataset.loaded = "1"; } catch { /* ignore */ }
          resolve(el);
        };
        const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
        if (existing) {
          if (existing.dataset.loaded === "1" || existing.sheet) return resolve(existing);
          const onLoad = () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onError); markLoaded(existing); };
          const onError = () => { existing.removeEventListener("load", onLoad); existing.removeEventListener("error", onError); resolve(existing); };
          existing.addEventListener("load", onLoad, { once: true });
          existing.addEventListener("error", onError, { once: true });
          return;
        }
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        l.onload = () => markLoaded(l);
        l.onerror = () => resolve(l);
        document.head.appendChild(l);
      });

    Promise.all(links.map(waitForStylesheet)).then(() => {
      if (!cancelled) setCssReady(true);
    });

    return () => {
      cancelled = true;
      document.body.classList.remove("report-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        const u = me;
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canReport = hasFull || perms.includes("report");
        if (!canReport || !u.company_has_gambling) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data.map(normalizeOwnerCompanyRow) : [];
        setCompanies(rows);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        setCompanyId(effective);
        setGroupFilterKind("follow");
        if (effective) await checkBankOnly(effective);

      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  const loadReport = useCallback(async () => {
    if (!companyId || !dateFrom || !dateTo) return;
    customerReportAbortRef.current?.abort();
    const ac = new AbortController();
    customerReportAbortRef.current = ac;
    const seq = ++customerReportSeqRef.current;
    const quietRefresh = reportDataRef.current != null;
    if (!quietRefresh) setLoading(true);
    if (quietRefresh) setReportSyncing(true);
    setError("");
    try {
      const data = await fetchCustomerReport(
        {
          accountId,
          dateFrom,
          dateTo,
          showAll,
          companyId,
          selectedCurrencies,
          showAllCurrencies,
        },
        { signal: ac.signal },
      );
      if (seq !== customerReportSeqRef.current) return;
      startTransition(() => {
        setReportData(data);
      });
      if (!data?.data?.length) {
        notify(t("noDataAdjustSearch"), "info");
      }
    } catch (err) {
      if (err?.name === "AbortError" || seq !== customerReportSeqRef.current) return;
      const msg = err.message || t("loadReportFailed");
      setError(msg);
      notify(msg, "error");
      startTransition(() => {
        setReportData(null);
      });
    } finally {
      if (seq === customerReportSeqRef.current) {
        setLoading(false);
        setReportSyncing(false);
      }
    }
  }, [companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies, t, notify]);

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

  const loadMetaData = useCallback(async () => {
    if (!companyId) return;
    try {
      const [accs, curs] = await Promise.all([
        fetchAccounts(companyId),
        fetchCurrencies(companyId),
      ]);
      setAccounts(accs);
      setCurrencyList(curs);

      if (curs.length > 0 && selectedCurrencies.length === 0 && !showAllCurrencies) {
        const myr = curs.find(c => c.code === "MYR");
        const def = myr || curs[0];
        setSelectedCurrencies([def.code]);
        setShowAllCurrencies(false);
      }
    } catch (err) {
      console.error("Meta data load error:", err);
    }
  }, [companyId, selectedCurrencies.length, showAllCurrencies]);

  useEffect(() => {
    if (!bootLoading && companyId) loadMetaData();
  }, [bootLoading, companyId, loadMetaData]);

  useEffect(() => {
    if (!bootLoading && companyId) {
      const handler = setTimeout(() => {
        loadReport();
      }, 0);
      return () => clearTimeout(handler);
    }
  }, [bootLoading, companyId, accountId, dateFrom, dateTo, showAll, selectedCurrencies, showAllCurrencies, loadReport]);

  useEffect(() => () => {
    customerReportAbortRef.current?.abort();
  }, []);

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
    setSelectedCurrencies(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      return [...prev, code];
    });
  };

  const toggleAllCurrencies = () => {
    setShowAllCurrencies(!showAllCurrencies);
    if (!showAllCurrencies) setSelectedCurrencies([]);
  };

  if (bootLoading || !me || !cssReady) return <PageContentLoader />;

  return (
    <div className="container">
      <div className="content">
        <div className="report-header">
          <h1 className="account-page-title">{t("customerReportTitle")}</h1>
        </div>

        <CustomerReportFilters
          companyId={companyId}
          onSwitchCompany={onSwitchCompany}
          groupIds={groupIds}
          groupFilterKind={groupFilterKind}
          selectedGroupKey={selectedGroupKey}
          onPickAllGroups={handlePickAllGroups}
          onPickGroup={handlePickGroup}
          companyButtons={companyButtons}
          highlightCompanyId={companyHighlightId}
          accountId={accountId}
          setAccountId={setAccountId}
          accounts={accounts}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={(s, e) => { setDateFrom(s); setDateTo(e); }}
          showAll={showAll}
          setShowAll={setShowAll}
          currencyList={currencyList}
          selectedCurrencies={selectedCurrencies}
          toggleCurrency={toggleCurrency}
          showAllCurrencies={showAllCurrencies}
          toggleAllCurrencies={toggleAllCurrencies}
          t={t}
          monthLabels={r.monthsShort}
          weekdaysShort={r.weekdaysShort}
        />

        <div className="customer-report-table-region">
          {reportSyncing && (
            <div className="customer-report-sync-track" aria-hidden>
              <div className="customer-report-sync-bar" />
            </div>
          )}
          <CustomerReportTable
            reportData={reportData}
            loading={loading}
            reportSyncing={reportSyncing}
            error={error}
            currencyList={currencyList}
            t={t}
          />
        </div>
      </div>

      {toast && (
        <div id="customerReportNotificationContainer" className="maintenance-notification-container">
          <div className={`maintenance-notification maintenance-notification-${reportToastMaintenanceVariant(toast.type)} show`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
