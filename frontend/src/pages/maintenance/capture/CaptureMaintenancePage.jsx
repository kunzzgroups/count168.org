import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
/* 与 DataCapture 相同：打进 Vite 产物，避免 dynamic import 在生产包中被拆成空 chunk、样式从未加载 */
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/date-range-picker.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/capture_maintenance.css";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { removeOtherMaintenanceStylesheets, waitForStylesheet } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { formatYmd } from "../../../utils/date/dateUtils.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import {
  fetchCompanyPermissions,
  fetchProcesses,
  searchCaptureData,
  deleteCaptureItems,
  updateSessionCompany,
} from "./captureMaintenanceLogic.js";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N } from "../../../translateFile/pages/maintenanceTranslate.js";
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import PageContentLoader from "../../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

// Componentss
import CaptureMaintenanceFilters from "./components/CaptureMaintenanceFilters.jsx";
import CaptureMaintenanceTable from "./components/CaptureMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";

export default function CaptureMaintenancePage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);

  // -- Boot State ---
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

  // -- Data State --
  const [processes, setProcesses] = useState([]);
  const [captureData, setCaptureData] = useState([]);
  const [captureListEpoch, setCaptureListEpoch] = useState(0);
  const [captureDataSourceCompanyId, setCaptureDataSourceCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  /** 与 Report 页一致：非首次拉数时用细条 + 保留旧表，避免切换公司整表 Loading 卡顿感 */
  const [listSyncing, setListSyncing] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cssReady, setCssReady] = useState(false);

  const captureSeqRef = useRef(0);
  const captureAbortRef = useRef(null);
  const companyIdRef = useRef(null);
  const captureDataRef = useRef(captureData);
  captureDataRef.current = captureData;
  const initialCaptureSearchDoneRef = useRef(false);
  /** 切换公司已手动触发拉数时跳过 useEffect 里下一次重复请求，少等一轮渲染 */
  const suppressNextSearchEffectRef = useRef(false);
  const followGroupRef = useRef(() => {});

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

  const { guardWrite } = usePartnershipAuditWriteGuard(me, notify);

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

    removeOtherMaintenanceStylesheets("capture_maintenance.css");

    let cancelled = false;

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];

    Promise.all(links.map(waitForStylesheet)).then(() => {
      if (!cancelled) setCssReady(true);
    });

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
    (async () => {
      try {
        const u = me;

        // Permissions check
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canMaintenance = hasFull || perms.includes("maintenance");

        // Sidebar visibility check
        if (!canMaintenance) {
          navigate("/dashboard", { replace: true });
          return;
        }

        // Load Companies
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        if (cancelled) return;
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        // Set Initial Company
        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);

        const currentComp = rows.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          // Fetch initial metadata here to ensure the first query starts with the correct activePermission
          const [procList, companyPerms] = await Promise.all([
            fetchProcesses(initialCompanyId),
            fetchCompanyPermissions(code)
          ]);
          if (cancelled) return;

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

          setProcesses(procList);
          setPermissions(companyPerms);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = savedPerm && companyPerms.includes(savedPerm) ? savedPerm : (companyPerms.length > 0 ? companyPerms[0] : "");
          setActivePermission(initialActive);

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
  }, [sessionReady, me, navigate]);

  // -- Load Meta Data (Processes & Permissions) --
  useEffect(() => {
    if (bootLoading || !companyId) return;

    (async () => {
      try {
        const [procList, permList] = await Promise.all([
          fetchProcesses(companyId),
          fetchCompanyPermissions(companyCode)
        ]);
        setProcesses(procList);
        setPermissions(permList);
        
        // Initial permission from localStorage or first one
        const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (saved && permList.includes(saved)) {
          setActivePermission(saved);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        console.error("Meta data load error:", err);
        notify(t("failedLoadProcesses"), "error");
      }
    })();
  }, [bootLoading, companyId, companyCode, notify, t]);

  // -- Search Logic --
  const performSearch = useCallback(async (overrides = {}) => {
    const effectiveCompanyId = overrides.companyId ?? companyId;
    if (!effectiveCompanyId || !dateFrom || !dateTo) return;
    const searchCompanyId = Number(effectiveCompanyId);
    captureAbortRef.current?.abort();
    const ac = new AbortController();
    captureAbortRef.current = ac;
    const seq = ++captureSeqRef.current;
    const quietRefresh = initialCaptureSearchDoneRef.current;
    if (!quietRefresh) setLoading(true);
    else {
      setLoading(false);
      setListSyncing(true);
    }
    setSelectedIds([]);
    try {
      const data = await searchCaptureData(
        {
          dateFrom,
          dateTo,
          process: selectedProcess,
          companyId: effectiveCompanyId,
          category: activePermission,
        },
        { signal: ac.signal },
      );
      if (seq !== captureSeqRef.current) return;
      if (searchCompanyId !== Number(companyIdRef.current)) return;
      setCaptureListEpoch((e) => e + 1);
      setCaptureData(data);
      setCaptureDataSourceCompanyId(searchCompanyId);
      if (!quietRefresh) {
        if (data.length > 0) {
          notify(t("foundRecords", { n: data.length }), "success");
        } else {
          notify(t("noDataAdjustSearch"), "info");
        }
      }
    } catch (err) {
      if (err?.name === "AbortError" || seq !== captureSeqRef.current) return;
      if (searchCompanyId !== Number(companyIdRef.current)) return;
      notify(err.message, "error");
      setCaptureListEpoch((e) => e + 1);
      setCaptureData([]);
      setCaptureDataSourceCompanyId(null);
    } finally {
      initialCaptureSearchDoneRef.current = true;
      if (seq === captureSeqRef.current) {
        setLoading(false);
        setListSyncing(false);
      }
    }
  }, [companyId, dateFrom, dateTo, selectedProcess, activePermission, notify, t]);

  // Auto-search when filters change（defer 0ms；切换公司已手动 performSearch 时跳过一轮避免重复）
  useEffect(() => {
    if (!bootLoading && companyId && cssReady) {
      if (suppressNextSearchEffectRef.current) {
        suppressNextSearchEffectRef.current = false;
        return;
      }
      const h = setTimeout(() => {
        void performSearch();
      }, 0);
      return () => clearTimeout(h);
    }
  }, [bootLoading, companyId, selectedProcess, dateFrom, dateTo, activePermission, performSearch, cssReady]);

  useEffect(
    () => () => {
      captureAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    companyIdRef.current = companyId;
  }, [companyId]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    const nextId = Number(c.id);
    const nextCode = c.company_id || "";
    const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
    const isOwner = String(me?.role || "").toLowerCase() === "owner";

    if (isOwner) {
      suppressNextSearchEffectRef.current = true;
      setCompanyId(nextId);
      setCompanyCode(nextCode);
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      followGroupRef.current();
      void performSearch({ companyId: nextId });
      notify(t("switchedTo", { company: nextCode }), "success");
      try {
        const sessionData = await updateSessionCompany(c.id);
        if (sessionData && sessionData.has_gambling === false) {
          navigate("/process-list", { replace: true });
          return;
        }
        notifyCompanySessionUpdated();
      } catch (err) {
        notify(err.message || t("switchFailed"), "error");
        navigate("/dashboard", { replace: true });
      }
      return;
    }

    try {
      const sessionData = await updateSessionCompany(c.id);

      if (sessionData && sessionData.has_gambling === false) {
        navigate("/process-list", { replace: true });
        return;
      }

      suppressNextSearchEffectRef.current = true;
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
    if (p === activePermission) return;
    setActivePermission(p);
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const selectable = captureDataRef.current.filter(
        (row) => !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true),
      );
      if (prev.length === selectable.length && selectable.length > 0) return [];
      return selectable.map((row) => row.capture_id);
    });
  }, []);

  const selectableRowsCount = useMemo(
    () =>
      captureData.filter(
        (row) => !(row.is_deleted === 1 || row.is_deleted === "1" || row.is_deleted === true),
      ).length,
    [captureData],
  );
  const selectAll = selectedIds.length > 0 && selectedIds.length === selectableRowsCount;

  const handleDeleteClick = () => {
    if (guardWrite()) return;
    if (selectedIds.length === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setShowDeleteModal(true);
  };

  const confirmDeleteAction = async () => {
    if (guardWrite()) return;
    setShowDeleteModal(false);
    try {
      const itemsToDelete = captureData
        .filter(row => selectedIds.includes(row.capture_id))
        .map(row => ({
          capture_id: Number(row.capture_id),
          process_id: row.process_id || row.process || null,
          currency_id: row.currency_id ? Number(row.currency_id) : null
        }));

      await deleteCaptureItems({
        items: itemsToDelete,
        dateFrom,
        dateTo
      });

      notify(t("deleteSuccessful"), "success");
      setConfirmDelete(false);
      setSelectedIds([]);
      await performSearch();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  if (bootLoading || !sessionReady || !me || !cssReady) return <PageContentLoader />;

  return (
    <div className="container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitleDataCapture}</h1>
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

      {/* Scope table CSS: other maintenance pages share .maintenance-* and win in bundle order */}
      <div className="capture-maintenance-page-root">
        <CaptureMaintenanceFilters
          processes={processes}
          selectedProcess={selectedProcess}
          setSelectedProcess={setSelectedProcess}
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
          onDelete={handleDeleteClick}
          canDelete={selectedIds.length > 0}
          confirmDelete={confirmDelete}
          setConfirmDelete={setConfirmDelete}
          m={m}
        />

        <div className="capture-maintenance-table-region">
          {listSyncing && (
            <div className="capture-maintenance-sync-track" aria-hidden>
              <div className="capture-maintenance-sync-bar" />
            </div>
          )}
          <CaptureMaintenanceTable
            key={captureDataSourceCompanyId ?? companyId ?? "no-company"}
            data={captureData}
            listEpoch={captureListEpoch}
            rowKeyCompanyId={captureDataSourceCompanyId ?? companyId}
            loading={loading}
            listSyncing={listSyncing}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            selectAll={selectAll}
            m={m}
          />
        </div>
      </div>

      {/* Notifications */}
      <div id="notificationContainer" className="maintenance-notification-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`maintenance-notification maintenance-notification-${toast.type} show`}>
            {toast.message}
          </div>
        ))}
      </div>
      {/* Confirm Modal */}
      <MaintenanceDeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteAction}
        count={selectedIds.length}
        t={t}
      />
    </div>
  );
}
