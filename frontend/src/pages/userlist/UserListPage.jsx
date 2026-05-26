import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../utils/company/companySessionEvents.js";
import { isPartnershipAuditReadOnlyLocked } from "../../utils/audit/partnershipAuditReadOnly.js";
import { assetUrl, buildApiUrl } from "../../utils/core/apiUrl.js";
import { validateEmailFormat } from "../../utils/input/emailValidation.js";
import { useAuthSession } from "../../context/AuthSessionContext.jsx";
import "../../../public/css/accountCSS.css";
import "../../../public/css/userlist.css";
import "../../../public/css/admin-responsive.css";
import {
  ALL_ROLE_OPTIONS,
  PAGE_SIZE,
  PERMISSION_KEYS,
  applyUserFilters,
  computeRowCapabilities,
  formatLastLogin,
  getAvailableRolesForCreation,
  getAvailableRolesForEdit,
  getCurrentUserRolePermissions,
  getDeleteCheckboxState,
  getFinalPermissionsForCreation,
  getRoleTemplateSidebarList,
  normRole,
  sortUsers,
  roleHasReadOnlyToggle,
  canInteractWithReadOnlyToggle,
  isUserModalPageReadOnlyLock,
  getUserEditFieldLocks,
} from "./userListLogic.js";

// Components
import UserModal from "./components/UserModal.jsx";
import UserConfirmModal from "./components/UserConfirmModal.jsx";
import { processNotificationAboveAccountZIndex, processNotificationZIndex } from "../../components/ProcessModalPortal.jsx";
import { getUserListText, translateUserListApiMessage } from "../../translateFile/pages/userListTranslate.js";

function roleBadgeClass(role) {
  return `role-${String(role || "").toLowerCase().replace(/\s+/g, "-")}`;
}

function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

/** 集团分润/合并虚拟行（get_companies_helper _applyGroupLinkVirtualRows）；User List 分组只按库表真实 group_id */
function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

