import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { getMemberText, translateMemberApiMessage } from "../../translateFile/pages/memberTranslate.js";
import {
  MINI_GRID_SHELL_CCY,
  accountHoldsMiniGridCurrency,
  applyCurrencyToggle,
  formatPaymentHistoryMoney,
  getAvailableCurrencies,
  getMemberMiniGridCurrencies,
  getOrderedMiniGridAccounts,
  groupHistoryForDisplay,
  getWlGridIncludedAccountIds,
  normalizeNumber,
  saveWLGridSelection,
  sanitizeCurrencySelection,
} from "./memberPageHelpers.js";
import { fetchAccountHistoryClosingBalance, mapBatchCurrencies, mapLinkedAccountsApiList, parseJsonResponse } from "./memberWinLossApi.js";

export function useMemberWinLoss({ showNotification, lang }) {
  const t = useCallback((key, params) => getMemberText(lang, key, params), [lang]);
  const notifyApi = useCallback(
    (message, type, fallbackKey, params = {}) => {
      showNotification(translateMemberApiMessage(lang, message, fallbackKey, params), type);
    },
    [lang, showNotification],
  );
  const [loginRootAccountId, setLoginRootAccountId] = useState(0);
  const [viewAccountId, setViewAccountId] = useState(0);
  const [companyId, setCompanyId] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [viewGridAccounts, setViewGridAccounts] = useState([]);
  const [wlGridSelectedIds, setWlGridSelectedIds] = useState([]);
  const [linkedAccountCurrenciesMap, setLinkedAccountCurrenciesMap] = useState(() => new Map());
  const [linkedCurrenciesLoaded, setLinkedCurrenciesLoaded] = useState(false);
  const [ownedCurrencies, setOwnedCurrencies] = useState([]);
  const [currencySummary, setCurrencySummary] = useState([]);
  const [currencyOrder, setCurrencyOrder] = useState([]);
  const [isAllSelected, setIsAllSelected] = useState(true);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingTable, setLoadingTable] = useState(false);
  const [linkedDataReady, setLinkedDataReady] = useState(false);
  const [miniGridShell, setMiniGridShell] = useState(true);
  const [miniGridLoading, setMiniGridLoading] = useState(false);
  const [miniGridBalances, setMiniGridBalances] = useState(() => new Map());
  const [miniGridTotals, setMiniGridTotals] = useState(() => new Map());
  const [miniGridHint, setMiniGridHint] = useState("");

  const currencySortOrderRef = useRef({});
  const summaryAbortRef = useRef(null);
  const historyAbortRef = useRef(null);
  const gridAbortRef = useRef(null);
  const searchSeqRef = useRef(0);
  const linkedAccountsRef = useRef(linkedAccounts);
  linkedAccountsRef.current = linkedAccounts;
  const performMemberSearchRef = useRef(null);
  const loginRootAccountIdRef = useRef(loginRootAccountId);
  loginRootAccountIdRef.current = loginRootAccountId;
  const viewGridAccountsRef = useRef(viewGridAccounts);
  viewGridAccountsRef.current = viewGridAccounts;
  const wlGridSelectedIdsRef = useRef(wlGridSelectedIds);
  wlGridSelectedIdsRef.current = wlGridSelectedIds;

  const sameAccountIdList = useCallback((left, right) => {
    const a = (left || []).map(Number).filter(Boolean);
    const b = (right || []).map(Number).filter(Boolean);
    if (a.length !== b.length) return false;
    return a.every((id, idx) => id === b[idx]);
  }, []);

  const sameLinkedAccountList = useCallback((left, right) => {
    const a = (left || []).map((acc) => Number(acc.id)).filter(Boolean);
    const b = (right || []).map((acc) => Number(acc.id)).filter(Boolean);
    return sameAccountIdList(a, b);
  }, [sameAccountIdList]);

  const linkedAccountCurrenciesMapRef = useRef(linkedAccountCurrenciesMap);
  linkedAccountCurrenciesMapRef.current = linkedAccountCurrenciesMap;

  const loadCurrencyOrder = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), { credentials: "include" });
      const json = await res.json();
      setCurrencyOrder(Array.isArray(json?.data?.order) ? json.data.order : []);
    } catch {
      setCurrencyOrder([]);
    }
  }, []);

  const loadOwnedCurrencies = useCallback(async (accountId, compId) => {
    if (!accountId || !compId) {
      setOwnedCurrencies([]);
      return;
    }
    try {
      const res = await fetch(
        buildApiUrl(
          `api/accounts/account_currency_api.php?action=get_account_currencies&account_id=${accountId}&company_id=${compId}`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      const json = await parseJsonResponse(await res.text());
      if (!json?.success || !Array.isArray(json.data)) {
        setOwnedCurrencies([]);
        return;
      }
      const list = json.data
        .map((row) => ({
          code: String(row.currency_code || row.code || "")
            .trim()
            .toUpperCase(),
          currency_id: row.currency_id != null ? Number(row.currency_id) : null,
        }))
        .filter((o) => o.code);
      list.forEach((o) => {
        if (o.currency_id && !currencySortOrderRef.current[o.code]) {
          currencySortOrderRef.current[o.code] = o.currency_id;
        }
      });
      setOwnedCurrencies(list);
    } catch {
      setOwnedCurrencies([]);
    }
  }, []);

  const loadLinkedCurrenciesMap = useCallback(async (accounts, compId) => {
    const ids = accounts.map((a) => Number(a.id)).filter(Boolean);
    if (!ids.length || !compId) {
      setLinkedAccountCurrenciesMap(new Map());
      setLinkedCurrenciesLoaded(true);
      return;
    }
    setLinkedCurrenciesLoaded(false);
    try {
      const qs = new URLSearchParams({
        action: "get_batch_account_currencies",
        account_ids: ids.join(","),
        company_id: String(compId),
        _t: String(Date.now()),
      });
      const res = await fetch(buildApiUrl(`api/accounts/account_currency_api.php?${qs}`), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await parseJsonResponse(await res.text());
      if (!json?.success || !Array.isArray(json.data)) {
        setLinkedAccountCurrenciesMap(new Map());
      } else {
        setLinkedAccountCurrenciesMap(mapBatchCurrencies(json.data, currencySortOrderRef));
      }
    } catch {
      setLinkedAccountCurrenciesMap(new Map());
    } finally {
      setLinkedCurrenciesLoaded(true);
    }
  }, []);

  const fetchLinkedAccountsForAccount = useCallback(async (accountId, compId) => {
    if (!accountId || !compId) return [];
    const res = await fetch(
      buildApiUrl(
        `api/accounts/account_link_api.php?action=get_all_linked_accounts&account_id=${accountId}&company_id=${compId}`,
      ),
      { credentials: "include", cache: "no-store" },
    );
    const json = await parseJsonResponse(await res.text());
    return json?.success ? mapLinkedAccountsApiList(json.data) : [];
  }, []);

  const fetchDirectLinkedAccountsForAccount = useCallback(async (accountId, compId) => {
    if (!accountId || !compId) return [];
    const res = await fetch(
      buildApiUrl(
        `api/accounts/account_link_api.php?action=get_linked_accounts&account_id=${accountId}&company_id=${compId}`,
      ),
      { credentials: "include", cache: "no-store" },
    );
    const json = await parseJsonResponse(await res.text());
    return json?.success ? mapLinkedAccountsApiList(json.data?.accounts) : [];
  }, []);

  const buildViewGridAccounts = useCallback(
    async (viewId, compId, preferList = null, accountPool = []) => {
      if (!viewId || !compId) return [];
      if (preferList?.length) return preferList;

      const viewAcc = accountPool.find((a) => Number(a.id) === Number(viewId));
      const directLinked = await fetchDirectLinkedAccountsForAccount(viewId, compId);
      const seen = new Set();
      const list = [];
      const push = (acc) => {
        const id = Number(acc?.id);
        if (!id || seen.has(id)) return;
        seen.add(id);
        list.push(acc);
      };
      if (viewAcc) push(viewAcc);
      directLinked.forEach(push);
      if (!viewAcc && list.length) return list;
      if (!viewAcc && !list.length) {
        const fallback = await fetchLinkedAccountsForAccount(viewId, compId);
        return fallback.length ? fallback : [];
      }
      return list;
    },
    [fetchDirectLinkedAccountsForAccount, fetchLinkedAccountsForAccount],
  );

  const syncGridSelectionToViewAccount = useCallback(
    async (viewId, compId, preferList = null, accountPool = []) => {
      if (!viewId || !compId) {
        setViewGridAccounts([]);
        setWlGridSelectedIds([]);
        return;
      }
      const list = await buildViewGridAccounts(viewId, compId, preferList, accountPool);
      const ids = list.map((a) => Number(a.id)).filter(Boolean);
      if (!sameLinkedAccountList(viewGridAccountsRef.current, list)) {
        setViewGridAccounts(list);
      }
      if (!sameAccountIdList(wlGridSelectedIdsRef.current, ids)) {
        setWlGridSelectedIds(ids);
        saveWLGridSelection(ids, compId, loginRootAccountIdRef.current);
      }
    },
    [buildViewGridAccounts, sameAccountIdList, sameLinkedAccountList],
  );

  const loadLinkedAccounts = useCallback(
    async (rootId, compId) => {
      if (!rootId || !compId) {
        setLinkedAccounts([]);
        setViewGridAccounts([]);
        setWlGridSelectedIds([]);
        setLinkedAccountCurrenciesMap(new Map());
        setLinkedCurrenciesLoaded(true);
        setLinkedDataReady(true);
        return;
      }
      try {
        const list = await fetchLinkedAccountsForAccount(rootId, compId);
        setLinkedAccounts(list);
        await loadLinkedCurrenciesMap(list, compId);
      } catch {
        setLinkedAccounts([]);
        setViewGridAccounts([]);
        setWlGridSelectedIds([]);
        setLinkedAccountCurrenciesMap(new Map());
        setLinkedCurrenciesLoaded(true);
      } finally {
        setLinkedDataReady(true);
      }
    },
    [fetchLinkedAccountsForAccount, loadLinkedCurrenciesMap],
  );

  const gridAccountPool = viewGridAccounts.length ? viewGridAccounts : linkedAccounts;

  const availableCurrencies = useMemo(
    () =>
      getAvailableCurrencies({
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        wlGridSelectedIds,
        linkedAccounts: gridAccountPool.length ? gridAccountPool : linkedAccounts,
        ownedCurrencies,
        currencySummary,
        currencySortOrder: currencySortOrderRef.current,
        currencyDisplayOrder: currencyOrder,
      }),
    [
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      wlGridSelectedIds,
      linkedAccounts,
      gridAccountPool,
      ownedCurrencies,
      currencySummary,
      currencyOrder,
    ],
  );

  const miniGridCurrencies = useMemo(
    () => getMemberMiniGridCurrencies(availableCurrencies, isAllSelected, selectedCurrencies),
    [availableCurrencies, isAllSelected, selectedCurrencies],
  );

  const showMiniRail = linkedAccounts.length > 0 && miniGridCurrencies.length > 0;

  const miniGridDisplayCurrencies = useMemo(() => {
    if (miniGridShell) return MINI_GRID_SHELL_CCY;
    if (miniGridCurrencies.length > 0) return miniGridCurrencies;
    if (availableCurrencies.length > 0) {
      return isAllSelected
        ? availableCurrencies
        : availableCurrencies.filter((c) => selectedCurrencies.includes(c));
    }
    return MINI_GRID_SHELL_CCY;
  }, [miniGridShell, miniGridCurrencies, availableCurrencies, isAllSelected, selectedCurrencies]);

  const miniGridAccounts = useMemo(
    () =>
      getOrderedMiniGridAccounts(
        gridAccountPool,
        wlGridSelectedIds,
        miniGridShell ? MINI_GRID_SHELL_CCY : miniGridCurrencies,
        linkedAccountCurrenciesMap,
        linkedCurrenciesLoaded,
      ),
    [
      gridAccountPool,
      wlGridSelectedIds,
      miniGridShell,
      miniGridCurrencies,
      linkedAccountCurrenciesMap,
      linkedCurrenciesLoaded,
    ],
  );

  const groupedRows = useMemo(
    () => groupHistoryForDisplay(historyRows, isAllSelected, selectedCurrencies, availableCurrencies),
    [historyRows, isAllSelected, selectedCurrencies, availableCurrencies],
  );

  const refreshMiniGrid = useCallback(
    async (seq, gridCurrencies, fromDate, toDate, viewId, compId) => {
      if (seq === searchSeqRef.current) setMiniGridLoading(true);
      try {
        if (!gridAccountPool.length || !fromDate || !toDate || !viewId || !compId) {
          setMiniGridBalances(new Map());
          setMiniGridTotals(new Map());
          setMiniGridHint("");
          return;
        }
        const orderUpper = (gridCurrencies || []).map((c) => String(c || "").trim().toUpperCase()).filter(Boolean);
        if (!orderUpper.length) {
          setMiniGridBalances(new Map());
          setMiniGridTotals(new Map());
          setMiniGridHint("");
          return;
        }
        const orderedAccounts = getOrderedMiniGridAccounts(
          gridAccountPool,
          wlGridSelectedIds,
          orderUpper,
          linkedAccountCurrenciesMap,
          linkedCurrenciesLoaded,
        );
        if (linkedCurrenciesLoaded && !orderedAccounts.length) {
          setMiniGridBalances(new Map());
          setMiniGridTotals(new Map());
          setMiniGridHint(
            orderUpper.length > 1
              ? t("noAccountsHoldCurrencies")
              : t("noAccountsHoldCurrency", { currency: orderUpper[0] }),
          );
          return;
        }
        setMiniGridHint("");
        if (gridAbortRef.current) gridAbortRef.current.abort();
        gridAbortRef.current = new AbortController();
        const signal = gridAbortRef.current.signal;
        const tasks = [];
        for (const acc of orderedAccounts) {
          const id = Number(acc.id);
          if (id <= 0) continue;
          for (const cu of orderUpper) {
            if (
              linkedCurrenciesLoaded &&
              !accountHoldsMiniGridCurrency(linkedAccountCurrenciesMap, linkedCurrenciesLoaded, id, cu)
            ) {
              continue;
            }
            tasks.push(
              (async () => {
                const dec = await fetchAccountHistoryClosingBalance(id, cu, fromDate, toDate, compId, signal);
                return { id, cu, dec };
              })(),
            );
          }
        }
        const pairs = await Promise.all(tasks);
        if (seq !== searchSeqRef.current) return;
        const balanceMap = new Map();
        const totalsByCu = new Map();
        orderUpper.forEach((cu) => totalsByCu.set(cu, normalizeNumber("0")));
        pairs.forEach(({ id, cu, dec }) => {
          if (id <= 0 || dec == null || typeof dec.plus !== "function") return;
          balanceMap.set(`${id}|${cu}`, dec);
          totalsByCu.set(cu, totalsByCu.get(cu).plus(dec));
        });
        setMiniGridBalances(balanceMap);
        setMiniGridTotals(totalsByCu);
        setMiniGridShell(false);
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setMiniGridBalances(new Map());
        setMiniGridTotals(new Map());
        setMiniGridHint(translateMemberApiMessage(lang, e?.message, "couldNotLoadGrid"));
      } finally {
        if (seq === searchSeqRef.current) setMiniGridLoading(false);
      }
    },
    [gridAccountPool, wlGridSelectedIds, linkedAccountCurrenciesMap, linkedCurrenciesLoaded, lang, t],
  );

  const finishHistoryFetch = useCallback(
    (seq) => {
      if (seq === searchSeqRef.current) setLoadingTable(false);
    },
    [],
  );

  const fetchMemberHistory = useCallback(
    async (seq = searchSeqRef.current, selectionOverride = null) => {
      if (!viewAccountId || !companyId || !dateFrom || !dateTo) return;
      if (historyAbortRef.current) historyAbortRef.current.abort();
      historyAbortRef.current = new AbortController();
      const signal = historyAbortRef.current.signal;

      let useAll = selectionOverride?.isAllSelected ?? isAllSelected;
      let useSelected = selectionOverride?.selectedCurrencies ?? selectedCurrencies;
      if (!useAll && (!useSelected?.length) && availableCurrencies.length > 0) {
        useAll = true;
        useSelected = [];
      }
      const targetCurrencies = useAll ? availableCurrencies : [...useSelected];
      if (!targetCurrencies.length) {
        const params = new URLSearchParams({
          account_id: String(viewAccountId),
          date_from: dateFrom,
          date_to: dateTo,
          company_id: String(companyId),
        });
        try {
          const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
            credentials: "include",
            cache: "no-store",
            signal,
          });
          const json = await parseJsonResponse(await res.text());
          if (seq !== searchSeqRef.current) return;
          if (!json?.success) {
            setHistoryRows([]);
            notifyApi(json?.error, "info", "noDataInRange");
            finishHistoryFetch(seq);
            return;
          }
          setHistoryRows(Array.isArray(json.data?.history) ? json.data.history : []);
          finishHistoryFetch(seq);
          showNotification(t("queryCompleted"), "success");
        } catch (e) {
          if (e?.name === "AbortError") return;
          if (seq !== searchSeqRef.current) return;
          setHistoryRows([]);
          notifyApi(e?.message, "info", "noDataInRange");
          finishHistoryFetch(seq);
        }
        const gridCur = getMemberMiniGridCurrencies(availableCurrencies, useAll, useSelected);
        void refreshMiniGrid(seq, gridCur, dateFrom, dateTo, viewAccountId, companyId);
        return;
      }

      const singleRequest = targetCurrencies.length > 1;
      const params = new URLSearchParams({
        account_id: String(viewAccountId),
        date_from: dateFrom,
        date_to: dateTo,
        company_id: String(companyId),
      });
      if (!singleRequest && targetCurrencies[0]) params.append("currency", targetCurrencies[0]);

      try {
        const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        const json = await parseJsonResponse(await res.text());
        if (seq !== searchSeqRef.current) return;
        if (!json?.success) throw new Error(json?.error || t("queryFailed"));
        const history = json.data?.history || [];
        setHistoryRows(history);
        finishHistoryFetch(seq);
        showNotification(t("queryCompleted"), "success");
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (seq !== searchSeqRef.current) return;
        setHistoryRows([]);
        notifyApi(e?.message, "error", "queryFailed");
        finishHistoryFetch(seq);
      }
      const gridCur = getMemberMiniGridCurrencies(availableCurrencies, useAll, useSelected);
      void refreshMiniGrid(seq, gridCur, dateFrom, dateTo, viewAccountId, companyId);
    },
    [
      viewAccountId,
      companyId,
      dateFrom,
      dateTo,
      isAllSelected,
      selectedCurrencies,
      availableCurrencies,
      refreshMiniGrid,
      finishHistoryFetch,
      showNotification,
      notifyApi,
      t,
    ],
  );

  const hasFallbackCurrencySources = useCallback(() => {
    if (ownedCurrencies.length > 0) return true;
    if (!linkedCurrenciesLoaded) return false;
    const pool = gridAccountPool.length ? gridAccountPool : linkedAccounts;
    const included = getWlGridIncludedAccountIds(pool, wlGridSelectedIds);
    for (const accountId of included) {
      const codes = linkedAccountCurrenciesMap.get(Number(accountId));
      if (codes?.size) return true;
    }
    return false;
  }, [
    ownedCurrencies,
    linkedCurrenciesLoaded,
    linkedAccountCurrenciesMap,
    gridAccountPool,
    linkedAccounts,
    wlGridSelectedIds,
  ]);

  const fetchMemberSummary = useCallback(
    async (seq = searchSeqRef.current) => {
      if (!viewAccountId || !companyId || !dateFrom || !dateTo) return false;
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      summaryAbortRef.current = new AbortController();
      try {
        const params = new URLSearchParams({
          date_from: dateFrom,
          date_to: dateTo,
          target_account_id: String(viewAccountId),
          company_id: String(companyId),
          show_inactive: "1",
          hide_zero_balance: "0",
        });
        const res = await fetch(buildApiUrl(`api/transactions/search_api.php?${params}&_t=${Date.now()}`), {
          credentials: "include",
          cache: "no-store",
          signal: summaryAbortRef.current.signal,
        });
        const json = await parseJsonResponse(await res.text());
        if (seq !== searchSeqRef.current) return false;
        if (!json?.success) throw new Error(json?.error || t("failedLoadCurrencySummary"));
        const rows = [...(json.data?.left_table || []), ...(json.data?.right_table || [])].filter(
          (r) => Number(r.account_db_id) === Number(viewAccountId),
        );
        currencySortOrderRef.current = {};
        rows.forEach((row) => {
          const code = String(row.currency || "").trim();
          if (!code) return;
          const sortValue =
            typeof row.currency_id === "number"
              ? row.currency_id
              : parseInt(row.currency_id || "0", 10) || Number.MAX_SAFE_INTEGER;
          if (!currencySortOrderRef.current[code] || currencySortOrderRef.current[code] > sortValue) {
            currencySortOrderRef.current[code] = sortValue;
          }
        });
        setCurrencySummary(rows);
        if (rows.length > 0) {
          setIsAllSelected(true);
          setSelectedCurrencies([]);
        }
        return true;
      } catch (e) {
        if (e?.name === "AbortError") return false;
        if (seq !== searchSeqRef.current) return false;
        setCurrencySummary([]);
        currencySortOrderRef.current = {};
        if (!hasFallbackCurrencySources()) {
          notifyApi(e?.message, "error", "failedLoadCurrencyData");
        }
        return false;
      }
    },
    [viewAccountId, companyId, dateFrom, dateTo, hasFallbackCurrencySources, notifyApi, t],
  );

  const performMemberSearch = useCallback(async () => {
    if (!viewAccountId || !companyId || !dateFrom || !dateTo) return;
    searchSeqRef.current += 1;
    const seq = searchSeqRef.current;
    setLoadingTable(true);
    setMiniGridLoading(true);
    setMiniGridBalances(new Map());
    setMiniGridTotals(new Map());
    setMiniGridHint("");
    try {
      const summaryOk = await fetchMemberSummary(seq);
      if (seq !== searchSeqRef.current) return;
      if (summaryOk) {
        await loadCurrencyOrder();
      }
      await fetchMemberHistory(seq);
    } finally {
      if (seq === searchSeqRef.current) {
        setLoadingTable(false);
      }
    }
  }, [viewAccountId, companyId, dateFrom, dateTo, fetchMemberSummary, fetchMemberHistory, loadCurrencyOrder]);

  performMemberSearchRef.current = performMemberSearch;

  const initSession = useCallback((u, compId, from, to) => {
    const loginId = Number(u.member_login_account_id || u.user_id) || 0;
    const viewId = Number(u.member_winloss_view_account_id || u.winloss_view_account_id || u.user_id) || 0;
    setLoginRootAccountId(loginId);
    setViewAccountId(viewId);
    setCompanyId(Number(compId) || 0);
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const reloadLinkedChain = useCallback(
    async (rootId, compId) => {
      setLinkedDataReady(false);
      await loadLinkedAccounts(rootId, compId);
    },
    [loadLinkedAccounts],
  );

  const switchCompany = useCallback(
    async (nextCompanyId, companyLabel) => {
      if (!nextCompanyId || Number(nextCompanyId) === Number(companyId)) return;
      try {
        const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${nextCompanyId}`), {
          credentials: "include",
        });
        const json = await parseJsonResponse(await res.text());
        if (!json?.success) throw new Error(json?.error || t("failedSwitchCompany"));
        if (typeof window.updateSidebarDataCaptureVisibility === "function" && json?.data) {
          window.updateSidebarDataCaptureVisibility(json.data.has_gambling, json.data.has_bank);
        }
        setCompanyId(Number(nextCompanyId));
        showNotification(t("switchedToCompany", { label: companyLabel || nextCompanyId }), "success");
        await reloadLinkedChain(loginRootAccountId, Number(nextCompanyId));
        await loadOwnedCurrencies(viewAccountId, Number(nextCompanyId));
      } catch (e) {
        notifyApi(e?.message, "error", "failedSwitchCompany");
      }
    },
    [companyId, loginRootAccountId, viewAccountId, reloadLinkedChain, loadOwnedCurrencies, performMemberSearch, notifyApi, showNotification, t],
  );

  const switchAccount = useCallback(
    async (nextAccountId, code, name) => {
      if (!nextAccountId || Number(nextAccountId) === Number(viewAccountId)) return;
      try {
        const res = await fetch(buildApiUrl(`api/session/update_account_session_api.php?account_id=${nextAccountId}`), {
          credentials: "include",
        });
        const json = await parseJsonResponse(await res.text());
        if (!json?.success) throw new Error(json?.message || t("switchFailed"));
        const payload = json.data || json;
        const newId = Number(payload.account_id) || Number(nextAccountId);
        setViewAccountId(newId);
        showNotification(
          t("switchedToAccount", { label: payload.account_code || code || name || newId }),
          "success",
        );
        await loadOwnedCurrencies(newId, companyId);
      } catch (e) {
        notifyApi(e?.message, "error", "failedSwitchAccount");
      }
    },
    [viewAccountId, companyId, loadOwnedCurrencies, performMemberSearch, notifyApi, showNotification, t],
  );

  const persistCurrencyOrder = useCallback(
    async (nextOrder) => {
      try {
        const res = await fetch(buildApiUrl("api/transactions/user_currency_order_api.php"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: nextOrder }),
        });
        const json = await parseJsonResponse(await res.text());
        if (json?.success) {
          setCurrencyOrder(Array.isArray(json?.data?.order) ? json.data.order : nextOrder);
          setIsAllSelected(true);
          setSelectedCurrencies([]);
          showNotification(t("currencyOrderSaved"), "success");
          await fetchMemberHistory();
        }
      } catch {
        showNotification(t("saveOrderFailed"), "error");
      }
    },
    [fetchMemberHistory, showNotification, t],
  );

  const applyWlGridSelection = useCallback(
    (ids) => {
      setWlGridSelectedIds(ids);
      saveWLGridSelection(ids, companyId, loginRootAccountId);
      const sanitized = sanitizeCurrencySelection(
        availableCurrencies,
        isAllSelected,
        selectedCurrencies,
        linkedCurrenciesLoaded,
        linkedAccountCurrenciesMap,
        ids,
        gridAccountPool,
      );
      setIsAllSelected(sanitized.isAllSelected);
      setSelectedCurrencies(sanitized.selectedCurrencies);
      performMemberSearch();
    },
    [
      companyId,
      loginRootAccountId,
      availableCurrencies,
      isAllSelected,
      selectedCurrencies,
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      gridAccountPool,
      performMemberSearch,
    ],
  );

  const onCurrencyAll = useCallback(() => {
    if (isAllSelected) return;
    setIsAllSelected(true);
    setSelectedCurrencies([]);
    fetchMemberHistory(searchSeqRef.current, { isAllSelected: true, selectedCurrencies: [] });
  }, [isAllSelected, fetchMemberHistory]);

  const onCurrencyToggle = useCallback(
    (code) => {
      const next = applyCurrencyToggle(availableCurrencies, isAllSelected, selectedCurrencies, code);
      setIsAllSelected(next.isAllSelected);
      setSelectedCurrencies(next.selectedCurrencies);
      fetchMemberHistory(searchSeqRef.current, next);
    },
    [availableCurrencies, isAllSelected, selectedCurrencies, fetchMemberHistory],
  );

  useEffect(() => {
    if (!availableCurrencies.length) {
      setIsAllSelected(true);
      setSelectedCurrencies([]);
      return;
    }
    const sanitized = sanitizeCurrencySelection(
      availableCurrencies,
      isAllSelected,
      selectedCurrencies,
      linkedCurrenciesLoaded,
      linkedAccountCurrenciesMap,
      wlGridSelectedIds,
      linkedAccounts,
    );
    setIsAllSelected((prev) => (prev === sanitized.isAllSelected ? prev : sanitized.isAllSelected));
    setSelectedCurrencies((prev) => {
      const next = sanitized.selectedCurrencies;
      if (prev.length === next.length && prev.every((c, i) => c === next[i])) return prev;
      return next;
    });
  }, [
    availableCurrencies,
    linkedCurrenciesLoaded,
    linkedAccountCurrenciesMap,
    wlGridSelectedIds,
    linkedAccounts,
    isAllSelected,
    selectedCurrencies,
  ]);

  useEffect(() => {
    if (loginRootAccountId && companyId) {
      reloadLinkedChain(loginRootAccountId, companyId);
    }
  }, [loginRootAccountId, companyId, reloadLinkedChain]);

  useEffect(() => {
    if (viewAccountId && companyId) {
      loadOwnedCurrencies(viewAccountId, companyId);
    }
  }, [viewAccountId, companyId, loadOwnedCurrencies]);

  useEffect(() => {
    if (!linkedDataReady || !viewAccountId || !companyId || !dateFrom || !dateTo) return undefined;

    let cancelled = false;
    (async () => {
      const pool = linkedAccountsRef.current;
      const preferList =
        Number(viewAccountId) === Number(loginRootAccountIdRef.current) && pool.length ? pool : null;
      await syncGridSelectionToViewAccount(viewAccountId, companyId, preferList, pool);
      if (cancelled) return;
      await performMemberSearchRef.current?.();
    })();

    return () => {
      cancelled = true;
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
      if (gridAbortRef.current) gridAbortRef.current.abort();
    };
  }, [linkedDataReady, viewAccountId, companyId, dateFrom, dateTo, syncGridSelectionToViewAccount]);

  return {
    loginRootAccountId,
    viewAccountId,
    companyId,
    setCompanyId,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    linkedAccounts,
    viewGridAccounts,
    wlGridSelectedIds,
    linkedAccountCurrenciesMap,
    linkedCurrenciesLoaded,
    isAllSelected,
    selectedCurrencies,
    availableCurrencies,
    miniGridCurrencies,
    miniGridDisplayCurrencies,
    miniGridShell,
    miniGridLoading,
    miniGridBalances,
    miniGridTotals,
    miniGridHint,
    miniGridAccounts,
    showMiniRail,
    groupedRows,
    loadingTable,
    initSession,
    switchCompany,
    switchAccount,
    persistCurrencyOrder,
    applyWlGridSelection,
    onCurrencyAll,
    onCurrencyToggle,
    performMemberSearch,
    fetchMemberHistory,
    formatPaymentHistoryMoney,
  };
}
