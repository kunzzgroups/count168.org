import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";
import { buildChartRows, resolveDailyChartXAxisTicks } from "../lib/dashboardChart.js";
import { DASHBOARD_PROFIT_COLOR } from "../lib/dashboardConstants.js";
import {
  defaultDashboardDateRange,
  formatRangeLabel,
  periodPresetRange,
} from "../lib/dashboardDateUtils.js";
import { buildKpiCompare, computeKpiMetrics } from "../lib/dashboardKpi.js";
import {
  companiesForPicker as resolveCompaniesForPicker,
  pickCompany,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "../lib/dashboardScope.js";
import { fetchMobileCurrencyCodes } from "../lib/dashboardCurrencies.js";
import { loadMobileDashboardData, resolveMobileKpiOwnershipOpts } from "../lib/dashboardLoad.js";
import {
  computeDisplayConvertedAmount,
  fetchFrankfurterRates,
  resolveFrankfurterDate,
} from "../lib/frankfurterRates.js";
import { dashboardDataIsUsable } from "../lib/demoDashboard.js";
import { assertApiOk, fetchJson } from "../lib/fetchJson.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import { canAccessDashboard, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const COMPANIES_API = "api/transactions/get_owner_companies_api.php";

function sameStringList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function buildDashboardScopeKey({
  companyId,
  selectedGroup,
  groupAllMode,
  groupsAllMode,
  dateFrom,
  dateTo,
  currency,
}) {
  const cid = Number.isFinite(Number(companyId)) && Number(companyId) > 0 ? String(Number(companyId)) : "";
  return [
    cid,
    String(selectedGroup || "").toUpperCase(),
    groupAllMode ? "1" : "0",
    groupsAllMode ? "1" : "0",
    dateFrom || "",
    dateTo || "",
    String(currency || "").toUpperCase(),
  ].join("|");
}

function earningsRowsFromBootstrap(bootstrap, panelMetric, primaryCurrency, kpiOpts = {}) {
  // Mobile hero/KPI are Net Profit — currency breakdown uses the same metric
  // (avoid mixing primary-currency net with other-currency earnings).
  const entries = bootstrap?.earnings?.current;
  if (Array.isArray(entries) && entries.length) {
    return entries
      .map(({ code, payload }) => {
        if (!payload) return null;
        const metrics = computeKpiMetrics(payload, kpiOpts);
        const normalized = String(code || "").trim().toUpperCase();
        const fromMetrics = metrics?.netProfit ?? metrics?.earnings;
        const earnings =
          normalized === String(primaryCurrency || "").toUpperCase() && panelMetric != null
            ? panelMetric
            : fromMetrics;
        return { code: normalized, earnings };
      })
      .filter((row) => row?.code);
  }

  const current = bootstrap?.current;
  const metrics = computeKpiMetrics(current, kpiOpts);
  const code = String(current?.currency || current?.settlement_currency || primaryCurrency || "MYR").toUpperCase();
  const earnings = panelMetric ?? metrics?.netProfit ?? metrics?.earnings ?? null;
  return earnings == null ? [] : [{ code, earnings }];
}

export function useMobileDashboard() {
  const navigate = useNavigate();
  const defaults = defaultDashboardDateRange();
  const [lang, setLangState] = useState(() => localStorage.getItem("login_lang") || "en");
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);

  const setLang = useCallback((next) => {
    const normalized = next === "zh" ? "zh" : "en";
    localStorage.setItem("login_lang", normalized);
    setLangState(normalized);
  }, []);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [currency, setCurrency] = useState("MYR");
  const [currencies, setCurrencies] = useState(["MYR"]);
  const [currenciesReady, setCurrenciesReady] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [activePreset, setActivePreset] = useState("thisYear");
  const [bootstrap, setBootstrap] = useState(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState("");
  const loadedScopeKeyRef = useRef("");
  const [exchangeRates, setExchangeRates] = useState({ rates: { MYR: 1 }, date: null });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [exchangeRatesError, setExchangeRatesError] = useState(false);
  const [chartVisible, setChartVisible] = useState({ 0: false, 1: false, 2: true, 3: false });
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [sessionNonce, setSessionNonce] = useState(0);
  const bootstrapSeq = useRef(0);
  const scopeSeq = useRef(0);
  const scopeAbortRef = useRef(null);

  const groupIds = useMemo(() => sortedUniqueGroupIds(companies), [companies]);

  const companiesForPicker = useMemo(
    () => resolveCompaniesForPicker(companies, { selectedGroup, groupsAllMode }),
    [companies, selectedGroup, groupsAllMode],
  );

  const selectedCompany = useMemo(
    () => companies.find((c) => Number(c.id) === Number(companyId)) || null,
    [companies, companyId],
  );

  const loadBootstrap = useCallback(
    async (scopeState, signal) => {
      return loadMobileDashboardData(scopeState, { signal, loadError: i18n.loadError });
    },
    [i18n.loadError],
  );

  // Session + companies (once)
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { res: meRes, json: meJson } = await fetchJson(
          buildApiUrl("api/session/current_user_api.php"),
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        if (!meRes.ok || !meJson?.success || !meJson?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = meJson.data;
        if (user.needs_owner_secondary || user.needs_user_secondary) {
          navigate(user.needs_owner_secondary ? "/owner-secondary-password" : "/user-secondary-password", {
            replace: true,
          });
          return;
        }
        if (String(user.user_type || "").toLowerCase() === "member") {
          navigate("/member", { replace: true });
          return;
        }
        if (!canAccessDashboard(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);

        const { res: coRes, json: coJson } = await fetchJson(
          buildApiUrl(`${COMPANIES_API}?all=1`),
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        assertApiOk(coRes, coJson, i18n.loadError);
        const list = Array.isArray(coJson?.data) ? coJson.data : [];
        const picked = pickCompany(list, user.company_id);
        if (!picked) throw new Error(i18n.loadError);

        setCompanies(list);
        setCompanyId(Number(picked.id));
        setSelectedGroup(null);
        setGroupsAllMode(false);
        setGroupAllMode(false);
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(e?.message || i18n.loadError);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [navigate, i18n.loadError, sessionNonce]);

  // Currencies before bootstrap — avoids first paint locked to MYR-only
  useEffect(() => {
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const groupOnly = Boolean(selectedGroup && !groupAllMode && !groupsAllMode && !hasCompany);
    if (!companies.length || (!hasCompany && !groupOnly && !groupsAllMode && !groupAllMode)) {
      return undefined;
    }
    const ac = new AbortController();
    // Soft refresh: don't flip currenciesReady false if we already have data (avoids full-page spinner flash).
    setCurrenciesReady((ready) => (ready ? ready : false));
    (async () => {
      try {
        const codes = await fetchMobileCurrencyCodes({
          companyId,
          selectedGroup,
          groupAllMode,
          groupsAllMode,
          companies,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        const next = codes.length ? codes : ["MYR"];
        setCurrencies((prev) => (sameStringList(prev, next) ? prev : next));
        setCurrency((prev) => (next.includes(prev) ? prev : next[0] || "MYR"));
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setCurrencies((prev) => (prev.length ? prev : ["MYR"]));
      } finally {
        if (!ac.signal.aborted) setCurrenciesReady(true);
      }
    })();
    return () => ac.abort();
  }, [companies, companyId, selectedGroup, groupAllMode, groupsAllMode]);

  // Bootstrap — gated on currenciesReady; ignore stale responses
  const scopeKey = useMemo(
    () =>
      buildDashboardScopeKey({
        companyId,
        selectedGroup,
        groupAllMode,
        groupsAllMode,
        dateFrom,
        dateTo,
        currency,
      }),
    [companyId, selectedGroup, groupAllMode, groupsAllMode, dateFrom, dateTo, currency],
  );

  useEffect(() => {
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const groupOnly = Boolean(selectedGroup && !groupAllMode && !groupsAllMode && !hasCompany);
    const canLoad =
      companies.length &&
      currenciesReady &&
      (hasCompany || groupOnly || groupsAllMode || groupAllMode);
    if (!canLoad) return undefined;
    const ac = new AbortController();
    const seq = ++bootstrapSeq.current;
    const requestScopeKey = scopeKey;
    const prevLoaded = loadedScopeKeyRef.current;
    const isScopeChange = Boolean(prevLoaded) && prevLoaded !== requestScopeKey;
    setBootstrapping(true);
    setError("");
    (async () => {
      try {
        const data = await loadBootstrap(
          {
            dateFrom,
            dateTo,
            currency,
            currencies,
            companyId,
            selectedGroup,
            groupAllMode,
            groupsAllMode,
            companies,
          },
          ac.signal,
        );
        if (ac.signal.aborted || seq !== bootstrapSeq.current) return;
        let finalData = data;
        if (import.meta.env.DEV && !dashboardDataIsUsable(data)) {
          const { DEMO_BOOTSTRAP } = await import("../lib/demoDashboard.js");
          finalData = DEMO_BOOTSTRAP;
        }
        loadedScopeKeyRef.current = requestScopeKey;
        setLoadedScopeKey(requestScopeKey);
        setBootstrap(finalData);
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError" || seq !== bootstrapSeq.current) return;
        setError(e?.message || i18n.loadError);
        // Soft refresh keeps last paint; scope change must not show another company's totals.
        if (isScopeChange || !prevLoaded) {
          loadedScopeKeyRef.current = "";
          setLoadedScopeKey("");
          setBootstrap(null);
        }
      } finally {
        if (!ac.signal.aborted && seq === bootstrapSeq.current) setBootstrapping(false);
      }
    })();
    return () => ac.abort();
  }, [
    companies,
    companyId,
    selectedGroup,
    groupAllMode,
    groupsAllMode,
    dateFrom,
    dateTo,
    currency,
    currencies,
    currenciesReady,
    reloadNonce,
    loadBootstrap,
    i18n.loadError,
    scopeKey,
  ]);

  const useConvertedEarnings = currencies.length > 1;
  const scopeStale = Boolean(bootstrap) && loadedScopeKey && loadedScopeKey !== scopeKey;
  // Skeleton on cold start or when switching Group/Company (never paint wrong-scope totals).
  const initialLoading = loading || scopeStale || (!bootstrap && (bootstrapping || !currenciesReady));
  const refreshing = Boolean(bootstrap) && !scopeStale && (bootstrapping || exchangeRatesLoading);
  const showLoading = initialLoading;

  useEffect(() => {
    if (!useConvertedEarnings || !currency) {
      setExchangeRates({ rates: { [currency]: 1 }, date: null });
      setExchangeRatesLoading(false);
      setExchangeRatesError(false);
      return undefined;
    }

    const ac = new AbortController();
    setExchangeRatesLoading(true);
    setExchangeRatesError(false);
    (async () => {
      try {
        const payload = await fetchFrankfurterRates(currency, currencies, {
          signal: ac.signal,
          date: resolveFrankfurterDate(dateTo),
        });
        if (!ac.signal.aborted) {
          setExchangeRates(payload);
          setExchangeRatesError(false);
        }
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        // Keep previous rates on failure to avoid undercounted totals flashing to identity.
        setExchangeRates((prev) =>
          prev?.rates && Object.keys(prev.rates).length
            ? prev
            : { rates: { [currency]: 1 }, date: null },
        );
        setExchangeRatesError(true);
      } finally {
        if (!ac.signal.aborted) setExchangeRatesLoading(false);
      }
    })();

    return () => ac.abort();
  }, [currency, currencies, useConvertedEarnings, dateTo]);

  const kpiOwnershipOpts = useMemo(
    () =>
      resolveMobileKpiOwnershipOpts({
        companyId,
        selectedGroup,
        groupAllMode,
        groupsAllMode,
        companies,
      }),
    [companyId, selectedGroup, groupAllMode, groupsAllMode, companies],
  );

  const kpi = useMemo(() => {
    const current = bootstrap?.current;
    const previous = bootstrap?.previous;
    const metrics = computeKpiMetrics(current, kpiOwnershipOpts);
    if (!metrics) return null;
    const prevMetrics = computeKpiMetrics(previous, kpiOwnershipOpts);
    const canCompareEarnings = Boolean(metrics.showEarnings && prevMetrics?.showEarnings);
    return {
      ...metrics,
      comparisons: prevMetrics
        ? {
            profit: buildKpiCompare(metrics.profit, prevMetrics.profit),
            expenses: buildKpiCompare(metrics.expenses, prevMetrics.expenses),
            netProfit: buildKpiCompare(metrics.netProfit, prevMetrics.netProfit),
            earnings: canCompareEarnings
              ? buildKpiCompare(metrics.kpiCardEarnings, prevMetrics.kpiCardEarnings)
              : null,
          }
        : null,
    };
  }, [bootstrap, kpiOwnershipOpts]);

  // Backend always shifts range by −1 month; label from previous_date_range when present.
  const compareLabel = useMemo(() => {
    const prev = bootstrap?.previous_date_range;
    if (prev?.from && prev?.to) {
      return `${i18n.vsPreviousPeriod} (${formatRangeLabel(prev.from, prev.to, { withYear: false })})`;
    }
    const map = {
      today: i18n.vsPreviousPeriod,
      yesterday: i18n.vsPreviousPeriod,
      thisWeek: i18n.vsPreviousPeriod,
      thisMonth: i18n.vsLastMonth,
      lastMonth: i18n.vsPreviousPeriod,
      thisYear: i18n.vsPreviousPeriod,
    };
    return map[activePreset] || i18n.vsPreviousPeriod;
  }, [activePreset, bootstrap, i18n]);

  const chartRows = useMemo(
    () => buildChartRows(bootstrap?.current, dateFrom, dateTo),
    [bootstrap, dateFrom, dateTo],
  );

  const chartSeries = useMemo(() => {
    const series = [
      { idx: 0, label: i18n.profit, color: DASHBOARD_PROFIT_COLOR, dataKey: "profit", fill: "url(#mGProfit)" },
      { idx: 1, label: i18n.expenses, color: "#ef4444", dataKey: "expenses", fill: "url(#mGExp)" },
      { idx: 2, label: i18n.netProfitChart, color: "#10b981", dataKey: "netProfit", fill: "url(#mGNet)" },
    ];
    if (kpi?.showEarnings) {
      series.push({ idx: 3, label: i18n.earnings, color: "#f59e0b", dataKey: "earnings", fill: "url(#mGEarn)" });
    }
    return series;
  }, [i18n, kpi?.showEarnings]);

  const chartXAxisLayout = useMemo(() => {
    return resolveDailyChartXAxisTicks(chartRows.length);
  }, [chartRows.length]);

  const panelMetric = kpi?.netProfit ?? null;

  const earningsCurrencyRows = useMemo(() => {
    const rows = earningsRowsFromBootstrap(bootstrap, panelMetric, currency, kpiOwnershipOpts);
    if (!useConvertedEarnings) return rows;
    return rows.map((row) => {
      if (String(row.code).toUpperCase() === String(currency).toUpperCase()) {
        return { ...row, earningsConverted: row.earnings };
      }
      return {
        ...row,
        earningsConverted: computeDisplayConvertedAmount(row.earnings, row.code, currency, exchangeRates.rates),
      };
    });
  }, [bootstrap, panelMetric, currency, useConvertedEarnings, exchangeRates.rates, kpiOwnershipOpts]);

  // Hero must match KPI Net Profit (selected company/currency) — never sum FX rows.
  const summaryValue = panelMetric ?? 0;

  const heroCompare = useMemo(() => kpi?.comparisons?.netProfit || null, [kpi?.comparisons?.netProfit]);

  // Multi-currency note lives on the currency cards, not the Net Profit hero.
  const showMultiCurrencyNote = false;

  const ratesWarning = useMemo(() => {
    if (!useConvertedEarnings || exchangeRatesLoading) return "";
    const missing = earningsCurrencyRows.some((row) => {
      const raw = Number(row.earnings);
      if (!Number.isFinite(raw) || Math.abs(raw) < 0.005) return false;
      return row.earningsConverted == null;
    });
    // Surface when conversion is incomplete (failed FX fetch typically causes this).
    if (missing || (exchangeRatesError && useConvertedEarnings)) {
      return i18n.ratesUnavailable || "";
    }
    return "";
  }, [
    useConvertedEarnings,
    exchangeRatesLoading,
    exchangeRatesError,
    earningsCurrencyRows,
    i18n.ratesUnavailable,
  ]);

  const dateRangeText = useMemo(() => formatRangeLabel(dateFrom, dateTo), [dateFrom, dateTo]);
  const dateRangeShort = useMemo(
    () => formatRangeLabel(dateFrom, dateTo, { withYear: false }),
    [dateFrom, dateTo],
  );

  const applyPreset = useCallback((preset) => {
    const range = periodPresetRange(preset);
    if (!range) return;
    setActivePreset(preset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
    setBootstrapping(true);
  }, []);

  const setCustomDateRange = useCallback((nextFrom, nextTo) => {
    const from = String(nextFrom || "").trim();
    const to = String(nextTo || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;
    if (from > to) {
      setDateFrom(to);
      setDateTo(from);
    } else {
      setDateFrom(from);
      setDateTo(to);
    }
    setActivePreset(null);
    setBootstrapping(true);
  }, []);

  const syncCompanySession = useCallback(
    async (id, signal) => {
      const { res, json } = await fetchJson(
        buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`),
        { signal },
      );
      assertApiOk(res, json, i18n.loadError);
    },
    [i18n.loadError],
  );

  const switchCompany = useCallback(
    async (nextId) => {
      const id = Number(nextId);
      if (!Number.isFinite(id) || id <= 0) return;
      const sameCompany = Number(id) === Number(companyId);
      if (sameCompany && !groupAllMode && !groupsAllMode) return;
      const row = companies.find((c) => Number(c.id) === id);
      const seq = ++scopeSeq.current;
      scopeAbortRef.current?.abort();
      const ac = new AbortController();
      scopeAbortRef.current = ac;
      setBootstrapping(true);
      setError("");
      try {
        if (!sameCompany) {
          await syncCompanySession(id, ac.signal);
        }
        if (seq !== scopeSeq.current) return;
        setCompanyId(id);
        setSelectedGroup(selectedGroup ? resolveViewGroupForCompany(row, selectedGroup) : selectedGroup);
        setGroupsAllMode(false);
        setGroupAllMode(false);
      } catch (e) {
        if (e?.name === "AbortError" || seq !== scopeSeq.current) return;
        setError(e?.message || i18n.loadError);
        setBootstrapping(false);
      }
    },
    [companies, companyId, selectedGroup, groupAllMode, groupsAllMode, syncCompanySession, i18n.loadError],
  );

  const resetFilters = useCallback(() => {
    applyPreset("thisYear");
    setGroupsAllMode(false);
    setGroupAllMode(false);
    setSelectedGroup(null);
    const fallback = pickCompany(companies, me?.company_id);
    if (fallback?.id && Number(fallback.id) !== Number(companyId)) {
      void switchCompany(Number(fallback.id));
    }
  }, [applyPreset, companies, me?.company_id, companyId, switchCompany]);

  const pickGroup = useCallback(
    (gid) => {
      const group = String(gid || "").trim().toUpperCase();
      if (!group) return;
      // Enter group-only (ledger) mode — not Company All. Use Company → All to merge subsidiaries.
      setGroupsAllMode(false);
      setGroupAllMode(false);
      setSelectedGroup(group);
      setCompanyId(null);
      setBootstrapping(true);
      setError("");
    },
    [],
  );

  const pickAllGroups = useCallback(() => {
    setGroupsAllMode(true);
    setGroupAllMode(false);
    setSelectedGroup(null);
    setCompanyId(null);
  }, []);

  const pickAllInGroup = useCallback(() => {
    if (!selectedGroup) return;
    setGroupsAllMode(false);
    setGroupAllMode(true);
    // Keep / assign an anchor company id for session + picker, but load uses merge path.
    if (!(Number.isFinite(Number(companyId)) && Number(companyId) > 0)) {
      const first = resolveCompaniesForPicker(companies, {
        selectedGroup,
        groupsAllMode: false,
      })[0];
      if (first?.id != null) setCompanyId(Number(first.id));
    }
  }, [selectedGroup, companyId, companies]);

  const toggleChartSeries = useCallback((idx) => {
    setChartVisible((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } catch {
      /* continue */
    }
    navigate("/login", { replace: true });
  }, [navigate]);

  const retry = useCallback(() => {
    setError("");
    const hasCompany = Number.isFinite(Number(companyId)) && Number(companyId) > 0;
    const canSoftReload =
      hasCompany || Boolean(selectedGroup) || groupsAllMode || groupAllMode;
    if (canSoftReload) {
      setReloadNonce((n) => n + 1);
      return;
    }
    setSessionNonce((n) => n + 1);
  }, [companyId, selectedGroup, groupsAllMode, groupAllMode]);

  const groupOnlyMode = Boolean(
    selectedGroup && !groupAllMode && !groupsAllMode && !(Number.isFinite(Number(companyId)) && Number(companyId) > 0),
  );

  return {
    i18n,
    lang,
    setLang,
    me,
    companies,
    groupIds,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
    groupOnlyMode,
    companiesForPicker,
    companyId,
    selectedCompany,
    switchCompany,
    pickGroup,
    pickAllGroups,
    pickAllInGroup,
    currency,
    setCurrency,
    currencies,
    exchangeRates,
    exchangeRatesLoading,
    ratesWarning,
    useConvertedEarnings,
    showMultiCurrencyNote,
    heroCompare,
    dateFrom,
    dateTo,
    dateRangeText,
    dateRangeShort,
    activePreset,
    applyPreset,
    setCustomDateRange,
    resetFilters,
    kpi,
    compareLabel,
    chartRows,
    chartSeries,
    chartVisible,
    chartXAxisLayout,
    toggleChartSeries,
    earningsCurrencyRows,
    summaryValue,
    loading: showLoading,
    refreshing,
    error,
    blocked,
    logout,
    retry,
    hasData: dashboardDataIsUsable(bootstrap),
  };
}
