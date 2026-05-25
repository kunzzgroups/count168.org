import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { isPartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { saveUserCurrencyOrder } from "../transaction/lib/transactionApi.js";
import { isBankCategoryCompany } from "../bankprocesslist/lib/bankProcessHelpers.js";
import "../../../public/css/processCSS.css";
import "../../../public/css/processlist.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import CompanyExpirationModal from "../domain/components/CompanyExpirationModal.jsx";
import {
  PAGE_SIZE,
  EMPTY_FORM,
  normalizeRows,
  dedupeCompanyRowsForSwitcher,
  sortProcessTableRows,
  notifyTransactionDataChanged,
  parseRemarkForForm,
  buildEditDescriptionSelection,
} from "./processListHelpers.js";
import { prefetchBankProcessListPayload } from "./processRoutePrefetch.js";
import ProcessTable from "./components/ProcessTable.jsx";
import ProcessFormModal from "./components/ProcessFormModal.jsx";
import DescriptionPickerModal from "./components/DescriptionPickerModal.jsx";
import ProcessDeleteConfirmModal from "./components/ProcessDeleteConfirmModal.jsx";
import AddProcessIcon from "./components/AddProcessIcon.jsx";
import { getProcessListText } from "../../translateFile/pages/processListTranslate.js";
import PageContentLoader from "../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";

function filterSearchInput(raw) {
  return String(raw || "")
    .replace(/[^A-Z0-9 ]/gi, "")
    .toUpperCase();
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
  const [cssReady, setCssReady] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [pendingCompanyId, setPendingCompanyId] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
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
  const [expirationCompanies, setExpirationCompanies] = useState(null);
  /** Partnership/Audit read_only 时禁用流程写操作 — synced from layout session */
  const sessionMe = sessionMeFromLayout;
  const fetchAbortRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const skipNextFetchRef = useRef(false);
  const rowsRef = useRef([]);
  const skipNextCurrencyPillClickRef = useRef(false);

  const [currencyListOrdered, setCurrencyListOrdered] = useState([]);
  const [currencyFilterCode, setCurrencyFilterCode] = useState("");
  const [currencyPillDisplayOrder, setCurrencyPillDisplayOrder] = useState(null);

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
    setCssReady(true);
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

  useEffect(() => {
    if (!companies.length) return;
    let cancelled = false;
    const codes = [
      ...new Set(companies.map((c) => String(c.company_id || "").trim()).filter(Boolean)),
    ];
    void (async () => {
      for (const code of codes) {
        if (cancelled) break;
        await isBankCategoryCompany(code, buildApiUrl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companies]);

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

  const loadCurrencyMeta = useCallback(async () => {
    if (!companyId) return;
    try {
      const [curRes, ordRes] = await Promise.all([
        fetch(buildApiUrl(`api/transactions/get_company_currencies_api.php?company_id=${companyId}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/transactions/user_currency_order_api.php?_t=${Date.now()}`), { credentials: "include" }).catch(() => null),
      ]);
      const curJson = await curRes.json();
      if (!curRes.ok || !curJson.success || !Array.isArray(curJson.data)) {
        setCurrencyListOrdered([]);
        return;
      }
      let codes = curJson.data.map((r) => String(r.code).toUpperCase());
      if (ordRes) {
        const ordJson = await ordRes.json();
        const order = ordJson?.data?.order;
        if (Array.isArray(order) && order.length) {
          const set = new Set(codes);
          const ordered = [...order.map((c) => String(c).toUpperCase()).filter((c) => set.has(c))];
          const rest = codes.filter((c) => !ordered.includes(c));
          codes = [...ordered, ...rest];
        }
      }
      setCurrencyListOrdered(codes);
    } catch {
      setCurrencyListOrdered([]);
    }
  }, [companyId]);

  useEffect(() => {
    if (loading || !companyId) return;
    void loadCurrencyMeta();
  }, [loading, companyId, loadCurrencyMeta]);

  useEffect(() => {
    setCurrencyPillDisplayOrder(null);
  }, [companyId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [currencyFilterCode]);

  useEffect(() => {
    if (!sessionReady || !sessionMeFromLayout) return;
    (async () => {
      let skipLoadingDone = false;
      try {
        const layoutMe = sessionMeFromLayout;
        const routePrefetch = location.state?.processListPrefetch;
        const prefetchCompanyId = routePrefetch?.companyId ? Number(routePrefetch.companyId) : null;
        const currentUrl = new URL(window.location.href);
        const prefetchQueryCompany = currentUrl.searchParams.get("company_id");

        if (routePrefetch && prefetchCompanyId && (!prefetchQueryCompany || Number(prefetchQueryCompany) === prefetchCompanyId)) {
          const prefetchedCompanies = Array.isArray(routePrefetch.companies) ? routePrefetch.companies : [];
          const prefetchedMeta = routePrefetch.meta || {};
          setCompanies(prefetchedCompanies);
          setCompanyId(prefetchCompanyId);
          {
            const pfGfk = routePrefetch.groupFilterKind;
            setGroupFilterKind(pfGfk === "all" || pfGfk === "ungrouped" ? pfGfk : "follow");
          }

          const normalizedSearch = filterSearchInput(currentUrl.searchParams.get("search") || "");
          setSearch(normalizedSearch);
          setDebouncedSearch(normalizedSearch);

          const showAllChecked = currentUrl.searchParams.has("showAll");
          const showInactiveChecked = !showAllChecked && currentUrl.searchParams.has("showInactive");
          setShowAll(showAllChecked);
          setShowInactive(showInactiveChecked);

          setCurrencyFilterCode(String(currentUrl.searchParams.get("currency") || "").trim().toUpperCase());

          setCurrencies(Array.isArray(prefetchedMeta.currencies) ? prefetchedMeta.currencies : []);
          setDescriptions(Array.isArray(prefetchedMeta.descriptions) ? prefetchedMeta.descriptions : []);
          setDays(Array.isArray(prefetchedMeta.days) ? prefetchedMeta.days : []);
          setExistingProcesses(Array.isArray(prefetchedMeta.existingProcesses) ? prefetchedMeta.existingProcesses : []);

          if (Array.isArray(routePrefetch.rows)) {
            setRows(normalizeRows(routePrefetch.rows));
            skipNextFetchRef.current = true;
            setTableLoading(false);
          } else {
            setTableLoading(true);
          }
          setLoading(false);
          return;
        }

        const companiesRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const companiesJson = await companiesRes.json();
        const cs = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(cs);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effectiveCompany = queryCompany || layoutMe.company_id || cs[0]?.id || null;
        effectiveCompany = effectiveCompany ? Number(effectiveCompany) : null;

        if (queryCompany && effectiveCompany && Number(effectiveCompany) !== Number(layoutMe.company_id)) {
          try {
            const syncRes = await fetch(
              buildApiUrl(`api/session/update_company_session_api.php?company_id=${effectiveCompany}`),
              { credentials: "include" }
            );
            const syncJson = await syncRes.json();
            if (!syncJson.success) {
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

        setCompanyId(effectiveCompany);
        setGroupFilterKind("follow");

        const rawSearch = url.searchParams.get("search") || "";
        const normalizedSearch = filterSearchInput(rawSearch);
        setSearch(normalizedSearch);
        setDebouncedSearch(normalizedSearch);

        const showAllChecked = url.searchParams.has("showAll");
        const showInactiveChecked = !showAllChecked && url.searchParams.has("showInactive");
        setShowAll(showAllChecked);
        setShowInactive(showInactiveChecked);

        setCurrencyFilterCode(String(url.searchParams.get("currency") || "").trim().toUpperCase());

        await loadFormMeta(effectiveCompany);
      } catch {
        window.location.assign(new URL("/login", window.location.origin).toString());
      } finally {
        if (!skipLoadingDone) setLoading(false);
      }
    })();
  }, [loadFormMeta, location.state, navigate, sessionReady, sessionMeFromLayout]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (debouncedSearch.trim()) url.searchParams.set("search", debouncedSearch.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    if (currencyFilterCode) url.searchParams.set("currency", currencyFilterCode);
    else url.searchParams.delete("currency");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, debouncedSearch, showInactive, showAll, currencyFilterCode]);

  useEffect(() => {
    if (loading || !companyId) return;
    syncUrl();
  }, [loading, companyId, currencyFilterCode, syncUrl]);

  const fetchRows = useCallback(async () => {
    if (!companyId) return;
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    if (rowsRef.current.length === 0) setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("permission", "Games");
      url.searchParams.set("company_id", String(companyId));
      if (debouncedSearch.trim()) url.searchParams.set("search", debouncedSearch.trim());
      if (showInactive) url.searchParams.set("showInactive", "1");
      if (showAll) url.searchParams.set("showAll", "1");
      const res = await fetch(url.toString(), { credentials: "include", signal: ac.signal });
      const json = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok || !json.success) {
        notify(json.message || json.error || t("failedLoadProcessList"), "danger");
        return;
      }
      setRows(normalizeRows(json.data));
      setSelectedIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch {
      if (ac.signal.aborted) return;
      notify(t("failedLoadProcessList"), "danger");
    } finally {
      if (!ac.signal.aborted) setTableLoading(false);
    }
  }, [companyId, debouncedSearch, showInactive, showAll, notify, syncUrl]);

  useEffect(() => {
    if (loading || !companyId) return;
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    void fetchRows();
  }, [loading, companyId, debouncedSearch, showInactive, showAll, fetchRows]);

  useEffect(() => {
    if (loading || !companyId) return;
    void loadFormMeta(companyId);
  }, [loading, companyId, loadFormMeta]);

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
    try {
      const fd = new FormData();
      fd.append("action", "add_description");
      fd.append("description_name", descName);
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
      return newId != null ? { id: newId, name: descName } : null;
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

  const pickerCompanyId = pendingCompanyId ?? companyId;

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
  const selectedGroupKey = useMemo(
    () => String(selectedCompany?.group_id || "").trim().toUpperCase(),
    [selectedCompany?.group_id]
  );
  const companyButtons = useMemo(() => {
    if (groupFilterKind === "all") {
      const groupOrder = new Map(groupIds.map((gid, idx) => [gid, idx]));
      return [...allCompanyButtons].sort((a, b) => {
        const ga = String(a.group_id || "").trim().toUpperCase();
        const gb = String(b.group_id || "").trim().toUpperCase();
        const ra = groupOrder.has(ga) ? groupOrder.get(ga) : Number.MAX_SAFE_INTEGER;
        const rb = groupOrder.has(gb) ? groupOrder.get(gb) : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return String(a.company_id || "").localeCompare(String(b.company_id || ""), undefined, { numeric: true });
      });
    }
    if (groupFilterKind === "ungrouped") {
      return allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
    }
    if (groupIds.length === 0) return allCompanyButtons;
    if (!selectedGroupKey) {
      const ung = allCompanyButtons.filter((c) => !String(c.group_id || "").trim());
      return ung.length ? ung : allCompanyButtons;
    }
    const inG = allCompanyButtons.filter((c) => String(c.group_id || "").trim().toUpperCase() === selectedGroupKey);
    return inG.length ? inG : allCompanyButtons;
  }, [allCompanyButtons, groupIds, selectedGroupKey, groupFilterKind]);

  const rowCurrencyCodes = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      const c = String(r.currency || "").trim().toUpperCase();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const baseCurrencyPills = useMemo(() => {
    const merged = new Set([...currencyListOrdered, ...rowCurrencyCodes]);
    const orderFirst = currencyListOrdered.filter((c) => merged.has(c));
    const rest = [...merged].filter((c) => !orderFirst.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...orderFirst, ...rest];
  }, [currencyListOrdered, rowCurrencyCodes]);

  const currencyPillCodes = useMemo(
    () => currencyPillDisplayOrder ?? baseCurrencyPills,
    [currencyPillDisplayOrder, baseCurrencyPills]
  );

  useEffect(() => {
    setCurrencyPillDisplayOrder((prev) => {
      if (!prev) return null;
      const add = baseCurrencyPills.filter((c) => !prev.includes(c));
      return add.length ? [...prev, ...add] : prev;
    });
  }, [baseCurrencyPills]);

  const persistOrderedCompanyCurrencies = useCallback(
    async (orderedPills) => {
      if (processMutationsBlocked) return;
      const companySet = new Set(currencyListOrdered);
      const apiOrder = orderedPills.filter((c) => companySet.has(c));
      if (apiOrder.length === 0) return;
      const json = await saveUserCurrencyOrder(apiOrder);
      if (!json?.success) return;
      const tail = currencyListOrdered.filter((c) => !apiOrder.includes(c));
      setCurrencyListOrdered([...apiOrder, ...tail]);
    },
    [currencyListOrdered, processMutationsBlocked]
  );

  const onCurrencyPillDrop = useCallback(
    async (e, targetCode) => {
      if (processMutationsBlocked) return;
      e.preventDefault();
      const dragged = e.dataTransfer.getData("text/plain");
      if (!dragged || !targetCode || dragged === targetCode) return;
      const list = [...currencyPillCodes];
      const fromI = list.indexOf(dragged);
      const toI = list.indexOf(targetCode);
      if (fromI < 0 || toI < 0 || fromI === toI) return;
      skipNextCurrencyPillClickRef.current = true;
      const next = [...list];
      const [moved] = next.splice(fromI, 1);
      next.splice(toI, 0, moved);
      setCurrencyPillDisplayOrder(next);
      await persistOrderedCompanyCurrencies(next);
    },
    [currencyPillCodes, persistOrderedCompanyCurrencies, processMutationsBlocked]
  );

  useEffect(() => {
    if (!currencyFilterCode) return;
    if (currencyPillCodes.length && !currencyPillCodes.includes(currencyFilterCode)) {
      setCurrencyFilterCode("");
    }
  }, [currencyFilterCode, currencyPillCodes]);

  const currencyFilteredRows = useMemo(() => {
    if (!currencyFilterCode) return rows;
    return rows.filter((r) => String(r.currency || "").trim().toUpperCase() === currencyFilterCode);
  }, [rows, currencyFilterCode]);

  const sortedDisplayRows = useMemo(
    () => sortProcessTableRows(currencyFilteredRows, sortColumn, sortDirection),
    [currencyFilteredRows, sortColumn, sortDirection],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(sortedDisplayRows.length / PAGE_SIZE)), [sortedDisplayRows]);
  const pageRows = useMemo(() => {
    if (showAll) return sortedDisplayRows.filter((r) => String(r.status || "").toLowerCase() === "active");
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

  const onSwitchCompany = async (company) => {
    const nextId = Number(company?.id);
    if (!nextId || nextId === Number(pickerCompanyId) || switchingCompany) return;
    setPendingCompanyId(nextId);
    setSelectedIds(new Set());
    setCurrentPage(1);
    setSwitchingCompany(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextId}`), {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const reason = json?.data?.reason;
        if (reason === "expired" || reason === "no_set") {
          setExpirationCompanies([
            { company_id: company.company_id, expiration_date: company.expiration_date ?? null },
          ]);
          return;
        }
        notify(json.message || json.error || t("switchCompanyFailed"), "danger");
        return;
      }
      notifyCompanySessionUpdated();
      const bankCategory = await isBankCategoryCompany(company.company_id, buildApiUrl);
      if (bankCategory) {
        const warm = await prefetchBankProcessListPayload(nextId);
        navigate(`/bank-process-list?company_id=${nextId}`, {
          replace: true,
          state: {
            bankProcessListPrefetch: {
              companyId: nextId,
              companies,
              groupFilterKind,
              rows: warm.rows,
              currencyCodes: warm.currencyCodes,
            },
          },
        });
        return;
      }
      setCompanyId(nextId);
      setGroupFilterKind((prev) => (prev === "all" || prev === "ungrouped" ? prev : "follow"));
    } catch {
      notify(t("switchCompanyFailed"), "danger");
    } finally {
      setPendingCompanyId(null);
      setSwitchingCompany(false);
    }
  };

  const handlePickGroup = useCallback(
    (gid) => {
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;
      if (groupFilterKind === "follow" && g === selectedGroupKey) {
        setGroupFilterKind("ungrouped");
        return;
      }
      setGroupFilterKind("follow");
      if (g === selectedGroupKey) return;
      const first = allCompanyButtons.find((c) => String(c.group_id || "").trim().toUpperCase() === g);
      if (first) void onSwitchCompany(first);
    },
    [allCompanyButtons, groupFilterKind, onSwitchCompany, selectedGroupKey]
  );

  const handlePickAllGroups = useCallback(() => {
    setGroupFilterKind((k) => (k === "all" ? "ungrouped" : "all"));
  }, []);

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

  if (loading || !cssReady || !sessionReady) return <PageContentLoader />;

  return (
    <div className="container">
      <div className="content" style={showAll ? { height: "auto", overflow: "visible" } : undefined}>
        <div className="action-buttons-container">
          <div className="action-buttons">
            <div className="action-controls-row" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
              <button type="button" className="btn btn-add" disabled={processMutationsBlocked} onClick={openAdd}>
                <AddProcessIcon />
                {t("addProcess")}
              </button>
            </div>
          </div>
          <div className="user-gc-inline-panel">
            {groupIds.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("groupId")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("groupId")}>
                    <button
                      type="button"
                      className={`user-gc-segment${groupFilterKind === "all" ? " is-on" : ""}`}
                      onClick={handlePickAllGroups}
                    >
                      {t("groupFilterAll")}
                    </button>
                    {groupIds.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`user-gc-segment${groupFilterKind === "follow" && g === selectedGroupKey ? " is-on" : ""}`}
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
                        onClick={() => {
                          if (!active) void onSwitchCompany(c);
                        }}
                      >
                        {String(c.company_id || "").toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {currencyPillCodes.length > 0 && (
              <div className="user-gc-inline-row">
                <span className="user-gc-inline-label">{t("currency")}</span>
                <div className="user-gc-inline-pills user-gc-inline-pills--segment-scroll">
                  <div className="user-gc-segment-group" role="group" aria-label={t("currency")}>
                    <button
                      type="button"
                      className={`user-gc-segment${!currencyFilterCode ? " is-on" : ""}`}
                      onClick={() => {
                        setCurrencyFilterCode("");
                        setCurrentPage(1);
                      }}
                    >
                      {t("groupFilterAll")}
                    </button>
                    {currencyPillCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        draggable={!processMutationsBlocked}
                        title={t("currencyDragHint")}
                        className={`user-gc-segment user-gc-segment--draggable-pill${currencyFilterCode === code ? " is-on" : ""}`}
                        onDragStart={(e) => {
                          if (processMutationsBlocked) return;
                          e.dataTransfer.setData("text/plain", code);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (!processMutationsBlocked) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          if (processMutationsBlocked) return;
                          void onCurrencyPillDrop(e, code);
                        }}
                        onClick={() => {
                          if (skipNextCurrencyPillClickRef.current) {
                            skipNextCurrencyPillClickRef.current = false;
                            return;
                          }
                          setCurrencyFilterCode(code);
                          setCurrentPage(1);
                        }}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <ProcessTable
          tableLoading={tableLoading}
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

      {expirationCompanies && (
        <CompanyExpirationModal companies={expirationCompanies} onClose={() => setExpirationCompanies(null)} lang={lang} />
      )}

      <ProcessToastStack items={toasts} />
    </div>
  );
}