function buildModalCompanyList(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).filter((c) => {
    const key = String(c?.company_id || "").trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function UserListPage() {
  const navigate = useNavigate();
  const { me, sessionReady } = useAuthSession();
  const [lang, setLang] = useState(() => (localStorage.getItem("login_lang") === "zh" ? "zh" : "en"));
  const langRef = useRef(lang);
  langRef.current = lang;
  const t = useCallback((key, params) => getUserListText(lang, key, params), [lang]);
  const [bootLoading, setBootLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [usersRaw, setUsersRaw] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableSwapAnimating, setTableSwapAnimating] = useState(false);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [pendingCompanyId, setPendingCompanyId] = useState(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sortColumn, setSortColumn] = useState("loginId");
  const [sortDirection, setSortDirection] = useState("asc");
  /** Group 筛选：follow=随当前公司所属组；all=全部公司；ungrouped=仅无 group_id 的公司 */
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState(new Set());
  const [selectAllUsers, setSelectAllUsers] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [cssReady, setCssReady] = useState(false);
  const toastTimerRef = useRef(null);
  const tableSwapTimerRef = useRef(null);
  const hasLoadedUsersRef = useRef(false);
  const pendingDeleteRef = useRef(null);
  const listFetchAbortRef = useRef(null);
  const modalCompaniesCacheRef = useRef([]);
  const modalAccessCacheRef = useRef(new Map());
  const modalAccessPendingRef = useRef(new Map());
  const modalAccessCompanyIdRef = useRef(null);
  const modalLoadSeqRef = useRef(0);
  const editUserDetailCacheRef = useRef(new Map());
  const editUserDetailPendingRef = useRef(new Map());

  const [modalOpen, setModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
  const [permSelected, setPermSelected] = useState(() => new Set());
  const [modalCompanies, setModalCompanies] = useState([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [modalAccounts, setModalAccounts] = useState([]);
  const [modalProcesses, setModalProcesses] = useState([]);
  const [modalAccessReadyCompanyId, setModalAccessReadyCompanyId] = useState(null);
  const [editReadyIds, setEditReadyIds] = useState(() => new Set());
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [selectedProcessIds, setSelectedProcessIds] = useState(new Set());
  const [roleSelectDisabled, setRoleSelectDisabled] = useState(false);
  const [loginDisabled, setLoginDisabled] = useState(false);
  const [fieldLocks, setFieldLocks] = useState({ name: false, email: false, role: false, password: false, sidebar: false, company: false });

  const handleUserListSort = useCallback((column) => {
    setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
    setSortColumn(column);
  }, [sortColumn]);

  const renderUserListHeaderSortIcon = useCallback(
    (column) => (
      <span className={`account-sort-icon${sortColumn === column ? ` is-active is-${sortDirection}` : ""}`} aria-hidden="true">
        <span className="account-sort-icon__up" />
        <span className="account-sort-icon__down" />
      </span>
    ),
    [sortColumn, sortDirection],
  );

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const notifyApi = useCallback(
    (apiMessage, fallbackKey, type = "success", params = {}) => {
      notify(translateUserListApiMessage(lang, apiMessage, fallbackKey, params), type);
    },
    [lang, notify],
  );

  const currentUserId = me?.user_id ?? null;
  const currentUserRole = normRole(me?.role);

  const isC168Company = useMemo(() => {
    const c = companies.find((x) => Number(x.id) === Number(companyId));
    return c && String(c.company_id || "").toUpperCase() === "C168";
  }, [companies, companyId]);

  const allCompanyButtons = useMemo(
    () =>
      companies.filter(
        (c) => c.company_id && String(c.company_id).trim() !== "" && !isVirtualGroupLinkCompanyRow(c)
      ),
    [companies]
  );
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons
        .map((c) => String(c.group_id || "").trim().toUpperCase())
        .filter(Boolean))]
        .sort(),
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
  const filteredSorted = useMemo(() => {
    const f = applyUserFilters(usersRaw, { search, showInactive, showAll, viewerRole: currentUserRole });
    return sortUsers(f, sortColumn, sortDirection);
  }, [usersRaw, search, showInactive, showAll, currentUserRole, sortColumn, sortDirection]);

  const canCreateUser = useMemo(() => getAvailableRolesForCreation(currentUserRole).length > 0, [currentUserRole]);
  const userMutationsBlocked = useMemo(() => isPartnershipAuditReadOnlyLocked(me), [me]);
  const modalAccessReady = companyId != null && modalAccessReadyCompanyId != null && Number(modalAccessReadyCompanyId) === Number(companyId);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE)), [filteredSorted.length]);

  /** 与顶部 chip 一致：仅「显示停用」或「显示全部」时展示批量删除勾选列（默认活跃分页不展示） */
  const showBulkDeleteColumn = showInactive || showAll;

  const pageRows = useMemo(() => {
    if (showAll) return filteredSorted;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSorted.slice(start, start + PAGE_SIZE);
  }, [filteredSorted, currentPage, showAll]);

  const listBusy = tableLoading || switchingCompany;
  /** 仅首次无数据时显示简单加载行；有缓存数据时保持表格行（切换公司/刷新不闪骨架条） */
  const showInitialTableLoading = listBusy && usersRaw.length === 0;

  const permDisabledMap = useMemo(() => {
    const allowed = new Set(getCurrentUserRolePermissions(currentUserRole));
    const m = {};
    PERMISSION_KEYS.forEach((k) => { m[k] = currentUserRole !== "owner" && !allowed.has(k); });
    return m;
  }, [currentUserRole]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    if (search.trim()) url.searchParams.set("search", search.trim()); else url.searchParams.delete("search");
    if (showAll) url.searchParams.set("showAll", "1"); else url.searchParams.delete("showAll");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [companyId, search, showAll]);

  useEffect(() => { if (!bootLoading) syncUrl(); }, [bootLoading, syncUrl]);

  useEffect(() => {
    if (!showInactive && !showAll) {
      setSelectedDeleteIds(new Set());
      setSelectAllUsers(false);
    }
  }, [showInactive, showAll]);

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
    document.body.classList.add("user-page");
    setCssReady(true);
    return () => {
      document.body.classList.remove("user-page", "user-page--show-all", "bg");
      document.body.classList.add("dashboard-page");
      setCssReady(false);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (tableSwapTimerRef.current) clearTimeout(tableSwapTimerRef.current);
    };
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!companyId || !me) return;
    listFetchAbortRef.current?.abort();
    const ac = new AbortController();
    listFetchAbortRef.current = ac;
    setTableLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get" }),
        signal: ac.signal,
      });
      const json = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok || !json.success) {
        notifyApi(json.message, "failedToLoadUsers", "danger");
        setUsersRaw([]);
        return;
      }
      let list = Array.isArray(json.data) ? json.data.map((u) => ({ ...u, is_owner_shadow: false })) : [];
      if (normRole(me.role) === "owner" && me.user_id) {
        try {
          const r2 = await fetch(buildApiUrl("api/users/userlist_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "get", id: me.user_id }),
            signal: ac.signal,
          });
          const j2 = await r2.json();
          if (ac.signal.aborted) return;
          if (j2.success && j2.data && normRole(j2.data.role) === "owner") {
            const shadow = { ...j2.data, is_owner_shadow: true };
            if (!list.some((u) => Number(u.id) === Number(shadow.id))) list = [shadow, ...list];
          }
        } catch {
          if (ac.signal.aborted) return;
        }
      }
      const shouldAnimateSwap = hasLoadedUsersRef.current;
      if (shouldAnimateSwap) {
        if (tableSwapTimerRef.current) clearTimeout(tableSwapTimerRef.current);
        setTableSwapAnimating(true);
      }
      setUsersRaw(list);
      editUserDetailCacheRef.current.clear();
      setEditReadyIds(new Set());
      hasLoadedUsersRef.current = true;
      if (shouldAnimateSwap) {
        tableSwapTimerRef.current = setTimeout(() => setTableSwapAnimating(false), 180);
      }
      setCurrentPage(1);
      setSelectedDeleteIds(new Set());
      setSelectAllUsers(false);
    } catch (e) {
      if (ac.signal.aborted) return;
      notifyApi(null, "failedToLoadUsers", "danger");
    } finally {
      if (!ac.signal.aborted) setTableLoading(false);
    }
  }, [companyId, me, notify]);

  useEffect(() => {
    if (!sessionReady || !me) return;
    let cancelled = false;
    (async () => {
      try {
        const perms = Array.isArray(me.permissions) ? me.permissions : [];
        if (perms.length > 0 && !perms.includes("admin")) {
          navigate("/dashboard", { replace: true });
          return;
        }
        const compRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
        const compJson = await compRes.json();
        if (cancelled) return;
        const rows = Array.isArray(compJson?.data) ? compJson.data.map(normalizeCompanyRow) : [];
        setCompanies(rows);
        const modalCompanyList = buildModalCompanyList(rows);
        modalCompaniesCacheRef.current = modalCompanyList;
        setModalCompanies(modalCompanyList);
        const url = new URL(window.location.href);
        const cid = url.searchParams.get("company_id");
        const effective = cid || me.company_id || rows[0]?.id || null;
        setCompanyId(effective ? Number(effective) : null);
        setSearch(String(url.searchParams.get("search") || ""));
        setShowAll(url.searchParams.get("showAll") === "1");
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

  useEffect(() => {
    if (!bootLoading && companyId && me) void fetchUsers();
  }, [bootLoading, companyId, me, fetchUsers]);

  useEffect(() => () => listFetchAbortRef.current?.abort(), []);

  const onSwitchCompany = async (c) => {
    const nextCompanyId = Number(c?.id);
    if (!nextCompanyId || Number(nextCompanyId) === Number(pickerCompanyId) || switchingCompany) {
      return;
    }
    setPendingCompanyId(nextCompanyId);
    setSwitchingCompany(true);
    setTableLoading(true);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`), { credentials: "include" });
      const json = await res.json();
      if (!json.success) {
        notifyApi(json.error || json.message, "couldNotSwitchCompany", "danger");
        setTableLoading(false);
        return;
      }
      setCompanyId(nextCompanyId);
      notifyCompanySessionUpdated();
    } catch {
      notify(t("companySwitchFailed"), "danger");
      setTableLoading(false);
    } finally {
      setPendingCompanyId(null);
      setSwitchingCompany(false);
    }
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

  const fetchModalAccountsProcesses = useCallback(async (cid, force = false) => {
    const cacheKey = String(cid || "");
    const cached = modalAccessCacheRef.current.get(cacheKey);
    if (cached && !force) {
      modalAccessCompanyIdRef.current = Number(cid);
      setModalAccounts(cached.accounts);
      setModalProcesses(cached.processes);
      setModalAccessReadyCompanyId(Number(cid));
      return cached;
    }
    const pending = modalAccessPendingRef.current.get(cacheKey);
    if (pending) {
      try {
        const next = await pending;
        modalAccessCompanyIdRef.current = Number(cid);
        setModalAccounts(next.accounts);
        setModalProcesses(next.processes);
        setModalAccessReadyCompanyId(Number(cid));
        return next;
      } catch { setModalAccounts([]); setModalProcesses([]); return { accounts: [], processes: [] }; }
    }
    try {
      const request = Promise.all([
        fetch(buildApiUrl(`api/accounts/accountlistapi.php?company_id=${cid}`), { credentials: "include" }),
        fetch(buildApiUrl(`api/processes/processlist_api.php?company_id=${cid}&showAll=1`), { credentials: "include" }),
      ]).then(async ([accRes, procRes]) => {
        const accJ = await accRes.json(); const procJ = await procRes.json();
        const accs = (accJ?.data?.accounts || []).filter((a) => String(a.status || "").toLowerCase() === "active").map((a) => ({ id: a.id, account_id: a.account_id, name: String(a.name || "").trim() }));
        const procs = (Array.isArray(procJ?.data) ? procJ.data : []).filter((p) => String(p.status || "").toLowerCase() === "active").map((p) => ({ id: p.id, process_id: p.process_name || p.process_id || "", description: p.description_name || p.description || "" }));
        return { accounts: accs, processes: procs };
      });
      modalAccessPendingRef.current.set(cacheKey, request);
      const next = await request;
      modalAccessCacheRef.current.set(cacheKey, next);
      modalAccessCompanyIdRef.current = Number(cid);
      setModalAccounts(next.accounts); setModalProcesses(next.processes); setModalAccessReadyCompanyId(Number(cid)); return next;
    } catch {
      if (cached) {
        setModalAccounts(cached.accounts);
        setModalProcesses(cached.processes);
        setModalAccessReadyCompanyId(Number(cid));
        return cached;
      }
      setModalAccessReadyCompanyId(null);
      setModalAccounts([]); setModalProcesses([]); return { accounts: [], processes: [] };
    }
    finally { modalAccessPendingRef.current.delete(cacheKey); }
  }, []);

  useEffect(() => {
    if (!bootLoading && companyId && me) {
      if (!modalAccessCacheRef.current.has(String(companyId))) setModalAccessReadyCompanyId(null);
      void fetchModalAccountsProcesses(companyId);
    }
  }, [bootLoading, companyId, me, fetchModalAccountsProcesses]);

  const loadCompaniesForModal = async () => {
    if (modalCompaniesCacheRef.current.length) {
      setModalCompanies(modalCompaniesCacheRef.current);
      return modalCompaniesCacheRef.current;
    }
    const currentList = buildModalCompanyList(companies);
    if (currentList.length) {
      modalCompaniesCacheRef.current = currentList;
      setModalCompanies(currentList);
      return currentList;
    }
    try {
      const res = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" });
      const json = await res.json();
      const list = buildModalCompanyList(json.data);
      modalCompaniesCacheRef.current = list;
      setModalCompanies(list); return list;
    } catch { setModalCompanies([]); return []; }
  };

  const markEditReady = useCallback((id) => {
    const nId = Number(id);
    if (!nId) return;
    setEditReadyIds((prev) => {
      if (prev.has(nId)) return prev;
      const next = new Set(prev);
      next.add(nId);
      return next;
    });
  }, []);

  const fetchEditUserDetail = useCallback(async (id, force = false) => {
    const cacheKey = String(id || "");
    if (!cacheKey) return null;
    const cached = editUserDetailCacheRef.current.get(cacheKey);
    if (cached && !force) {
      markEditReady(id);
      return cached;
    }
    const pending = editUserDetailPendingRef.current.get(cacheKey);
    if (pending) {
      try {
        const next = await pending;
        markEditReady(id);
        return next;
      } catch { return cached || null; }
    }
    const request = fetch(buildApiUrl("api/users/userlist_api.php"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "get", id }),
    }).then(async (res) => {
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.message || "Load user failed");
      return json.data;
    });
    editUserDetailPendingRef.current.set(cacheKey, request);
    try {
      const next = await request;
      editUserDetailCacheRef.current.set(cacheKey, next);
      markEditReady(id);
      return next;
    } catch {
      return cached || null;
    } finally {
      editUserDetailPendingRef.current.delete(cacheKey);
    }
  }, [markEditReady]);

  const applyEditDetail = useCallback((row, detail, accList, procList) => {
    let perms = []; try { perms = detail.permissions ? JSON.parse(detail.permissions) : []; } catch { perms = []; }
    setPermSelected(new Set(perms.map((p) => String(p).toLowerCase())));
    setForm((f) => ({ ...f, read_only: detail.read_only !== undefined ? parseInt(detail.read_only, 10) === 1 : true }));
    let ap = null, pp = null; try { if (detail.account_permissions != null) ap = typeof detail.account_permissions === "string" ? JSON.parse(detail.account_permissions) : detail.account_permissions; } catch { ap = []; }
    try { if (detail.process_permissions != null) pp = typeof detail.process_permissions === "string" ? JSON.parse(detail.process_permissions) : detail.process_permissions; } catch { pp = []; }
    setSelectedAccountIds(ap === null ? new Set(accList.map(a => Number(a.id))) : new Set((Array.isArray(ap) ? ap : []).map(x => Number(x.id || x))));
    setSelectedProcessIds(pp === null ? new Set(procList.map(p => Number(p.id))) : new Set((Array.isArray(pp) ? pp : []).map(x => Number(x.id || x))));
    if (Array.isArray(detail.company_ids) && (currentUserRole === "admin" || currentUserRole === "owner")) { setSelectedCompanyIds(detail.company_ids.map(Number)); } else { setSelectedCompanyIds(companyId ? [Number(companyId)] : []); }
    if (row.is_owner_shadow) { setPermSelected(new Set(PERMISSION_KEYS)); setSelectedAccountIds(new Set(accList.map(a => Number(a.id)))); setSelectedProcessIds(new Set(procList.map(p => Number(p.id)))); setSelectedCompanyIds([]); }
  }, [companyId, currentUserRole]);

  useEffect(() => {
    if (!modalAccessReady) return;
    pageRows.forEach((row) => {
      const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
      if (caps.canEditDelete && !editUserDetailCacheRef.current.has(String(row.id))) void fetchEditUserDetail(row.id);
    });
  }, [currentUserId, currentUserRole, fetchEditUserDetail, modalAccessReady, pageRows]);

  const openAdd = async () => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!companyId) return;
    if (!modalAccessReady) return;
    const avail = getAvailableRolesForCreation(currentUserRole);
    if (avail.length === 0) { notify(t("noPermissionCreateAccounts"), "danger"); return; }
    const loadSeq = ++modalLoadSeqRef.current;
    setIsEditMode(false); setEditingRow(null);
    setForm({ id: "", login_id: "", name: "", email: "", role: "", password: "", secondary_password: "", status: "active", read_only: true });
    setRoleSelectDisabled(false); setLoginDisabled(false);
    setFieldLocks({ name: false, email: false, role: false, password: false, sidebar: false, company: false });
    const allP = new Set(PERMISSION_KEYS.filter((k) => !permDisabledMap[k])); setPermSelected(allP);
    void loadCompaniesForModal();
    const cachedAccess = modalAccessCacheRef.current.get(String(companyId || ""));
    const currentAccess = Number(modalAccessCompanyIdRef.current) === Number(companyId) ? { accounts: modalAccounts, processes: modalProcesses } : null;
    const initialAccess = cachedAccess || currentAccess || { accounts: [], processes: [] };
    if (!cachedAccess && !currentAccess) { setModalAccounts([]); setModalProcesses([]); }
    setSelectedAccountIds(new Set(initialAccess.accounts.map((a) => Number(a.id)))); setSelectedProcessIds(new Set(initialAccess.processes.map((p) => Number(p.id))));
    if (currentUserRole === "admin" || currentUserRole === "owner") { setSelectedCompanyIds(companyId ? [Number(companyId)] : []); }
    setModalOpen(true);
    void fetchModalAccountsProcesses(companyId, true).then(({ accounts: accList, processes: procList }) => {
      if (loadSeq !== modalLoadSeqRef.current) return;
      setSelectedAccountIds(new Set(accList.map((a) => Number(a.id)))); setSelectedProcessIds(new Set(procList.map((p) => Number(p.id))));
    });
  };

  const applyPermTemplate = (role, force) => {
    if (isEditMode && !force) return;
    const next = new Set(); getRoleTemplateSidebarList(role).forEach((k) => next.add(k)); setPermSelected(next);
  };

  const openEdit = async (row) => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (!companyId) return;
    if (row.is_owner_shadow && currentUserRole !== "owner") { notify(t("onlyOwnerCanEditOwner"), "danger"); return; }
    if (!modalAccessReady) return;
    const cachedDetail = editUserDetailCacheRef.current.get(String(row.id));
    if (!cachedDetail) return;
    const loadSeq = ++modalLoadSeqRef.current;
    const cachedAccess = modalAccessCacheRef.current.get(String(companyId || "")) || { accounts: modalAccounts, processes: modalProcesses };
    setIsEditMode(true); setEditingRow(row);
    setForm({ id: String(row.id), login_id: row.login_id || "", name: row.name || "", email: row.email || "", role: normRole(row.role), password: "", secondary_password: "", status: normRole(row.status) || "active", read_only: true });
    setRoleSelectDisabled(!!row.is_owner_shadow); setLoginDisabled(true);
    setFieldLocks(getUserEditFieldLocks(row, currentUserId, currentUserRole));
    void loadCompaniesForModal();
    applyEditDetail(row, cachedDetail, cachedAccess.accounts, cachedAccess.processes);
    setModalOpen(true);
    void Promise.all([fetchModalAccountsProcesses(companyId, true), fetchEditUserDetail(row.id, true)]).then(([access, detail]) => {
      if (loadSeq !== modalLoadSeqRef.current || !detail) return;
      applyEditDetail(row, detail, access.accounts, access.processes);
    });
  };

  const closeModal = () => { modalLoadSeqRef.current += 1; setModalOpen(false); setEditingRow(null); };

  const toggleUserStatus = async (row) => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    const caps = computeRowCapabilities(row, currentUserId, currentUserRole);
    if (!caps.canToggleStatus) return;
    try {
      const fd = new FormData(); fd.append("id", String(row.id));
      const res = await fetch(buildApiUrl("api/users/toggle_status_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json(); const newStatus = json?.data?.newStatus || json?.newStatus;
      if (!json.success || !newStatus) { notifyApi(json.message, "toggleFailed", "danger"); return; }
      setUsersRaw((prev) => prev.map((u) => (Number(u.id) === Number(row.id) ? { ...u, status: newStatus } : u))); notify(t("statusUpdated"), "success");
    } catch { notify(t("toggleFailed"), "danger"); }
  };

  const confirmDelete = async () => {
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      setConfirmOpen(false);
      return;
    }
    const ids = pendingDeleteRef.current || []; pendingDeleteRef.current = []; setConfirmOpen(false);
    if (!ids.length) return;
    const results = await Promise.all(ids.map((id) => fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "delete", id }) }).then((r) => r.json().catch(() => ({ success: false })))));
    const ok = results.filter((r) => r.success).length;
    if (ok === ids.length) notify(t("deletedUsersSuccess", { count: ok }), "success"); else notify(t("deletionResult", { ok, fail: ids.length - ok }), "danger");
    setUsersRaw((prev) => prev.filter((u) => !ids.includes(Number(u.id)))); setSelectedDeleteIds(new Set()); setSelectAllUsers(false);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (userMutationsBlocked) {
      notify(t("readOnlyActionBlocked"), "danger");
      return;
    }
    if (isUserModalPageReadOnlyLock(isEditMode, editingRow, form.role, form.read_only, currentUserId)) return;
    if (!isEditMode && !form.password.trim()) { notify(t("passwordRequired"), "danger"); return; }
    const emailCheck = validateEmailFormat(form.email);
    if (!emailCheck.valid) { notify(t("apiInvalidEmail"), "danger"); return; }
    const accountPerms = Array.from(selectedAccountIds).map(id => { const a = modalAccounts.find(x => Number(x.id) === Number(id)); return { id: Number(id), account_id: a?.account_id || "" }; });
    const processPerms = Array.from(selectedProcessIds).map(id => { const p = modalProcesses.find(x => Number(x.id) === Number(id)); return { id: Number(id), process_id: p?.process_id || "", description: p?.description || "" }; });
    let payload = { action: isEditMode ? "update" : "create", id: form.id || undefined, login_id: form.login_id.trim(), name: form.name.trim(), email: emailCheck.email, role: form.role, status: form.status };
    if (form.password.trim()) payload.password = form.password;
    const allowSecondaryPassword = isC168Company || !!editingRow?.is_owner_shadow;
    if (allowSecondaryPassword && form.secondary_password.trim()) {
      if (!/^\d{6}$/.test(form.secondary_password.trim())) {
        notify(t("secondaryPasswordMustBe6Digits"), "danger");
        return;
      }
      payload.secondary_password = form.secondary_password.trim();
    }
    const roleForReadOnly = normRole(form.role) || normRole(editingRow?.role);
    if (roleForReadOnly && roleHasReadOnlyToggle(roleForReadOnly) && canInteractWithReadOnlyToggle(currentUserRole, roleForReadOnly)) {
      payload.read_only = form.read_only ? 1 : 0;
    }
    if (editingRow?.is_owner_shadow) {
      payload.role = "owner";
    } else if (!isEditMode) { payload.permissions = getFinalPermissionsForCreation(form.role, Array.from(permSelected), currentUserRole); payload.account_permissions = accountPerms; payload.process_permissions = processPerms; if ((currentUserRole === "admin" || currentUserRole === "owner")) payload.company_ids = selectedCompanyIds; } else {
      const caps = computeRowCapabilities(editingRow, currentUserId, currentUserRole);
      if (caps.isSelf || caps.isHigherLevel || caps.isSameLevel) {
        payload.account_permissions = accountPerms;
        payload.process_permissions = processPerms;
      } else {
        payload.permissions = Array.from(permSelected);
        payload.account_permissions = accountPerms;
        payload.process_permissions = processPerms;
      }
      if ((currentUserRole === "admin" || currentUserRole === "owner") && !fieldLocks.company) payload.company_ids = selectedCompanyIds;
    }
    try {
      const res = await fetch(buildApiUrl("api/users/userlist_api.php"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
      const json = await res.json(); if (!json.success) { notifyApi(json.message, "saveFailed", "danger"); return; }
      if (isEditMode && form.id) {
        editUserDetailCacheRef.current.delete(String(form.id));
        setEditReadyIds((prev) => {
          const next = new Set(prev);
          next.delete(Number(form.id));
          return next;
        });
      }
      notifyApi(json.message, "saved", "success"); closeModal();
      if (isEditMode && json.data?.will_lose_access) { setUsersRaw((prev) => prev.filter((u) => Number(u.id) !== Number(form.id))); }
      else if (json.data) { setUsersRaw((prev) => isEditMode ? prev.map((u) => (Number(u.id) === Number(json.data.id) ? { ...u, ...json.data, is_owner_shadow: u.is_owner_shadow } : u)) : [...prev, { ...json.data, is_owner_shadow: false }]); }
      else { void fetchUsers(); }
    } catch { notify(t("saveFailed"), "danger"); }
  };

  if (bootLoading || !sessionReady || !me || !cssReady) return <PageContentLoader />;

  return (
    <>
      <div className="container">
        <div className="content">
          <div className="action-buttons-container" style={{ marginBottom: 20 }}>
            <div className="action-buttons" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div className="search-container userlist-search-bar">
                  <span className="userlist-search-bar__icon" aria-hidden="true">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                  </span>
                  <input
                    id="userlist-search-input"
                    type="text"
                    className="search-input userlist-search-input"
                    placeholder={t("searchPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
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
                {canCreateUser ? (
                <button type="button" className="btn btn-add" onClick={openAdd} disabled={!modalAccessReady || userMutationsBlocked}>
                  <svg className="btn-add__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  {t("addUser")}
                </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-delete"
                  disabled={!selectedDeleteIds.size || userMutationsBlocked}
                  onClick={() => {
                    if (userMutationsBlocked) {
                      notify(t("readOnlyActionBlocked"), "danger");
                      return;
                    }
                    const ids = Array.from(selectedDeleteIds);
                    pendingDeleteRef.current = ids;
                    const selectedUserNames = usersRaw
                      .filter((u) => ids.includes(Number(u.id)))
                      .map((u) => String(u.login_id || u.name || u.email || u.id || "").trim())
                      .filter(Boolean);
                    const details = selectedUserNames.length ? `\n\n${selectedUserNames.join("\n")}` : "";
                    setConfirmMessage(`${t("deleteConfirmWithCount", { count: ids.length })}${details}`);
                    setConfirmOpen(true);
                  }}
                >
                  {t("deleteWithCount", { count: selectedDeleteIds.size })}
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
                            if (!active) {
                              void onSwitchCompany(c);
                            }
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
          <div className={`user-table-wrapper user-list-table${showBulkDeleteColumn ? " user-table-wrapper--bulk-delete-col" : ""}`}>
            <div className="user-list-table-inner">
            <div className="table-header user-list-table-header">
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("no")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("no");
                  }
                }}
              >
                <span className="header-item__label">{t("no")}</span>
                {renderUserListHeaderSortIcon("no")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("loginId")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("loginId");
                  }
                }}
              >
                <span className="header-item__label">{t("loginId")}</span>
                {renderUserListHeaderSortIcon("loginId")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("name")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("name");
                  }
                }}
              >
                <span className="header-item__label">{t("name")}</span>
                {renderUserListHeaderSortIcon("name")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("email")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("email");
                  }
                }}
              >
                <span className="header-item__label">{t("email")}</span>
                {renderUserListHeaderSortIcon("email")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("role")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("role");
                  }
                }}
              >
                <span className="header-item__label">{t("role")}</span>
                {renderUserListHeaderSortIcon("role")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("status")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("status");
                  }
                }}
              >
                <span className="header-item__label">{t("status")}</span>
                {renderUserListHeaderSortIcon("status")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("lastLogin")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("lastLogin");
                  }
                }}
              >
                <span className="header-item__label">{t("lastLogin")}</span>
                {renderUserListHeaderSortIcon("lastLogin")}
              </div>
              <div
                className="header-item header-item--with-sort-icon header-sortable"
                role="button"
                tabIndex={0}
                onClick={() => handleUserListSort("createdBy")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleUserListSort("createdBy");
                  }
                }}
              >
                <span className="header-item__label">{t("createdBy")}</span>
                {renderUserListHeaderSortIcon("createdBy")}
              </div>
              <div className="header-item">
                <span className="header-item__label">{t("action")}</span>
              </div>
              {showBulkDeleteColumn && (
                <div className="header-item header-item--select">
                  <input
                    type="checkbox"
                    aria-label={t("selectAllDeletableAria")}
                    checked={selectAllUsers}
                    disabled={userMutationsBlocked}
                    onChange={(e) => {
                      const on = e.target.checked;
                      const eligible = pageRows
                        .filter((r) => {
                          const c = computeRowCapabilities(r, currentUserId, currentUserRole);
                          return getDeleteCheckboxState(r, c).show;
                        })
                        .map((r) => Number(r.id));
                      setSelectedDeleteIds(on ? new Set(eligible) : new Set());
                      setSelectAllUsers(on);
                    }}
                  />
                </div>
              )}
            </div>
            <div className={`user-cards${tableSwapAnimating ? " user-cards--settling" : ""}`} aria-busy={listBusy}>
              {showInitialTableLoading ? (
                <div key="userlist-initial-loading" className="user-card user-card--loading show-card row-even" role="status">
                  {t("loading")}
                </div>
              ) : (
                pageRows.map((r, idx) => {
                const caps = computeRowCapabilities(r, currentUserId, currentUserRole);
                const del = getDeleteCheckboxState(r, caps);
                const editReady = caps.canEditDelete && modalAccessReady && editReadyIds.has(Number(r.id));
                return (
                  <div key={`${r.id}-${r.is_owner_shadow ? "o" : "u"}`} className={`user-card user-list-row show-card ${idx % 2 === 0 ? "row-even" : "row-odd"}`}>
                    <div className="card-item">{showAll ? idx + 1 : (currentPage - 1) * PAGE_SIZE + idx + 1}</div>
                    <div className="card-item">{r.login_id}</div>
                    <div className="card-item">{r.name}</div>
                    <div className="card-item">{r.email || "-"}</div>
                    <div className="card-item"><span className={`role-badge ${roleBadgeClass(r.role)}`}>{String(r.role || "").toUpperCase()}</span></div>
                    <div className="card-item"><span className={`role-badge ${normRole(r.status) === "active" ? "status-active" : "status-inactive"} ${caps.canToggleStatus && !userMutationsBlocked ? "status-clickable" : ""}`} onClick={() => !userMutationsBlocked && caps.canToggleStatus && toggleUserStatus(r)}>{String(r.status || "").toUpperCase()}</span></div>
                    <div className="card-item">{formatLastLogin(r.last_login)}</div>
                    <div className="card-item">{String(r.created_by || "-").toUpperCase()}</div>
                    <div className="card-item card-item--action">
                      <button className="btn btn-edit" onClick={() => openEdit(r)} disabled={!editReady || userMutationsBlocked} style={{ opacity: editReady && !userMutationsBlocked ? 1 : 0.3 }}><img src={assetUrl("images/edit.svg")} alt="Edit" /></button>
                    </div>
                    {showBulkDeleteColumn && (
                      <div className="card-item card-item--select">
                        {del.show ? (
                          <input
                            type="checkbox"
                            aria-label={t("rowDeleteCheckboxAria")}
                            disabled={del.disabled || userMutationsBlocked}
                            checked={selectedDeleteIds.has(Number(r.id))}
                            onChange={(e) =>
                              setSelectedDeleteIds((prev) => {
                                const n = new Set(prev);
                                if (e.target.checked) n.add(Number(r.id));
                                else n.delete(Number(r.id));
                                return n;
                              })}
                          />
                        ) : (
                          <span className="user-row-select-placeholder" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
              )}
            </div>
            </div>
          </div>
          {!showAll && (
            <div className="pagination-container">
              <button className="pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>◀</button>
            <span className="pagination-info">{t("paginationOf", { page: currentPage, total: totalPages })}</span>
              <button className="pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>▶</button>
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
                zIndex: modalOpen || confirmOpen ? processNotificationAboveAccountZIndex : processNotificationZIndex,
              }}
            >
              <div className={`account-notification account-notification-${toast.type} show`}>{toast.message}</div>
            </div>,
            document.body
          )
        : null}
      <UserModal open={modalOpen} onClose={closeModal} isEditMode={isEditMode} editingRow={editingRow} form={form} setForm={setForm} isC168Company={isC168Company} currentUserRole={currentUserRole} currentUserId={currentUserId} roleSelectDisabled={roleSelectDisabled} loginDisabled={loginDisabled} fieldLocks={fieldLocks} permDisabledMap={permDisabledMap} permSelected={permSelected} setPermSelected={setPermSelected} modalCompanies={modalCompanies} selectedCompanyIds={selectedCompanyIds} setSelectedCompanyIds={setSelectedCompanyIds} modalAccounts={modalAccounts} selectedAccountIds={selectedAccountIds} setSelectedAccountIds={setSelectedAccountIds} modalProcesses={modalProcesses} selectedProcessIds={selectedProcessIds} setSelectedProcessIds={setSelectedProcessIds} applyPermTemplate={applyPermTemplate} onSave={saveUser} sessionMutationsBlocked={userMutationsBlocked} t={t} />
      <UserConfirmModal open={confirmOpen} message={confirmMessage} onConfirm={confirmDelete} onClose={() => setConfirmOpen(false)} confirmDisabled={userMutationsBlocked} t={t} />
    </>
  );
}
