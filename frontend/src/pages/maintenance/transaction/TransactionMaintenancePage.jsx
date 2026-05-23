import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData, isCancelledError } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { canAccessTransactionFormulaMaintenance } from "../../../utils/auth/sidebarPermissions.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/transaction_maintenance.css";
import {
  fetchCompanyPermissions,
  fetchProcesses,
  isBankOnlyCategoryCompany,
  normalizeMaintenanceProcessFilter,
  searchTransactionData,
  updateSessionCompany,
  isMaintenanceRecoverableError,
  getMaintenanceSearchUserMessage,
} from "./transactionMaintenanceLogic.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";

// Components
import TransactionMaintenanceFilters from "./components/TransactionMaintenanceFilters.jsx";
import TransactionMaintenanceTable from "./components/TransactionMaintenanceTable.jsx";
import PageContentLoader from "../../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

/**
 * Dedupe "no data" toast on Transaction Maintenance.
 * React 18 Strict Mode remounts the tree in dev: component refs reset, so ref-based
 * dedupe fires twice for the same successful empty response.
 */
const transactionMaintenanceNoDataToastKeys = new Set();
const MAX_NO_DATA_TOAST_KEYS = 64;

function consumeNoDataToastDedupeKey(key) {
  if (!key || transactionMaintenanceNoDataToastKeys.has(key)) return false;
  transactionMaintenanceNoDataToastKeys.add(key);
  while (transactionMaintenanceNoDataToastKeys.size > MAX_NO_DATA_TOAST_KEYS) {
    const first = transactionMaintenanceNoDataToastKeys.values().next().value;
    transactionMaintenanceNoDataToastKeys.delete(first);
  }
  return true;
}

