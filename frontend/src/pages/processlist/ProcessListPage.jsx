import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { ensureCrossPageCompanySelection, syncCompanySessionApi } from "../../utils/company/companySessionSync.js";
import {
  clearDashboardGroupFilterKeepCompany,
  notifyDashboardGroupFilterChanged,
  persistDashboardFilterState,
  persistDashboardGroupFilter,
  pickDefaultSubsidiaryForGroup,
  resolveCompanyPickWhenSwitchingGroup,
  resolveInitialSelectedGroupFromSession,
  resolveSubsidiaryBootCompanyId,
  fetchOwnerCompaniesAll,
} from "../../utils/company/sharedCompanyFilter.js";
import { findOwnerCompanyById } from "../../utils/company/sharedCompanyFilter.js";
import { useGroupAnchorSessionSync } from "../../utils/company/useGroupAnchorSessionSync.js";
import { isPartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { isBankCategoryCompany } from "../bankprocesslist/lib/bankProcessHelpers.js";
import "../../../public/css/processCSS.css";
import "../../../public/css/processlist.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import {
  PAGE_SIZE,
  EMPTY_FORM,
  normalizeRows,
  dedupeCompanyRowsForSwitcher,
  filterProcessPageCompanyButtons,
  sortProcessTableRows,
  notifyTransactionDataChanged,
  parseRemarkForForm,
  buildEditDescriptionSelection,
  processListCacheHasRows,
} from "./processListHelpers.js";
import {
  fetchGamesProcessListSlice,
  prefetchBankProcessListPayload,
  resolveProcessListRouteCache,
} from "./processRoutePrefetch.js";
import ProcessTable from "./components/ProcessTable.jsx";
import ProcessFormModal from "./components/ProcessFormModal.jsx";
import DescriptionPickerModal from "./components/DescriptionPickerModal.jsx";
import ProcessDeleteConfirmModal from "./components/ProcessDeleteConfirmModal.jsx";
import AddProcessIcon from "./components/AddProcessIcon.jsx";
import { getProcessListText } from "../../translateFile/pages/processListTranslate.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";

