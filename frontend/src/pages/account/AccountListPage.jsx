import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { assetUrl, buildApiUrl } from "../../utils/core/apiUrl.js";
import "../../../public/css/account-list.css";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";

// Logic & Constants..
import {
  toUpper,
  normalizeAlertAmount,
  roleSortOrder,
  PAGE_SIZE,
  DEFAULT_FORM,
  getOrderedRoles,
  normalizeCompanyRow,
  isVirtualGroupLinkCompanyRow,
  buildAccountsFetchKey,
  buildAccountsUrl,
  pickDefaultAddCurrencyIds,
} from "./accountLogic.js";

// Components
import AccountModal from "../../components/AccountModal.jsx";
import { processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import {
  AccountConfirmModal,
  CurrencySettingModal,
  LinkAccountModal,
} from "./components/accountModals.jsx";
import {
  getAccountText,
  parseAccountsFromCurrencyDeleteMessage,
  translateAccountApiMessage,
} from "../../translateFile/pages/accountTranslate.js";
import { usePartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import PageContentLoader from "../../components/PageContentLoader.jsx";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";

export default function AccountListPage() {
  const navigate = useNavigate();
  const { me: sessionMe, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const langRef = useRef(lang);
  langRef.current = lang;
  const t = useCallback((key, params) => getAccountText(lang, key, params), [lang]);

  // -- Status --
  const [bootLoading, setBootLoading] = useState(true);
  const [cssReady, setCssReady] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [pendingCompanyId, setPendingCompanyId] = useState(null);

  // -- Data --
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [companyId, setCompanyId] = useState(null);

  // -- Filters --
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("account");
  const [sortDirection, setSortDirection] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());

  // -- Modals & Forms --
  const [toast, setToast] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [currencySettingOpen, setCurrencySettingOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [isEditMode, setIsEditMode] = useState(false);
  const [initialEditCurrencyIds, setInitialEditCurrencyIds] = useState([]);
  const [linkingAccountId, setLinkingAccountId] = useState(null);
  const [linkAccountsPool, setLinkAccountsPool] = useState([]);
  const [selectedLinkedIds, setSelectedLinkedIds] = useState(new Set());
  const [linkType, setLinkType] = useState("bidirectional");
  const [linkTypeMap, setLinkTypeMap] = useState({});
  const [linkSearchTerm, setLinkSearchTerm] = useState("");

  // -- Child states --
  const [selectedCurrencyIds, setSelectedCurrencyIds] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [currencyInput, setCurrencyInput] = useState("");
  /** Add/Edit 弹窗内点 × 隐藏的货币 id（本会话），避免仅取消勾选时界面无变化 */
  const [hiddenCurrencyIds, setHiddenCurrencyIds] = useState([]);
  const [settingCurrencyId, setSettingCurrencyId] = useState(null);
  const [settingLinked, setSettingLinked] = useState(new Set());
  const [settingInitial, setSettingInitial] = useState(new Set());
  const [settingSearch, setSettingSearch] = useState("");
  const [settingRole, setSettingRole] = useState("");

  const toastTimerRef = useRef(null);
  const bootFetchedAccountsKeyRef = useRef(null);

  const accountModalCurrencies = useMemo(() => {
    const hidden = new Set(hiddenCurrencyIds.map(Number));
    return currencies.filter((c) => !hidden.has(Number(c.id)));
  }, [currencies, hiddenCurrencyIds]);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const durationMs = type === "danger" ? 4000 : 1800;
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  const notifyApi = useCallback(
    (apiMessage, fallbackKey, type = "success", params = {}, apiData = null) => {
      notify(translateAccountApiMessage(lang, apiMessage, fallbackKey, params, apiData), type);
    },
    [lang, notify],
  );

  // -- CSS Loading (FOUC Fix) —
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
    document.body.classList.remove("bg");
    document.body.classList.add("account-page");
    setCssReady(true);

    return () => {
      document.body.classList.remove("account-page", "account-page--show-all", "bg");
      document.body.classList.add("dashboard-page");
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showAll) document.body.classList.add("account-page--show-all");
    else document.body.classList.remove("account-page--show-all");
    return () => document.body.classList.remove("account-page--show-all");
  }, [showAll]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    if (searchTerm.trim()) url.searchParams.set("search", searchTerm.trim());
    else url.searchParams.delete("search");
    if (showInactive) url.searchParams.set("showInactive", "1");
    else url.searchParams.delete("showInactive");
    if (showAll) url.searchParams.set("showAll", "1");
    else url.searchParams.delete("showAll");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, searchTerm, showInactive, showAll]);

  const fetchAccounts = useCallback(async () => {
    if (!companyId) return;
    setTableLoading(true);
    try {
      const url = buildAccountsUrl(companyId, searchTerm, showInactive, showAll);
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "failedToLoadAccounts", "danger");
      setAccounts(Array.isArray(json?.data?.accounts) ? json.data.accounts : []);
      setSelectedDeleteIds(new Set());
      setCurrentPage(1);
      syncUrl();
    } catch { notifyApi(null, "networkError", "danger"); }
    finally { setTableLoading(false); }
  }, [companyId, searchTerm, showInactive, showAll, syncUrl, notify]);

  // -- Boot --
  useEffect(() => {
    if (!sessionReady || !sessionMe) return;
    let cancelled = false;
    (async () => {
      try {
        const [compRes, editRes] = await Promise.all([
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
          fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" }),
        ]);
        const compJson = await compRes.json();
        const editJson = await editRes.json();
        if (cancelled) return;

        const rows = Array.isArray(compJson?.data) ? compJson.data.map(normalizeCompanyRow) : [];
        setCompanies(rows);
        setRoles(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);

        const url = new URL(window.location.href);
        const cid = url.searchParams.get("company_id") || sessionMe.company_id || rows[0]?.id;
        const initialCompanyId = cid ? Number(cid) : null;
        const initialSearchTerm = toUpper(url.searchParams.get("search") || "");
        const initialShowInactive = url.searchParams.get("showInactive") === "1";
        const initialShowAll = url.searchParams.get("showAll") === "1";
        if (initialCompanyId) {
          const accountRes = await fetch(buildAccountsUrl(initialCompanyId, initialSearchTerm, initialShowInactive, initialShowAll).toString(), { credentials: "include" });
          const accountJson = await accountRes.json();
          if (cancelled) return;
          if (accountJson.success) {
            setAccounts(Array.isArray(accountJson?.data?.accounts) ? accountJson.data.accounts : []);
            bootFetchedAccountsKeyRef.current = buildAccountsFetchKey(initialCompanyId, initialSearchTerm, initialShowInactive, initialShowAll);
          }
        }
        setCompanyId(initialCompanyId);
        setSearchTerm(initialSearchTerm);
        setShowInactive(initialShowInactive);
        setShowAll(initialShowAll);
      } catch {
        if (!cancelled) navigate("/login");
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionReady, sessionMe, navigate]);

  useEffect(() => {
    if (!bootLoading && companyId) {
      const key = buildAccountsFetchKey(companyId, searchTerm, showInactive, showAll);
      if (bootFetchedAccountsKeyRef.current === key) {
        bootFetchedAccountsKeyRef.current = null;
        return;
      }
      fetchAccounts();
    }
  }, [bootLoading, companyId, searchTerm, showInactive, showAll, fetchAccounts]);

  // -- Computed --
  const allCompanyButtons = useMemo(
    () => companies.filter(c => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c)),
    [companies]
  );
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean))].sort(),
    [allCompanyButtons]
  );
  const pickerCompanyId = pendingCompanyId ?? companyId;
  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(pickerCompanyId)) || null,
    [allCompanyButtons, pickerCompanyId]
  );
  const selectedGroupKey = useMemo(
    () => String(selectedCompany?.group_id || "").trim().toUpperCase(),
    [selectedCompany?.group_id]
  );
  const companiesForPicker = useMemo(() => {
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

  const sortedAccounts = useMemo(() => {
    const arr = [...accounts];
    arr.sort((a, b) => {
      let base = 0;
      if (sortColumn === "role") {
        const ao = roleSortOrder(a.role, roles);
        const bo = roleSortOrder(b.role, roles);
        base = ao - bo;
      } else if (sortColumn === "alert") {
        base = Number(a.payment_alert || 0) - Number(b.payment_alert || 0);
      } else {
        const getValue = (account) => {
          if (sortColumn === "name") return account.name;
          if (sortColumn === "status") return account.status;
          if (sortColumn === "lastLogin") return account.last_login;
          if (sortColumn === "remark") return account.remark;
          return account.account_id;
        };
        base = String(getValue(a) || "").localeCompare(String(getValue(b) || ""), undefined, { numeric: true, sensitivity: "base" });
      }

      if (base === 0 && sortColumn !== "account") {
        base = String(a.account_id || "").localeCompare(String(b.account_id || ""), undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? base : -base;
    });
    return arr;
  }, [accounts, sortColumn, sortDirection, roles]);

  const orderedRoles = useMemo(() => getOrderedRoles(roles), [roles]);

  const filteredForMode = useMemo(() => {
    return sortedAccounts;
  }, [sortedAccounts]);

  const accountMutationsBlocked = usePartnershipAuditReadOnlyLocked(sessionMe);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredForMode.length / PAGE_SIZE)), [filteredForMode]);
  const pageRows = useMemo(() => {
    if (showAll) return filteredForMode;
    const p = Math.min(currentPage, totalPages);
    return filteredForMode.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [filteredForMode, showAll, currentPage, totalPages]);

  // -- Handlers --
  const onSwitchCompany = async (c) => {
    const nextCompanyId = Number(c?.id);
    if (!nextCompanyId || Number(nextCompanyId) === Number(pickerCompanyId) || switchingCompany) return;
    setPendingCompanyId(nextCompanyId);
    setSwitchingCompany(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "failedToSwitchCompany", "danger");
      setCompanyId(nextCompanyId);
      notifyCompanySessionUpdated();
      notify(t("switchedTo", { company: c.company_id }));
    } catch { notify(t("failedToSwitchCompany"), "danger"); }
    finally { setPendingCompanyId(null); setSwitchingCompany(false); }
  };

  const handlePickGroup = useCallback(
    (gid) => {
      if (switchingCompany) return;
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
    [allCompanyButtons, groupFilterKind, onSwitchCompany, selectedGroupKey, switchingCompany]
  );

  const handlePickAllGroups = useCallback(() => {
    if (switchingCompany) return;
    setGroupFilterKind((k) => (k === "all" ? "ungrouped" : "all"));
  }, [switchingCompany]);

  useEffect(() => {
    if (!showInactive && !showAll) setSelectedDeleteIds(new Set());
  }, [showInactive, showAll]);

  const togglePaymentAlert = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData(); fd.append("id", id);
      const res = await fetch(buildApiUrl("api/accounts/toggle_payment_alert_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const next = json.data?.newPaymentAlert ?? json.newPaymentAlert;
        setAccounts(prev => prev.map(a => Number(a.id) === Number(id) ? { ...a, payment_alert: next } : a));
      }
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const toggleAccountStatus = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData(); fd.append("id", id);
      const res = await fetch(buildApiUrl("api/accounts/toggle_account_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const next = json.newStatus || json.data?.newStatus;
        setAccounts(prev => {
          const updated = prev.map(a => Number(a.id) === Number(id) ? { ...a, status: next } : a);
          if (showInactive) return updated.filter(a => String(a.status || "").toLowerCase() === "inactive");
          if (!showAll) return updated.filter(a => String(a.status || "").toLowerCase() === "active");
          return updated;
        });
        void fetchAccounts();
      }
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const loadSelectionMeta = async (id, isEdit) => {
    try {
      const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
      if (id) currencyParams.set("account_id", String(id));
      if (companyId) currencyParams.set("company_id", String(companyId));
      const [curRes, compRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/account_currency_api.php?${currencyParams.toString()}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/accounts/account_company_api.php?action=get_available_companies${id ? `&account_id=${id}` : ""}`), { credentials: "include" }),
      ]);
      const curJ = await curRes.json(); const compJ = await compRes.json();
      if (curJ.success) {
        setCurrencies(curJ.data.map(c => ({ id: c.id, code: c.code, is_linked: !!c.is_linked })));
        if (isEdit) {
          const ids = curJ.data.filter(c => c.is_linked).map(c => Number(c.id));
          setSelectedCurrencyIds(ids);
          setInitialEditCurrencyIds(ids);
        } else {
          setSelectedCurrencyIds(pickDefaultAddCurrencyIds(curJ.data));
        }
      }
      if (compJ.success) {
        const linked = compJ.data.filter(c => c.is_linked).map(c => Number(c.id));
        setSelectedCompanyIds(linked.length ? linked : companyId ? [Number(companyId)] : []);
      }
    } catch { /* silent */ }
  };

  const openAdd = () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    setIsEditMode(false); setForm({ ...DEFAULT_FORM, payment_alert: "0" });
    setSelectedCurrencyIds([]); setCurrencyInput("");
    setInitialEditCurrencyIds([]);
    setHiddenCurrencyIds([]);
    setAddModalOpen(true); loadSelectionMeta(null, false);
  };

  const openCurrencySetting = () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    setCurrencySettingOpen(true);
    void loadSelectionMeta(null, false);
    if (settingCurrencyId) void loadCurrencyLinks(settingCurrencyId);
  };

  const clearCurrencySettingSelection = () => {
    setSettingCurrencyId(null);
    setSettingLinked(new Set());
    setSettingInitial(new Set());
  };

  const openEdit = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const detailUrl = new URL(buildApiUrl("api/accounts/getaccount_api.php"));
      detailUrl.searchParams.set("id", String(id));
      if (companyId) detailUrl.searchParams.set("company_id", String(companyId));
      detailUrl.searchParams.set("_", String(Date.now()));
      const res = await fetch(detailUrl.toString(), {
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const text = await res.text();
      let json;
      try {
        json = text.trim() ? JSON.parse(text) : { success: false };
      } catch {
        return notify(t("errorLoadingAccount"), "danger");
      }
      if (!json.success) return notifyApi(json.message || json.error, "failedToLoadAccount", "danger");
      const d = json.data;
      setIsEditMode(true);
      setHiddenCurrencyIds([]);
      setForm({ id: d.id, account_id: toUpper(d.account_id), name: toUpper(d.name), role: d.role || "", password: d.password || "", remark: toUpper(d.remark), payment_alert: String(d.payment_alert == 1 ? "1" : "0"), alert_type: d.alert_type || d.alert_day || "", alert_start_date: d.alert_start_date || d.alert_specific_date || "", alert_amount: d.alert_amount || "" });
      await loadSelectionMeta(id, true);
      setEditModalOpen(true);
    } catch { notify(t("errorLoadingAccount"), "danger"); }
  };

  const confirmDelete = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      const fd = new FormData();
      selectedDeleteIds.forEach(id => fd.append("ids[]", id));
      if (companyId) fd.append("company_id", String(companyId));
      const res = await fetch(buildApiUrl("api/accounts/delete_accounts_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "deleteFailed", "danger");
      setConfirmDeleteOpen(false);
      setSelectedDeleteIds(new Set());
      notifyApi(json.message, "accountsDeletedSuccessfully");
      fetchAccounts();
    } catch { notify(t("deleteFailed"), "danger"); }
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (form.payment_alert === "1" && (!form.alert_type || !form.alert_start_date)) {
      notify(t("paymentAlertRequiredFields"), "danger");
      return;
    }
    const amount = normalizeAlertAmount(form.alert_amount);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, k === "alert_amount" ? amount : (v ?? "")));
    if (selectedCompanyIds.length) fd.set("company_ids", JSON.stringify(selectedCompanyIds));
    if (!isEditMode) {
      if (companyId) fd.set("company_id", String(companyId));
      if (selectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(selectedCurrencyIds));
    }
    try {
      const ep = isEditMode ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php";
      const res = await fetch(buildApiUrl(ep), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notifyApi(json.message, "saveFailed", "danger");
      if (!isEditMode && json?.data?.id && selectedCurrencyIds.length) {
        for (const cid of selectedCurrencyIds) {
          const currencyRes = await fetch(accountCurrencyApiUrl("add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(json.data.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notifyApi(currencyJson.message, "saveFailed", "danger");
        }
      }
      if (isEditMode && form.id) {
        const before = new Set(initialEditCurrencyIds.map(Number));
        const after = new Set(selectedCurrencyIds.map(Number));
        const toAdd = [...after].filter((id) => !before.has(id));
        const toRemove = [...before].filter((id) => !after.has(id));
        for (const cid of toAdd) {
          const currencyRes = await fetch(accountCurrencyApiUrl("add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(form.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notifyApi(currencyJson.message, "saveFailed", "danger");
        }
        for (const cid of toRemove) {
          const currencyRes = await fetch(accountCurrencyApiUrl("remove_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: Number(form.id), currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notifyApi(currencyJson.message, "saveFailed", "danger");
        }
        setInitialEditCurrencyIds([...after]);
        if (settingCurrencyId) void loadCurrencyLinks(settingCurrencyId);
      }
      setAddModalOpen(false); setEditModalOpen(false);
      setHiddenCurrencyIds([]);
      notify(t("accountSavedSuccessfully"));
      void fetchAccounts();
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const createCurrency = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const code = toUpper(currencyInput).trim(); if (!code) return;
    const existing = currencies.find((c) => toUpper(c.code).trim() === code);
    if (existing) {
      const existingId = Number(existing.id);
      setHiddenCurrencyIds((prev) => prev.filter((id) => Number(id) !== existingId));
      setSelectedCurrencyIds((prev) => (prev.map(Number).includes(existingId) ? prev : [...prev, existingId]));
      setCurrencyInput("");
      return;
    }
    try {
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, company_id: companyId }), credentials: "include" });
      const json = await res.json();
      if (json.success) {
        const newId = Number(json.data.id);
        setCurrencies((prev) => [...prev, { id: newId, code: json.data.code, is_linked: false }]);
        setSelectedCurrencyIds((prev) => (prev.map(Number).includes(newId) ? prev : [...prev, newId]));
        setCurrencyInput("");
      } else {
        notifyApi(json.message, "createFailed", "danger");
      }
    } catch { notify(t("createFailed"), "danger"); }
  };

  const accountCurrencyApiUrl = useCallback(
    (action) => {
      const params = new URLSearchParams({ action });
      if (companyId) params.set("company_id", String(companyId));
      return buildApiUrl(`api/accounts/account_currency_api.php?${params.toString()}`);
    },
    [companyId]
  );

  const fetchAccountsUsingCurrency = async (currencyId) => {
    try {
      const params = new URLSearchParams({
        action: "get_linked_accounts_by_currency",
        currency_id: String(currencyId),
      });
      if (companyId) params.set("company_id", String(companyId));
      const res = await fetch(
        buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`),
        { method: "POST", credentials: "include" },
      );
      const json = await res.json();
      if (!json.success) return [];
      const fromApi = Array.isArray(json.data?.linked_accounts) ? json.data.linked_accounts : [];
      if (fromApi.length > 0) {
        return fromApi.map((a) => ({
          id: Number(a.id),
          name: String(a.name ?? ""),
          account_id: String(a.account_id ?? ""),
        }));
      }
      const linkedIds = new Set((json.data?.linked_account_ids || []).map(Number));
      return accounts
        .filter((a) => linkedIds.has(Number(a.id)))
        .map((a) => ({
          id: Number(a.id),
          name: String(a.name ?? ""),
          account_id: String(a.account_id ?? ""),
        }));
    } catch {
      return [];
    }
  };

  const handleCurrencyDeleteBlocked = async (currencyId, json, msg) => {
    const editingAccountId = isEditMode ? Number(form.id) : 0;
    let accountsInUse = Array.isArray(json?.data?.accounts_in_use) ? json.data.accounts_in_use : [];
    if (accountsInUse.length === 0) {
      accountsInUse = await fetchAccountsUsingCurrency(currencyId);
    }
    if (accountsInUse.length === 0) {
      accountsInUse = parseAccountsFromCurrencyDeleteMessage(msg);
    }
    if (editingAccountId > 0) {
      accountsInUse = accountsInUse.filter((a) => Number(a.id) !== editingAccountId);
    }
    const apiData =
      accountsInUse.length > 0 ? { ...(json?.data || {}), accounts_in_use: accountsInUse } : json?.data ?? null;
    notifyApi(msg, "failedDeleteCurrency", "danger", {}, apiData);
  };

  /** Permanently delete currency; only when deselected. Unlink from current account if still linked in DB. */
  const removeModalCurrency = async (currencyId) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const id = Number(currencyId);
    const accountId = isEditMode ? Number(form.id) : 0;

    if (selectedCurrencyIds.map(Number).includes(id)) {
      notify(t("deselectCurrencyBeforeDelete"), "danger");
      return;
    }

    const dropCurrencyFromUi = () => {
      setSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
      setHiddenCurrencyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setCurrencies((prev) => prev.filter((c) => Number(c.id) !== id));
    };

    const unlinkCurrentAccountFromCurrency = async () => {
      const wasSavedOnAccount = accountId > 0 && initialEditCurrencyIds.map(Number).includes(id);

      if (!accountId) return true;

      let needsUnlink = wasSavedOnAccount;
      if (!needsUnlink) {
        const using = await fetchAccountsUsingCurrency(id);
        needsUnlink = using.some((a) => Number(a.id) === accountId);
      }
      if (!needsUnlink) {
        if (wasSavedOnAccount) {
          setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
        }
        return true;
      }

      try {
        const res = await fetch(accountCurrencyApiUrl("remove_currency"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, currency_id: id }),
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          notifyApi(json.message, "saveFailed", "danger");
          return false;
        }
        setInitialEditCurrencyIds((prev) => prev.filter((x) => Number(x) !== id));
        setCurrencies((prev) =>
          prev.map((c) => (Number(c.id) === id ? { ...c, is_linked: false } : c)),
        );
        return true;
      } catch {
        notify(t("saveFailed"), "danger");
        return false;
      }
    };

    const unlinked = await unlinkCurrentAccountFromCurrency();
    if (!unlinked) return;

    let otherAccountsInUse = await fetchAccountsUsingCurrency(id);
    if (accountId > 0) {
      otherAccountsInUse = otherAccountsInUse.filter((a) => Number(a.id) !== accountId);
    }

    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        dropCurrencyFromUi();
        notifyApi(json.message, "currencyDeleted", "success");
        return;
      }
      const msg = String(json.message || json.error || "");
      const apiData =
        otherAccountsInUse.length > 0
          ? { ...(json?.data || {}), accounts_in_use: otherAccountsInUse }
          : json?.data ?? null;
      await handleCurrencyDeleteBlocked(id, { ...json, data: apiData }, msg);
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  };

  const loadCurrencyLinks = async (curId) => {
    try {
      const params = new URLSearchParams({ action: "get_linked_accounts_by_currency", currency_id: String(curId) });
      if (companyId) params.set("company_id", String(companyId));
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`), { method: "POST", credentials: "include" });
      const json = await res.json();
      const ids = new Set((json.data?.linked_account_ids || []).map(Number));
      setSettingLinked(ids); setSettingInitial(new Set(ids));
    } catch { notify(t("loadLinksFailed"), "danger"); }
  };

  const saveCurrencySetting = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const linked = [], unlinked = [];
    accounts.forEach(a => {
      const id = Number(a.id); const was = settingInitial.has(id), now = settingLinked.has(id);
      if (now && !was) linked.push(id); if (!now && was) unlinked.push(id);
    });
    try {
      const params = new URLSearchParams({ action: "bulk_update" });
      if (companyId) params.set("company_id", String(companyId));
      const res = await fetch(buildApiUrl(`api/accounts/bulk_account_currency_api.php?${params.toString()}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency_id: settingCurrencyId, linked_account_ids: linked, unlinked_account_ids: unlinked }), credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notifyApi(json.message, "saveFailed", "danger");
      setSettingInitial(new Set(settingLinked));
      setCurrencySettingOpen(false);
      notify(t("currencySettingsSaved"));
      void fetchAccounts();
      if (editModalOpen && form.id) void loadSelectionMeta(form.id, true);
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const openLink = async (id) => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    try {
      if (!companyId) return notify(t("pleaseSelectCompanyFirst"), "danger");
      setLinkingAccountId(Number(id));
      setLinkType("bidirectional");
      setLinkSearchTerm("");
      const [allRes, linkedRes] = await Promise.all([
        fetch(buildApiUrl(`api/accounts/accountlistapi.php?company_id=${companyId}&showAll=1`), { credentials: "include" }),
        fetch(buildApiUrl(`api/accounts/account_link_api.php?action=get_linked_accounts&account_id=${id}&company_id=${companyId}`), { credentials: "include" }),
      ]);
      const allJson = await allRes.json();
      const linkedJson = await linkedRes.json();
      const pool = Array.isArray(allJson?.data?.accounts) ? allJson.data.accounts : [];
      setLinkAccountsPool(pool);
      const types = linkedJson?.data?.link_types_map || {};
      setLinkTypeMap(types);
      const initial = new Set(
        (Array.isArray(linkedJson?.data?.accounts) ? linkedJson.data.accounts : [])
          .filter((a) => types[a.id] === "bidirectional")
          .map((a) => Number(a.id))
      );
      setSelectedLinkedIds(initial);
      setLinkModalOpen(true);
    } catch {
      notify(t("failedOpenLinkModal"), "danger");
    }
  };

  useEffect(() => {
    if (!linkModalOpen) return;
    const next = new Set(
      Object.entries(linkTypeMap)
        .filter(([, type]) => type === linkType)
        .map(([id]) => Number(id))
    );
    setSelectedLinkedIds(next);
  }, [linkType, linkTypeMap, linkModalOpen]);

  const saveLinks = async () => {
    if (accountMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!linkingAccountId || !companyId) return;
    try {
      const refRes = await fetch(buildApiUrl(`api/accounts/account_link_api.php?action=get_linked_accounts&account_id=${linkingAccountId}&company_id=${companyId}`), { credentials: "include" });
      const refJson = await refRes.json();
      const typesMap = refJson?.data?.link_types_map || {};
      const currentTypeIds = new Set(
        (Array.isArray(refJson?.data?.accounts) ? refJson.data.accounts : [])
          .filter((a) => typesMap[a.id] === linkType)
          .map((a) => Number(a.id))
      );
      const desiredIds = new Set([...selectedLinkedIds]);
      const toAdd = [...desiredIds].filter((id) => !currentTypeIds.has(id));
      const toRemove = [...currentTypeIds].filter((id) => !desiredIds.has(id));

      for (const linkedId of toRemove) {
        await fetch(buildApiUrl("api/accounts/account_link_api.php?action=unlink_accounts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id_1: Number(linkingAccountId), account_id_2: Number(linkedId), company_id: Number(companyId) }),
          credentials: "include",
        });
      }
      for (const linkedId of toAdd) {
        await fetch(buildApiUrl("api/accounts/account_link_api.php?action=link_accounts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id_1: Number(linkingAccountId),
            account_id_2: Number(linkedId),
            company_id: Number(companyId),
            link_type: linkType,
            source_account_id: linkType === "unidirectional" ? Number(linkingAccountId) : null,
          }),
          credentials: "include",
        });
      }
      if (toAdd.length === 0 && toRemove.length === 0 && desiredIds.size > 0) {
        for (const linkedId of desiredIds) {
          await fetch(buildApiUrl("api/accounts/account_link_api.php?action=update_link_type"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id_1: Number(linkingAccountId),
              account_id_2: Number(linkedId),
              company_id: Number(companyId),
              link_type: linkType,
              source_account_id: linkType === "unidirectional" ? Number(linkingAccountId) : null,
            }),
            credentials: "include",
          });
        }
      }
      setLinkModalOpen(false);
      notify(t("accountLinksSavedSuccessfully"));
    } catch {
      notify(t("failedSaveAccountLinks"), "danger");
    }
  };

  if (bootLoading || !sessionReady || !cssReady) return <PageContentLoader />;

  const handleSort = (column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
  };

  const renderSortIcon = (column) => (
    <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
      <span className="account-sort-icon__up" />
      <span className="account-sort-icon__down" />
    </span>
  );

  const renderSortableHeader = (label, column) => (
    <div
      className="account-header-item account-header-sortable"
      role="button"
      tabIndex={0}
      onClick={() => handleSort(column)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSort(column);
        }
      }}
    >
      <span>{label}</span>
      {renderSortIcon(column)}
    </div>
  );

  return (
    <>
      <div className="container">
        <div className="content">
          <div className="action-buttons-container">
            <div className="action-buttons">
              <div className="account-toolbar-top-row">
                <div className="action-controls-row account-toolbar-primary">
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    id="accountlist-search-input"
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchByAccountOrName")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(toUpper(e.target.value))}
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
                <div className="user-toolbar-actions-right">
                  <button type="button" className="btn btn-currency-setting" disabled={accountMutationsBlocked} onClick={openCurrencySetting}>
                    {t("currencySetting")}
                  </button>
                  <button type="button" className="btn btn-add" disabled={accountMutationsBlocked} onClick={openAdd}>
                    <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                    {t("addAccount")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-delete"
                    disabled={!selectedDeleteIds.size || accountMutationsBlocked}
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    {t("deleteWithCount", { count: selectedDeleteIds.size })}
                  </button>
                </div>
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
                      {groupIds.map((gid) => (
                        <button
                          key={gid}
                          type="button"
                          className={`user-gc-segment${groupFilterKind === "follow" && gid === selectedGroupKey ? " is-on" : ""}`}
                          onClick={() => handlePickGroup(gid)}
                        >
                          {gid}
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
                    {companiesForPicker.map((c) => {
                      const active = Number(pickerCompanyId) === Number(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`user-gc-segment${active ? " is-on" : ""}`}
                          onClick={() => {
                            if (switchingCompany) return;
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
            </div>
          </div>

          <div className="account-table-wrapper account-list-table">
            <div className="account-list-table-inner">
            <div className="account-table-header account-list-table-header">
              <div className="account-header-item">{t("no")}</div>
              {renderSortableHeader(t("account"), "account")}
              {renderSortableHeader(t("name"), "name")}
              {renderSortableHeader(t("role"), "role")}
              {renderSortableHeader(t("alert"), "alert")}
              {renderSortableHeader(t("status"), "status")}
              {renderSortableHeader(t("lastLogin"), "lastLogin")}
              {renderSortableHeader(t("remark"), "remark")}
              <div className="account-header-item">{t("action")}</div>
            </div>
            <div className={`account-cards${showAll ? " account-cards--show-all" : ""}`}>
              {pageRows.map((a, idx) => {
                const alertOn = String(a.payment_alert) === "1";
                const isInactive = String(a.status || "").toLowerCase() === "inactive";
                return (
                  <div className="account-card account-list-row" key={a.id}>
                    <div className="account-card-item">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                    <div className="account-card-item">{toUpper(a.account_id)}</div>
                    <div className="account-card-item">{toUpper(a.name)}</div>
                    <div className="account-card-item"><span className={`account-role-badge account-role-${String(a.role || "").toLowerCase().replace(/\s+/g, "-")}`}>{toUpper(a.role) === "UPLINE" ? t("supplier") : toUpper(a.role)}</span></div>
                    <div className="account-card-item"><span className={`account-role-badge ${alertOn ? "account-status-active" : "account-status-inactive"}${accountMutationsBlocked ? "" : " status-clickable"}`} onClick={accountMutationsBlocked ? () => notify(t("readOnlyActionBlocked"), "danger") : () => togglePaymentAlert(a.id)} style={accountMutationsBlocked ? { cursor: "not-allowed" } : undefined}>{alertOn ? "ON" : "OFF"}</span></div>
                    <div className="account-card-item"><span className={`account-role-badge ${isInactive ? "account-status-inactive" : "account-status-active"}${accountMutationsBlocked ? "" : " status-clickable"}`} onClick={accountMutationsBlocked ? () => notify(t("readOnlyActionBlocked"), "danger") : () => toggleAccountStatus(a.id)} style={accountMutationsBlocked ? { cursor: "not-allowed" } : undefined}>{toUpper(a.status)}</span></div>
                    <div className="account-card-item">{toUpper(a.last_login)}</div>
                    <div className="account-card-item">{toUpper(a.remark)}</div>
                    <div className="account-card-item">
                      <button type="button" className="account-edit-btn" disabled={accountMutationsBlocked} onClick={() => openEdit(a.id)}><img src={assetUrl("images/edit.svg")} alt={t("edit")} /></button>
                      <button type="button" className="account-edit-btn" disabled={accountMutationsBlocked} onClick={() => openLink(a.id)} style={{ marginLeft: 5 }} title={t("linkAccountTitle")}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                      {isInactive && <input type="checkbox" style={{ marginLeft: 10 }} disabled={accountMutationsBlocked} checked={selectedDeleteIds.has(Number(a.id))} onChange={(e) => setSelectedDeleteIds(prev => { const n = new Set(prev); if (e.target.checked) n.add(Number(a.id)); else n.delete(Number(a.id)); return n; })} />}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
          {!showAll && (
            <div className="account-pagination-container">
              <button className="account-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
              <span className="account-pagination-info">{t("paginationOf", { page: currentPage, total: totalPages })}</span>
              <button className="account-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
            </div>
          )}
        </div>
      </div>

      {toast && typeof document !== "undefined" && document.body
        ? createPortal(
            <div
              id="accountNotificationContainer"
              className="account-notification-container"
              style={{
                zIndex:
                  addModalOpen || editModalOpen || linkModalOpen || confirmDeleteOpen || currencySettingOpen
                    ? processNotificationAboveAccountZIndex
                    : processNotificationZIndex,
              }}
            >
              <div className={`account-notification account-notification-${toast.type} show`}>{toast.message}</div>
            </div>,
            document.body
          )
        : null}

      <AccountModal
        open={addModalOpen || editModalOpen}
        title={isEditMode ? t("editAccount") : t("addAccount")}
        isEditMode={isEditMode}
        form={form}
        setForm={setForm}
        orderedRoles={orderedRoles}
        currencies={accountModalCurrencies}
        companies={allCompanyButtons}
        selectedCurrencyIds={selectedCurrencyIds}
        setSelectedCurrencyIds={setSelectedCurrencyIds}
        selectedCompanyIds={selectedCompanyIds}
        setSelectedCompanyIds={setSelectedCompanyIds}
        currencyInput={currencyInput}
        setCurrencyInput={setCurrencyInput}
        onCreateCurrency={(e) => {
          // Allow UI reuse without forcing event handling conventions.
          if (e?.preventDefault) e.preventDefault();
          createCurrency();
        }}
        onRemoveCurrency={removeModalCurrency}
        currencyDeleteOnlyWhenDeselected
        onSubmit={saveForm}
        onClose={() => {
          setAddModalOpen(false);
          setEditModalOpen(false);
          setHiddenCurrencyIds([]);
        }}
        t={t}
      />
      <AccountConfirmModal open={confirmDeleteOpen} message={t("deleteConfirmMessage", { count: selectedDeleteIds.size })} onConfirm={confirmDelete} onClose={() => setConfirmDeleteOpen(false)} t={t} />
      <CurrencySettingModal open={currencySettingOpen} onClose={() => setCurrencySettingOpen(false)} currencies={currencies} settingCurrencyId={settingCurrencyId} setSettingCurrencyId={setSettingCurrencyId} settingLinked={settingLinked} setSettingLinked={setSettingLinked} settingSearch={settingSearch} setSettingSearch={setSettingSearch} settingRole={settingRole} setSettingRole={setSettingRole} onLoadCurrencyLinks={loadCurrencyLinks} onClearCurrencySelection={clearCurrencySettingSelection} onSave={saveCurrencySetting} accounts={accounts} roles={roles} currencyInput={currencyInput} setCurrencyInput={setCurrencyInput} onCreateCurrency={createCurrency} t={t} />
      <LinkAccountModal open={linkModalOpen} accounts={linkAccountsPool} currentAccountId={linkingAccountId} selectedIds={selectedLinkedIds} setSelectedIds={setSelectedLinkedIds} linkType={linkType} setLinkType={setLinkType} searchTerm={linkSearchTerm} setSearchTerm={setLinkSearchTerm} onSave={saveLinks} onClose={() => setLinkModalOpen(false)} t={t} />
    </>
  );
}