export default function TransactionMaintenancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);

  // -- Boot State --
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProcess, setSelectedProcess] = useState("");
  const [activePermission, setActivePermission] = useState("");
  
  const today = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);

  const [toasts, setToasts] = useState([]);
  const [cssReady, setCssReady] = useState(false);
  /** Boot finished metadata; date picker synced — avoids racing search with boot/meta fetches. */
  const [filtersReady, setFiltersReady] = useState(false);
  const [dateRangeReady, setDateRangeReady] = useState(false);
  const [searchDeferredReady, setSearchDeferredReady] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const followGroupRef = useRef(() => {});

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  /** When set, meta effect reuses permissions from the last company switch instead of calling domain_api again. */
  const switchPermsCacheRef = useRef(null);
  /** Boot already loaded process/permission meta — skip duplicate meta effect on first paint. */
  const skipMetaAfterBootRef = useRef(false);

  const processFilter = useMemo(
    () => normalizeMaintenanceProcessFilter(selectedProcess),
    [selectedProcess],
  );

  const maintenanceQueryKey = useMemo(
    () => [
      "transaction-maintenance",
      companyId,
      dateFrom,
      dateTo,
      processFilter,
      activePermission || "",
    ],
    [companyId, dateFrom, dateTo, processFilter, activePermission],
  );

  const listQueryEnabled = Boolean(
    !bootLoading &&
    filtersReady &&
    dateRangeReady &&
    companyId &&
    dateFrom &&
    dateTo &&
    cssReady &&
    (permissions.length === 0 || activePermission),
  );

  const transactionQuery = useQuery({
    queryKey: maintenanceQueryKey,
    queryFn: ({ signal }) =>
      searchTransactionData({
        dateFrom,
        dateTo,
        process: processFilter,
        companyId,
        category: activePermission,
        signal,
        onFirstPage: (rows) => {
          queryClient.setQueryData(maintenanceQueryKey, rows);
        },
      }),
    enabled: listQueryEnabled && searchDeferredReady && !switchingCompany,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) =>
      error?.name !== "AbortError" && !isCancelledError(error) && failureCount < 5,
    retryDelay: (attempt) => Math.min(2500, 500 * (attempt + 1)),
  });

  const transactionData = transactionQuery.data ?? [];
  const listRowCount = transactionData.length;
  const searchRecoverable =
    transactionQuery.isError &&
    listRowCount === 0 &&
    isMaintenanceRecoverableError(transactionQuery.error);
  /** 无数据：加载中或可恢复错误 — 显示 Loading，不出现 Search failed */
  const showListSkeleton =
    listQueryEnabled &&
    listRowCount === 0 &&
    (transactionQuery.isLoading ||
      transactionQuery.isFetching ||
      (searchRecoverable && !recoverableExhausted));
  const recoverableRetryRef = useRef(0);
  const [recoverableExhausted, setRecoverableExhausted] = useState(false);
  const lastToastKeyRef = useRef(null);

  const searchQueryKey = useMemo(
    () =>
      JSON.stringify([
        companyId,
        dateFrom,
        dateTo,
        processFilter,
        activePermission || "",
      ]),
    [companyId, dateFrom, dateTo, processFilter, activePermission],
  );

  useEffect(() => {
    recoverableRetryRef.current = 0;
    setRecoverableExhausted(false);
  }, [searchQueryKey]);

  useEffect(() => {
    if (!listQueryEnabled || !searchRecoverable || transactionQuery.isFetching) return;
    if (recoverableRetryRef.current >= 10) {
      setRecoverableExhausted(true);
      return;
    }

    const delay = Math.min(4000, 700 * (recoverableRetryRef.current + 1));
    const timer = window.setTimeout(() => {
      recoverableRetryRef.current += 1;
      transactionQuery.refetch({ cancelRefetch: false });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    listQueryEnabled,
    searchRecoverable,
    recoverableExhausted,
    transactionQuery.isFetching,
    transactionQuery.errorUpdatedAt,
    searchQueryKey,
    transactionQuery,
  ]);

  useEffect(() => {
    if (transactionQuery.isSuccess) {
      recoverableRetryRef.current = 0;
      setRecoverableExhausted(false);
    }
  }, [transactionQuery.isSuccess, transactionQuery.dataUpdatedAt]);

  const listStatusMessage = useMemo(() => {
    if (showListSkeleton) return t("searchRetrying");
    if (recoverableExhausted) return t("searchRetryHint");
    if (transactionQuery.isError && listRowCount === 0) {
      return getMaintenanceSearchUserMessage(transactionQuery.error, {
        loadingMessage: t("searchRetrying"),
        narrowRangeMessage: t("searchRetryHint"),
      });
    }
    return "";
  }, [
    showListSkeleton,
    recoverableExhausted,
    transactionQuery.isError,
    transactionQuery.error,
    listRowCount,
    t,
  ]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => {
      if (prev.some(t => t.message === message)) return prev;
      const next = [...prev, { id, message, type }];
      if (next.length > 2) return next.slice(1);
      return next;
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2000);
  }, []);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    const targets = [document.documentElement, document.body, document.getElementById("root")].filter(Boolean);
    const originalStyles = targets.map((el) => ({
      el,
      overflow: el.style.getPropertyValue("overflow"),
      overflowPriority: el.style.getPropertyPriority("overflow"),
      overflowY: el.style.getPropertyValue("overflow-y"),
      overflowYPriority: el.style.getPropertyPriority("overflow-y"),
      overflowX: el.style.getPropertyValue("overflow-x"),
      overflowXPriority: el.style.getPropertyPriority("overflow-x"),
      height: el.style.getPropertyValue("height"),
      heightPriority: el.style.getPropertyPriority("height"),
      minHeight: el.style.getPropertyValue("min-height"),
      minHeightPriority: el.style.getPropertyPriority("min-height"),
      maxHeight: el.style.getPropertyValue("max-height"),
      maxHeightPriority: el.style.getPropertyPriority("max-height"),
    }));
    targets.forEach((el) => {
      el.style.setProperty("overflow", "auto", "important");
      el.style.setProperty("overflow-y", "auto", "important");
      el.style.setProperty("overflow-x", "hidden", "important");
      el.style.setProperty("height", "auto", "important");
      el.style.setProperty("min-height", "100vh", "important");
      el.style.setProperty("max-height", "none", "important");
    });

    let cancelled = false;

    removeOtherMaintenanceStylesheets("transaction_maintenance.css");
    ensureMaintenanceDateRangePicker();
    // Fonts/icons are in index.html; page CSS is bundled via imports — do not block on third-party CDN
    // (some networks/devices block or stall fonts.googleapis.com / cdnjs → blank page + "failed to load resource").
    setCssReady(true);

    return () => {
      cancelled = true;
      setCssReady(false);
      originalStyles.forEach((item) => {
        const { el } = item;
        if (item.overflow) el.style.setProperty("overflow", item.overflow, item.overflowPriority);
        else el.style.removeProperty("overflow");
        if (item.overflowY) el.style.setProperty("overflow-y", item.overflowY, item.overflowYPriority);
        else el.style.removeProperty("overflow-y");
        if (item.overflowX) el.style.setProperty("overflow-x", item.overflowX, item.overflowXPriority);
        else el.style.removeProperty("overflow-x");
        if (item.height) el.style.setProperty("height", item.height, item.heightPriority);
        else el.style.removeProperty("height");
        if (item.minHeight) el.style.setProperty("min-height", item.minHeight, item.minHeightPriority);
        else el.style.removeProperty("min-height");
        if (item.maxHeight) el.style.setProperty("max-height", item.maxHeight, item.maxHeightPriority);
        else el.style.removeProperty("max-height");
      });
      document.body.classList.remove("maintenance-page");
    };
  }, []);

  useEffect(() => {
    if (bootLoading || !me || !cssReady) return;
    setDateRangeReady(true);
  }, [bootLoading, me, cssReady]);

  // Defer first search one tick after filters are ready (align with Payment/Capture maintenance).
  useEffect(() => {
    if (!listQueryEnabled) {
      setSearchDeferredReady(false);
      return;
    }
    const timer = setTimeout(() => setSearchDeferredReady(true), 0);
    return () => {
      clearTimeout(timer);
      setSearchDeferredReady(false);
    };
  }, [listQueryEnabled]);

  useEffect(() => {
    if (bootLoading || !me || !cssReady) return;
    window.MaintenanceDateRangePicker?.setLocaleStrings?.({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      monthLabels: m.monthsShort,
    });
  }, [bootLoading, me, cssReady, lang, t, m]);

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        const u = me;

        // Member check
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }

        // Permissions check
        if (!canAccessTransactionFormulaMaintenance(u)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        
        const filtered = rows;
        setCompanies(filtered);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (filtered[0]?.id ? Number(filtered[0].id) : null);
        
        // Ensure initialCompanyId exists in filtered list
        if (initialCompanyId && !filtered.some(c => Number(c.id) === initialCompanyId)) {
          initialCompanyId = filtered[0]?.id ? Number(filtered[0].id) : null;
        }
        
        setCompanyId(initialCompanyId);
        
        const currentComp = filtered.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          // Fetch initial metadata here to ensure the first query starts with the correct activePermission
          const [companyPerms, procList] = await Promise.all([
            fetchCompanyPermissions(code),
            fetchProcesses(initialCompanyId)
          ]);

          const hasGames = companyPerms.includes("Games") || companyPerms.includes("Gambling");
          const bankOnly = companyPerms.includes("Bank") && !hasGames;
          if (bankOnly) {
            navigate("/process-list", { replace: true });
            return;
          }
          if (!hasGames) {
            navigate("/dashboard", { replace: true });
            return;
          }

          setPermissions(companyPerms);
          setProcesses(procList);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = savedPerm && companyPerms.includes(savedPerm) ? savedPerm : (companyPerms.length > 0 ? companyPerms[0] : "");
          setActivePermission(initialActive);

          // Cache permissions so the meta-effect below skips redundant API call
          switchPermsCacheRef.current = { companyCode: code, perms: companyPerms };
          skipMetaAfterBootRef.current = true;

          const savedGroup = sessionStorage.getItem("dashboard_group_filter");
          const groups = [...new Set(filtered.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
          
          let selGroup = null;
          if (savedGroup && groups.includes(savedGroup) && currentComp.group_id && String(currentComp.group_id).toUpperCase().trim() === savedGroup) {
            selGroup = savedGroup;
          } else if (currentComp.group_id?.trim()) {
            selGroup = String(currentComp.group_id).toUpperCase().trim();
          }
          
          setSelectedGroup(selGroup);
          if (selGroup) sessionStorage.setItem("dashboard_group_filter", selGroup);
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) {
          setFiltersReady(true);
          setBootLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, navigate, me]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (bootLoading || !companyId) return;
    if (skipMetaAfterBootRef.current) {
      skipMetaAfterBootRef.current = false;
      return;
    }

    let cancelled = false;
    const cid = companyId;
    const ccode = companyCode;

    (async () => {
      try {
        const procList = await fetchProcesses(cid);
        if (cancelled) return;
        setProcesses(procList);
        setSelectedProcess((prev) => {
          const filter = normalizeMaintenanceProcessFilter(prev);
          if (!filter) return "";
          return procList.some((p) => String(p.process_name) === filter) ? filter : "";
        });

        const cached = switchPermsCacheRef.current;
        let permList;
        if (cached && cached.companyCode === ccode) {
          permList = cached.perms;
          switchPermsCacheRef.current = null;
        } else {
          permList = await fetchCompanyPermissions(ccode);
        }
        if (cancelled) return;
        setPermissions(permList);

        const saved = localStorage.getItem(`selectedPermission_${ccode}`);
        if (saved && permList.includes(saved)) {
          setActivePermission(saved);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Meta data load error:", err);
        notify(t("failedLoadMetaData"), "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyId, companyCode, notify, t]);

  useEffect(() => {
    if (!transactionQuery.isSuccess || !transactionData.length) return;
    if (transactionQuery.isPlaceholderData) return;
    const key = `${transactionQuery.dataUpdatedAt}:${transactionData.length}`;
    if (lastToastKeyRef.current === key) return;
    lastToastKeyRef.current = key;
    notify(t("foundRecords", { n: transactionData.length }), "success");
  }, [transactionQuery.isSuccess, transactionQuery.dataUpdatedAt, transactionQuery.isPlaceholderData, transactionData.length, notify, t]);

  useEffect(() => {
    if (!listQueryEnabled) return;
    if (!transactionQuery.isSuccess) return;
    if (transactionQuery.isFetching) return;
    if (transactionData.length > 0) return;
    const key = `${transactionQuery.dataUpdatedAt ?? ""}:empty`;
    if (!consumeNoDataToastDedupeKey(key)) return;
    notify(t("noDataAdjustSearch"), "info");
  }, [
    listQueryEnabled,
    transactionQuery.isSuccess,
    transactionQuery.isFetching,
    transactionData.length,
    transactionQuery.dataUpdatedAt,
    notify,
    t,
  ]);

  // -- Handlers --
  const handleSwitchCompany = useCallback(async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    setSwitchingCompany(true);
    try {
      const nextCompanyId = Number(c.id);
      const res = await updateSessionCompany(c.id);

      if (res.has_gambling === false) {
        navigate("/process-list", { replace: true });
        return;
      }

      const perms = await fetchCompanyPermissions(c.company_id);

      if (isBankOnlyCategoryCompany(perms)) {
        navigate("/process-list", { replace: true });
        return;
      }

      const procList = await fetchProcesses(nextCompanyId);

      const code = c.company_id || "";
      const saved = localStorage.getItem(`selectedPermission_${code}`);
      const nextActive =
        saved && perms.includes(saved) ? saved : perms.length > 0 ? perms[0] : "";
      switchPermsCacheRef.current = { companyCode: code, perms };
      skipMetaAfterBootRef.current = true;
      setActivePermission(nextActive);
      setPermissions(perms);
      setProcesses(procList);
      setSelectedProcess("");

      setCompanyId(nextCompanyId);
      setCompanyCode(code);

      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");

      followGroupRef.current();

      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: c.company_id }), "success");
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("unauthorized permission category")) {
        navigate("/process-list", { replace: true });
        return;
      }
      notify(err.message || t("switchFailed"), "error");
    } finally {
      setSwitchingCompany(false);
    }
  }, [companyId, navigate, notify, t]);

  const {
    groupFilterKind,
    snapGroupIds,
    visibleCompanies,
    handlePickAllGroups,
    handleGroupClick,
    followCurrentCompanyGroup,
  } = useMaintenanceGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    switchCompany: handleSwitchCompany,
    switchingCompany,
  });

  followGroupRef.current = followCurrentCompanyGroup;

  const handlePermissionSwitch = (p) => {
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  if (bootLoading || !me || !cssReady) return <PageContentLoader />;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitleTransaction}</h1>
        {permissions.length > 1 && (
          <div id="maintenance-permission-filter" className="maintenance-permission-filter-header">
            <span className="maintenance-company-label">{m.category}</span>
            <div id="maintenance-permission-buttons" className="maintenance-company-buttons">
              {permissions.map(p => (
                <button 
                  key={p} 
                  type="button" 
                  className={`maintenance-company-btn ${p === activePermission ? 'active' : ''}`}
                  onClick={() => handlePermissionSwitch(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="transaction-maintenance-page-root">
        <TransactionMaintenanceFilters 
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
          today={todayDmy}
          companyId={companyId}
          companies={companies}
          groupFilterKind={groupFilterKind}
          snapGroupIds={snapGroupIds}
          visibleCompanies={visibleCompanies}
          selectedGroup={selectedGroup}
          onGroupClick={handleGroupClick}
          onPickAllGroups={handlePickAllGroups}
          onSwitchCompany={handleSwitchCompany}
          m={m}
        />

        <TransactionMaintenanceTable
          data={transactionData}
          showSkeleton={showListSkeleton}
          statusMessage={listStatusMessage}
          isPlaceholderData={transactionQuery.isPlaceholderData}
          m={m}
        />
      </div>

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