function filterSearchInput(raw) {
  return String(raw || "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .toUpperCase();
}

function resolveProcessListCacheKey(companyId, debouncedSearch, showInactive, showAll) {
  return `company:${Number(companyId)}|${String(debouncedSearch || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

function processRowsFingerprint(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "0";
  return rows.map((r) => Number(r.id)).join(",");
}

function ProcessToastStack({ items }) {
  return (
    <div id="processNotificationContainer" className="process-notification-container">
      {items.map((t) => (
        <div
          key={t.id}
          className={`process-notification process-notification-${t.type} ${t.visible ? "show" : ""}`.trim()}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function ProcessListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me: sessionMeFromLayout, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const t = useCallback((key, params) => getProcessListText(lang, key, params), [lang]);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState("processId");
  const [sortDirection, setSortDirection] = useState("asc");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currencies, setCurrencies] = useState([]);
  const [descriptions, setDescriptions] = useState([]);
  const [days, setDays] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toasts, setToasts] = useState([]);
  const [descriptionPickerOpen, setDescriptionPickerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  /** Partnership/Audit read_only 时禁用流程写操作 — synced from layout session */
  const sessionMe = sessionMeFromLayout;
  const fetchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const skipCompanyFetchEffectRef = useRef(false);
  const processListCacheRef = useRef(new Map());
  const processListWarmInflightRef = useRef(new Map());
  const suppressCrossPageSyncRef = useRef(false);
  const onSwitchCompanyRef = useRef(null);
  /** Prevent session refresh from re-running boot and resetting GroupID ALL / follow UI. */
  const processListInitDoneRef = useRef(false);
  const rowsRef = useRef([]);
  const companySessionAbortRef = useRef(null);

  const [existingProcesses, setExistingProcesses] = useState([]);

  const notify = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, visible: false }].slice(-2));
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    });
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 1500);
  }, []);

  // Layout phase (with BankProcessListPage): avoid deferred useEffect cleanup stripping body.process-page after route swap.
  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page", "account-page", "announcement-page");
    document.body.classList.add("process-page");
    return () => {
      document.body.classList.remove("process-page");
      document.body.classList.add("dashboard-page");
    };
  }, []);

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

  useEffect(() => {
    window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(searchDebounceRef.current);
  }, [search]);

  const processMutationsBlocked = useMemo(
    () => isPartnershipAuditReadOnlyLocked(sessionMe),
    [sessionMe]
  );

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const loadFormMeta = useCallback(async (cid) => {
    if (!cid) return;
    try {
      const u = new URL(buildApiUrl("api/processes/addprocess_api.php"));
      u.searchParams.set("company_id", String(cid));
      const formRes = await fetch(u.toString(), { credentials: "include" });
      const formJson = await formRes.json();
      setCurrencies(Array.isArray(formJson?.data?.currencies) ? formJson.data.currencies : formJson?.currencies || []);
      setDescriptions(Array.isArray(formJson?.data?.descriptions) ? formJson.data.descriptions : formJson?.descriptions || []);
      setDays(Array.isArray(formJson?.data?.days) ? formJson.data.days : formJson?.days || []);
      setExistingProcesses(
        Array.isArray(formJson?.data?.existingProcesses) ? formJson.data.existingProcesses : formJson?.existingProcesses || []
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (loading || !companyId || groupFilterKind !== "follow") return;
    if (suppressCrossPageSyncRef.current) return;
    const row = companies.find((c) => Number(c.id) === Number(companyId));
    void ensureCrossPageCompanySelection(companyId, {
      companies,
      selectedGroup,
      companyRow: row,
      sessionCompanyId: sessionMeFromLayout?.company_id,
    });
  }, [loading, companyId, companies, selectedGroup, groupFilterKind, sessionMeFromLayout?.company_id]);

  useEffect(() => {
    if (!sessionReady || !sessionMeFromLayout) return;
    const routePrefetch = location.state?.processListPrefetch;
    if (processListInitDoneRef.current && !routePrefetch) return;
    (async () => {
      let skipLoadingDone = false;
      try {
        const layoutMe = sessionMeFromLayout;
        const prefetchCompanyId = routePrefetch?.companyId ? Number(routePrefetch.companyId) : null;
        const currentUrl = new URL(window.location.href);
        const prefetchQueryCompany = currentUrl.searchParams.get("company_id");

        if (routePrefetch && prefetchCompanyId && (!prefetchQueryCompany || Number(prefetchQueryCompany) === prefetchCompanyId)) {
          const prefetchedCompanies = Array.isArray(routePrefetch.companies) ? routePrefetch.companies : [];
          const prefetchedMeta = routePrefetch.meta || {};
          setCompanies(prefetchedCompanies);
          const prefetchedRow = prefetchedCompanies.find((c) => Number(c.id) === prefetchCompanyId);
          const prefBootGroup = resolveInitialSelectedGroupFromSession(
            prefetchedCompanies,
            prefetchedRow,
            layoutMe,
          );
          const resolvedPrefetchId = resolveSubsidiaryBootCompanyId(prefetchedCompanies, {
            urlCompanyId: prefetchQueryCompany ?? String(prefetchCompanyId),
            sessionCompanyId: layoutMe.company_id,
            selectedGroup: prefBootGroup,
            loginMe: layoutMe,
          });
          setCompanyId(resolvedPrefetchId);
          {
            const pfGfk = routePrefetch.groupFilterKind;
            setGroupFilterKind(pfGfk === "ungrouped" ? "ungrouped" : "follow");
          }

          const normalizedSearch = filterSearchInput(currentUrl.searchParams.get("search") || "");
          setSearch(normalizedSearch);
          setDebouncedSearch(normalizedSearch);

          const showAllChecked = currentUrl.searchParams.has("showAll");
          const showInactiveChecked = !showAllChecked && currentUrl.searchParams.has("showInactive");
          setShowAll(showAllChecked);
          setShowInactive(showInactiveChecked);

          setCurrencies(Array.isArray(prefetchedMeta.currencies) ? prefetchedMeta.currencies : []);
          setDescriptions(Array.isArray(prefetchedMeta.descriptions) ? prefetchedMeta.descriptions : []);
          setDays(Array.isArray(prefetchedMeta.days) ? prefetchedMeta.days : []);
          setExistingProcesses(Array.isArray(prefetchedMeta.existingProcesses) ? prefetchedMeta.existingProcesses : []);

          if (processListCacheHasRows(routePrefetch)) {
            const prefRows = normalizeRows(routePrefetch.rows);
            setRows(prefRows);
            skipNextFetchRef.current = true;
            if (resolvedPrefetchId != null) {
              const cacheKey = resolveProcessListCacheKey(
                resolvedPrefetchId,
                normalizedSearch,
                showInactiveChecked,
                showAllChecked,
              );
              processListCacheRef.current.set(cacheKey, {
                rows: prefRows,
                currencyCodes: Array.isArray(routePrefetch.currencyCodes)
                  ? routePrefetch.currencyCodes
                  : null,
              });
            }
          }
          setSelectedGroup(prefBootGroup);
          const resolvedRow = prefetchedCompanies.find((c) => Number(c.id) === Number(resolvedPrefetchId));
          if (resolvedPrefetchId != null) {
            persistDashboardFilterState(prefBootGroup, resolvedPrefetchId, { allowGroupOnly: false });
          }
          await ensureCrossPageCompanySelection(resolvedPrefetchId, {
            companies: prefetchedCompanies,
            selectedGroup: prefBootGroup,
            companyRow: resolvedRow,
            sessionCompanyId: layoutMe.company_id,
          });
          setLoading(false);
          processListInitDoneRef.current = true;
          return;
        }

        const cs = await fetchOwnerCompaniesAll();
        setCompanies(cs);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        const rowForBoot =
          queryCompany != null && queryCompany !== ""
            ? cs.find((c) => Number(c.id) === Number(queryCompany))
            : cs.find((c) => Number(c.id) === Number(layoutMe.company_id)) || null;
        const bootGroup = resolveInitialSelectedGroupFromSession(cs, rowForBoot, layoutMe);
        let effectiveCompany = resolveSubsidiaryBootCompanyId(cs, {
          urlCompanyId: queryCompany,
          sessionCompanyId: layoutMe.company_id,
          selectedGroup: bootGroup,
          loginMe: layoutMe,
        });

        if (effectiveCompany != null && Number(effectiveCompany) !== Number(layoutMe.company_id)) {
          try {
            const syncJson = await syncCompanySessionApi(effectiveCompany);
            if (!syncJson?.success) {
              effectiveCompany = layoutMe.company_id ? Number(layoutMe.company_id) : effectiveCompany;
            }
          } catch {
            effectiveCompany = layoutMe.company_id ? Number(layoutMe.company_id) : effectiveCompany;
          }
        }

        const currentCompanyRow = cs.find((c) => Number(c.id) === Number(effectiveCompany));
        if (currentCompanyRow?.company_id) {
          const bankCategory = await isBankCategoryCompany(currentCompanyRow.company_id, buildApiUrl);
          if (bankCategory) {
            const warm = await prefetchBankProcessListPayload(effectiveCompany);
            navigate(`/bank-process-list?company_id=${effectiveCompany}`, {
              replace: true,
              state: {
                bankProcessListPrefetch: {
                  companyId: effectiveCompany,
                  companies: cs,
                  groupFilterKind: "follow",
                  rows: warm.rows,
                  currencyCodes: warm.currencyCodes,
                },
              },
            });
            skipLoadingDone = true;
            return;
          }
        }

        setSelectedGroup(bootGroup);
        setCompanyId(effectiveCompany);
        setGroupFilterKind("follow");
        if (effectiveCompany != null) {
          persistDashboardFilterState(bootGroup, effectiveCompany, { allowGroupOnly: false });
        }

        const rawSearch = url.searchParams.get("search") || "";
        const normalizedSearch = filterSearchInput(rawSearch);
        setSearch(normalizedSearch);
        setDebouncedSearch(normalizedSearch);

        const showAllChecked = url.searchParams.has("showAll");
        const showInactiveChecked = !showAllChecked && url.searchParams.has("showInactive");
        setShowAll(showAllChecked);
        setShowInactive(showInactiveChecked);

        void loadFormMeta(effectiveCompany);

        const slice = await resolveProcessListRouteCache(effectiveCompany, {
          search: normalizedSearch,
          showInactive: showInactiveChecked,
          showAll: showAllChecked,
        });
        if (processListCacheHasRows(slice)) {
          const cacheKey = resolveProcessListCacheKey(
            effectiveCompany,
            normalizedSearch,
            showInactiveChecked,
            showAllChecked,
          );
          processListCacheRef.current.set(cacheKey, {
            rows: slice.rows,
            currencyCodes: slice.currencyCodes,
          });
          setRows(slice.rows);
          skipNextFetchRef.current = true;
        }

        processListInitDoneRef.current = true;
      } catch {
        window.location.assign(new URL("/login", window.location.origin).toString());
      } finally {
        if (!skipLoadingDone) setLoading(false);
      }
    })();
  }, [loadFormMeta, location.state, navigate, sessionReady, sessionMeFromLayout?.user_id]);

  const syncUrl = useCallback(
    (overrides = {}) => {
      const url = new URL(window.location.href);
      const cid = overrides.companyId != null ? overrides.companyId : companyId;
      if (cid) url.searchParams.set("company_id", String(cid));
      else url.searchParams.delete("company_id");
      if (debouncedSearch.trim()) url.searchParams.set("search", debouncedSearch.trim());
      else url.searchParams.delete("search");
      if (showInactive) url.searchParams.set("showInactive", "1");
      else url.searchParams.delete("showInactive");
      if (showAll) url.searchParams.set("showAll", "1");
      else url.searchParams.delete("showAll");
      url.searchParams.delete("currency");
      window.history.replaceState({}, document.title, url.toString());
    },
    [companyId, debouncedSearch, showInactive, showAll],
  );

  useEffect(() => {
    if (loading || !companyId) return;
    syncUrl();
  }, [loading, companyId, syncUrl]);

  const applyProcessListCache = useCallback(
    (cid) => {
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return false;
      const cacheKey = resolveProcessListCacheKey(id, debouncedSearch, showInactive, showAll);
      const cached = processListCacheRef.current.get(cacheKey);
      if (!processListCacheHasRows(cached)) return false;
      setRows((prev) =>
        processRowsFingerprint(prev) === processRowsFingerprint(cached.rows) ? prev : cached.rows,
      );
      return true;
    },
    [debouncedSearch, showInactive, showAll],
  );

  const warmProcessListCompanyCache = useCallback(
    (cid) => {
      const id = Number(cid);
      if (!Number.isFinite(id) || id <= 0) return;
      const cacheKey = resolveProcessListCacheKey(id, debouncedSearch, showInactive, showAll);
      if (processListCacheRef.current.has(cacheKey) || processListWarmInflightRef.current.has(cacheKey)) {
        return;
      }
      const ac = new AbortController();
      processListWarmInflightRef.current.set(cacheKey, ac);
      void (async () => {
        try {
          const slice = await fetchGamesProcessListSlice(id, {
            search: debouncedSearch,
            showInactive,
            showAll,
            signal: ac.signal,
          });
          if (ac.signal.aborted || !slice.rows) return;
          processListCacheRef.current.set(cacheKey, {
            rows: slice.rows,
            currencyCodes: slice.currencyCodes,
          });
        } catch {
          /* ignore warm failures */
        } finally {
          if (processListWarmInflightRef.current.get(cacheKey) === ac) {
            processListWarmInflightRef.current.delete(cacheKey);
          }
        }
      })();
    },
    [debouncedSearch, showInactive, showAll],
  );

  const fetchRows = useCallback(
    async (opts = {}) => {
      const silent = !!opts.silent;
      const cid = opts.companyId != null ? Number(opts.companyId) : Number(companyId);
      if (!Number.isFinite(cid) || cid <= 0) return;
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const ac = new AbortController();
      fetchAbortRef.current = ac;
      try {
        const slice = await fetchGamesProcessListSlice(cid, {
          search: debouncedSearch,
          showInactive,
          showAll,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!slice.rows) {
          if (!silent) notify(t("failedLoadProcessList"), "danger");
          return;
        }
        const nextRows = slice.rows;
        const cacheKey = resolveProcessListCacheKey(cid, debouncedSearch, showInactive, showAll);
        processListCacheRef.current.set(cacheKey, {
          rows: nextRows,
          currencyCodes: slice.currencyCodes,
        });
        setRows((prev) => {
          if (silent && processRowsFingerprint(prev) === processRowsFingerprint(nextRows)) {
            return prev;
          }
          return nextRows;
        });
        if (!silent) {
          setSelectedIds(new Set());
          setCurrentPage(1);
          syncUrl({ companyId: cid });
        }
      } catch (err) {
        if (ac.signal.aborted || err?.name === "AbortError") return;
        if (!silent) notify(t("failedLoadProcessList"), "danger");
      }
    },
    [
      companyId,
      debouncedSearch,
      showInactive,
      showAll,
      notify,
      syncUrl,
      t,
    ],
  );

  useEffect(() => {
    if (loading || !companyId) return;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (skipCompanyFetchEffectRef.current) {
      skipCompanyFetchEffectRef.current = false;
      return;
    }
    void fetchRows({ silent: rowsRef.current.length > 0 });
  }, [loading, companyId, debouncedSearch, showInactive, showAll, fetchRows]);

  const reloadDescriptions = async () => {
    if (!companyId) return;
    try {
      const u = new URL(buildApiUrl("api/processes/addprocess_api.php"));
      u.searchParams.set("company_id", String(companyId));
      const formRes = await fetch(u.toString(), { credentials: "include" });
      const formJson = await formRes.json();
      setDescriptions(Array.isArray(formJson?.data?.descriptions) ? formJson.data.descriptions : formJson?.descriptions || []);
    } catch {
      /* ignore */
    }
  };

  /** @returns {Promise<{ id: number|string, name: string }|null>} */
  const handleAddDescription = async (descName) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return null;
    }
    const normalizedName = String(descName || "").trim().toUpperCase();
    if (!normalizedName) return null;
    try {
      const fd = new FormData();
      fd.append("action", "add_description");
      fd.append("description_name", normalizedName);
      if (companyId) fd.append("company_id", String(companyId));
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json?.data?.duplicate || String(json?.message || json?.error || "").includes("already exists")) {
          notify(t("descExists"), "danger");
        } else {
          notify(json.message || json.error || t("failedAddDescription"), "danger");
        }
        return null;
      }
      notify(t("descAdded"), "success");
      await reloadDescriptions();
      const newId = json?.data?.description_id ?? json?.description_id;
      return newId != null ? { id: newId, name: normalizedName } : null;
    } catch {
      notify(t("failedAddDescription"), "danger");
      return null;
    }
  };

  const handleDeleteDescription = async (descId) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("action", "delete_description");
      fd.append("description_id", String(descId));
      if (companyId) fd.append("company_id", String(companyId));
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("failedDeleteDescription"), "danger");
        return;
      }
      notify(t("descDeleted"), "success");
      await reloadDescriptions();
      setForm((prev) => ({
        ...prev,
        selected_descriptions: prev.selected_descriptions.filter((d) => String(d.id) !== String(descId)),
      }));
    } catch {
      notify(t("failedDeleteDescription"), "danger");
    }
  };

  useEffect(() => {
    if (showAll) document.body.classList.add("process-page--show-all");
    else document.body.classList.remove("process-page--show-all");
    return () => document.body.classList.remove("process-page--show-all");
  }, [showAll]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!modalOpen && !descriptionPickerOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (descriptionPickerOpen) setDescriptionPickerOpen(false);
      else setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, descriptionPickerOpen]);

  const pickerCompanyId = companyId;

  const allCompanyButtons = useMemo(
    () => dedupeCompanyRowsForSwitcher(companies, pickerCompanyId),
    [companies, pickerCompanyId]
  );
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean))].sort(),
    [allCompanyButtons]
  );
  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(pickerCompanyId)) || null,
    [allCompanyButtons, pickerCompanyId]
  );
  const selectedGroupKey = useMemo(() => {
    if (groupFilterKind !== "follow") return "";
    if (selectedGroup) return String(selectedGroup).trim().toUpperCase();
    return String(selectedCompany?.group_id || "").trim().toUpperCase();
  }, [groupFilterKind, selectedGroup, selectedCompany?.group_id]);

  useGroupAnchorSessionSync({
    companies,
    selectedGroup: groupFilterKind === "follow" ? selectedGroup : null,
    companyId: groupFilterKind === "follow" ? companyId : null,
    sessionCompanyId: sessionMeFromLayout?.company_id,
  });

  useLayoutEffect(() => {
    if (loading) return;
    notifyDashboardGroupFilterChanged(
      groupFilterKind === "follow" ? selectedGroup : null,
      groupFilterKind === "follow" ? companyId : null
    );
  }, [loading, groupFilterKind, selectedGroup, companyId]);

  // Process routes always require a company when a group pill is active.
  useLayoutEffect(() => {
    if (loading || groupFilterKind !== "follow" || !selectedGroup || companyId != null) return;
    const pick = pickDefaultSubsidiaryForGroup(companies, selectedGroup, {
      me: sessionMe,
      preferredCompanyId: sessionMeFromLayout?.company_id,
    });
    if (!pick?.id) return;
    const nextId = Number(pick.id);
    skipCompanyFetchEffectRef.current = applyProcessListCache(nextId);
    suppressCrossPageSyncRef.current = true;
    flushSync(() => setCompanyId(nextId));
    persistDashboardFilterState(selectedGroup, nextId, { allowGroupOnly: false });
    notifyDashboardGroupFilterChanged(selectedGroup, nextId, { companyCode: pick.company_id });
    void onSwitchCompanyRef.current?.(pick, { layoutSilent: true });
  }, [
    loading,
    groupFilterKind,
    selectedGroup,
    companyId,
    companies,
    sessionMe,
    sessionMeFromLayout?.company_id,
    applyProcessListCache,
  ]);
  const companyButtons = useMemo(
    () =>
      filterProcessPageCompanyButtons(allCompanyButtons, {
        groupFilterKind,
        groupIds,
        selectedGroupKey,
        pillCategory: "games",
        preferredCompanyId: pickerCompanyId,
      }),
    [allCompanyButtons, groupIds, selectedGroupKey, groupFilterKind, pickerCompanyId]
  );

  const sortedDisplayRows = useMemo(
    () => sortProcessTableRows(rows, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedDisplayRows.length / PAGE_SIZE)), [sortedDisplayRows]);
  const pageRows = useMemo(() => {
    if (showAll) return sortedDisplayRows;
    const page = Math.min(currentPage, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    return sortedDisplayRows.slice(start, start + PAGE_SIZE);
  }, [sortedDisplayRows, currentPage, totalPages, showAll]);

  const handleProcessTableSort = useCallback((column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
    setCurrentPage(1);
  }, [sortColumn]);

  const toggleSelectAll = useCallback(
    (checked) => {
      const deletable = pageRows.filter(
        (r) => String(r.status || "").toLowerCase() === "inactive" && !r.has_transactions
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) deletable.forEach((r) => next.add(r.id));
        else deletable.forEach((r) => next.delete(r.id));
        return next;
      });
    },
    [pageRows]
  );

  const onSwitchCompany = useCallback(
    async (company, { layoutSilent = false } = {}) => {
      const nextId = Number(company?.id);
      if (!nextId) return;

      suppressCrossPageSyncRef.current = true;
      try {
        const sessionCompanyId =
          sessionMeFromLayout?.company_id != null ? Number(sessionMeFromLayout.company_id) : null;

        const bankCategoryPromise = isBankCategoryCompany(company.company_id, buildApiUrl);
        void loadFormMeta(nextId);

        try {
          const bankCategory = await bankCategoryPromise;
          if (bankCategory) {
            const warm = await prefetchBankProcessListPayload(nextId);
            navigate(`/bank-process-list?company_id=${nextId}`, {
              replace: true,
              state: {
                bankProcessListPrefetch: {
                  companyId: nextId,
                  companies,
                  groupFilterKind: "follow",
                  rows: warm.rows,
                  currencyCodes: warm.currencyCodes,
                },
              },
            });
            return;
          }
        } catch {
          /* fall through to session sync */
        }

        const runFetch = () => void fetchRows({ companyId: nextId, silent: true });

        if (sessionCompanyId === nextId) {
          runFetch();
          return;
        }

        const previousCompanyId = Number(companyId) === nextId ? sessionCompanyId : companyId;
        companySessionAbortRef.current?.abort();
        const sessionAc = new AbortController();
        companySessionAbortRef.current = sessionAc;

        try {
          const res = await fetch(
            buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextId}`),
            { credentials: "include", signal: sessionAc.signal },
          );
          const json = await res.json();
          if (sessionAc.signal.aborted) return;
          if (!res.ok || !json.success) {
            const reason = json?.data?.reason;
            if (reason === "expired" || reason === "no_set") {
              if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
                skipCompanyFetchEffectRef.current = true;
                flushSync(() => {
                  setCompanyId(previousCompanyId);
                  applyProcessListCache(previousCompanyId);
                });
                void fetchRows({ companyId: previousCompanyId, silent: true });
              }
              setExpirationCompanies([
                { company_id: company.company_id, expiration_date: company.expiration_date ?? null },
              ]);
              return;
            }
            if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
              skipCompanyFetchEffectRef.current = true;
              flushSync(() => {
                setCompanyId(previousCompanyId);
                applyProcessListCache(previousCompanyId);
              });
              void fetchRows({ companyId: previousCompanyId, silent: true });
            }
            notify(json.message || json.error || t("switchCompanyFailed"), "danger");
            return;
          }
          notifyCompanySessionUpdated(json.data ?? null);
          runFetch();
        } catch {
          if (sessionAc.signal.aborted) return;
          if (previousCompanyId != null && Number(previousCompanyId) !== nextId) {
            skipCompanyFetchEffectRef.current = true;
            flushSync(() => {
              setCompanyId(previousCompanyId);
              applyProcessListCache(previousCompanyId);
            });
            void fetchRows({ companyId: previousCompanyId, silent: true });
          }
          notify(t("switchCompanyFailed"), "danger");
        } finally {
          if (companySessionAbortRef.current === sessionAc) {
            companySessionAbortRef.current = null;
          }
        }
      } finally {
        suppressCrossPageSyncRef.current = false;
      }
    },
    [
      applyProcessListCache,
      companies,
      companyId,
      fetchRows,
      loadFormMeta,
      navigate,
      notify,
      selectedGroup,
      sessionMeFromLayout,
      t,
    ],
  );

  onSwitchCompanyRef.current = onSwitchCompany;

  const onPickCompanyPill = useCallback(
    (c) => {
      const nextId = Number(c?.id);
      if (!nextId || Number(companyId) === nextId) return;

      const gid = c.group_id ? String(c.group_id).toUpperCase().trim() : null;
      const nextGroup = gid || null;

      skipCompanyFetchEffectRef.current = true;
      suppressCrossPageSyncRef.current = true;

      const hadCache = applyProcessListCache(nextId);
      flushSync(() => {
        setGroupFilterKind("follow");
        if (nextGroup) setSelectedGroup(nextGroup);
        setCompanyId(nextId);
        if (!hadCache) {
          setRows([]);
          setSelectedIds(new Set());
        }
      });

      syncUrl({ companyId: nextId });

      if (nextGroup) persistDashboardGroupFilter(nextGroup);
      persistDashboardFilterState(nextGroup, nextId);
      notifyDashboardGroupFilterChanged(nextGroup, nextId, {
        companyCode: c.company_id,
      });

      void onSwitchCompanyRef.current?.(c, { layoutSilent: true });
    },
    [applyProcessListCache, companyId, syncUrl],
  );

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      // Process list is company-scoped: re-click active group hides the group row (ungrouped).
      if (groupFilterKind === "follow" && g === selectedGroupKey && companyId != null) {
        setGroupFilterKind("ungrouped");
        setSelectedGroup(null);
        clearDashboardGroupFilterKeepCompany(companyId);
        return;
      }

      const pick =
        resolveCompanyPickWhenSwitchingGroup(companies, g, companyId) ??
        pickDefaultSubsidiaryForGroup(companies, g, { me: sessionMe, preferredCompanyId: companyId });
      const nextCompanyId = pick?.id != null ? Number(pick.id) : null;

      setGroupFilterKind("follow");
      setSelectedGroup(g);
      persistDashboardGroupFilter(g);

      if (nextCompanyId != null) {
        skipCompanyFetchEffectRef.current = true;
        suppressCrossPageSyncRef.current = true;
        const hadCache = applyProcessListCache(nextCompanyId);
        flushSync(() => {
          setCompanyId(nextCompanyId);
          if (!hadCache) {
            setRows([]);
            setSelectedIds(new Set());
          }
        });
        persistDashboardFilterState(g, nextCompanyId, { allowGroupOnly: false });
        notifyDashboardGroupFilterChanged(g, nextCompanyId, {
          companyCode: pick.company_id,
        });
        void onSwitchCompanyRef.current?.(pick, { layoutSilent: true });
        return;
      }

      if (companyId != null) {
        persistDashboardFilterState(g, companyId, { allowGroupOnly: false });
        const row = findOwnerCompanyById(companyId);
        notifyDashboardGroupFilterChanged(g, companyId, {
          companyCode: row?.company_id,
        });
      }
    },
    [
      applyProcessListCache,
      companies,
      companyId,
      groupFilterKind,
      selectedGroupKey,
      sessionMe,
    ],
  );

  const openAdd = () => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    setEditMode(false);
    setForm({ ...EMPTY_FORM, existingProcesses });
    setDescriptionPickerOpen(false);
    setModalOpen(true);
  };

  const confirmDescriptionSelection = (selectedDescriptions) => {
    setForm((prev) => ({ ...prev, selected_descriptions: selectedDescriptions }));
    setDescriptionPickerOpen(false);
  };

  const openEdit = async (id) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(id));
      url.searchParams.set("permission", "Games");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        notify(json.message || json.error || t("failedLoadProcess"), "danger");
        return;
      }
      const p = json.data;

      let currencyId = String(p.currency_id || "");
      if (currencyId) {
        const exists = currencies.some((c) => String(c.id) === currencyId);
        if (!exists) {
          if (p.currency_warning) notify(t("currencyWarningNoCompany"), "danger");
          currencyId = "";
        }
      }
      if (!currencyId && p.currency_code) {
        const code = String(p.currency_code).toUpperCase();
        const matchingOption = currencies.find((opt) => String(opt.code || "").toUpperCase() === code);
        if (matchingOption) {
          currencyId = String(matchingOption.id);
        } else if (p.currency_warning) {
          notify(t("currencyWarningWithCode", { code }), "danger");
        }
      }

      const dtsModified = p.dts_modified || "";
      const dtsCreated = p.dts_created || "";
      let displayModifiedDate = "";
      let displayModifiedBy = "";
      if (dtsModified && dtsModified !== dtsCreated) {
        displayModifiedDate = dtsModified;
        displayModifiedBy = p.modified_by || "";
      }

      const selectedDescriptions = buildEditDescriptionSelection(p, descriptions);

      setEditMode(true);
      setForm({
        id: String(p.id || ""),
        process_name: p.process_name || "",
        selected_descriptions: selectedDescriptions,
        currency_id: currencyId,
        day_use: String(p.day_use || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        remove_word: p.remove_word || "",
        replace_word_from: p.replace_word_from || "",
        replace_word_to: p.replace_word_to || "",
        remark: parseRemarkForForm(p.remarks),
        status: p.status || "active",
        dts_modified: dtsModified,
        modified_by: p.modified_by || "",
        dts_created: dtsCreated,
        created_by: p.created_by || "",
        dts_modified_display: displayModifiedDate,
        dts_modified_user_display: displayModifiedBy,
        currency_warning: p.currency_warning || null,
        existingProcesses,
      });
      setDescriptionPickerOpen(false);
      setModalOpen(true);
    } catch {
      notify(t("failedLoadProcess"), "danger");
    }
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!form.selected_descriptions || form.selected_descriptions.length === 0) {
      notify(t("needAtLeastOneDescription"), "danger");
      return;
    }
    if (!form.currency_id) {
      notify(t("selectCurrency"), "danger");
      return;
    }

    if (!editMode) {
      if (!form.is_multi_process && (!form.process_name || !String(form.process_name).trim())) {
        notify(t("needProcessIdOrMulti"), "danger");
        return;
      }
      if (form.is_multi_process && (!form.selected_processes || form.selected_processes.length === 0)) {
        notify(t("needOneMultiProcess"), "danger");
        return;
      }
    }

    const fd = new FormData();
    if (editMode) {
      fd.append("id", form.id);
      fd.append("process_name", form.process_name);
      fd.append("status", form.status || "active");
      const names = form.selected_descriptions.map((d) => d.name).filter(Boolean);
      fd.append("selected_descriptions", JSON.stringify(names.length ? names : [form.selected_descriptions[0].name]));
      fd.append("description", form.selected_descriptions[0].name);
      fd.append("day_use", form.day_use.join(","));
      fd.append("remove_word", form.remove_word || "");
      fd.append("replace_word_from", form.replace_word_from || "");
      fd.append("replace_word_to", form.replace_word_to || "");
      fd.append("remark", form.remark || "");
      fd.append("currency_id", form.currency_id);
      try {
        const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=update_process"), {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          notify(json.message || json.error || t("updateFailed"), "danger");
          return;
        }
        notify(json.message || t("processUpdated"), "success");
        notifyTransactionDataChanged("processlist-react");
        setModalOpen(false);
        fetchRows();
      } catch {
        notify(t("updateFailed"), "danger");
      }
      return;
    }

    if (form.is_multi_process && form.selected_processes?.length > 0) {
      fd.append("selected_processes", JSON.stringify(form.selected_processes));
    } else {
      fd.append("process_id", form.process_name);
    }
    fd.append("selected_descriptions", JSON.stringify(form.selected_descriptions.map((d) => d.name)));
    fd.append("currency_id", form.currency_id);
    fd.append("day_use", form.day_use.join(","));
    fd.append("remove_word", form.remove_word || "");
    fd.append("replace_word_from", form.replace_word_from || "");
    fd.append("replace_word_to", form.replace_word_to || "");
    fd.append("remark", form.remark || "");
    if (form.copy_from) fd.append("copy_from", form.copy_from);
    fd.append("permission", "Games");
    if (companyId) fd.append("company_id", String(companyId));

    try {
      const res = await fetch(buildApiUrl("api/processes/addprocess_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("createFailed"), "danger");
        return;
      }
      let message = json.message || t("processAdded");
      const d = json.data;
      if (d && typeof d === "object") {
        if (d.copy_from_used && Number(d.source_templates_found) === 0) message += ` (${t("copyNoTemplates")})`;
        if (d.copy_from_used && d.sync_source_set) message += ` [${t("copySyncEnabled")}]`;
        else if (d.copy_from_used && !d.sync_source_set) message += ` (${t("copySyncNotSet")})`;
        if (Array.isArray(d.errors) && d.errors.length > 0) {
          message += `. ${t("processSkippedConflicts", { count: d.errors.length })}`;
        }
      }
      notify(message, "success");
      notifyTransactionDataChanged("processlist-react");
      setModalOpen(false);
      fetchRows();
    } catch {
      notify(t("createFailed"), "danger");
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!selectedIds.size) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProcesses = async () => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      setDeleteConfirmOpen(false);
      return;
    }
    if (!selectedIds.size) {
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Games" }),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("deleteFailed"), "danger");
        return;
      }
      const n = json?.data?.deleted ?? selectedIds.size;
      notify(n === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: n }), "success");
      notifyTransactionDataChanged("processlist-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      fetchRows();
    } catch {
      notify(t("deleteFailed"), "danger");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const toggleStatus = async (row) => {
    if (processMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!row?.id) return;
    try {
      const fd = new FormData();
      fd.append("id", String(row.id));
      fd.append("permission", "Games");
      const res = await fetch(buildApiUrl("api/processes/toggle_process_status_api.php"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("statusUpdateFailed"), "danger");
        return;
      }
      const newStatus = String(json?.data?.newStatus || "").toLowerCase();
      if (!newStatus) {
        notifyTransactionDataChanged("processlist-react");
        fetchRows();
        return;
      }

      const shouldShow = showAll ? true : showInactive ? newStatus === "inactive" : newStatus === "active";

      if (!shouldShow) {
        setRows((prev) => prev.filter((r) => Number(r.id) !== Number(row.id)));
      } else {
        setRows((prev) => prev.map((r) => (Number(r.id) === Number(row.id) ? { ...r, status: newStatus } : r)));
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (newStatus === "active") next.delete(row.id);
        return next;
      });

      const statusText = newStatus === "active" ? t("activated") : t("deactivated");
      notify(t("statusChangedTo", { status: statusText }), "success");
      notifyTransactionDataChanged("processlist-react");
    } catch {
      notify(t("statusUpdateFailed"), "danger");
    }
  };

  const onSearchChange = (e) => {
    setSearch(filterSearchInput(e.target.value));
  };

  return (
    <div className="container">
      <div className="content" style={showAll ? { height: "auto", overflow: "visible" } : undefined}>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-add" disabled={processMutationsBlocked} onClick={openAdd}>
                <AddProcessIcon />
                {t("addProcess")}
              </button>
              <div className="search-container userlist-search-bar">
                <span className="userlist-search-bar__icon" aria-hidden="true">
                  <svg fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                </span>
                <input
                  type="text"
                  className="search-input userlist-search-input"
                  placeholder={t("search")}
                  value={search}
                  onChange={onSearchChange}
                />
              </div>
              <div className="userlist-filter-chips" role="group">
                <button
                  type="button"
                  className={`user-filter-chip${showInactive && !showAll ? " is-selected" : ""}`}
                  aria-pressed={showInactive && !showAll}
                  onClick={() => {
                    if (showInactive && !showAll) setShowInactive(false);
                    else {
                      setShowInactive(true);
                      setShowAll(false);
                    }
                  }}
                >
                  <span className="user-filter-chip__dot" aria-hidden>
                    {showInactive && !showAll ? (
                      <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 12l4 4 8-8" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="user-filter-chip__label">{t("showInactive")}</span>
                </button>
                <button
                  type="button"
                  className={`user-filter-chip${showAll ? " is-selected" : ""}`}
                  aria-pressed={showAll}
                  onClick={() => {
                    if (showAll) setShowAll(false);
                    else {
                      setShowAll(true);
                      setShowInactive(false);
                    }
                  }}
                >
                  <span className="user-filter-chip__dot" aria-hidden>
                    {showAll ? (
                      <svg className="user-filter-chip__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 12l4 4 8-8" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="user-filter-chip__label">{t("showAll")}</span>
                </button>
              </div>
            </div>
            <div className="user-toolbar-actions-right" style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <button
                type="button"
                className="btn btn-delete"
                id="processDeleteSelectedBtn"
                disabled={!selectedIds.size || processMutationsBlocked}
                onClick={deleteSelected}
              >
                {selectedIds.size ? t("deleteWithCount", { count: selectedIds.size }) : t("delete")}
              </button>
            </div>
          </div>
          <div className="user-gc-inline-panel">
            {groupIds.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("groupId")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
                    {groupIds.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`user-gc-segment${groupFilterKind === "follow" && g === selectedGroupKey ? " is-on" : ""}`}
                        disabled={processMutationsBlocked}
                        onClick={() => handlePickGroup(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="user-gc-inline-row">
              <span className="user-gc-inline-label">{t("company")}</span>
              <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                <div className="user-gc-segment-group" role="group" aria-label={t("company")}>
                  {companyButtons.map((c) => {
                    const active = Number(c.id) === Number(pickerCompanyId);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`user-gc-segment${active ? " is-on" : ""}`}
                        disabled={processMutationsBlocked}
                        onMouseEnter={() => warmProcessListCompanyCache(c.id)}
                        onFocus={() => warmProcessListCompanyCache(c.id)}
                        onClick={() => onPickCompanyPill(c)}
                      >
                        {String(c.company_id || "").toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <ProcessTable
          showAll={showAll}
          showSelectColumn={showInactive || showAll}
          pageRows={pageRows}
          currentPage={currentPage}
          PAGE_SIZE={PAGE_SIZE}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleProcessTableSort}
          selectedIds={selectedIds}
          toggleStatus={toggleStatus}
          openEdit={openEdit}
          toggleSelectId={toggleSelectId}
          toggleSelectAll={toggleSelectAll}
          mutationsBlocked={processMutationsBlocked}
          t={t}
        />

        {!showAll && (
          <div className="pagination-container" id="paginationContainer">
            <button type="button" className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              ◀
            </button>
            <span className="pagination-info">
              {t("pageOf", { current: currentPage, total: totalPages })}
            </span>
            <button
              type="button"
              className="pagination-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              ▶
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <ProcessFormModal
          editMode={editMode}
          form={form}
          setForm={setForm}
          currencies={currencies}
          days={days}
          readOnly={processMutationsBlocked}
          onClose={() => {
            setDescriptionPickerOpen(false);
            setModalOpen(false);
          }}
          onSubmit={submitForm}
          onOpenDescriptionPicker={() => setDescriptionPickerOpen(true)}
          t={t}
        />
      )}

      {modalOpen && descriptionPickerOpen && (
        <DescriptionPickerModal
          descriptions={descriptions}
          form={form}
          readOnly={processMutationsBlocked}
          onConfirm={confirmDescriptionSelection}
          onClose={() => setDescriptionPickerOpen(false)}
          onAddDescription={handleAddDescription}
          onDeleteDescription={handleDeleteDescription}
          t={t}
        />
      )}

      <ProcessDeleteConfirmModal
        open={deleteConfirmOpen}
        count={selectedIds.size}
        deleting={deleteSubmitting}
        confirmDisabled={processMutationsBlocked}
        onCancel={() => !deleteSubmitting && setDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteProcesses}
        t={t}
      />


      <ProcessToastStack items={toasts} />
    </div>
  );
}
