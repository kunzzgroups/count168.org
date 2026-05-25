import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import { ensureMaintenanceDateRangePicker } from "../../../utils/date/dateRangePicker.js";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { isCapitalLettersOnly, sanitizeCapitalLettersOnly } from "../../../utils/input/sanitizeCapitalLettersOnly.js";
import { saveUserCurrencyOrder } from "../../transaction/lib/transactionApi.js";
import { DEFAULT_FORM as ACCOUNT_DEFAULT_FORM, getOrderedRoles, normalizeAlertAmount, toUpper } from "../../account/accountLogic.js";
import { getAccountText } from "../../../translateFile/pages/accountTranslate.js";
import { getBankProcessLocale, getBankProcessText, translateBankProcessApiMessage } from "../../../translateFile/pages/bankProcessTranslate.js";
// Helper imports
import {
  PAGE_SIZE,
  normalizeRows,
  isoToDmy,
  dmyToIso,
  parseRowDateMs,
  isBankResendDayStartBackendErrorMessage,
  notifyTransactionDataChanged,
  bankProcessStatusTargetPatch,
  isBankCategoryCompany,
  parseProfitSharingToRows,
  serializeProfitSharingRows,
  calcBankNetProfitDisplay,
  formatBankMoneyFixed2,
  formatProfitSharingStringFixed2,
  EMPTY_BANK_FORM,
  parseBankContractRentalMonthsForDayEnd,
  contractBillingEndYmdForBankForm,
  matchesCurrentBankFilters,
  bankProcessFrequencyNormalized,
  BANK_PICK_ACCOUNT_ROLES,
  filterBankPickAccounts,
  sortBankProcessTableRows,
  accountingDuePeriodType,
  checkBankResendLockFromBackend,
  isBankResendScheduleLockedToday,
  normalizeBankResendDayStartYmd,
} from "../lib/bankProcessHelpers.js";
import { dedupeCompanyRowsForSwitcher } from "../../processlist/processListHelpers.js";
import { prefetchGamesProcessListPayload } from "../../processlist/processRoutePrefetch.js";
import { usePartnershipAuditWriteGuard } from "../../../utils/audit/usePartnershipAuditWriteGuard.js";
import { useAuthSession } from "../../../context/AuthSessionContext.jsx";

