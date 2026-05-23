import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/payment_maintenance.css";
import {
  fetchCompanyPermissions,
  fetchCompanyCurrencies,
  searchPaymentData,
  deletePaymentRecords,
  updateSessionCompany,
  isPaymentMaintenanceRowSelectable,
} from "./paymentMaintenanceLogic.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";

// Components
import PaymentMaintenanceFilters from "./components/PaymentMaintenanceFilters.jsx";
import PaymentMaintenanceTable from "./components/PaymentMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";
import PageContentLoader from "../../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

export default function PaymentMaintenancePage() {
  const navigate = useNavigate();
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
  const [transactionType, setTransactionType] = useState("");
  const [activePermission, setActivePermission] = useState("");
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState(null);
  
  const today = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => {
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  }, [today]);
  const [dateFrom, setDateFrom] = useState(todayDmy);
  const [dateTo, setDateTo] = useState(todayDmy);
  const [cssReady, setCssReady] = useState(false);

  // -- Data State --
  const [paymentData, setPaymentData] = useState([]);
  /** 每次成功替换列表结果时递增，与 paymentDataSourceCompanyId 一起写入表格行 key */
  const [paymentListEpoch, setPaymentListEpoch] = useState(0);
  /** 当前 paymentData 所对应的已提交公司 numeric id（仅随成功搜索更新；切换公司时筛选已变但数据未回前仍为旧 id，避免行 key 误用新公司 id 复用 DOM 窜行） */
  const [paymentDataSourceCompanyId, setPaymentDataSourceCompanyId] = useState(null);
  /** 与 Capture Maintenance 一致：首次整表 Loading；之后仅顶栏细条 + 保留旧表，切换公司不卡手 */
  const [loading, setLoading] = useState(false);
  const [listSyncing, setListSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const companyIdRef = useRef(null);
  const searchSeqRef = useRef(0);
  const searchAbortRef = useRef(null);
  const initialPaymentSearchDoneRef = useRef(false);
  /** 切换公司已手动 performSearch 时跳过 useEffect 里下一轮重复请求 */
  const suppressNextSearchEffectRef = useRef(false);
  const followGroupRef = useRef(() => {});
  const paymentDataRef = useRef(paymentData);
  paymentDataRef.current = paymentData;

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "1") {
      notify(t("operationCompletedSuccess"), "success");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (params.get("error") === "1") {
      notify(t("operationFailedRetry"), "error");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [notify, t]);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    // Force native page scrolling even when legacy CSS applies viewport locks.
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

    removeOtherMaintenanceStylesheets("payment_maintenance.css");

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
      // local styles are imported statically so only external stylesheets need runtime loading
    ];

    Promise.all(links.map(waitForStylesheet)).then(() => {
      if (!cancelled) setCssReady(true);
    });

    return () => {
      cancelled = true;
      searchAbortRef.current?.abort();
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

  // Handle sidebar company switch
  useEffect(() => {
    const handleSwitch = (e) => {
      if (!e.detail) return;
      const { companyId, companyCode } = e.detail;
      if (Number(companyId) === Number(companyIdRef.current)) return;

      companyIdRef.current = Number(companyId);
      setCompanyId(Number(companyId));
      setCompanyCode(companyCode);
      setPaymentData([]);
      setSelectedIds([]);
      setConfirmDelete(false);
    };

    window.addEventListener("eazycount:company-session-updated", handleSwitch);
    return () => window.removeEventListener("eazycount:company-session-updated", handleSwitch);
  }, []);

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

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);
        companyIdRef.current = initialCompanyId;
        
        const currentComp = rows.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);
          
          // Fetch initial metadata here to ensure the first query starts with the correct activePermission
          const [companyPerms, currList] = await Promise.all([
            fetchCompanyPermissions(code),
            fetchCompanyCurrencies(initialCompanyId)
          ]);
          setPermissions(companyPerms);
          setCurrencies(currList);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = savedPerm && companyPerms.includes(savedPerm) ? savedPerm : (companyPerms.length > 0 ? companyPerms[0] : "");
          setActivePermission(initialActive);

          const hasMYR = currList.some(c => c.code === "MYR");
          setSelectedCurrency(hasMYR ? "MYR" : (currList[0]?.code || null));

          const savedGroup = sessionStorage.getItem("dashboard_group_filter");
          const groups = [...new Set(rows.filter((c) => c.group_id).map((c) => String(c.group_id).toUpperCase().trim()))].sort();
          
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
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, navigate, me]);

  // -- Load Meta Data (Permissions & Currencies) --
  useEffect(() => {
    if (bootLoading || !companyId) return;

    let cancelled = false;
    (async () => {
      try {
        const [permList, currList] = await Promise.all([
          fetchCompanyPermissions(companyCode),
          fetchCompanyCurrencies(companyId)
        ]);
        if (cancelled) return;
        setPermissions(permList);
        setCurrencies(currList);
        
        // Initial permission
        const savedPerm = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (savedPerm && permList.includes(savedPerm)) {
          setActivePermission(savedPerm);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }

        // Initial currency
        const hasMYR = currList.some(c => c.code === "MYR");
        setSelectedCurrency(hasMYR ? "MYR" : (currList[0]?.code || null));
        
      } catch (err) {
        if (cancelled) return;
        console.error("Meta data load error:", err);
        notify(t("failedLoadCompanyMetadata"), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyId, companyCode, notify, t]);

  // -- Search Logic --
  /** 与 Capture Maintenance 对齐：支持 overrides.companyId；seq + ref + Abort；首次 Loading / 之后 listSyncing 保留旧表 */
  const performSearch = useCallback(
    async (overrides = {}) => {
      const { companyId: overrideCompanyId } = overrides;
      const effectiveCompanyId = overrideCompanyId ?? companyId;
      if (!effectiveCompanyId || !dateFrom || !dateTo) return;

      const searchCompanyId = Number(effectiveCompanyId);
      const quietRefresh = initialPaymentSearchDoneRef.current;

      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      const seq = ++searchSeqRef.current;
      if (!quietRefresh) setLoading(true);
      else {
        setLoading(false);
        setListSyncing(true);
      }
      setSelectedIds([]);
      try {
        const data = await searchPaymentData({
          dateFrom,
          dateTo,
          transactionType,
          companyId: effectiveCompanyId,
          currency: selectedCurrency,
          signal: controller.signal,
        });
        if (seq !== searchSeqRef.current) return;
        if (searchCompanyId !== Number(companyIdRef.current)) return;
        setPaymentListEpoch((e) => e + 1);
        setPaymentData(data);
        setPaymentDataSourceCompanyId(searchCompanyId);
        setConfirmDelete(false);
        if (!quietRefresh) {
          if (data.length > 0) {
            notify(t("foundRecords", { n: data.length }), "success");
          } else {
            notify(t("noDataAdjustSearch"), "info");
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" || seq !== searchSeqRef.current) return;
        if (searchCompanyId !== Number(companyIdRef.current)) return;
        notify(err.message, "error");
        setPaymentListEpoch((e) => e + 1);
        setPaymentData([]);
        setPaymentDataSourceCompanyId(null);
      } finally {
        initialPaymentSearchDoneRef.current = true;
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
        if (seq === searchSeqRef.current) {
          setLoading(false);
          setListSyncing(false);
        }
      }
    },
    [companyId, dateFrom, dateTo, transactionType, selectedCurrency, notify, t],
  );

  // Auto-search when filters change（defer 0ms；切换公司已手动 performSearch 时跳过一轮避免重复）
  useEffect(() => {
    if (bootLoading || !companyId || !cssReady) return;
    if (suppressNextSearchEffectRef.current) {
      suppressNextSearchEffectRef.current = false;
      return;
    }
    const h = setTimeout(() => {
      void performSearch();
    }, 0);
    return () => clearTimeout(h);
  }, [bootLoading, companyId, transactionType, dateFrom, dateTo, selectedCurrency, performSearch, cssReady]);

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [],
  );

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    const nextId = Number(c.id);
    const nextCode = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
    const isOwner = String(me?.role || "").toLowerCase() === "owner";

    if (isOwner) {
      suppressNextSearchEffectRef.current = true;
      companyIdRef.current = nextId;
      setCompanyId(nextId);
      setCompanyCode(nextCode);
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      followGroupRef.current();
      void performSearch({ companyId: nextId });
      notify(t("switchedTo", { company: nextCode }), "success");
      try {
        await updateSessionCompany(c.id);
        // Stay on Payment Maintenance: bank-only companies (e.g. CX) still have PAYMENT rows to maintain.
        notifyCompanySessionUpdated();
      } catch (err) {
        notify(err.message || t("switchFailed"), "error");
        navigate("/dashboard", { replace: true });
      }
      return;
    }

    try {
      await updateSessionCompany(c.id);

      suppressNextSearchEffectRef.current = true;
      companyIdRef.current = nextId;
      setCompanyId(nextId);
      setCompanyCode(nextCode);
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      followGroupRef.current();

      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: nextCode }), "success");
      void performSearch({ companyId: nextId });
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
      navigate("/dashboard", { replace: true });
    }
  };

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
  });

  followGroupRef.current = followCurrentCompanyGroup;

  const handlePermissionSwitch = (p) => {
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectable = paymentDataRef.current.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)
      );
      if (prev.length === selectable.length && selectable.length > 0) return [];
      return selectable.map((r) => r.transaction_id);
    });
  }, []);

  const selectableRowsCount = useMemo(
    () =>
      paymentData.filter(
        (r) =>
          isPaymentMaintenanceRowSelectable(r) &&
          !(r.is_deleted === 1 || r.is_deleted === "1" || r.is_deleted === true)
      ).length,
    [paymentData]
  );
  const selectAll =
    selectedIds.length > 0 && selectedIds.length === selectableRowsCount;

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleteModalOpen(false);
    try {
      await deletePaymentRecords(selectedIds);
      notify(t("successfullyDeletedN", { n: selectedIds.length }), "success");
      performSearch();
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  if (bootLoading || !me || !cssReady) return <PageContentLoader />;

  return (
    <div className="payment-maintenance-page-root container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitlePayment}</h1>
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

      <PaymentMaintenanceFilters 
        transactionType={transactionType}
        setTransactionType={setTransactionType}
        dateFrom={dateFrom}
        dateTo={dateTo}
        setDateFrom={setDateFrom}
        setDateTo={setDateTo}
        today={todayDmy}
        companyId={companyId}
        groupFilterKind={groupFilterKind}
        snapGroupIds={snapGroupIds}
        visibleCompanies={visibleCompanies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onPickAllGroups={handlePickAllGroups}
        onSwitchCompany={handleSwitchCompany}
        currencies={currencies}
        selectedCurrency={selectedCurrency}
        setSelectedCurrency={setSelectedCurrency}
        onDelete={handleDeleteClick}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        deleteDisabled={selectedIds.length === 0}
        m={m}
      />

      <div className="payment-maintenance-table-region">
        {listSyncing && (
          <div className="payment-maintenance-sync-track" aria-hidden>
            <div className="payment-maintenance-sync-bar" />
          </div>
        )}
        <PaymentMaintenanceTable
          key={paymentDataSourceCompanyId ?? companyId ?? "no-company"}
          data={paymentData}
          listEpoch={paymentListEpoch}
          rowKeyCompanyId={paymentDataSourceCompanyId ?? companyId}
          loading={loading}
          listSyncing={listSyncing}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          selectAll={selectAll}
          m={m}
        />
      </div>

      {/* Modal & Notifications */}
      <MaintenanceDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        count={selectedIds.length}
        t={t}
      />

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
