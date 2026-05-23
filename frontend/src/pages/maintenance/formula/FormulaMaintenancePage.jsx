import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N, getFormulaInputMethodOptions } from "../../../translateFile/pages/maintenanceTranslate.js";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { canAccessTransactionFormulaMaintenance } from "../../../utils/auth/sidebarPermissions.js";
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/formula_maintenance.css";
import { 
  fetchCompanyPermissions, 
  fetchCompanyPermissionsRaw,
  fetchProcesses,
  fetchAccounts,
  listFormulaTemplates,
  updateFormulaTemplate,
  deleteFormulaTemplates,
  updateSessionCompany,
  isBankOnlyCategoryCompany,
  prepareFormulaRowsForDisplay,
  formulaRowIdsMatch,
  patchFormulaRowAfterSave,
} from "./formulaMaintenanceLogic.js";

// Components
import FormulaMaintenanceFilters from "./components/FormulaMaintenanceFilters.jsx";
import FormulaMaintenanceTable from "./components/FormulaMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";
import PageContentLoader from "../../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

export default function FormulaMaintenancePage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const lang = useLoginLang();
  const m = useMemo(() => MAINTENANCE_I18N[lang] || MAINTENANCE_I18N.en, [lang]);
  const t = useCallback((key, params) => getMaintenanceText(lang, key, params), [lang]);
  const inputMethodOptions = useMemo(() => getFormulaInputMethodOptions(lang), [lang]);

  // -- Boot State --
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // -- Filter State --
  const [companyId, setCompanyId] = useState(null);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [activePermission, setActivePermission] = useState("");
  const [processes, setProcesses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  
  // -- Data State --
  const [formulaData, setFormulaData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  // -- UI State --
  const [toasts, setToasts] = useState([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const toastTimerRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const formulaDataFullRef = useRef([]);
  const progressiveRafRef = useRef(null);
  const searchSeqRef = useRef(0);
  const listScrollActiveRef = useRef(false);
  const companyIdRef = useRef(null);
  const initialFormulaSearchDoneRef = useRef(false);
  const suppressNextSearchEffectRef = useRef(false);
  const followGroupRef = useRef(() => {});

  const [totalRowCount, setTotalRowCount] = useState(0);
  const [listHydrating, setListHydrating] = useState(false);
  const [listSyncing, setListSyncing] = useState(false);
  const [selectAllActive, setSelectAllActive] = useState(false);
  const [deselectedIds, setDeselectedIds] = useState(() => new Set());

  const INITIAL_DISPLAY_ROWS = 80;
  const DISPLAY_BATCH_ROWS = 150;
  const LARGE_RESULT_TOAST_THRESHOLD = 800;

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

  const { guardWrite, mutationsBlocked } = usePartnershipAuditWriteGuard(me, notify);

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page", "maintenance-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

    // Force native page scrolling even when legacy dashboard CSS locks viewport.
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

    removeOtherMaintenanceStylesheets("formula_maintenance.css");

    const ensureStylesheetLast = (href) => {
      const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`);
      if (existing) {
        document.head.appendChild(existing);
        return;
      }
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    };

    const links = [
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&display=swap",
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css",
    ];

    links.forEach(ensureStylesheetLast);

    return () => {
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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (progressiveRafRef.current) cancelAnimationFrame(progressiveRafRef.current);
    };
  }, []);

  const resetSelection = useCallback(() => {
    setSelectAllActive(false);
    setDeselectedIds(new Set());
    setSelectedIds([]);
  }, []);

  const clearFormulaList = useCallback(() => {
    if (progressiveRafRef.current) {
      cancelAnimationFrame(progressiveRafRef.current);
      progressiveRafRef.current = null;
    }
    formulaDataFullRef.current = [];
    setTotalRowCount(0);
    setFormulaData([]);
    setListHydrating(false);
    setListSyncing(false);
    resetSelection();
  }, [resetSelection]);

  /** 先展示前 N 行，其余用 rAF 分批追加，避免一次性渲染卡住 UI */
  const hydrateFormulaList = useCallback(
    (fullList, options = {}) => {
      const { ensureRowId = null } = options;
      if (progressiveRafRef.current) {
        cancelAnimationFrame(progressiveRafRef.current);
        progressiveRafRef.current = null;
      }

      const full = prepareFormulaRowsForDisplay(Array.isArray(fullList) ? fullList : []);
      formulaDataFullRef.current = full;
      setTotalRowCount(full.length);
      resetSelection();

      const applySlice = (count, defer = true) => {
        const next = full.slice(0, count);
        if (defer) {
          startTransition(() => setFormulaData(next));
        } else {
          setFormulaData(next);
        }
      };

      let firstSliceEnd = INITIAL_DISPLAY_ROWS;
      if (ensureRowId != null) {
        const anchorIdx = full.findIndex((r) => formulaRowIdsMatch(r.id, ensureRowId));
        if (anchorIdx >= 0) {
          applySlice(full.length, false);
          setListHydrating(false);
          return;
        }
      }

      if (full.length <= firstSliceEnd) {
        applySlice(full.length, false);
        setListHydrating(false);
        return;
      }

      applySlice(firstSliceEnd, false);
      setListHydrating(true);

      let end = firstSliceEnd;
      const tick = () => {
        if (listScrollActiveRef.current) {
          progressiveRafRef.current = requestAnimationFrame(tick);
          return;
        }
        end = Math.min(end + DISPLAY_BATCH_ROWS, full.length);
        applySlice(end);
        if (end < full.length) {
          progressiveRafRef.current = requestAnimationFrame(tick);
        } else {
          setListHydrating(false);
          progressiveRafRef.current = null;
        }
      };
      progressiveRafRef.current = requestAnimationFrame(tick);
    },
    [resetSelection],
  );

  // -- Boot Logic --
  useEffect(() => {
    if (!sessionReady || !me) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        const u = me;

        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }

        if (!canAccessTransactionFormulaMaintenance(u)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        const rows = Array.isArray(compJson?.data) ? compJson.data : [];
        setCompanies(rows);

        let initialCompanyId = u.company_id ? Number(u.company_id) : (rows[0]?.id ? Number(rows[0].id) : null);
        setCompanyId(initialCompanyId);
        
        const currentComp = rows.find(c => Number(c.id) === initialCompanyId);
        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          // Pre-load metadata to ensure first search is correct and avoid double-query
          const [rawPerms, procList, accList] = await Promise.all([
            fetchCompanyPermissionsRaw(code),
            fetchProcesses(initialCompanyId),
            fetchAccounts(initialCompanyId)
          ]);

          const hasGames = rawPerms.includes("Games") || rawPerms.includes("Gambling");
          const bankOnly = rawPerms.includes("Bank") && !hasGames;
          if (bankOnly) {
            navigate("/process-list", { replace: true });
            return;
          }
          if (!hasGames) {
            navigate("/dashboard", { replace: true });
            return;
          }

          const permList = rawPerms.filter(p => p !== 'Bank');
          setPermissions(permList);
          setProcesses(procList);
          setAccounts(accList);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive = savedPerm && permList.includes(savedPerm) ? savedPerm : (permList.length > 0 ? permList[0] : "");
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
  }, [sessionReady, navigate, me]);

  // -- Load Meta Data --
  useEffect(() => {
    if (bootLoading || !companyId) return;

    (async () => {
      try {
        const [permList, procList, accList] = await Promise.all([
          fetchCompanyPermissions(companyCode),
          fetchProcesses(companyId),
          fetchAccounts(companyId)
        ]);
        setPermissions(permList);
        setProcesses(procList);
        setAccounts(accList);
        
        const savedPerm = localStorage.getItem(`selectedPermission_${companyCode}`);
        if (savedPerm && permList.includes(savedPerm)) {
          setActivePermission(savedPerm);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }
      } catch (err) {
        notify(t("failedLoadCompanyMetadata"), "error");
      }
    })();
  }, [bootLoading, companyId, companyCode, notify]);

  // -- Search Logic --
  /** 首次整表 Loading；之后（切换公司等）listSyncing 保留旧表直至新数据返回 */
  const [scrollRestoreRowId, setScrollRestoreRowId] = useState(null);

  const performSearch = useCallback(async (overrides = {}) => {
    const { companyId: overrideCompanyId, scrollRestoreRowId: restoreRowId = null } = overrides;
    const effectiveCompanyId = overrideCompanyId ?? companyId;
    if (!effectiveCompanyId || selectedProcess === null) return;

    const searchCompanyId = Number(effectiveCompanyId);
    const quietRefresh = initialFormulaSearchDoneRef.current;
    const seq = ++searchSeqRef.current;

    if (progressiveRafRef.current) {
      cancelAnimationFrame(progressiveRafRef.current);
      progressiveRafRef.current = null;
    }

    if (!quietRefresh) {
      setLoading(true);
      setListHydrating(false);
    } else {
      setLoading(false);
      setListSyncing(true);
    }

    try {
      const data = await listFormulaTemplates({
        companyId: searchCompanyId,
        category: activePermission,
        process: selectedProcess,
        search: searchFilter,
      });
      if (seq !== searchSeqRef.current) return;
      if (searchCompanyId !== Number(companyIdRef.current)) return;

      setConfirmDelete(false);
      hydrateFormulaList(data, { ensureRowId: restoreRowId });

      if (!quietRefresh) {
        if (data.length === 0) {
          notify(t("noDataAdjustSearch"), "info");
        } else if (data.length <= LARGE_RESULT_TOAST_THRESHOLD) {
          notify(t("foundRecords", { n: data.length }), "success");
        }
      }
    } catch (err) {
      if (seq !== searchSeqRef.current) return;
      if (searchCompanyId !== Number(companyIdRef.current)) return;
      notify(err.message, "error");
      formulaDataFullRef.current = [];
      setTotalRowCount(0);
      setFormulaData([]);
      resetSelection();
    } finally {
      initialFormulaSearchDoneRef.current = true;
      if (seq === searchSeqRef.current) {
        setLoading(false);
        setListSyncing(false);
      }
    }
  }, [
    companyId,
    activePermission,
    selectedProcess,
    searchFilter,
    notify,
    t,
    hydrateFormulaList,
    resetSelection,
  ]);

  useEffect(() => {
    companyIdRef.current = companyId;
  }, [companyId]);

  // Debounced search — only after user picks a process or Select All
  useEffect(() => {
    if (!bootLoading && companyId && selectedProcess !== null) {
      if (suppressNextSearchEffectRef.current) {
        suppressNextSearchEffectRef.current = false;
        return;
      }
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        performSearch();
      }, 300);
    }
  }, [bootLoading, companyId, searchFilter, selectedProcess, performSearch]);

  // -- Handlers --
  const handleSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    const nextId = Number(c.id);
    try {
      await updateSessionCompany(c.id);
      const perms = await fetchCompanyPermissionsRaw(c.company_id || "");
      if (isBankOnlyCategoryCompany(perms)) {
        navigate("/process-list", { replace: true });
        return;
      }

      suppressNextSearchEffectRef.current = true;
      companyIdRef.current = nextId;
      setCompanyId(nextId);
      setCompanyCode(c.company_id || "");

      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      setSelectedGroup(newGroup);
      if (newGroup) sessionStorage.setItem("dashboard_group_filter", newGroup);
      else sessionStorage.removeItem("dashboard_group_filter");
      followGroupRef.current();

      setSearchFilter("");
      setSelectedProcess(null);
      clearFormulaList();

      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: c.company_id }), "success");
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
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
    startTransition(() => {
      setActivePermission(p);
    });
    localStorage.setItem(`selectedPermission_${companyCode}`, p);
    setSearchFilter("");
    setSelectedProcess(null);
    clearFormulaList();
    setConfirmDelete(false);
  };

  const handleSetSelectedProcess = useCallback((value) => {
    startTransition(() => {
      setSelectedProcess(value);
    });
  }, []);

  const handleClearFilters = () => {
    setSearchFilter("");
    setSelectedProcess(null);
    clearFormulaList();
  };

  const isRowSelected = useCallback(
    (id) => {
      if (selectAllActive) return !deselectedIds.has(id);
      return selectedIds.includes(id);
    },
    [selectAllActive, deselectedIds, selectedIds],
  );

  const resolveSelectedIds = useCallback(() => {
    const full = formulaDataFullRef.current;
    if (selectAllActive) {
      if (deselectedIds.size === 0) return full.map((r) => r.id);
      return full.filter((r) => !deselectedIds.has(r.id)).map((r) => r.id);
    }
    return selectedIds;
  }, [selectAllActive, deselectedIds, selectedIds]);

  const selectedCount = useMemo(() => {
    if (selectAllActive) return totalRowCount - deselectedIds.size;
    return selectedIds.length;
  }, [selectAllActive, totalRowCount, deselectedIds.size, selectedIds.length]);

  const selectAllChecked = useMemo(() => {
    if (totalRowCount === 0) return false;
    if (selectAllActive) return deselectedIds.size === 0;
    return selectedIds.length === totalRowCount;
  }, [selectAllActive, deselectedIds.size, selectedIds.length, totalRowCount]);

  const selectAllIndeterminate = useMemo(() => {
    if (totalRowCount === 0) return false;
    if (selectAllActive) return deselectedIds.size > 0 && deselectedIds.size < totalRowCount;
    return selectedIds.length > 0 && selectedIds.length < totalRowCount;
  }, [selectAllActive, deselectedIds.size, selectedIds.length, totalRowCount]);

  const toggleSelect = useCallback(
    (id) => {
      startTransition(() => {
        if (selectAllActive) {
          setDeselectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        } else {
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
        }
      });
    },
    [selectAllActive],
  );

  const handleListScrolling = useCallback((scrolling) => {
    listScrollActiveRef.current = scrolling;
  }, []);

  const toggleSelectAll = useCallback(() => {
    startTransition(() => {
      if (selectAllChecked && !selectAllIndeterminate) {
        setSelectAllActive(false);
        setDeselectedIds(new Set());
        setSelectedIds([]);
        return;
      }
      setSelectAllActive(true);
      setDeselectedIds(new Set());
      setSelectedIds([]);
    });
  }, [selectAllChecked, selectAllIndeterminate]);

  const handleDeleteClick = () => {
    if (guardWrite()) return;
    if (selectedCount === 0) {
      notify(t("pleaseSelectOneRecord"), "error");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (guardWrite()) return;
    setIsDeleteModalOpen(false);
    const idsToDelete = resolveSelectedIds();
    try {
      await deleteFormulaTemplates(companyId, idsToDelete);
      notify(t("successfullyDeletedN", { n: idsToDelete.length }), "success");
      performSearch();
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  const handleSaveRow = async (id, editForm) => {
    if (guardWrite()) return;
    try {
      const payload = {
        template_id: id,
        company_id: companyId,
        ...editForm,
      };
      const serverData = await updateFormulaTemplate(payload);
      notify(t("updateSuccessful"), "success");

      const account = accounts.find((a) => formulaRowIdsMatch(a.id, editForm.account_id));
      const accountLabel = account?.display_text ?? "";
      const patchOpts = { id, editForm, accountLabel, serverData };
      const mergeRow = (row) => patchFormulaRowAfterSave(row, patchOpts);

      formulaDataFullRef.current = formulaDataFullRef.current.map(mergeRow);
      setFormulaData((prev) => prev.map(mergeRow));
      return true;
    } catch (err) {
      notify(err.message || t("saveFailed"), "error");
      return false;
    }
  };

  const handleScrollRestoreComplete = useCallback(() => {
    setScrollRestoreRowId(null);
  }, []);

  if (bootLoading || !me) return <PageContentLoader />;

  return (
    <div className="formula-maintenance-page-root container">
      <div className="maintenance-header">
        <h1 id="maintenance-page-title">{m.pageTitleFormula}</h1>
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

      <FormulaMaintenanceFilters 
        processes={processes}
        selectedProcess={selectedProcess}
        setSelectedProcess={handleSetSelectedProcess}
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        companyId={companyId}
        groupFilterKind={groupFilterKind}
        snapGroupIds={snapGroupIds}
        visibleCompanies={visibleCompanies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onPickAllGroups={handlePickAllGroups}
        onSwitchCompany={handleSwitchCompany}
        onClearFilters={handleClearFilters}
        selectedIds={selectedIds}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        onDelete={handleDeleteClick}
        m={m}
      />

      <div className="formula-maintenance-table-region">
        {listSyncing && (
          <div className="formula-maintenance-sync-track" aria-hidden>
            <div className="formula-maintenance-sync-bar" />
          </div>
        )}
      <FormulaMaintenanceTable
        data={formulaData}
        loading={loading}
        listSyncing={listSyncing}
        listHydrating={listHydrating}
        totalRowCount={totalRowCount}
        isRowSelected={isRowSelected}
        selectAllChecked={selectAllChecked}
        selectAllIndeterminate={selectAllIndeterminate}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onSaveRow={handleSaveRow}
        onListScrolling={handleListScrolling}
        scrollRestoreRowId={scrollRestoreRowId}
        onScrollRestoreComplete={handleScrollRestoreComplete}
        accounts={accounts}
        m={m}
        inputMethodOptions={inputMethodOptions}
        awaitingProcessSelection={selectedProcess === null}
      />
      </div>

      {/* Modal & Notifications */}
      <MaintenanceDeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        count={selectedCount}
        t={t}
      />

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
