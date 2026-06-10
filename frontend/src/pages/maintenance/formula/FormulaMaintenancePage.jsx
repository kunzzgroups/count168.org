import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLoginLang } from "../../../utils/i18n/useLoginLang.js";
import { getMaintenanceText, MAINTENANCE_I18N, getFormulaInputMethodOptions } from "../../../translateFile/pages/maintenanceTranslate.js";
import { useNavigate, useLocation } from "react-router-dom";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { canAccessTransactionFormulaMaintenance } from "../../../utils/auth/sidebarPermissions.js";
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { removeOtherMaintenanceStylesheets } from "../../../utils/maintenance/maintenanceStylesheets.js";
import { useMaintenanceGroupCompanyFilter } from "../shared/useMaintenanceGroupCompanyFilter.js";
import { runMaintenanceCompanySwitch } from "../shared/maintenanceCompanySwitch.js";
import { useMaintenanceBankOnlyGuard } from "../shared/useMaintenanceBankOnlyGuard.js";
import { useMaintenancePageScrollLock } from "../shared/useMaintenancePageScrollLock.js";
import {
  isMaintenanceGroupOnlyBoot,
  isMaintenanceSessionGroupEntityBoot,
  shouldSkipMaintenanceCategoryGuard,
} from "../shared/maintenanceGroupBoot.js";
import { canUseGroupOnlyMode } from "../../../utils/company/loginScope.js";
import {
  companiesInGroupList,
  companiesNativeInGroupList,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readPersistedDashboardGcFilter,
  readDashboardSelectedCompanyId,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  DASHBOARD_GROUP_FILTER_KEY,
  DASHBOARD_GROUP_FILTER_OPT_OUT_KEY,
} from "../../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../../utils/company/useGroupAnchorSessionSync.js";
import { fetchOwnerCompaniesAll } from "../../../utils/company/sharedCompanyFilter.js";
import "../../../../public/css/accountCSS.css";
import "../../../../public/css/userlist.css";
import "../../../../public/css/maintenance_unified_filters.css";
import "../../../../public/css/transaction.css";
import "../../../../public/css/customer_report.css";
import "../../../../public/css/report-outlined-fields.css";
import "../../../../public/css/formula_maintenance.css";
import {
  bootstrapFormulaMaintenanceMeta,
  fetchCompanyPermissions,
  fetchCompanyPermissionsRaw,
  fetchProcesses,
  fetchAccounts,
  listFormulaTemplates,
  updateFormulaTemplate,
  deleteFormulaTemplates,
  updateSessionCompany,
  prepareFormulaRowsForDisplay,
  formulaRowIdsMatch,
  patchFormulaRowAfterSave,
} from "./formulaMaintenanceLogic.js";
import {
  formulaMaintenanceEffectiveCompanyId,
  formulaMaintenanceScopeCacheCompanyKey,
  formulaMaintenanceScopeCacheKey,
  formulaMaintenanceScopeIsReady,
  formulaMaintenanceUsesGroupProcesses,
  resolveFormulaMaintenanceScope,
} from "./formulaMaintenanceScope.js";

// Components
import FormulaMaintenanceFilters from "./components/FormulaMaintenanceFilters.jsx";
import FormulaMaintenanceTable from "./components/FormulaMaintenanceTable.jsx";
import MaintenanceDeleteConfirmModal from "../shared/MaintenanceDeleteConfirmModal.jsx";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

function readInitialMaintenanceSelectedGroup() {
  try {
    const saved = sessionStorage.getItem(DASHBOARD_GROUP_FILTER_KEY);
    return saved ? String(saved).trim().toUpperCase() : null;
  } catch {
    return null;
  }
}

function readInitialMaintenanceCompanyId() {
  const persisted = readPersistedDashboardGcFilter();
  if (isDashboardGroupOnlyMode() || persisted.groupOnly) return null;
  const saved = readDashboardSelectedCompanyId();
  if (saved != null) return saved;
  if (persisted.selectedGroup) return null;
  return null;
}

