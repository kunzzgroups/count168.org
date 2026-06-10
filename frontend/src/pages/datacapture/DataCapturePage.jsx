import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { injectStylesheet } from "../../utils/core/injectStylesheet.js";
import {
  companiesInGroupList,
  companyBelongsToGroup,
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  isExplicitCompanySelection,
  normalizeOwnerCompanyRow,
  isDashboardGroupOnlyMode,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  notifyDashboardGroupFilterChanged,
  persistDashboardGroupOnlyMode,
  persistDashboardSelectedCompany,
  readDashboardSelectedCompanyId,
  readPersistedDashboardGcFilter,
  resolveBootCompanyId,
  resolveInitialSelectedGroupFromSession,
  filterCompaniesForLoginScope,
  fetchOwnerCompaniesAll,
} from "../../utils/company/sharedCompanyFilter.js";
import { filterCompaniesForGamesPills } from "../../utils/company/companyCategoryFlags.js";
import { syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import { canUseGroupOnlyMode, isGroupLogin } from "../../utils/company/loginScope.js";
import { useGcFilterWithAllModes } from "../../utils/company/useGcFilterWithAllModes.js";
import GcInlineFilterPanel from "../../components/GcInlineFilterPanel.jsx";

import "../../../public/css/userlist.css";
import "../../../public/css/global-13inch.css";
import "../../../public/css/datacapture.css";

import {
  formatGroupSubmittedProcessLabel,
  formatSubmittedProcessDateTime,
} from "./lib/dataCaptureApi.js";
import { readCaptureSessionMeta } from "./lib/dataCaptureStorage.js";
import {
  dataCaptureScopeCacheKey,
  dataCaptureScopeIsReady,
  normalizeGroupCaptureScope,
  resolveDataCaptureScope,
} from "./lib/dataCaptureScope.js";
import { resolveGroupEntityRowFromSnap } from "../transaction/lib/transactionScope.js";
import {
  DATA_CAPTURE_HOME_PATH,
  resolveCompanyGamesAccess,
  sessionUserHasCompanyCategoryAccess,
  sessionUserHasGamblingAccess,
  syncDataCaptureCompanySession,
} from "./lib/dataCaptureCompanyAccess.js";
import {
  getGroupOnlyProcessOptions,
  isGroupOnlyProcessId,
} from "./lib/dataCaptureGroupOnlyProcesses.js";
import DataCaptureContextMenus from "./components/DataCaptureContextMenus.jsx";
import DataCaptureDeleteDialog from "./components/DataCaptureDeleteDialog.jsx";
import DataCaptureTableSection from "./components/DataCaptureTableSection.jsx";
import DescriptionSelectionModal from "./components/DescriptionSelectionModal.jsx";
import ProcessNotificationContainer from "./components/ProcessNotificationContainer.jsx";
import { useDataCaptureCategoryPermissions } from "./hooks/useDataCaptureCategoryPermissions.js";
import { useDataCaptureFormEngine } from "./hooks/useDataCaptureFormEngine.js";
import { useDataCaptureGrid } from "./hooks/useDataCaptureGrid.js";
import { useDataCapturePaste } from "./hooks/useDataCapturePaste.js";
import { useDataCaptureCaptureType } from "./hooks/useDataCaptureCaptureType.js";
import { useDataCaptureFormat } from "./hooks/useDataCaptureFormat.js";
import { useDataCapturePageLifecycle } from "./hooks/useDataCapturePageLifecycle.js";
import { useDataCaptureDeleteDialog } from "./hooks/useDataCaptureDeleteDialog.js";
import { useDataCaptureSubmitReset } from "./hooks/useDataCaptureSubmitReset.js";
import { useGroupOnlyTableDraftAutosave } from "./hooks/useGroupOnlyTableDraftAutosave.js";
import { usePartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { useDataCaptureSubmittedList } from "./hooks/useDataCaptureSubmittedList.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import { getDataCaptureText } from "../../translateFile/pages/dataCaptureTranslate.js";
import { DataCaptureProvider, useDataCaptureContext } from "./context/DataCaptureContext.jsx";
import { callDataCaptureRuntime, getDataCaptureState } from "./lib/dataCaptureRuntime.js";
import { updateActiveContextMenuPosition } from "./lib/dataCaptureContextMenu.js";
import { setTableActive } from "./grid/dataCaptureGridMeta.js";

class DataCaptureErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("DataCaptureErrorBoundary", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      const lang = localStorage.getItem("login_lang") === "zh" ? "zh" : "en";
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div className="container" style={{ padding: "24px" }}>
          <h2 style={{ marginTop: 0 }}>{getDataCaptureText(lang, "renderFailedTitle")}</h2>
          <p style={{ color: "#b91c1c", marginBottom: 12 }} role="alert">
            {msg}
          </p>
          <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
            {getDataCaptureText(lang, "renderFailedHint")}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function DataCapturePageContent() {
  const navigate = useNavigate();
  const { confirmDescriptions, clearSelectedDescriptions } = useDataCaptureContext();
  const [searchParams] = useSearchParams();
  const { me, sessionReady } = useAuthSession();
  const companyIdFromUrl = searchParams.get("company_id");
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getDataCaptureText(lang, key, params), [lang]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "login_lang") setLang(e.newValue === "zh" ? "zh" : "en");
    };
    const onLangUpdated = (e) => {
      const next = e?.detail?.lang;
      setLang(next === "zh" ? "zh" : "en");
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("eazycount:language-updated", onLangUpdated);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("eazycount:language-updated", onLangUpdated);
    };
  }, []);

  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const bootCompletedRef = useRef(false);
  const prevGroupOnlyGroupRef = useRef(null);
  const prevProcessCompanyRef = useRef(undefined);
  const prevScopeKeyRef = useRef(null);
  /** Tracks anchor session sync per group (sidebar flags follow PHP session company). */
  const groupAnchorSessionRef = useRef({ group: null, companyId: null });

  useLayoutEffect(() => {
    window.isNavigatingAwayByBackOrSubmit = false;
  }, []);

  const companiesNormalized = useMemo(() => companies.map(normalizeOwnerCompanyRow), [companies]);

  const companiesDeduped = useMemo(
    () => dedupeOwnerCompaniesByCode(companiesNormalized, companyId),
    [companiesNormalized, companyId]
  );

  /** Full list: deduped strips rows without display code; URL session can still target a valid numeric id. */
  const currentCompanyRow = useMemo(
    () => companiesNormalized.find((c) => Number(c.id) === Number(companyId)) || null,
    [companiesNormalized, companyId]
  );

  const isCompanySelected = useMemo(
    () => isExplicitCompanySelection(companyId, currentCompanyRow, selectedGroup),
    [companyId, currentCompanyRow, selectedGroup]
  );

  const anchorCompanyRow = useMemo(() => {
    if (isCompanySelected) return currentCompanyRow;
    const inGroup = companiesInGroupList(companiesDeduped, selectedGroup);
    return inGroup[0] ?? null;
  }, [isCompanySelected, currentCompanyRow, companiesDeduped, selectedGroup]);

  const groupOnlyTable = !isCompanySelected && canUseGroupOnlyMode(me);

  const onClearCompanyRef = useRef(() => {});
  const onSelectCompanyRef = useRef(async () => {});
  const onPrepareCompanySelectRef = useRef(() => {});

  const {
    groupIds,
    companiesForPicker,
    groupsAllMode,
    groupAllMode,
    handlePickAllGroups,
    handlePickAllInGroup,
    handlePickGroup,
    handlePickCompany,
  } = useGcFilterWithAllModes({
    companies: companiesDeduped,
    companyId,
    selectedGroup,
    setSelectedGroup,
    onPrepareCompanySelect: (comp) => onPrepareCompanySelectRef.current(comp),
    onSelectCompany: (comp) => onSelectCompanyRef.current(comp),
    onClearCompany: (...args) => onClearCompanyRef.current(...args),
    preferredCompanyId: companyId,
    enableGroupAnchorSession: false,
    autoPickCompanyWhenEmpty: false,
    broadcastFilterToLayout: false,
    me,
  });

  const captureScope = useMemo(() => {
    const resolved = resolveDataCaptureScope({
      companies: companiesNormalized,
      selectedGroup,
      companyId,
      groupOnlyMode: groupOnlyTable,
      groupsAllMode,
      groupAllMode,
    });
    if (groupOnlyTable && resolved?.mode === "group") {
      return normalizeGroupCaptureScope(resolved, {
        groupOnlyCapture: true,
        captureSelectedGroup: selectedGroup,
      });
    }
    return resolved;
  }, [
    companiesNormalized,
    selectedGroup,
    companyId,
    groupOnlyTable,
    groupsAllMode,
    groupAllMode,
  ]);

  const scopeCompanyId =
    captureScope?.scopeCompanyId != null && Number(captureScope.scopeCompanyId) > 0
      ? Number(captureScope.scopeCompanyId)
      : null;

  const groupEntityRow = useMemo(
    () =>
      selectedGroup ? resolveGroupEntityRowFromSnap(companiesDeduped, selectedGroup) : null,
    [companiesDeduped, selectedGroup],
  );

  /** API + storage company id (group entity vs subsidiary). */
  const effectiveCompanyId = scopeCompanyId;

  /** PHP session sync: group entity in group-only mode. */
  const sessionSyncCompanyId = isCompanySelected
    ? companyId
    : groupEntityRow?.id ?? anchorCompanyRow?.id ?? null;

  const engineReady = useMemo(
    () => !bootLoading && !!me && dataCaptureScopeIsReady(captureScope),
    [bootLoading, me, captureScope],
  );

  const companyCode = useMemo(() => {
    if (isCompanySelected) {
      const raw = currentCompanyRow?.company_id;
      if (raw != null && String(raw).trim() !== "") return String(raw).trim();
    } else if (groupOnlyTable && selectedGroup) {
      return String(selectedGroup).trim().toUpperCase();
    }
    const raw = anchorCompanyRow?.company_id;
    if (raw != null && String(raw).trim() !== "") return String(raw).trim();
    if (scopeCompanyId != null && Number(scopeCompanyId) > 0) return String(scopeCompanyId);
    return "";
  }, [isCompanySelected, currentCompanyRow, groupOnlyTable, selectedGroup, anchorCompanyRow, scopeCompanyId]);

  const form = useDataCaptureFormEngine(captureScope, {
    applyCompanyOnlyFields: isCompanySelected,
    selectedGroup,
    engineReady,
  });

  const groupOnlyProcessOptions = useMemo(() => getGroupOnlyProcessOptions(t), [t]);

  const { submittedItems, refreshSubmitted } = useDataCaptureSubmittedList(captureScope, form.captureDate);

  const topSectionRef = useRef(null);
  const formColumnRef = useRef(null);

  const { permissions, selectedPermission, selectPermission, showPermissionFilter } =
    useDataCaptureCategoryPermissions(companyCode);

  const {
    captureType,
    citibetMode,
    formatGridReady,
    applyCaptureType,
    handleCaptureTypeChange,
  } = useDataCaptureCaptureType();

  const {
    deleteOpen,
    deleteOption,
    setDeleteOption,
    handleConfirmDelete,
    closeDeleteDialog,
  } = useDataCaptureDeleteDialog();

  const mutationsBlocked = usePartnershipAuditReadOnlyLocked(me);
  const submitReset = useDataCaptureSubmitReset({
    captureScope,
    form,
    captureType,
    mutationsBlocked,
    navigate,
    t,
    requireDescriptions: isCompanySelected,
    groupOnlyCapture: groupOnlyTable,
    selectedGroup,
  });
  const { ensureGridReady } = useDataCaptureGrid(engineReady, groupOnlyTable);
  useGroupOnlyTableDraftAutosave({
    enabled: groupOnlyTable && !mutationsBlocked,
    captureScope,
    selectedGroup,
    selectedProcessId: form.selectedProcess?.id,
    currencyId: form.currencyId,
    captureType,
  });
  useDataCapturePaste();
  useDataCaptureFormat();

  useEffect(() => {
    if (!engineReady) return;

    const pageReadyTimer = setTimeout(() => {
      document.body.classList.add("page-ready");
    }, 50);

    const updateMenuPosition = () => {
      updateActiveContextMenuPosition();
    };

    const scrollContainer = document.querySelector(".excel-table-container");
    scrollContainer?.addEventListener("scroll", updateMenuPosition, { passive: true });
    window.addEventListener("resize", updateMenuPosition);

    return () => {
      clearTimeout(pageReadyTimer);
      scrollContainer?.removeEventListener("scroll", updateMenuPosition);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [engineReady]);
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);

  const openDescriptionModal = useCallback(() => {
    if (!companyId) return;
    setDescriptionModalOpen(true);
  }, [companyId]);

  const closeDescriptionModal = useCallback(() => setDescriptionModalOpen(false), []);

  const handleDescriptionsConfirmed = useCallback((names) => {
    confirmDescriptions(names);
    callDataCaptureRuntime("onDescriptionsConfirmed", names);
    setTimeout(() => {
      callDataCaptureRuntime("recomputeSubmitState");
    }, 0);
    setDescriptionModalOpen(false);
  }, [confirmDescriptions]);

  useEffect(() => {
    if (!form.processOpen) return;
    const onDoc = (e) => {
      const btn = document.getElementById("capture_process");
      const dd = document.getElementById("capture_process_dropdown");
      if (btn?.contains(e.target) || dd?.contains(e.target)) return;
      form.setProcessOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [form.processOpen, form.setProcessOpen]);

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "account-page", "announcement-page", "transaction-page", "process-page");
    document.body.classList.add("dashboard-page", "datacapture-page");
    return () => {
      document.body.classList.remove("datacapture-page", "page-ready");
      document.getElementById("dataCaptureForm")?.removeAttribute("data-dc-page-init");
    };
  }, []);

  useEffect(() => {
    if (!sessionReady || !me) return;
    if (bootCompletedRef.current) return;

    let cancelled = false;
    setBootLoading(true);
    (async () => {
      try {
        await injectStylesheet("https://fonts.googleapis.com/css?family=Amaranth");
      } catch {
        /* ignore */
      }
      try {
        const u = me;
        const raw = filterCompaniesForLoginScope(await fetchOwnerCompaniesAll(), u);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const restoreFromUrl = url.searchParams.get("restore") === "1";
        const submittedFromUrl = url.searchParams.get("submitted") === "1";
        const queryGroupOnly = url.searchParams.get("group_only") === "1";
        const sessionMeta = restoreFromUrl ? readCaptureSessionMeta() : null;
        const allowGroupOnly = canUseGroupOnlyMode(u);
        const persistedGc = readPersistedDashboardGcFilter();
        const savedCompanyId = readDashboardSelectedCompanyId();
        const groupOnlyBoot =
          allowGroupOnly &&
          !queryCompany &&
          (queryGroupOnly ||
            (sessionMeta?.groupOnlyCapture && restoreFromUrl) ||
            (submittedFromUrl && queryGroupOnly) ||
            isDashboardGroupOnlyMode() ||
            persistedGc.groupOnly ||
            (canUseGroupOnlyMode(u) &&
              (isDashboardGroupOnlyMode() || persistedGc.groupOnly || savedCompanyId == null)));

        if (cancelled) return;

        if (groupOnlyBoot) {
          if (!sessionUserHasGamblingAccess(u)) {
            navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
            return;
          }
          if (sessionMeta?.captureSelectedGroup) {
            persistDashboardGroupFilter(sessionMeta.captureSelectedGroup);
          }
          persistDashboardGroupOnlyMode(true);
          persistDashboardSelectedCompany(null);
          setCompanies(raw);
          setCompanyId(null);
          setSelectedGroup(
            (sessionMeta?.captureSelectedGroup &&
              String(sessionMeta.captureSelectedGroup).trim().toUpperCase()) ||
              resolveInitialSelectedGroupFromSession(raw, null)
          );
          return;
        }

        if (!sessionUserHasCompanyCategoryAccess(u)) {
          navigate("/process-list?error=no_permission", { replace: true });
          return;
        }

        let effectiveCompany = resolveBootCompanyId({
          urlCompanyId: queryCompany,
          sessionCompanyId: u.company_id,
          defaultRowId: raw[0]?.id,
        });

        if (queryCompany && effectiveCompany && Number(effectiveCompany) !== Number(u.company_id)) {
          try {
            const syncJson = await syncCompanySessionApi(effectiveCompany);
            if (!syncJson?.success) {
              effectiveCompany = u.company_id ? Number(u.company_id) : effectiveCompany;
            }
          } catch {
            effectiveCompany = u.company_id ? Number(u.company_id) : effectiveCompany;
          }
        }

        const rowForPick = raw.find((c) => Number(c.id) === Number(effectiveCompany)) || null;
        const pickCode =
          rowForPick?.company_id != null && String(rowForPick.company_id).trim() !== ""
            ? String(rowForPick.company_id).trim()
            : effectiveCompany
              ? String(effectiveCompany)
              : "";

        const hasGamesAccess = await resolveCompanyGamesAccess({
          companyId: effectiveCompany,
          companyCode: pickCode,
          sessionUser: u,
        });
        if (cancelled) return;
        if (!hasGamesAccess) {
          navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
          return;
        }

        const initialGroup = resolveInitialSelectedGroupFromSession(raw, rowForPick);

        setCompanies(raw);
        setCompanyId(effectiveCompany);
        setSelectedGroup(initialGroup);
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) {
          setBootLoading(false);
          bootCompletedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, me, navigate]);

  useEffect(() => {
    return () => {
      bootCompletedRef.current = false;
      document.getElementById("dataCaptureForm")?.removeAttribute("data-dc-page-init");
    };
  }, []);

  useEffect(() => {
    if (bootLoading || companies.length === 0) return;
    if (isDashboardGroupOnlyMode()) {
      if (companyIdFromUrl) {
        const params = new URLSearchParams(searchParams);
        params.delete("company_id");
        const qs = params.toString();
        navigate(`/datacapture${qs ? `?${qs}` : ""}`, { replace: true });
      }
      return;
    }
    if (!companyIdFromUrl) return;
    const id = Number(companyIdFromUrl);
    if (!Number.isFinite(id) || id <= 0) return;
    const row = companiesNormalized.find((c) => Number(c.id) === id) || null;
    if (!row) return;
    if (selectedGroup && !companyBelongsToGroup(row, selectedGroup)) {
      navigate("/datacapture", { replace: true });
      return;
    }
    if (
      Number(companyId) === id &&
      isExplicitCompanySelection(companyId, row, selectedGroup)
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      persistDashboardGroupOnlyMode(false);
      persistDashboardSelectedCompany(id);
      try {
        const syncJson = await syncDataCaptureCompanySession(id);
        if (!syncJson.success) return;
        if (syncJson.data?.has_gambling === false) {
          navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
          return;
        }
      } catch {
        return;
      }
      if (!cancelled) {
        setCompanyId(id);
        notifyCompanySessionUpdated();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootLoading, companyIdFromUrl, companies, companiesNormalized, companyId, selectedGroup, navigate]);

  useEffect(() => {
    if (!companyId || !selectedGroup) return;
    if (!currentCompanyRow) return;
    if (companyBelongsToGroup(currentCompanyRow, selectedGroup)) return;
    setCompanyId(null);
    navigate("/datacapture", { replace: true });
    form.clearCompanyOnlyFields?.();
    form.clearProcessSelection?.();
  }, [companyId, selectedGroup, currentCompanyRow, navigate, form.clearCompanyOnlyFields, form.clearProcessSelection]);

  /** Sidebar menu flags follow group/company filter (page-owned broadcast; avoids GC hook auto-pick loop). */
  useLayoutEffect(() => {
    if (bootLoading) return;
    const code =
      currentCompanyRow?.company_id != null && String(currentCompanyRow.company_id).trim() !== ""
        ? String(currentCompanyRow.company_id).trim()
        : null;
    notifyDashboardGroupFilterChanged(selectedGroup, companyId, {
      companyCode: code,
      ignoreGroupOnly: true,
    });
  }, [bootLoading, selectedGroup, companyId, currentCompanyRow?.company_id]);

  /** Group-only UI: sync PHP session to group entity so Summary/API match scope. */
  useEffect(() => {
    if (bootLoading || isCompanySelected || !selectedGroup) return;
    const anchorId =
      sessionSyncCompanyId != null ? Number(sessionSyncCompanyId) : Number.NaN;
    if (!Number.isFinite(anchorId) || anchorId <= 0) return;

    const g = String(selectedGroup).trim().toUpperCase();
    const prev = groupAnchorSessionRef.current;
    if (prev.group === g && prev.companyId === anchorId) return;
    if (me?.company_id != null && Number(me.company_id) === anchorId && prev.group === g) {
      groupAnchorSessionRef.current = { group: g, companyId: anchorId };
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const syncJson = await syncDataCaptureCompanySession(anchorId);
        if (!syncJson.success || cancelled) return;
        if (
          syncJson.data?.has_gambling === false &&
          !sessionUserHasGamblingAccess(me)
        ) {
          navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
          return;
        }
        groupAnchorSessionRef.current = { group: g, companyId: anchorId };
        notifyCompanySessionUpdated();
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootLoading,
    isCompanySelected,
    selectedGroup,
    sessionSyncCompanyId,
    me?.company_id,
    navigate,
  ]);

  useEffect(() => {
    const scopeKey = dataCaptureScopeCacheKey(captureScope);
    const prev = prevScopeKeyRef.current;
    if (prev != null && prev !== scopeKey) {
      callDataCaptureRuntime("clearCaptureTable");
      callDataCaptureRuntime("reactFormReset");
      clearSelectedDescriptions();
      void callDataCaptureRuntime("refreshSubmittedProcesses");
    }
    prevScopeKeyRef.current = scopeKey || null;
  }, [captureScope, clearSelectedDescriptions]);

  const switchCompanySessionAndNavigate = useCallback(async (nextCompanyId) => {
    const id = Number(nextCompanyId);
    if (!id) return;

    try {
      const syncJson = await syncDataCaptureCompanySession(id);
      if (!syncJson.success) return;

      notifyCompanySessionUpdated(syncJson.data ?? null);

      if (syncJson.data?.has_gambling === false) {
        navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
        return;
      }
    } catch {
      navigate(DATA_CAPTURE_HOME_PATH, { replace: true });
      return;
    }

    persistDashboardGroupOnlyMode(false);
    persistDashboardSelectedCompany(id);
    groupAnchorSessionRef.current = {
      group: selectedGroup ? String(selectedGroup).trim().toUpperCase() : null,
      companyId: id,
    };
    setCompanyId(id);
    navigate(`/datacapture?company_id=${encodeURIComponent(id)}`, { replace: true });
  }, [navigate, selectedGroup]);

  const handleClearCompany = useCallback(() => {
    setCompanyId(null);
    groupAnchorSessionRef.current = { group: null, companyId: null };
    navigate("/datacapture", { replace: true });
    form.clearCompanyOnlyFields?.();
    form.clearProcessSelection?.();
  }, [navigate, form.clearCompanyOnlyFields, form.clearProcessSelection]);

  const onPrepareCompanySelect = useCallback(
    (comp) => {
      const id = Number(comp?.id);
      if (!id) return;
      const gid = comp.group_id ? String(comp.group_id).toUpperCase().trim() : null;
      form.clearProcessSelection?.();
      flushSync(() => {
        setCompanyId(id);
        if (gid) setSelectedGroup(gid);
      });
    },
    [form.clearProcessSelection]
  );

  onClearCompanyRef.current = handleClearCompany;
  onPrepareCompanySelectRef.current = onPrepareCompanySelect;
  onSelectCompanyRef.current = async (comp) => {
    if (comp?.id) void switchCompanySessionAndNavigate(comp.id);
  };

  useEffect(() => {
    if (isCompanySelected) return;
    form.clearCompanyOnlyFields?.();
  }, [isCompanySelected, form.clearCompanyOnlyFields]);

  useEffect(() => {
    if (getDataCaptureState().isRestoring) return;
    if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    const id = form.selectedProcess?.id;
    if (!id) return;
    if (!isCompanySelected && !isGroupOnlyProcessId(id)) {
      form.clearProcessSelection();
    } else if (isCompanySelected && isGroupOnlyProcessId(id)) {
      form.clearProcessSelection();
    }
  }, [isCompanySelected, form.selectedProcess?.id, form.clearProcessSelection]);

  useEffect(() => {
    if (bootLoading) return;
    if (getDataCaptureState().isRestoring) return;
    if (new URLSearchParams(window.location.search).get("restore") === "1") return;
    const prev = prevProcessCompanyRef.current;
    if (prev === undefined) {
      prevProcessCompanyRef.current = companyId;
      return;
    }
    if (prev !== companyId) {
      form.clearProcessSelection?.();
      prevProcessCompanyRef.current = companyId;
    }
  }, [bootLoading, companyId, form.clearProcessSelection]);

  useEffect(() => {
    if (isCompanySelected) {
      prevGroupOnlyGroupRef.current = selectedGroup;
      return;
    }
    const prev = prevGroupOnlyGroupRef.current;
    if (prev != null && prev !== selectedGroup) {
      form.clearProcessSelection?.();
      form.clearCompanyOnlyFields?.();
    }
    prevGroupOnlyGroupRef.current = selectedGroup;
  }, [selectedGroup, isCompanySelected, form.clearProcessSelection, form.clearCompanyOnlyFields]);

  useEffect(() => {
    if (bootLoading || !me || !engineReady) return;

    const syncCompanyContext = async () => {
      try {
        await callDataCaptureRuntime("refreshSubmittedProcesses");
      } catch {
        /* ignore */
      }
      callDataCaptureRuntime("recomputeSubmitState");
    };

    void syncCompanyContext();
  }, [bootLoading, me, engineReady]);

  useDataCapturePageLifecycle({
    engineReady,
    groupOnlyGrid: groupOnlyTable,
    submit: submitReset.submit,
    reset: submitReset.reset,
    recomputeSubmitState: submitReset.recomputeSubmitState,
    refreshSubmittedProcesses: refreshSubmitted,
    applyGroupOnlyPersistedForm: () => callDataCaptureRuntime("applyGroupOnlyPersistedForm"),
    applyCaptureType,
    ensureGridReady,
  });

  useEffect(() => {
    if (!engineReady) return;
    submitReset.restoreFromStorage();
  }, [engineReady, submitReset.restoreFromStorage]);

  const list = filterCompaniesForGamesPills(
    filterCompaniesWithDisplayId(companiesForPicker),
    companyId
  );
  const pageShellKey = dataCaptureScopeCacheKey(captureScope) || "pending";

  return (
    <DataCaptureErrorBoundary key={pageShellKey}>
      <div className="container" key={pageShellKey}>
      <div className="dc-page-toolbar">

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div
            id="data-capture-permission-filter"
            className="data-capture-company-filter data-capture-permission-filter-header"
            style={{ display: showPermissionFilter ? "flex" : "none" }}
          >
            <span className="data-capture-company-label">{t("category")}</span>
            <div id="data-capture-permission-buttons" className="data-capture-company-buttons">
              {permissions.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`data-capture-company-btn${selectedPermission === p ? " active" : ""}`.trim()}
                  data-permission={p}
                  onClick={() => selectPermission(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="top-section" ref={topSectionRef}>
        <div className="form-column" ref={formColumnRef}>
          <div className="form-container">
            <form
              id="dataCaptureForm"
              data-ezc-spa="1"
              className={`process-form${isCompanySelected ? "" : " dc-form--group-only"}`.trim()}
              method="POST"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              {(groupIds.length > 0 || list.length > 0) && (
                <div className="user-gc-inline-panel dc-data-capture-gc-panel">
                  <GcInlineFilterPanel
                    embedded
                    t={t}
                    groupIds={groupIds}
                    groupsAllMode={groupsAllMode}
                    selectedGroup={selectedGroup}
                    onPickAllGroups={handlePickAllGroups}
                    onPickGroup={handlePickGroup}
                    companiesForPicker={list}
                    groupAllMode={groupAllMode}
                    pickerCompanyId={companyId}
                    onPickAllInGroup={handlePickAllInGroup}
                    onPickCompany={handlePickCompany}
                  />
                </div>
              )}

              <div className="dc-form-two-col dc-form-two-col--stacked">
                <div className="form-group">
                  <label htmlFor="capture_date">{t("date")}</label>
                  <select id="capture_date" name="capture_date" required value={form.captureDate} onChange={(e) => void form.onDateChange(e)}>
                    {form.dateOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="capture_process">{t("process")}</label>
                  {isCompanySelected ? (
                    <div className="custom-select-wrapper">
                      <button
                        type="button"
                        className={`custom-select-button${form.processOpen ? " open" : ""}`.trim()}
                        id="capture_process"
                        data-placeholder={t("selectProcess")}
                        name="process"
                        {...(form.selectedProcess?.id
                          ? {
                              "data-value": form.selectedProcess.id,
                              "data-process-code": form.selectedProcess.process_id || "",
                              ...(form.selectedProcess.description_name
                                ? { "data-description-name": form.selectedProcess.description_name }
                                : {}),
                            }
                          : {})}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTableActive(false);
                          form.setProcessOpen((o) => !o);
                        }}
                      >
                        {form.selectedProcess?.displayText || t("selectProcess")}
                      </button>
                      <div
                        className={`custom-select-dropdown${form.processOpen ? " show" : ""}`.trim()}
                        id="capture_process_dropdown"
                      >
                        <div className="custom-select-search">
                          <input
                            ref={form.processSearchInputRef}
                            type="text"
                            placeholder={t("searchProcess")}
                            autoComplete="off"
                            value={form.processFilter}
                            onChange={(e) => form.setProcessFilter(e.target.value.toUpperCase())}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                form.setProcessOpen(false);
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                const first = form.filteredProcesses[0];
                                if (first) void form.selectProcessRow(first);
                              }
                            }}
                          />
                        </div>
                        <div className="custom-select-options dc-react-process-options">
                          {form.processListTruncated ? (
                            <div className="custom-select-option custom-select-option--hint" style={{ cursor: "default", opacity: 0.85 }}>
                              {t("typeToSearchProcesses", { count: form.processRowsCount })}
                            </div>
                          ) : null}
                          {form.visibleProcesses.map((row) => (
                            <div
                              key={row.id}
                              role="presentation"
                              className="custom-select-option"
                              onClick={() => void form.selectProcessRow(row)}
                            >
                              {form.displayTextFromProcessRow(row)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <select
                      id="capture_process"
                      name="process"
                      value={form.selectedProcess?.id || ""}
                      onChange={(e) => {
                        const opt = groupOnlyProcessOptions.find((o) => o.id === e.target.value);
                        if (opt) form.selectGroupOnlyProcess(opt);
                        else form.clearProcessSelection();
                      }}
                    >
                      <option value="">{t("selectProcess")}</option>
                      {groupOnlyProcessOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.displayText}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="dc-form-two-col dc-form-two-col--stacked">
                {isCompanySelected ? (
                  <div className="form-group">
                    <label htmlFor="capture_description">{t("description")}</label>
                    <div className="input-with-icon">
                      <input
                        type="text"
                        id="capture_description"
                        name="description"
                        required
                        readOnly
                        placeholder={t("clickToSelectDescriptions")}
                        value={form.descriptionDisplay}
                      />
                      <button
                        type="button"
                        className="add-icon"
                        onClick={() => openDescriptionModal()}
                        title={t("selectDescriptions")}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="form-group">
                  <label htmlFor="capture_currency">{t("currency")}</label>
                  <select
                    id="capture_currency"
                    name="currency"
                    value={form.currencyId}
                    onChange={(e) => {
                      form.setCurrencyId(e.target.value);
                      setTimeout(() => callDataCaptureRuntime("recomputeSubmitState"), 0);
                    }}
                  >
                    <option value="">{t("selectCurrency")}</option>
                    {form.currencies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>

                {!isCompanySelected ? (
                  <div className="form-group">
                    <label htmlFor="capture_remark">{t("remark")}</label>
                    <input
                      type="text"
                      id="capture_remark"
                      name="remark"
                      placeholder={t("enterRemark")}
                      value={form.remark}
                      onChange={(e) => form.setRemark(e.target.value.toUpperCase())}
                    />
                  </div>
                ) : null}
              </div>

              {isCompanySelected ? (
              <div className="dc-form-bottom-block">
                  <div className="form-group replace-word-group dc-replace-word-field">
                    <label htmlFor="capture_replace_word_from">{t("replaceWord")}</label>
                    <div className="replace-word-fields">
                      <input
                        type="text"
                        id="capture_replace_word_from"
                        name="replace_word_from"
                        placeholder={t("oldWord")}
                        value={form.replaceFrom}
                        onChange={(e) => form.setReplaceFrom(e.target.value.toUpperCase())}
                      />
                      <span className="replace-arrow">→</span>
                      <input
                        type="text"
                        id="capture_replace_word_to"
                        name="replace_word_to"
                        placeholder={t("newWord")}
                        value={form.replaceTo}
                        onChange={(e) => form.setReplaceTo(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>

                  <div className="dc-form-remove-remark-grid">
                    <label htmlFor="capture_remove_word" className="dc-remove-remark__label dc-remove-remark__label--rm">
                      {t("removeWord")}
                    </label>
                    <label htmlFor="capture_remark" className="dc-remove-remark__label dc-remove-remark__label--mk">
                      {t("remark")}
                    </label>
                    <input
                      type="text"
                      id="capture_remove_word"
                      name="remove_word"
                      className="dc-remove-remark__input dc-remove-remark__input--rm"
                      placeholder={t("enterWordsToRemove")}
                      value={form.removeWord}
                      onChange={(e) => form.setRemoveWord(e.target.value.toUpperCase())}
                    />
                    <input
                      type="text"
                      id="capture_remark"
                      name="remark"
                      className="dc-remove-remark__input dc-remove-remark__input--mk"
                      placeholder={t("enterRemark")}
                      value={form.remark}
                      onChange={(e) => form.setRemark(e.target.value.toUpperCase())}
                    />
                    <small className="field-help dc-remove-remark__help" style={{ display: "block", marginTop: 0, fontStyle: "italic", color: "#666" }}>
                      {t("removeWordHelp")}
                    </small>
                    <div className="dc-remove-remark__slot" aria-hidden="true" />
                  </div>
              </div>
              ) : null}
            </form>
          </div>
        </div>

        <div className="submitted-column">
          <div className="submitted-container">
            <h2 className="submitted-title">{t("submittedProcesses")}</h2>
            <div className="submitted-list">
              <div className="dc-react-submitted-list">
              {submittedItems.length === 0 ? (
                <div className="no-data">{t("noProcessesSubmitted")}</div>
              ) : (
                submittedItems.map((process, index) => (
                  <div
                    key={
                      process.capture_id != null
                        ? `cap-${process.capture_id}`
                        : process.id != null
                          ? String(process.id)
                          : `sub-${index}-${process.process_code}-${process.created_at || ""}-${process.submitted_by || ""}`
                    }
                    className="submitted-item"
                  >
                    <div className="submitted-details">
                      <div className="detail-row">
                        <strong>
                          {captureScope?.mode === "group"
                            ? formatGroupSubmittedProcessLabel(process)
                            : `${process.process_code}${process.description_name ? ` (${process.description_name})` : ""}`}
                        </strong>
                        <div className="submitted-meta">
                          <span className="submitted-by">{process.submitted_by}</span>
                          <span className="submitted-date">{formatSubmittedProcessDateTime(process)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DataCaptureTableSection
        t={t}
        captureType={captureType}
        citibetMode={citibetMode}
        formatGridReady={formatGridReady}
        hideCaptureTypeSelector={groupOnlyTable}
        groupOnlyTable={groupOnlyTable}
        onCaptureTypeChange={handleCaptureTypeChange}
        submitDisabled={submitReset.submitDisabled || mutationsBlocked}
        isSubmitting={submitReset.isSubmitting}
        onSubmit={() => void submitReset.submit()}
        onReset={submitReset.reset}
        engineReady={engineReady}
      />

      {isCompanySelected ? (
        <DescriptionSelectionModal
          t={t}
          open={descriptionModalOpen}
          onClose={closeDescriptionModal}
          companyId={companyId}
          onConfirm={handleDescriptionsConfirmed}
        />
      ) : null}

      <ProcessNotificationContainer />

      <DataCaptureContextMenus t={t} />

      <DataCaptureDeleteDialog
        t={t}
        open={deleteOpen}
        deleteOption={deleteOption}
        onDeleteOptionChange={setDeleteOption}
        onConfirm={handleConfirmDelete}
        onClose={closeDeleteDialog}
      />
    </div>
    </DataCaptureErrorBoundary>
  );
}

export default function DataCapturePage() {
  return (
    <DataCaptureProvider>
      <DataCapturePageContent />
    </DataCaptureProvider>
  );
}