export function useBankProcessListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me: authMe } = useAuthSession();
  const resolveLang = useCallback(
    (next) => {
      if (next === "zh") return "zh";
      if (next === "en") return "en";
      // Prefer the same key used by AuthenticatedLayout; keep fallback for older persisted value.
      return localStorage.getItem("login_lang") === "zh" || localStorage.getItem("language") === "zh" ? "zh" : "en";
    },
    []
  );
  const [lang, setLang] = useState(() => resolveLang());
  const bpLocale = useMemo(() => getBankProcessLocale(lang), [lang]);
  const t = useCallback((key, params = {}) => getBankProcessText(lang, key, params), [lang]);
  const apiMsg = useCallback(
    (json, fallbackKey) => {
      const errorCode =
        json?.data && typeof json.data === "object" && !Array.isArray(json.data) ? json.data.error : undefined;
      return translateBankProcessApiMessage(
        lang,
        { message: json?.message ?? json?.error, errorCode },
        fallbackKey ? t(fallbackKey) : ""
      );
    },
    [lang, t]
  );
  const tAccount = useCallback((key, params = {}) => getAccountText(lang, key, params), [lang]);

  const handleDatePickerChange = useCallback(() => {
    const b = window.MaintenanceDateRangePicker?.getActiveRangeBinding?.() || {};
    const fromId = b.dateFromId || "";
    const fromDmy = document.getElementById(fromId)?.value?.trim() || "";
    const iso = dmyToIso(fromDmy);

    if (fromId === "bank_day_start_drp_from") {
      setForm((prev) => ({ ...prev, day_start: iso }));
      return;
    }
    if (fromId === "bank_day_end_drp_from") {
      const minYmd = document.getElementById("bank_day_end_drp_from")?.dataset?.minYmd || "";
      if (minYmd && iso && iso < minYmd) return;
      setForm((prev) => ({ ...prev, day_end: iso }));
      return;
    }
    if (fromId === "bank_resend_day_start_drp_from") {
      setResendInlineError("");
      setResendDayStart(iso);
      return;
    }
    if (fromId === "bank_resend_day_end_drp_from") {
      const minYmd = document.getElementById("bank_resend_day_end_drp_from")?.dataset?.minYmd || "";
      if (minYmd && iso && iso < minYmd) return;
      setResendDayEnd(iso);
      return;
    }
    const toDmy = document.getElementById(b.dateToId)?.value?.trim() || "";
    setDateFrom(dmyToIso(fromDmy));
    setDateTo(dmyToIso(toDmy));
    const clearBtn = document.getElementById("processListDateClearBtn");
    if (clearBtn) {
      const nextFrom = dmyToIso(fromDmy);
      const nextTo = dmyToIso(toDmy);
      clearBtn.style.display = nextFrom || nextTo ? "inline-flex" : "none";
    }
  }, []);
  const [cssReady, setCssReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [groupFilterKind, setGroupFilterKind] = useState("follow");
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [rows, setRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showOfficial, setShowOfficial] = useState(false);
  const [showEInvoice, setShowEInvoice] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [toast, setToast] = useState(null);
  const [accounts, setAccounts] = useState([]);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_BANK_FORM });

  const [accountingOpen, setAccountingOpen] = useState(false);
  const [accountingRows, setAccountingRows] = useState([]);
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingSelected, setAccountingSelected] = useState(new Set());
  const [accountingDeleteSelected, setAccountingDeleteSelected] = useState(new Set());

  const [resendModalOpen, setResendModalOpen] = useState(false);
  const [resendTarget, setResendTarget] = useState(null);
  const [resendDayStart, setResendDayStart] = useState("");
  const [resendDayEnd, setResendDayEnd] = useState("");
  const [resendFrequency, setResendFrequency] = useState("1st_of_every_month");
  const [resendInlineError, setResendInlineError] = useState("");
  const [resendConfirmDisabled, setResendConfirmDisabled] = useState(false);
  const [resendLockChecking, setResendLockChecking] = useState(false);
  const resendLockCheckSeqRef = useRef(0);

  const [sortColumn, setSortColumn] = useState("supplier");
  const [sortDirection, setSortDirection] = useState("asc");
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkRow, setRemarkRow] = useState(null);

  const [countriesList, setCountriesList] = useState([]);
  const [banksList, setBanksList] = useState([]);
  const [countryModalOpen, setCountryModalOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [newCountryName, setNewCountryName] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [selectedCountryChips, setSelectedCountryChips] = useState([]);
  const [selectedBankChips, setSelectedBankChips] = useState([]);
  const [selectedBanksByCountry, setSelectedBanksByCountry] = useState({});

  const [profitShareModalOpen, setProfitShareModalOpen] = useState(false);
  const [profitShareRows, setProfitShareRows] = useState([]);
  const [bankFormNote, setBankFormNote] = useState(null);

  const [addAccountModalOpen, setAddAccountModalOpen] = useState(false);
  const [accountPlusTarget, setAccountPlusTarget] = useState(null);
  const [accountModalIsEditMode, setAccountModalIsEditMode] = useState(false);
  const [rolesList, setRolesList] = useState([]);
  const [accountModalCurrencies, setAccountModalCurrencies] = useState([]);

  // Add Account modal state (shared component)
  const [accountModalForm, setAccountModalForm] = useState({ ...ACCOUNT_DEFAULT_FORM });
  const [accountModalSelectedCurrencyIds, setAccountModalSelectedCurrencyIds] = useState([]);
  const [accountModalSelectedCompanyIds, setAccountModalSelectedCompanyIds] = useState([]);
  const [accountModalInitialCurrencyIds, setAccountModalInitialCurrencyIds] = useState([]);
  const [accountModalCurrencyInput, setAccountModalCurrencyInput] = useState("");

  const [currencyListOrdered, setCurrencyListOrdered] = useState([]);
  const [currencyFilterCode, setCurrencyFilterCode] = useState("");
  const [currencyPillDisplayOrder, setCurrencyPillDisplayOrder] = useState(null);
  const skipNextCurrencyPillClickRef = useRef(false);

  const toastTimerRef = useRef(null);
  const listAbortRef = useRef(null);
  const skipNextBankFetchRef = useRef(false);
  const bankDatePickerInitRef = useRef(false);
  const contractSyncKeysRef = useRef({ day_start: "", contract: "", frequency: "" });

  const seedContractSyncKeys = useCallback((f) => {
    contractSyncKeysRef.current = {
      day_start: String(f?.day_start || "").trim(),
      contract: String(f?.contract || "").trim(),
      frequency: String(f?.day_start_frequency || "1st_of_every_month").trim(),
    };
  }, []);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const { mutationsBlocked, guardWrite } = usePartnershipAuditWriteGuard(
    authMe,
    notify,
    t("readOnlyActionBlocked")
  );

  const accountModalOrderedRoles = useMemo(() => getOrderedRoles(rolesList), [rolesList]);

  const getAccountIdForPlusTarget = useCallback(
    (target) => {
      if (target === "card_merchant_id") return String(form.card_merchant_id || "").trim();
      if (target === "customer_id") return String(form.customer_id || "").trim();
      if (target === "profit_account_id") return String(form.profit_account_id || "").trim();
      if (target && typeof target === "object" && target.type === "profitRow") {
        const row = profitShareRows[target.index];
        return String(row?.accountId || "").trim();
      }
      return "";
    },
    [form.card_merchant_id, form.customer_id, form.profit_account_id, profitShareRows]
  );

  const loadAccountModalSelectionMeta = useCallback(
    async (accountId, isEdit) => {
      try {
        const currencyParams = new URLSearchParams({ action: "get_available_currencies" });
        if (accountId) currencyParams.set("account_id", String(accountId));
        if (companyId) currencyParams.set("company_id", String(companyId));
        const companyUrl = accountId
          ? `api/accounts/account_company_api.php?action=get_available_companies&account_id=${accountId}`
          : "api/accounts/account_company_api.php?action=get_available_companies";
        const [curRes, compRes] = await Promise.all([
          fetch(buildApiUrl(`api/accounts/account_currency_api.php?${currencyParams.toString()}`), { credentials: "include" }),
          fetch(buildApiUrl(companyUrl), { credentials: "include" }),
        ]);
        const curJ = await curRes.json();
        const compJ = await compRes.json();
        if (curJ.success && Array.isArray(curJ.data)) {
          setAccountModalCurrencies(
            curJ.data.map((c) => ({ id: c.id, code: c.code, is_linked: !!c.is_linked }))
          );
          if (isEdit) {
            const ids = curJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
            setAccountModalSelectedCurrencyIds(ids);
            setAccountModalInitialCurrencyIds(ids);
          } else {
            setAccountModalSelectedCurrencyIds([]);
            setAccountModalInitialCurrencyIds([]);
          }
        }
        if (compJ.success && Array.isArray(compJ.data)) {
          const linked = compJ.data.filter((c) => c.is_linked).map((c) => Number(c.id));
          setAccountModalSelectedCompanyIds(linked.length ? linked : companyId ? [Number(companyId)] : []);
        }
      } catch {
        /* silent */
      }
    },
    [companyId]
  );

  const resetAccountModalToAdd = useCallback(() => {
    setAccountModalIsEditMode(false);
    setAccountModalForm({ ...ACCOUNT_DEFAULT_FORM, payment_alert: "0" });
    setAccountModalSelectedCurrencyIds([]);
    setAccountModalSelectedCompanyIds(companyId ? [Number(companyId)] : []);
    setAccountModalInitialCurrencyIds([]);
    setAccountModalCurrencyInput("");
  }, [companyId]);

  const closeAccountModal = useCallback(() => {
    setAddAccountModalOpen(false);
    setAccountPlusTarget(null);
    setAccountModalIsEditMode(false);
  }, []);

  const fetchAccountDetailJson = useCallback(async (accountId) => {
    const url = new URL(buildApiUrl("api/accounts/getaccount_api.php"));
    url.searchParams.set("account_id", String(accountId));
    if (companyId) url.searchParams.set("company_id", String(companyId));
    url.searchParams.set("_", String(Date.now()));
    const res = await fetch(url.toString(), {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    const text = await res.text();
    if (!text.trim()) {
      return { success: false, error: `Empty response (${res.status})` };
    }
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: "Invalid JSON from server" };
    }
  }, [companyId]);

  const createAccountModalCurrency = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const code = toUpper(accountModalCurrencyInput).trim();
    if (!code) return;
    const targetCompany = accountModalSelectedCompanyIds[0] || companyId;
    if (!targetCompany) return notify(t("pleaseSelectCompanyFirst"), "danger");
    try {
      const res = await fetch(buildApiUrl("api/accounts/create_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, company_id: targetCompany }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success || !json.data) return notify(apiMsg(json, "failedCreateCurrency"), "danger");
      setAccountModalCurrencies((prev) => [...prev, { id: json.data.id, code: json.data.code, is_linked: false }]);
      setAccountModalCurrencyInput("");
      notify(t("currencyCreated", { code }), "success");
    } catch {
      notify(t("failedCreateCurrency"), "danger");
    }
  };

  const removeAccountModalCurrency = async (cid) => {
    try {
      const res = await fetch(buildApiUrl("api/accounts/delete_currency_api.php"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cid }),
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) return notify(apiMsg(json, "failedDeleteCurrency"), "danger");
      setAccountModalCurrencies((prev) => prev.filter((c) => Number(c.id) !== Number(cid)));
      setAccountModalSelectedCurrencyIds((prev) => prev.filter((x) => Number(x) !== Number(cid)));
    } catch {
      notify(t("failedDeleteCurrency"), "danger");
    }
  };

  const submitAccountModal = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const isEdit = accountModalIsEditMode && accountModalForm.id;
    const alertAmount = normalizeAlertAmount(accountModalForm.alert_amount);
    if (accountModalForm.payment_alert === "1" && (!accountModalForm.alert_type || !accountModalForm.alert_start_date)) {
      return notify(t("paymentAlertRequired"), "danger");
    }
    if (accountModalForm.payment_alert === "1" && alertAmount && Number(alertAmount) >= 0) {
      return notify(t("alertAmountNegative"), "danger");
    }

    const fd = new FormData();
    Object.entries(accountModalForm).forEach(([k, v]) => {
      if (k === "alert_amount") fd.append(k, alertAmount);
      else fd.append(k, v ?? "");
    });
    if (accountModalForm.payment_alert === "0") {
      fd.set("alert_type", "");
      fd.set("alert_start_date", "");
      fd.set("alert_amount", "");
    }
    if (accountModalSelectedCompanyIds.length) fd.set("company_ids", JSON.stringify(accountModalSelectedCompanyIds));
    if (!isEdit) {
      if (companyId) fd.set("company_id", String(companyId));
      if (accountModalSelectedCurrencyIds.length) fd.set("currency_ids", JSON.stringify(accountModalSelectedCurrencyIds));
    }

    try {
      const endpoint = isEdit ? "api/accounts/update_api.php" : "api/accounts/addaccountapi.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!json.success) return notify(apiMsg(json, "saveFailed"), "danger");

      const savedAccountId = isEdit ? Number(accountModalForm.id) : Number(json?.data?.id);

      if (!isEdit && json?.data?.id && accountModalSelectedCompanyIds.length) {
        await Promise.all(
          accountModalSelectedCompanyIds.map((cid) =>
            fetch(buildApiUrl("api/accounts/account_company_api.php?action=add_company"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, company_id: cid }),
              credentials: "include",
            })
          )
        );
      }
      if (!isEdit && json?.data?.id && accountModalSelectedCurrencyIds.length) {
        await Promise.all(
          accountModalSelectedCurrencyIds.map((cur) =>
            fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: json.data.id, currency_id: cur }),
              credentials: "include",
            })
          )
        );
      }

      if (isEdit && savedAccountId) {
        const before = new Set(accountModalInitialCurrencyIds.map(Number));
        const after = new Set(accountModalSelectedCurrencyIds.map(Number));
        const toAdd = [...after].filter((id) => !before.has(id));
        const toRemove = [...before].filter((id) => !after.has(id));
        for (const cid of toAdd) {
          const currencyRes = await fetch(buildApiUrl("api/accounts/account_currency_api.php?action=add_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: savedAccountId, currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notify(apiMsg(currencyJson, "saveFailed"), "danger");
        }
        for (const cid of toRemove) {
          const currencyRes = await fetch(buildApiUrl("api/accounts/account_currency_api.php?action=remove_currency"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: savedAccountId, currency_id: Number(cid) }),
            credentials: "include",
          });
          const currencyJson = await currencyRes.json();
          if (!currencyRes.ok || !currencyJson.success) return notify(apiMsg(currencyJson, "saveFailed"), "danger");
        }
        setAccountModalInitialCurrencyIds([...after]);
      }

      notify(isEdit ? tAccount("accountSavedSuccessfully") : t("accountAddedSuccessfully"), "success");
      await handleAccountModalSuccess?.(
        isEdit ? { id: accountModalForm.id, account_id: accountModalForm.account_id } : json.data
      );
    } catch {
      notify(t("saveFailed"), "danger");
    }
  };

  useLayoutEffect(() => {
    document.body.classList.remove("bg", "dashboard-page", "account-page", "announcement-page");
    document.body.classList.add("process-page", "process-page--bank");
    setCssReady(true);
    return () => {
      document.body.classList.remove("process-page", "process-page--bank", "process-page--bank-show-all");
      document.body.classList.add("dashboard-page");
    };
  }, []);

  useEffect(() => {
    const syncLang = (event) => {
      const nextLang = event?.detail?.lang;
      setLang(resolveLang(nextLang));
    };
    window.addEventListener("storage", syncLang);
    window.addEventListener("eazycount:language-updated", syncLang);
    return () => {
      window.removeEventListener("storage", syncLang);
      window.removeEventListener("eazycount:language-updated", syncLang);
    };
  }, [resolveLang]);

  useEffect(() => {
    if (loading || !cssReady || bankDatePickerInitRef.current) return;
    bankDatePickerInitRef.current = true;
    ensureMaintenanceDateRangePicker();
    {
      if (!window.MaintenanceDateRangePicker) return;
      const u = new URL(window.location.href);
      const dfIso = u.searchParams.get("date_from") || "";
      const dtIso = u.searchParams.get("date_to") || "";
      const fromH = document.getElementById("date_from");
      const toH = document.getElementById("date_to");
      if (fromH) fromH.value = dfIso && /^\d{4}-\d{2}-\d{2}$/.test(dfIso) ? isoToDmy(dfIso) : "";
      if (toH) toH.value = dtIso && /^\d{4}-\d{2}-\d{2}$/.test(dtIso) ? isoToDmy(dtIso) : "";
      window.MaintenanceDateRangePicker.init({
        allowEmpty: true,
        placeholder: t("selectDateRange"),
        selectEndDateHint: t("selectEndDate"),
        clearDateLabel: t("clearDate"),
        monthLabels: bpLocale.monthsShort,
        onChange: handleDatePickerChange,
      });
      const clearBtn = document.getElementById("processListDateClearBtn");
      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.MaintenanceDateRangePicker?.clear?.();
          setDateFrom(""); setDateTo("");
        });
      }
    }
    return () => { };
  }, [loading, cssReady, bpLocale.monthsShort, t, handleDatePickerChange]);

  useEffect(() => {
    if (!modalOpen && !resendModalOpen) return;
    ensureMaintenanceDateRangePicker();
    window.MaintenanceDateRangePicker?.bindPickers?.();
  }, [modalOpen, resendModalOpen]);

  /* Keep date-range chip wording in sync when login/UI language changes (picker caches placeholder internally). */
  useEffect(() => {
    if (loading || !cssReady || !bankDatePickerInitRef.current || !window.MaintenanceDateRangePicker?.setLocaleStrings) return;
    window.MaintenanceDateRangePicker.setLocaleStrings({
      placeholder: t("selectDateRange"),
      selectEndDateHint: t("selectEndDate"),
      clearDateLabel: t("clearDate"),
      monthLabels: bpLocale.monthsShort,
    });
  }, [lang, loading, cssReady, t, bpLocale.monthsShort]);

  useEffect(() => {
    const clearBtn = document.getElementById("processListDateClearBtn");
    if (!clearBtn) return;
    clearBtn.style.display = dateFrom || dateTo ? "inline-flex" : "none";
  }, [dateFrom, dateTo]);

  useEffect(() => {
    (async () => {
      let skipLoadingDone = false;
      try {
        const routePrefetch = location.state?.bankProcessListPrefetch;
        const prefetchCompanyId = routePrefetch?.companyId ? Number(routePrefetch.companyId) : null;
        const currentUrl = new URL(window.location.href);
        const prefetchQueryCompany = currentUrl.searchParams.get("company_id");

        if (routePrefetch && prefetchCompanyId && (!prefetchQueryCompany || Number(prefetchQueryCompany) === prefetchCompanyId)) {
          const prefetchedCompanies = Array.isArray(routePrefetch.companies) ? routePrefetch.companies : [];
          setCompanies(prefetchedCompanies);
          setCompanyId(prefetchCompanyId);
          {
            const pfGfk = routePrefetch.groupFilterKind;
            setGroupFilterKind(pfGfk === "all" || pfGfk === "ungrouped" ? pfGfk : "follow");
          }
          setSearch(currentUrl.searchParams.get("search") || "");
          setCurrencyFilterCode(String(currentUrl.searchParams.get("currency") || "").trim().toUpperCase());
          setDateFrom(currentUrl.searchParams.get("date_from") || "");
          setDateTo(currentUrl.searchParams.get("date_to") || "");
          setShowAll(currentUrl.searchParams.get("showAll") === "1");
          setShowInactive(currentUrl.searchParams.get("showInactive") === "1");
          setShowOfficial(currentUrl.searchParams.get("showOfficial") === "1");
          setShowEInvoice(currentUrl.searchParams.get("showEInvoice") === "1");
          setShowBlock(currentUrl.searchParams.get("showBlock") === "1");
          if (Array.isArray(routePrefetch.currencyCodes)) {
            setCurrencyListOrdered(routePrefetch.currencyCodes);
          }
          if (Array.isArray(routePrefetch.rows)) {
            setRows(normalizeRows(routePrefetch.rows));
            skipNextBankFetchRef.current = true;
            setTableLoading(false);
          } else {
            setTableLoading(true);
          }
          setLoading(false);
          return;
        }

        const companiesRes = await fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), {
          credentials: "include",
        });
        const companiesJson = await companiesRes.json();
        const cs = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        setCompanies(cs);
        const sessionUser = authMe;
        if (!sessionUser) {
          window.location.assign(new URL("/login", window.location.origin).toString());
          return;
        }
        const url = new URL(window.location.href);
        const effectiveCompany = url.searchParams.get("company_id") || sessionUser.company_id || cs[0]?.id || null;
        const effectiveNum = effectiveCompany ? Number(effectiveCompany) : null;
        const currentCompanyRow = effectiveNum != null ? cs.find((c) => Number(c.id) === Number(effectiveNum)) : null;
        if (currentCompanyRow?.company_id) {
          const bankCategory = await isBankCategoryCompany(currentCompanyRow.company_id, buildApiUrl);
          if (!bankCategory) {
            const warm = await prefetchGamesProcessListPayload(effectiveNum);
            navigate(`/process-list?company_id=${effectiveNum}`, {
              replace: true,
              state: {
                processListPrefetch: {
                  companyId: effectiveNum,
                  companies: cs,
                  groupFilterKind: "follow",
                  rows: warm.rows,
                  meta: warm.meta,
                },
              },
            });
            skipLoadingDone = true;
            return;
          }
        }
        setCompanyId(effectiveNum);
        setGroupFilterKind("follow");
        setSearch(url.searchParams.get("search") || "");
        setCurrencyFilterCode(String(url.searchParams.get("currency") || "").trim().toUpperCase());
        setDateFrom(url.searchParams.get("date_from") || "");
        setDateTo(url.searchParams.get("date_to") || "");
        setShowAll(url.searchParams.get("showAll") === "1");
        setShowInactive(url.searchParams.get("showInactive") === "1");
        setShowOfficial(url.searchParams.get("showOfficial") === "1");
        setShowEInvoice(url.searchParams.get("showEInvoice") === "1");
        setShowBlock(url.searchParams.get("showBlock") === "1");
      } finally {
        if (!skipLoadingDone) setLoading(false);
      }
    })();
  }, [navigate, location.state]);

  useEffect(() => {
    if (!companyId || loading) return;
    (async () => {
      try {
        const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
        url.searchParams.set("company_id", String(companyId));
        url.searchParams.set("roles", BANK_PICK_ACCOUNT_ROLES.join(","));
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = await res.json();
        const list = filterBankPickAccounts(Array.isArray(json?.data?.accounts) ? json.data.accounts : []);
        setAccounts(list);
      } catch { setAccounts([]); }
    })();
  }, [companyId, loading]);

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
    if (!companyId || loading) return;
    void loadCurrencyMeta();
  }, [companyId, loading, loadCurrencyMeta]);

  useEffect(() => {
    setCurrencyPillDisplayOrder(null);
  }, [companyId]);

  useEffect(() => {
    if (showAll) document.body.classList.add("process-page--bank-show-all");
    else document.body.classList.remove("process-page--bank-show-all");
  }, [showAll]);

  useEffect(() => {
    if (!modalOpen || !companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const base = buildApiUrl("api/processes/processlist_api.php");
        const cid = encodeURIComponent(String(companyId));
        const [countriesRes, selectedCountriesRes, selectedBanksRes] = await Promise.all([
          fetch(`${base}?action=get_countries&company_id=${cid}`, { credentials: "include" }),
          fetch(`${base}?action=get_selected_countries&company_id=${cid}`, { credentials: "include" }),
          fetch(`${base}?action=get_selected_banks&company_id=${cid}`, { credentials: "include" }),
        ]);
        const [countriesJson, selectedCountriesJson, selectedBanksJson] = await Promise.all([
          countriesRes.json(),
          selectedCountriesRes.json(),
          selectedBanksRes.json(),
        ]);
        if (cancelled) return;
        if (countriesJson.success && Array.isArray(countriesJson.data)) {
          setCountriesList(countriesJson.data);
        }
        if (selectedCountriesJson.success && Array.isArray(selectedCountriesJson.data)) {
          const list = selectedCountriesJson.data
            .map((c) => String(c || "").trim().toUpperCase())
            .filter(Boolean);
          setSelectedCountryChips([...new Set(list)]);
        }
        if (
          selectedBanksJson.success
          && selectedBanksJson.data
          && typeof selectedBanksJson.data === "object"
          && !Array.isArray(selectedBanksJson.data)
        ) {
          const map = {};
          for (const [countryKey, banks] of Object.entries(selectedBanksJson.data)) {
            const country = String(countryKey || "").trim();
            if (!country) continue;
            map[country] = Array.isArray(banks)
              ? banks.map((b) => String(b || "").trim()).filter(Boolean)
              : [];
          }
          setSelectedBanksByCountry(map);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [modalOpen, companyId]);

  useEffect(() => {
    if (!modalOpen || !companyId || !form.country) {
      setBanksList([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_banks_by_country");
      url.searchParams.set("company_id", String(companyId));
      url.searchParams.set("country", String(form.country));
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (cancelled) return;
      if (json.success && Array.isArray(json.data)) setBanksList(json.data);
    })();
    return () => { cancelled = true; };
  }, [modalOpen, companyId, form.country]);

  useEffect(() => {
    if (!modalOpen || editMode || !form.country) return;
    const country = String(form.country || "").trim();
    const allowed = selectedBanksByCountry[country] || [];
    setForm((f) => {
      if (!f.bank || allowed.includes(f.bank)) return f;
      return { ...f, bank: "" };
    });
  }, [modalOpen, editMode, form.country, selectedBanksByCountry]);

  useEffect(() => {
    if (!modalOpen) return;
    const next = calcBankNetProfitDisplay(form.cost, form.price, form.profit_sharing);
    setForm((f) => {
      if (String(f.profit) === next) return f;
      return { ...f, profit: next };
    });
  }, [modalOpen, form.cost, form.price, form.profit_sharing]);

  // Contract / Day start / Frequency 变化时自动填 Day end；用户手动改 Day end 不会被覆盖（不监听 day_end）
  useEffect(() => {
    if (!modalOpen) {
      contractSyncKeysRef.current = { day_start: "", contract: "", frequency: "" };
      return;
    }
    if (bankProcessFrequencyNormalized(form.day_start_frequency) === "once") return;

    const start = String(form.day_start || "").trim();
    const contract = String(form.contract || "").trim();
    const frequency = String(form.day_start_frequency || "1st_of_every_month").trim();

    const prev = contractSyncKeysRef.current;
    const keysChanged =
      prev.day_start !== start || prev.contract !== contract || prev.frequency !== frequency;
    contractSyncKeysRef.current = { day_start: start, contract, frequency };

    if (!keysChanged || !start) return;

    const term = parseBankContractRentalMonthsForDayEnd(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(start, term, frequency) : null;

    if (!calculated) {
      setForm((prevForm) => {
        const cur = String(prevForm.day_end || "").trim();
        if (cur && cur < start) return { ...prevForm, day_end: start };
        return prevForm;
      });
      return;
    }

    setForm((prevForm) => (prevForm.day_end === calculated ? prevForm : { ...prevForm, day_end: calculated }));
  }, [modalOpen, form.day_start, form.contract, form.day_start_frequency]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      listAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!resendModalOpen) return;
    if (bankProcessFrequencyNormalized(resendFrequency) !== "once") return;
    if (!String(resendDayEnd || "").trim()) return;
    setResendDayEnd("");
  }, [resendModalOpen, resendFrequency]);

  const refreshResendConfirmLock = useCallback(async () => {
    const id = resendTarget?.id;
    const dayStartYmd = normalizeBankResendDayStartYmd(resendDayStart);
    if (!resendModalOpen || !id || !dayStartYmd) {
      setResendConfirmDisabled(false);
      setResendLockChecking(false);
      return;
    }
    const quickLocked = isBankResendScheduleLockedToday(resendTarget, resendDayStart);
    const seq = ++resendLockCheckSeqRef.current;
    setResendLockChecking(true);
    setResendConfirmDisabled(true);
    try {
      const backendLocked = await checkBankResendLockFromBackend(id, resendDayStart);
      if (seq !== resendLockCheckSeqRef.current) return;
      setResendConfirmDisabled(backendLocked);
    } catch {
      if (seq !== resendLockCheckSeqRef.current) return;
      setResendConfirmDisabled(quickLocked);
    } finally {
      if (seq === resendLockCheckSeqRef.current) setResendLockChecking(false);
    }
  }, [resendModalOpen, resendTarget, resendDayStart]);

  useEffect(() => {
    if (!resendModalOpen) {
      setResendConfirmDisabled(false);
      setResendLockChecking(false);
      return;
    }
    void refreshResendConfirmLock();
  }, [resendModalOpen, resendDayStart, resendDayEnd, resendTarget?.id, refreshResendConfirmLock]);

  const syncUrl = useCallback(() => {
    const url = new URL(window.location.href);
    if (companyId) url.searchParams.set("company_id", String(companyId));
    else url.searchParams.delete("company_id");
    if (search.trim()) url.searchParams.set("search", search.trim());
    else url.searchParams.delete("search");
    if (dateFrom) url.searchParams.set("date_from", dateFrom);
    else url.searchParams.delete("date_from");
    if (dateTo) url.searchParams.set("date_to", dateTo);
    else url.searchParams.delete("date_to");
    [["showAll", showAll], ["showInactive", showInactive], ["showOfficial", showOfficial], ["showEInvoice", showEInvoice], ["showBlock", showBlock]].forEach(([k, v]) => {
      if (v) url.searchParams.set(k, "1"); else url.searchParams.delete(k);
    });
    if (currencyFilterCode) url.searchParams.set("currency", currencyFilterCode);
    else url.searchParams.delete("currency");
    window.history.replaceState({}, document.title, url.toString());
  }, [companyId, search, dateFrom, dateTo, showAll, showInactive, showOfficial, showEInvoice, showBlock, currencyFilterCode]);

  // Bank list always fetches the full dataset, then filters client-side
  // (matches legacy bank_process_list.js: prevents stale issue_flag/inactive splits).
  const fetchRows = useCallback(async (opts = {}) => {
    if (!companyId) return;
    const silent = !!opts.silent;
    const preservePage = !!opts.preservePage;
    const preserveSelection = !!opts.preserveSelection;
    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;
    if (!silent) setTableLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("permission", "Bank");
      url.searchParams.set("company_id", String(companyId));
      if (search.trim()) url.searchParams.set("search", search.trim());
      url.searchParams.set("showAll", "1");
      const res = await fetch(url.toString(), { credentials: "include", signal: ac.signal });
      const json = await res.json();
      if (ac.signal.aborted) return;
      if (!res.ok || !json.success) return notify(apiMsg(json, "failedLoadBankProcesses"), "danger");
      setRows(normalizeRows(json.data));
      if (!preserveSelection) setSelectedIds(new Set());
      if (!preservePage) setCurrentPage(1);
      syncUrl();
    } catch {
      if (ac.signal.aborted) return;
      notify(t("failedLoadBankProcesses"), "danger");
    } finally {
      if (!ac.signal.aborted && !silent) setTableLoading(false);
    }
  }, [companyId, search, notify, syncUrl]);

  useEffect(() => {
    if (!companyId || loading) return;
    if (skipNextBankFetchRef.current) {
      skipNextBankFetchRef.current = false;
      return;
    }
    const t = window.setTimeout(() => { void fetchRows(); }, 80);
    return () => window.clearTimeout(t);
  }, [companyId, loading, search, fetchRows]);

  // URL still reflects active filters even though they're applied client-side.
  useEffect(() => {
    if (!companyId || loading) return;
    syncUrl();
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [companyId, loading, showAll, showInactive, showOfficial, showEInvoice, showBlock, dateFrom, dateTo, currencyFilterCode, syncUrl]);

  const loadAccountingInbox = useCallback(async (opts = {}) => {
    const silent = !!opts.silent;
    if (!companyId) return;
    if (!silent) setAccountingLoading(true);
    try {
      const url = new URL(buildApiUrl("api/processes/process_accounting_inbox_api.php"));
      url.searchParams.set("company_id", String(companyId));
      const res = await fetch(url.toString(), { credentials: "include", cache: "no-cache" });
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      setAccountingRows(list);
      if (!silent) {
        setAccountingSelected(new Set(list.filter((x) => !x.already_posted_today).map((x) => Number(x.id))));
        setAccountingDeleteSelected(new Set());
      } else {
        const ids = new Set(list.map((x) => Number(x.id)));
        setAccountingSelected((prev) => {
          const next = new Set();
          prev.forEach((id) => {
            if (ids.has(id)) next.add(id);
          });
          return next;
        });
        setAccountingDeleteSelected((prev) => {
          const next = new Set();
          prev.forEach((id) => {
            if (ids.has(id)) next.add(id);
          });
          return next;
        });
      }
    } catch {
      setAccountingRows([]);
      if (!silent) {
        setAccountingSelected(new Set());
        setAccountingDeleteSelected(new Set());
      }
    } finally {
      if (!silent) setAccountingLoading(false);
    }
  }, [companyId]);

  const handleBankStatusUpdated = useCallback(
    (row, target, opts = {}) => {
      const id = row?.id;
      if (id == null) return;
      const backgroundSync = opts.backgroundSync !== false;
      const patch = bankProcessStatusTargetPatch(row, target);
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
      if (!backgroundSync) return;
      notifyTransactionDataChanged("bank-process-list-react-status");
      void fetchRows({ silent: true, preservePage: true, preserveSelection: true });
      void loadAccountingInbox({ silent: true });
    },
    [fetchRows, loadAccountingInbox]
  );

  // Badge count uses accountingRows; fetch inbox whenever company is ready so the badge is not stuck at 0 until the modal is opened.
  useEffect(() => {
    if (!companyId || loading) return;
    void loadAccountingInbox({ silent: true });
  }, [companyId, loading, loadAccountingInbox]);

  // Items can become due when the clock passes a billing boundary; refresh periodically and when the tab becomes visible again.
  useEffect(() => {
    const onTxChanged = (e) => {
      const source = e?.detail?.source || "";
      if (source === "bank-process-list-react-status") {
        if (resendModalOpen) void refreshResendConfirmLock();
        return;
      }
      const isLocalBank = String(source).startsWith("bank-process-list-react");
      void fetchRows({
        silent: isLocalBank,
        preservePage: isLocalBank,
        preserveSelection: isLocalBank,
      });
      if (resendModalOpen) void refreshResendConfirmLock();
    };
    window.addEventListener("tx-data-changed", onTxChanged);
    return () => window.removeEventListener("tx-data-changed", onTxChanged);
  }, [fetchRows, resendModalOpen, refreshResendConfirmLock]);

  useEffect(() => {
    if (!companyId || loading) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void loadAccountingInbox({ silent: true });
    };
    const id = window.setInterval(tick, 90000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [companyId, loading, loadAccountingInbox]);

  const resetForm = () => setForm({ ...EMPTY_BANK_FORM });

  const onSwitchCompany = async (c) => {
    if (!c?.id || Number(c.id) === Number(companyId)) return;
    if (switchingCompany) return;
    setSwitchingCompany(true);
    listAbortRef.current?.abort();
    setSelectedIds(new Set());
    setCurrentPage(1);
    try {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${c.id}`), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return notify(apiMsg(json, "switchCompanyFailed"), "danger");
      }
      notifyCompanySessionUpdated();
      const bankCategory = await isBankCategoryCompany(c.company_id, buildApiUrl);
      if (!bankCategory) {
        const warm = await prefetchGamesProcessListPayload(c.id);
        const processListPrefetch = {
          companyId: Number(c.id),
          companies,
          groupFilterKind,
          rows: warm.rows,
          meta: warm.meta,
        };
        navigate(`/process-list?company_id=${c.id}`, { replace: true, state: { processListPrefetch } });
        return;
      }
      setRows([]);
      setTableLoading(true);
      setCompanyId(Number(c.id));
      setGroupFilterKind((prev) => (prev === "all" || prev === "ungrouped" ? prev : "follow"));
      if (accountingOpen) void loadAccountingInbox();
    } catch {
      setTableLoading(false);
      notify(t("switchCompanyFailed"), "danger");
    } finally {
      setSwitchingCompany(false);
    }
  };

  const openAdd = () => {
    setEditMode(false);
    resetForm();
    seedContractSyncKeys(EMPTY_BANK_FORM);
    setCountryModalOpen(false);
    setBankModalOpen(false);
    setProfitShareModalOpen(false);
    setBankFormNote(null);
    closeAccountModal();
    setModalOpen(true);
  };

  const persistSelectedCountries = async (countries) => {
    if (!companyId) return;
    const fd = new FormData();
    fd.append("company_id", String(companyId));
    for (const c of countries) fd.append("countries[]", c);
    try {
      await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_selected_countries"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
  };

  const persistSelectedBanksByCountry = async (map) => {
    if (!companyId) return;
    const fd = new FormData();
    fd.append("company_id", String(companyId));
    fd.append("selected", JSON.stringify(map || {}));
    try {
      await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_selected_banks"), {
        method: "POST",
        body: fd,
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
  };

  const submitNewCountry = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const name = sanitizeCapitalLettersOnly(newCountryName);
    if (!companyId) return;
    if (!isCapitalLettersOnly(name)) {
      notify(t("countryCodeLettersOnly"), "warning");
      return;
    }
    const alreadyExists =
      countriesList.some((c) => String(c).trim().toUpperCase() === name) ||
      selectedCountryChips.some((c) => String(c).trim().toUpperCase() === name);
    if (alreadyExists) {
      notify(t("countryAlreadyExists", { country: name }), "warning");
      return;
    }
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=add_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "addCountryFailed"), "danger");
      setCountriesList((prev) => [...new Set([...prev, name])].sort());
      setNewCountryName("");
      notify(t("countryAdded"));
    } catch { notify(t("addCountryFailed"), "danger"); }
  };

  const submitNewBank = async (e) => {
    if (guardWrite()) return;
    e.preventDefault();
    const name = sanitizeCapitalLettersOnly(newBankName);
    if (!companyId || !form.country) return;
    if (!isCapitalLettersOnly(name)) {
      notify(t("bankCodeLettersOnly"), "warning");
      return;
    }
    const bankAlreadyExists =
      banksList.some((b) => String(b).trim().toUpperCase() === name) ||
      selectedBankChips.some((b) => String(b).trim().toUpperCase() === name);
    if (bankAlreadyExists) {
      notify(t("bankAlreadyExists", { bank: name }), "warning");
      return;
    }
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", String(form.country)); fd.append("banks[]", name);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=save_country_banks"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "addBankFailed"), "danger");
      setBanksList((prev) => [...new Set([...prev, name])].sort());
      setNewBankName("");
      notify(t("bankAdded"));
    } catch { notify(t("addBankFailed"), "danger"); }
  };

  const removeAvailableCountry = async (countryName) => {
    const country = String(countryName || "").trim();
    if (!country || !companyId) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", country);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_country"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "removeCountryFailed"), "danger");
      setCountriesList((prev) => prev.filter((c) => c !== country));
      setSelectedCountryChips((prev) => {
        const next = prev.filter((c) => c !== country);
        void persistSelectedCountries(next);
        return next;
      });
      setForm((f) => (f.country === country ? { ...f, country: "", bank: "" } : f));
      notify(t("countryRemoved"));
    } catch { notify(t("removeCountryFailed"), "danger"); }
  };

  const removeAvailableBank = async (bankName) => {
    const bank = String(bankName || "").trim();
    const country = String(form.country || "").trim();
    if (!bank || !country || !companyId) return;
    try {
      const fd = new FormData(); fd.append("company_id", String(companyId)); fd.append("country", country); fd.append("bank", bank);
      const res = await fetch(buildApiUrl("api/processes/processlist_api.php?action=remove_bank"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "removeBankFailed"), "danger");
      setBanksList((prev) => prev.filter((b) => b !== bank));
      setSelectedBankChips((prev) => prev.filter((b) => b !== bank));
      setSelectedBanksByCountry((prev) => {
        const list = (prev[country] || []).filter((b) => b !== bank);
        const next = { ...prev };
        if (list.length) next[country] = list;
        else delete next[country];
        void persistSelectedBanksByCountry(next);
        return next;
      });
      setForm((f) => (f.bank === bank ? { ...f, bank: "" } : f));
      notify(t("bankRemoved"));
    } catch { notify(t("removeBankFailed"), "danger"); }
  };

  const openProfitShareModal = () => {
    const rows = parseProfitSharingToRows(form.profit_sharing, accounts).map((r) => ({
      ...r,
      amount: r.amount ? formatBankMoneyFixed2(r.amount) : "",
    }));
    setProfitShareRows(rows.length ? rows : [{ accountId: "", accountLabel: "", amount: "" }]);
    setProfitShareModalOpen(true);
  };

  const confirmProfitShareModal = () => {
    const normalizedRows = profitShareRows.map((r) => ({
      ...r,
      amount: r.amount ? formatBankMoneyFixed2(r.amount) : "",
    }));
    const s = serializeProfitSharingRows(normalizedRows, accounts);
    setForm((f) => ({ ...f, profit_sharing: s }));
    setProfitShareModalOpen(false);
  };

  const handleAccountModalSuccess = async (data) => {
    const newId = data?.id != null ? String(data.id) : "";
    const newAccountId = String(data?.account_id || "").trim();
    const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
    url.searchParams.set("company_id", String(companyId));
    url.searchParams.set("roles", BANK_PICK_ACCOUNT_ROLES.join(","));
    const listRes = await fetch(url.toString(), { credentials: "include" });
    const listJson = await listRes.json();
    const list = filterBankPickAccounts(Array.isArray(listJson?.data?.accounts) ? listJson.data.accounts : []);
    setAccounts(list);
    if (newId && accountPlusTarget === "card_merchant_id") setForm((f) => ({ ...f, card_merchant_id: newId }));
    if (newId && accountPlusTarget === "customer_id") setForm((f) => ({ ...f, customer_id: newId }));
    if (newId && accountPlusTarget === "profit_account_id") setForm((f) => ({ ...f, profit_account_id: newId }));
    if (newId && accountPlusTarget && typeof accountPlusTarget === "object" && accountPlusTarget.type === "profitRow") {
      const idx = accountPlusTarget.index;
      setProfitShareRows((rows) => rows.map((r, i) => (i === idx ? { ...r, accountId: newId, accountLabel: newAccountId } : r)));
    }
    notifyTransactionDataChanged("bank-process-list-react");
    closeAccountModal();
  };

  const openAddAccountForField = async (target) => {
    setAccountPlusTarget(target);
    if (!companyId) return notify(t("missingCompanyContext"), "danger");

    const existingId = getAccountIdForPlusTarget(target);

    try {
      const editRes = await fetch(buildApiUrl("api/editdata/editdata_api.php"), { credentials: "include" });
      const editJson = await editRes.json();
      setRolesList(Array.isArray(editJson?.data?.roles) ? editJson.data.roles : []);

      if (existingId) {
        const accJson = await fetchAccountDetailJson(existingId);
        if (!accJson.success || !accJson.data) {
          notify(accJson.error || accJson.message || tAccount("failedToLoadAccount"), "danger");
          return;
        }
        const d = accJson.data;
        setAccountModalIsEditMode(true);
        setAccountModalForm({
          id: d.id,
          account_id: toUpper(d.account_id),
          name: toUpper(d.name),
          role: d.role || "",
          password: d.password || "",
          remark: toUpper(d.remark),
          payment_alert: String(d.payment_alert == 1 ? "1" : "0"),
          alert_type: d.alert_type || d.alert_day || "",
          alert_start_date: d.alert_start_date || d.alert_specific_date || "",
          alert_amount: d.alert_amount || "",
        });
        setAccountModalCurrencyInput("");
        await loadAccountModalSelectionMeta(existingId, true);
      } else {
        resetAccountModalToAdd();
        await loadAccountModalSelectionMeta(null, false);
      }

      setAddAccountModalOpen(true);
    } catch {
      setRolesList([]);
      notify(tAccount("errorLoadingAccount"), "danger");
    }
  };

  const openEdit = async (rowId) => {
    try {
      const url = new URL(buildApiUrl("api/processes/processlist_api.php"));
      url.searchParams.set("action", "get_process");
      url.searchParams.set("id", String(rowId));
      url.searchParams.set("permission", "Bank");
      const res = await fetch(url.toString(), { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) return notify(apiMsg(json, "failedLoadBankProcess"), "danger");
      const d = json.data;
      const nextForm = {
        id: String(d.id || ""),
        country: d.country || "", bank: d.bank || "", type: d.type || "", name: d.name || "",
        card_merchant_id: d.card_merchant_id ? String(d.card_merchant_id) : "",
        customer_id: d.customer_id ? String(d.customer_id) : "",
        profit_account_id: d.profit_account_id ? String(d.profit_account_id) : "",
        contract: d.contract || "",
        insurance: d.insurance ?? "",
        cost: d.cost != null && d.cost !== "" ? formatBankMoneyFixed2(d.cost) : "",
        price: d.price != null && d.price !== "" ? formatBankMoneyFixed2(d.price) : "",
        profit: d.profit != null && d.profit !== "" ? formatBankMoneyFixed2(d.profit) : "",
        profit_sharing: formatProfitSharingStringFixed2(d.profit_sharing || ""),
        day_start: d.day_start ? String(d.day_start).slice(0, 10) : "",
        day_end: d.day_end ? String(d.day_end).slice(0, 10) : "",
        day_start_frequency: bankProcessFrequencyNormalized(d.day_start_frequency),
        status: d.status || "active", remark: d.remark || "", sop: d.sop || "",
      };
      seedContractSyncKeys(nextForm);
      setEditMode(true);
      setForm(nextForm);
      setModalOpen(true);
    } catch { notify(t("failedLoadBankProcess"), "danger"); }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    if (guardWrite()) return;
    const rawFreq = bankProcessFrequencyNormalized(form.day_start_frequency);
    const isOnceSubmit = rawFreq === "once";
    const dayStart = String(form.day_start || "").trim();
    const dayEnd = String(form.day_end || "").trim();
    if (dayStart && dayEnd && dayEnd < dayStart) {
      notify(t("dayEndEarlierThanStart"), "danger");
      return;
    }
    if (!isOnceSubmit && !String(form.contract || "").trim()) {
      notify(t("contractRequiredUnlessOnce"), "danger");
      return;
    }
    if (!editMode) {
      if (!String(form.country || "").trim()) {
        notify(t("selectCountry"), "danger");
        return;
      }
      if (!String(form.type || "").trim()) {
        notify(t("selectType"), "danger");
        return;
      }
    }
    let normalizedFreq;
    if (isOnceSubmit) normalizedFreq = "once";
    else if (rawFreq === "monthly") normalizedFreq = "monthly";
    else normalizedFreq = "1st_of_every_month";
    const moneyNormalized = {
      ...form,
      cost: formatBankMoneyFixed2(form.cost),
      price: formatBankMoneyFixed2(form.price),
      profit: calcBankNetProfitDisplay(form.cost, form.price, form.profit_sharing),
      profit_sharing: formatProfitSharingStringFixed2(form.profit_sharing),
    };
    const fd = new FormData();
    Object.entries(moneyNormalized).forEach(([k, v]) => {
      if (k === "id" && !editMode) return;
      if (k === "day_start_frequency") {
        fd.append(k, normalizedFreq);
        return;
      }
      if (isOnceSubmit && (k === "day_end" || k === "contract" || k === "insurance")) {
        fd.append(k, "");
        return;
      }
      fd.append(k, v ?? "");
    });
    if (companyId) fd.append("company_id", String(companyId));
    fd.append("permission", "Bank");
    try {
      const endpoint = editMode ? "api/processes/processlist_api.php?action=update_process" : "api/processes/addprocess_api.php";
      const res = await fetch(buildApiUrl(endpoint), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "saveFailed"), "danger");
      notify(editMode ? t("bankProcessUpdated") : t("bankProcessAdded"));
      notifyTransactionDataChanged("bank-process-list-react");
      setModalOpen(false); fetchRows();
    } catch { notify(t("saveFailed"), "danger"); }
  };

  const postAccountingToTransaction = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingSelected.has(Number(r.id)) && !r.already_posted_today);
    if (selected.length === 0) return notify(t("needOneDueItem"), "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        fd.append("ids[]", r.id); fd.append("period_types[]", accountingDuePeriodType(r)); fd.append("billing_months[]", r.monthly_billing_month || "");
      });
      fd.append("allow_future_monthly", "1");
      const res = await fetch(buildApiUrl("api/processes/process_post_to_transaction_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "transactionPostFailed"), "danger");
      notify(apiMsg(json, "postedToTransaction"));
      notifyTransactionDataChanged("bank-process-list-react");
      loadAccountingInbox(); fetchRows();
    } catch { notify(t("transactionPostFailed"), "danger"); }
  };

  const dismissAccountingRows = async () => {
    if (guardWrite()) return;
    const selected = accountingRows.filter((r) => accountingDeleteSelected.has(Number(r.id)));
    if (selected.length === 0) return notify(t("tickDeleteRows"), "warning");
    try {
      const fd = new FormData();
      selected.forEach((r) => {
        fd.append("ids[]", r.id); fd.append("period_types[]", accountingDuePeriodType(r)); fd.append("billing_months[]", r.monthly_billing_month || "");
      });
      const res = await fetch(buildApiUrl("api/processes/dismiss_accounting_due_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "deleteDueFailed"), "danger");
      notify(apiMsg(json, "removedFromDue"));
      await loadAccountingInbox();
      await fetchRows();
      if (resendModalOpen) void refreshResendConfirmLock();
      notifyTransactionDataChanged("bank-process-list-react");
    } catch { notify(t("deleteDueFailed"), "danger"); }
  };

  const saveRemarkModal = async () => {
    if (guardWrite()) return;
    if (!remarkRow) return;
    try {
      const fd = new FormData(); fd.append("id", String(remarkRow.id)); fd.append("remark", remarkDraft);
      const res = await fetch(buildApiUrl("api/processes/update_bank_remark_api.php"), { method: "POST", body: fd, credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "remarkUpdateFailed"), "danger");
      setRows((prev) => prev.map((r) => (Number(r.id) === Number(remarkRow.id) ? { ...r, remark: remarkDraft } : r)));
      notifyTransactionDataChanged("bank-process-list-react");
      notify(t("remarkUpdated"));
      setRemarkModalOpen(false); setRemarkRow(null);
    } catch { notify(t("remarkUpdateFailed"), "danger"); }
  };

  const resendAccountingDue = async () => {
    if (guardWrite()) return;
    if (!resendTarget) return;
    setResendInlineError("");
    const dayStart = String(resendDayStart || "").trim();
    const dayEnd = String(resendDayEnd || "").trim();
    const fqEarly = bankProcessFrequencyNormalized(resendFrequency);
    if (fqEarly !== "once" && dayStart && dayEnd && dayEnd < dayStart) {
      const msg = t("dayEndEarlierThanStart");
      setResendInlineError(msg);
      notify(msg, "danger");
      return;
    }
    const fq = bankProcessFrequencyNormalized(resendFrequency);
    const dayEndTrim = fq === "once" ? "" : String(resendDayEnd || "").trim();
    const normalizedResendFrequency =
      fq === "once" ? "once" : (fq === "monthly" ? "monthly" : "1st_of_every_month");
    try {
      const res = await fetch(buildApiUrl("api/bankprocess_maintenance/resend_accounting_due_api.php"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          bank_process_id: Number(resendTarget.id),
          day_start: resendDayStart || null,
          day_end: fq === "once" ? null : (dayEndTrim || null),
          day_start_frequency: normalizedResendFrequency,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const rawMsg = json.message || json.error || "";
        const msg = apiMsg(json, "resendFailed");
        if (isBankResendDayStartBackendErrorMessage(rawMsg) || isBankResendDayStartBackendErrorMessage(msg)) {
          setResendInlineError(msg);
        }
        return notify(msg, "danger");
      }
      notify(apiMsg(json, "resendSuccessful"));
      notifyTransactionDataChanged("bank-process-list-react");
      void loadAccountingInbox({ silent: true });
      void fetchRows();
      setResendModalOpen(false); setResendTarget(null);
    } catch { notify(t("resendFailed"), "danger"); }
  };

  const deleteSelected = () => {
    if (!selectedIds.size) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteProcesses = async () => {
    if (guardWrite()) return;
    if (!selectedIds.size) {
      setDeleteConfirmOpen(false);
      return;
    }
    setDeleteSubmitting(true);
    try {
      const res = await fetch(buildApiUrl("api/processes/delete_processes_api.php"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ids: Array.from(selectedIds), permission: "Bank" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) return notify(apiMsg(json, "deleteFailed"), "danger");
      const n = json?.data?.deleted ?? selectedIds.size;
      notify(n === 1 ? t("processDeletedOne") : t("processDeletedMany", { count: n }), "success");
      notifyTransactionDataChanged("bank-process-list-react");
      setDeleteConfirmOpen(false);
      setSelectedIds(new Set());
      fetchRows();
    } catch { notify(t("deleteFailed"), "danger"); }
    finally { setDeleteSubmitting(false); }
  };

  const allCompanyButtons = useMemo(() => dedupeCompanyRowsForSwitcher(companies, companyId), [companies, companyId]);
  const groupIds = useMemo(
    () =>
      [...new Set(allCompanyButtons.map((c) => String(c.group_id || "").trim().toUpperCase()).filter(Boolean))].sort(),
    [allCompanyButtons]
  );
  const selectedCompany = useMemo(
    () => allCompanyButtons.find((c) => Number(c.id) === Number(companyId)) || null,
    [allCompanyButtons, companyId]
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

  const sortedRows = useMemo(
    () => sortBankProcessTableRows(rows, sortColumn, sortDirection),
    [rows, sortColumn, sortDirection]
  );

  const handleBankTableSort = useCallback(
    (column) => {
      setSortDirection((direction) => (sortColumn === column && direction === "asc" ? "desc" : "asc"));
      setSortColumn(column);
      setCurrentPage(1);
    },
    [sortColumn]
  );

  const rowCountryCodes = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      const c = String(r.country || "").trim().toUpperCase();
      if (c) s.add(c);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const baseCurrencyPills = useMemo(() => {
    const merged = new Set([...currencyListOrdered, ...rowCountryCodes]);
    const orderFirst = currencyListOrdered.filter((c) => merged.has(c));
    const rest = [...merged].filter((c) => !orderFirst.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...orderFirst, ...rest];
  }, [currencyListOrdered, rowCountryCodes]);

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
      const companySet = new Set(currencyListOrdered);
      const apiOrder = orderedPills.filter((c) => companySet.has(c));
      if (apiOrder.length === 0) return;
      const json = await saveUserCurrencyOrder(apiOrder);
      if (!json?.success) return;
      const tail = currencyListOrdered.filter((c) => !apiOrder.includes(c));
      setCurrencyListOrdered([...apiOrder, ...tail]);
    },
    [currencyListOrdered]
  );

  const onCurrencyPillDrop = useCallback(
    async (e, targetCode) => {
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
    [currencyPillCodes, persistOrderedCompanyCurrencies]
  );

  useEffect(() => {
    if (!currencyFilterCode) return;
    if (currencyPillCodes.length && !currencyPillCodes.includes(currencyFilterCode)) {
      setCurrencyFilterCode("");
    }
  }, [currencyFilterCode, currencyPillCodes]);

  const visibleRows = useMemo(() => {
    const filterState = { showAll, showInactive, showOfficial, showEInvoice, showBlock };
    let filtered = sortedRows.filter((r) => matchesCurrentBankFilters(r, filterState));
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? parseRowDateMs(dateFrom) : null;
      const toMs = dateTo ? parseRowDateMs(dateTo) : null;
      const toEnd = toMs != null ? toMs + 86400000 - 1 : null;
      filtered = filtered.filter((r) => {
        const ts = parseRowDateMs(r.date || r.day_start);
        if (ts == null) return false;
        if (fromMs !== null && ts < fromMs) return false;
        if (toEnd !== null && ts > toEnd) return false;
        return true;
      });
    }
    if (currencyFilterCode) {
      filtered = filtered.filter((r) => String(r.country || "").trim().toUpperCase() === currencyFilterCode);
    }
    return filtered;
  }, [
    sortedRows,
    dateFrom,
    dateTo,
    showAll,
    showInactive,
    showOfficial,
    showEInvoice,
    showBlock,
    currencyFilterCode,
  ]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE)), [visibleRows]);
  const pageRows = useMemo(() => {
    if (showAll) return visibleRows;
    const p = Math.min(currentPage, totalPages);
    return visibleRows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  }, [visibleRows, showAll, currentPage, totalPages]);
  return {
    navigate,
    location,
    resolveLang,
    lang,
    setLang,
    bpLocale,
    t,
    apiMsg,
    tAccount,
    handleDatePickerChange,
    cssReady,
    loading,
    setLoading,
    tableLoading,
    setTableLoading,
    companies,
    setCompanies,
    companyId,
    setCompanyId,
    groupFilterKind,
    setGroupFilterKind,
    switchingCompany,
    setSwitchingCompany,
    rows,
    setRows,
    currentPage,
    setCurrentPage,
    selectedIds,
    setSelectedIds,
    search,
    setSearch,
    showAll,
    setShowAll,
    showInactive,
    setShowInactive,
    showOfficial,
    setShowOfficial,
    showEInvoice,
    setShowEInvoice,
    showBlock,
    setShowBlock,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deleteSubmitting,
    setDeleteSubmitting,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    toast,
    setToast,
    accounts,
    setAccounts,
    modalOpen,
    setModalOpen,
    editMode,
    setEditMode,
    form,
    setForm,
    accountingOpen,
    setAccountingOpen,
    accountingRows,
    setAccountingRows,
    accountingLoading,
    setAccountingLoading,
    accountingSelected,
    setAccountingSelected,
    accountingDeleteSelected,
    setAccountingDeleteSelected,
    resendModalOpen,
    setResendModalOpen,
    resendTarget,
    setResendTarget,
    resendDayStart,
    setResendDayStart,
    resendDayEnd,
    setResendDayEnd,
    resendFrequency,
    setResendFrequency,
    resendInlineError,
    setResendInlineError,
    resendConfirmDisabled,
    resendLockChecking,
    isBankResendScheduleLockedToday,
    sortColumn,
    sortDirection,
    remarkModalOpen,
    setRemarkModalOpen,
    remarkDraft,
    setRemarkDraft,
    remarkRow,
    setRemarkRow,
    countriesList,
    setCountriesList,
    banksList,
    setBanksList,
    countryModalOpen,
    setCountryModalOpen,
    bankModalOpen,
    setBankModalOpen,
    countrySearch,
    setCountrySearch,
    bankSearch,
    setBankSearch,
    newCountryName,
    setNewCountryName,
    newBankName,
    setNewBankName,
    selectedCountryChips,
    setSelectedCountryChips,
    selectedBankChips,
    setSelectedBankChips,
    selectedBanksByCountry,
    setSelectedBanksByCountry,
    profitShareModalOpen,
    setProfitShareModalOpen,
    profitShareRows,
    setProfitShareRows,
    bankFormNote,
    setBankFormNote,
    addAccountModalOpen,
    setAddAccountModalOpen,
    accountPlusTarget,
    setAccountPlusTarget,
    accountModalIsEditMode,
    setAccountModalIsEditMode,
    rolesList,
    setRolesList,
    accountModalCurrencies,
    setAccountModalCurrencies,
    accountModalForm,
    setAccountModalForm,
    accountModalSelectedCurrencyIds,
    setAccountModalSelectedCurrencyIds,
    accountModalSelectedCompanyIds,
    setAccountModalSelectedCompanyIds,
    accountModalInitialCurrencyIds,
    setAccountModalInitialCurrencyIds,
    accountModalCurrencyInput,
    setAccountModalCurrencyInput,
    currencyListOrdered,
    setCurrencyListOrdered,
    currencyFilterCode,
    setCurrencyFilterCode,
    currencyPillDisplayOrder,
    setCurrencyPillDisplayOrder,
    skipNextCurrencyPillClickRef,
    toastTimerRef,
    listAbortRef,
    skipNextBankFetchRef,
    bankDatePickerInitRef,
    contractSyncKeysRef,
    seedContractSyncKeys,
    notify,
    accountModalOrderedRoles,
    getAccountIdForPlusTarget,
    loadAccountModalSelectionMeta,
    resetAccountModalToAdd,
    closeAccountModal,
    fetchAccountDetailJson,
    createAccountModalCurrency,
    removeAccountModalCurrency,
    submitAccountModal,
    loadCurrencyMeta,
    syncUrl,
    fetchRows,
    handleBankStatusUpdated,
    loadAccountingInbox,
    resetForm,
    onSwitchCompany,
    openAdd,
    persistSelectedCountries,
    persistSelectedBanksByCountry,
    submitNewCountry,
    submitNewBank,
    removeAvailableCountry,
    removeAvailableBank,
    openProfitShareModal,
    confirmProfitShareModal,
    handleAccountModalSuccess,
    openAddAccountForField,
    openEdit,
    submitForm,
    postAccountingToTransaction,
    dismissAccountingRows,
    saveRemarkModal,
    resendAccountingDue,
    deleteSelected,
    confirmDeleteProcesses,
    allCompanyButtons,
    groupIds,
    selectedCompany,
    selectedGroupKey,
    companyButtons,
    handlePickGroup,
    handlePickAllGroups,
    sortedRows,
    handleBankTableSort,
    rowCountryCodes,
    baseCurrencyPills,
    currencyPillCodes,
    persistOrderedCompanyCurrencies,
    onCurrencyPillDrop,
    visibleRows,
    totalPages,
    pageRows,
    PAGE_SIZE,
    mutationsBlocked,
  };
}