export default function FormulaMaintenancePage() {
  const navigate = useNavigate();
  const location = useLocation();
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
  useMaintenanceBankOnlyGuard(companyId);
  const [companyCode, setCompanyCode] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [activePermission, setActivePermission] = useState("");
  const [processes, setProcesses] = useState([]);
  const [accounts, setAccounts] = useState([]);
  
  // -- Data State --
  const [formulaData, setFormulaData] = useState([]);
  const [formulaDataSourceCompanyId, setFormulaDataSourceCompanyId] = useState(null);
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
  const scopeKeyRef = useRef("");
  const initialFormulaSearchDoneRef = useRef(false);
  const suppressNextSearchEffectRef = useRef(false);
  const followGroupRef = useRef(() => {});
  const switchCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});
  const onClearCompanyRef = useRef(() => {});

  const {
    snapGroupIds,
    visibleCompanies,
    handleGroupClick,
    handlePickCompany,
    handlePickAllGroups,
    handlePickAllInGroup,
    groupsAllMode,
    groupAllMode,
    allowClearCompany,
  } = useMaintenanceGroupCompanyFilter({
    companies,
    companyId,
    selectedGroup,
    setSelectedGroup,
    switchCompany: (c) => switchCompanyRef.current(c),
    onPrepareCompanySelect: (c) => onPrepareCompanySelectRef.current(c),
    onClearCompany: (...args) => onClearCompanyRef.current(...args),
    pillCategory: "games",
  });

  const formulaScope = useMemo(
    () =>
      resolveFormulaMaintenanceScope({
        companies,
        selectedGroup,
        companyId,
        groupsAllMode,
        groupAllMode,
      }),
    [companies, selectedGroup, companyId, groupsAllMode, groupAllMode],
  );

  const formulaScopeKey = useMemo(
    () => formulaMaintenanceScopeCacheKey(formulaScope),
    [formulaScope],
  );

  const listQueryEnabled =
    !bootLoading && formulaMaintenanceScopeIsReady(formulaScope) && selectedProcess !== null;

  useGroupAnchorSessionSync({
    companies,
    selectedGroup,
    companyId,
    sessionCompanyId: me?.company_id,
    enabled: true,
  });

  useEffect(() => {
    scopeKeyRef.current = formulaScopeKey;
  }, [formulaScopeKey]);

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
  useMaintenancePageScrollLock();

  // -- Initialization --
  useEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "datacapture-page", "transaction-page", "maintenance-page");
    document.body.classList.add("dashboard-page", "maintenance-page");

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

  useEffect(() => {
    const handleSwitch = (e) => {
      const data = e?.detail;
      if (!data || typeof data !== "object") return;
      if (isDashboardGroupOnlyMode()) return;
      const nextId = Number(data.company_id ?? data.companyId);
      if (!Number.isFinite(nextId) || nextId <= 0) return;
      if (nextId === Number(companyIdRef.current)) return;
      const nextCode = String(data.company_code ?? data.companyCode ?? "").trim();
      companyIdRef.current = nextId;
      setCompanyId(nextId);
      if (nextCode) setCompanyCode(nextCode);
      resetSelection();
    };
    window.addEventListener("eazycount:company-session-updated", handleSwitch);
    return () => window.removeEventListener("eazycount:company-session-updated", handleSwitch);
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

        const rows = await fetchOwnerCompaniesAll();
        if (cancelled) return;
        setCompanies(rows);

        const groupFilterOptOut =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(DASHBOARD_GROUP_FILTER_OPT_OUT_KEY) === "1";
        const initialUiCompanyId = readInitialMaintenanceCompanyId();
        let initialCompanyId = resolveBootCompanyId({
          sessionCompanyId: u.company_id,
          defaultRowId: rows[0]?.id,
        });
        if (groupFilterOptOut && initialUiCompanyId != null) {
          initialCompanyId = initialUiCompanyId;
        } else if (groupFilterOptOut && initialCompanyId == null) {
          initialCompanyId = null;
        } else if (!groupFilterOptOut && (isDashboardGroupOnlyMode() || readPersistedDashboardGcFilter().groupOnly)) {
          initialCompanyId = null;
        } else if (initialUiCompanyId != null) {
          initialCompanyId = initialUiCompanyId;
        }
        const currentComp =
          initialCompanyId != null
            ? rows.find((c) => Number(c.id) === initialCompanyId)
            : null;
        const bootGroup = groupFilterOptOut
          ? null
          : resolveInitialSelectedGroupFromSession(rows, currentComp, u);
        setSelectedGroup(bootGroup);
        const persistedGc = readPersistedDashboardGcFilter();
        const sessionGroup = readInitialMaintenanceSelectedGroup();
        let groupOnlyBoot = isMaintenanceGroupOnlyBoot({
          groupFilterOptOut,
          sessionGroup: bootGroup ?? sessionGroup,
          initialUiCompanyId,
          persistedGc,
        });
        if (
          !groupOnlyBoot &&
          !groupFilterOptOut &&
          (isMaintenanceSessionGroupEntityBoot(currentComp, u) ||
            (bootGroup && initialUiCompanyId == null && canUseGroupOnlyMode(u, bootGroup)))
        ) {
          groupOnlyBoot = true;
        }
        if (groupOnlyBoot) {
          persistDashboardGroupOnlyMode(true);
          persistDashboardSelectedCompany(null);
          setCompanyId(null);
          setCompanyCode("");
          companyIdRef.current = null;
          const effectiveGroup = bootGroup ?? sessionGroup;
          const bootScope = resolveFormulaMaintenanceScope({
            companies: rows,
            selectedGroup: effectiveGroup,
            companyId: null,
            groupsAllMode: false,
            groupAllMode: false,
          });
          const meta = await bootstrapFormulaMaintenanceMeta({
            companies: rows,
            groupId: effectiveGroup,
          });
          if (cancelled) return;
          let procList = [];
          try {
            procList = bootScope ? await fetchProcesses(null, bootScope) : [];
          } catch (procErr) {
            console.error("Group process list load error:", procErr);
            notify(procErr.message || t("failedLoadProcesses"), "error");
          }
          setPermissions(meta.permissions);
          setActivePermission(meta.activePermission);
          setProcesses(procList);
          if (bootScope?.scopeCompanyId) {
            try {
              setAccounts(await fetchAccounts(bootScope.scopeCompanyId, bootScope));
            } catch (accErr) {
              console.error("Group accounts load error:", accErr);
              setAccounts([]);
            }
          } else {
            setAccounts([]);
          }
          if (effectiveGroup) sessionStorage.setItem("dashboard_group_filter", effectiveGroup);
          return;
        }
        setCompanyId(initialCompanyId);
        companyIdRef.current = initialCompanyId;

        if (currentComp) {
          const code = currentComp.company_id || "";
          setCompanyCode(code);

          const bootScope = resolveFormulaMaintenanceScope({
            companies: rows,
            selectedGroup: bootGroup,
            companyId: initialCompanyId,
          });

          const [rawPerms, procList, accList] = await Promise.all([
            fetchCompanyPermissionsRaw(code),
            fetchProcesses(initialCompanyId, bootScope),
            fetchAccounts(initialCompanyId, bootScope),
          ]);

          if (cancelled) return;

          const skipCategoryGuard = shouldSkipMaintenanceCategoryGuard({
            groupOnlyBoot,
            scope: bootScope,
            me: u,
            selectedGroup: bootGroup,
            companyRow: currentComp,
            companyId: initialCompanyId,
          });
          if (!skipCategoryGuard) {
            const hasGames = rawPerms.includes("Games") || rawPerms.includes("Gambling");
            const bankOnly = rawPerms.includes("Bank") && !hasGames;
            if (bankOnly) {
              navigate("/dashboard", { replace: true });
              return;
            }
            if (!hasGames) {
              navigate("/dashboard", { replace: true });
              return;
            }
          }

          const permList = rawPerms.filter((p) => p !== "Bank");
          setPermissions(permList);
          setProcesses(procList);
          setAccounts(accList);

          const savedPerm = localStorage.getItem(`selectedPermission_${code}`);
          const initialActive =
            savedPerm && permList.includes(savedPerm) ? savedPerm : permList.length > 0 ? permList[0] : "";
          setActivePermission(initialActive);

          if (bootGroup) sessionStorage.setItem("dashboard_group_filter", bootGroup);
        }

      } catch (err) {
        console.error("Boot error:", err);
        if (!cancelled) {
          notify(err.message || t("failedLoadProcesses"), "error");
        }
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
    if (bootLoading || !formulaMaintenanceScopeIsReady(formulaScope)) return;

    let cancelled = false;
    const scope = formulaScope;
    const permCode =
      companyCode ||
      (selectedGroup ? companiesNativeInGroupList(companies, selectedGroup)[0]?.company_id : "") ||
      "";
    const accountCompanyId = scope?.scopeCompanyId ?? companyId;

    (async () => {
      try {
        const [permList, procList, accList] = await Promise.all([
          permCode ? fetchCompanyPermissions(permCode) : Promise.resolve([]),
          fetchProcesses(companyId, scope),
          accountCompanyId ? fetchAccounts(accountCompanyId, scope) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setPermissions(permList);
        setProcesses(procList);
        setAccounts(accList);

        const savedPerm = permCode ? localStorage.getItem(`selectedPermission_${permCode}`) : null;
        if (savedPerm && permList.includes(savedPerm)) {
          setActivePermission(savedPerm);
        } else if (permList.length > 0) {
          setActivePermission(permList[0]);
        }

        setSelectedProcess((prev) => {
          if (prev === null) return prev;
          if (prev === "") return prev;
          const ids = procList.map((p) => String(p.id));
          return ids.includes(String(prev)) ? prev : null;
        });
      } catch (err) {
        if (!cancelled) notify(t("failedLoadCompanyMetadata"), "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootLoading, formulaScope, companyId, companyCode, selectedGroup, companies, notify, t]);

  // -- Search Logic --
  /** 首次整表 Loading；之后（切换公司等）listSyncing 保留旧表直至新数据返回 */
  const [scrollRestoreRowId, setScrollRestoreRowId] = useState(null);

  const removeFormulaRowsLocally = useCallback(
    (idsToRemove) => {
      const idSet = new Set((Array.isArray(idsToRemove) ? idsToRemove : []).map((id) => Number(id)));
      if (idSet.size === 0) return;
      const remaining = formulaDataFullRef.current.filter((row) => !idSet.has(Number(row.id)));
      hydrateFormulaList(remaining);
    },
    [hydrateFormulaList],
  );

  const performSearch = useCallback(async (overrides = {}) => {
    const { scrollRestoreRowId: restoreRowId = null, skipStaleGuard = false } = overrides;
    const effectiveScope =
      overrides.scope ??
      resolveFormulaMaintenanceScope({
        companies,
        selectedGroup: overrides.selectedGroup ?? selectedGroup,
        companyId: overrides.companyId ?? companyId,
        groupsAllMode,
        groupAllMode,
      });
    if (!formulaMaintenanceScopeIsReady(effectiveScope) || selectedProcess === null) return;

    const searchScopeKey = formulaMaintenanceScopeCacheKey(effectiveScope);
    const searchCompanyId = Number(effectiveScope.scopeCompanyId);
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
        process: selectedProcess === "" ? undefined : selectedProcess,
        scope: effectiveScope,
      });
      if (!skipStaleGuard && seq !== searchSeqRef.current) return;
      if (!skipStaleGuard && searchScopeKey !== scopeKeyRef.current) return;

      setConfirmDelete(false);
      setFormulaDataSourceCompanyId(formulaMaintenanceScopeCacheCompanyKey(effectiveScope));
      hydrateFormulaList(data, { ensureRowId: restoreRowId });

      if (!quietRefresh) {
        if (data.length === 0) {
          notify(t("noDataAdjustSearch"), "info");
        } else if (data.length <= LARGE_RESULT_TOAST_THRESHOLD) {
          notify(t("foundRecords", { n: data.length }), "success");
        }
      }
    } catch (err) {
      if (!skipStaleGuard && seq !== searchSeqRef.current) return;
      if (!skipStaleGuard && searchScopeKey !== scopeKeyRef.current) return;
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
    companies,
    selectedGroup,
    companyId,
    groupsAllMode,
    groupAllMode,
    activePermission,
    selectedProcess,
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
    if (!listQueryEnabled) return;
    if (suppressNextSearchEffectRef.current) {
      suppressNextSearchEffectRef.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      performSearch();
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [listQueryEnabled, formulaScopeKey, activePermission, selectedProcess, performSearch]);

  // -- Handlers --
  const handleClearCompany = useCallback(
    (groupForPersist) => {
      const g = groupForPersist ?? selectedGroup;
      companyIdRef.current = null;
      setCompanyId(null);
      setCompanyCode("");
      setSelectedProcess(null);
      clearFormulaList();
      persistDashboardFilterState(g, null);
      void (async () => {
        try {
          const scope = resolveFormulaMaintenanceScope({
            companies,
            selectedGroup: g,
            companyId: null,
            groupsAllMode,
            groupAllMode,
          });
          const meta = await bootstrapFormulaMaintenanceMeta({ companies, groupId: g });
          const procList = scope ? await fetchProcesses(null, scope) : [];
          setPermissions(meta.permissions);
          setActivePermission(meta.activePermission);
          setProcesses(procList);
          if (scope?.scopeCompanyId) {
            setAccounts(await fetchAccounts(scope.scopeCompanyId, scope));
          } else {
            setAccounts([]);
          }
        } catch (err) {
          console.error("Meta bootstrap after clear company:", err);
        }
      })();
    },
    [companies, selectedGroup, clearFormulaList],
  );

  const onPrepareCompanySelect = useCallback(
    (c) => {
      if (!c?.id) return;
      const nextId = Number(c.id);
      const newGroup = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const nextScope = resolveFormulaMaintenanceScope({
        companies,
        selectedGroup: newGroup,
        companyId: nextId,
        groupsAllMode,
        groupAllMode,
      });
      suppressNextSearchEffectRef.current = true;
      companyIdRef.current = nextId;
      setCompanyId(nextId);
      setCompanyCode(c.company_id || "");
      setSelectedGroup(newGroup);
      persistDashboardFilterState(newGroup, nextId);
      followGroupRef.current();
      resetSelection();
      void performSearch({ companyId: nextId, selectedGroup: newGroup, scope: nextScope });
    },
    [companies, groupAllMode, groupsAllMode, performSearch, resetSelection],
  );

  onPrepareCompanySelectRef.current = onPrepareCompanySelect;

  const handleSwitchCompany = async (c) => {
    if (!c?.id) return;
    try {
      const { redirected } = await runMaintenanceCompanySwitch({
        companyRow: c,
        viewGroup: c.group_id ? String(c.group_id).toUpperCase().trim() : null,
        currentPath: location.pathname,
        navigate,
        updateSessionCompany,
        onStay: async () => {
          notify(t("switchedTo", { company: c.company_id }), "success");
        },
      });
      if (redirected) return;
    } catch (err) {
      notify(err.message || t("switchFailed"), "error");
    }
  };

  switchCompanyRef.current = handleSwitchCompany;
  onClearCompanyRef.current = handleClearCompany;

  followGroupRef.current = () => {};

  const handlePermissionSwitch = (p) => {
    startTransition(() => {
      setActivePermission(p);
    });
    const permCode =
      companyCode ||
      (selectedGroup ? companiesNativeInGroupList(companies, selectedGroup)[0]?.company_id : "") ||
      "";
    if (permCode) localStorage.setItem(`selectedPermission_${permCode}`, p);
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
    if (idsToDelete.length === 0) return;
    try {
      const effectiveCompanyId = formulaMaintenanceEffectiveCompanyId(formulaScope, companyId);
      await deleteFormulaTemplates(effectiveCompanyId, idsToDelete, formulaScope);
      removeFormulaRowsLocally(idsToDelete);
      setConfirmDelete(false);
      notify(t("successfullyDeletedN", { n: idsToDelete.length }), "success");
      void performSearch({ scope: formulaScope, skipStaleGuard: true });
    } catch (err) {
      notify(err.message || t("deleteFailed"), "error");
    }
  };

  const handleSaveRow = async (id, editForm) => {
    if (guardWrite()) return;
    try {
      const effectiveCompanyId = formulaMaintenanceEffectiveCompanyId(formulaScope, companyId);
      const payload = {
        template_id: id,
        ...(effectiveCompanyId != null ? { company_id: effectiveCompanyId } : {}),
        account_id: editForm.account_id,
        source_columns: editForm.source_ref ?? "",
        source_percent: editForm.source_percent ?? "",
        input_method: editForm.input_method ?? "",
        formula: editForm.formula ?? "",
        description: editForm.description ?? "",
      };
      const serverData = await updateFormulaTemplate(payload, formulaScope);
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

  const tableLoading = loading || bootLoading;

  return (
    <div className="formula-maintenance-page-root container">
      {permissions.length > 1 ? (
      <div className="maintenance-header">
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
      </div>
      ) : null}

      <FormulaMaintenanceFilters 
        processes={processes}
        selectedProcess={selectedProcess}
        setSelectedProcess={handleSetSelectedProcess}
        companyId={companyId}
        snapGroupIds={snapGroupIds}
        visibleCompanies={visibleCompanies}
        selectedGroup={selectedGroup}
        onGroupClick={handleGroupClick}
        onPickCompany={handlePickCompany}
        onClearCompany={handleClearCompany}
        allowClearCompany={allowClearCompany}
        onPickAllGroups={handlePickAllGroups}
        onPickAllInGroup={handlePickAllInGroup}
        groupsAllMode={groupsAllMode}
        groupAllMode={groupAllMode}
        onClearFilters={handleClearFilters}
        deleteDisabled={selectedCount === 0}
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
        key={`${formulaScopeKey}:${formulaDataSourceCompanyId ?? "no-scope"}`}
        data={formulaData}
        loading={tableLoading}
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
