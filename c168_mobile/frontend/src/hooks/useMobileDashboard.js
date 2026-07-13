import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiUrl.js";
import { buildChartRows, resolveDailyChartXAxisTicks } from "../lib/dashboardChart.js";
import { DASHBOARD_BOOTSTRAP_API, DASHBOARD_PROFIT_COLOR } from "../lib/dashboardConstants.js";
import {
  defaultDashboardDateRange,
  formatRangeLabel,
  periodPresetRange,
} from "../lib/dashboardDateUtils.js";
import { buildKpiCompare, computeKpiMetrics } from "../lib/dashboardKpi.js";
import {
  buildBootstrapQuery,
  companiesForPicker as resolveCompaniesForPicker,
  pickCompany,
  resolveViewGroupForCompany,
  sortedUniqueGroupIds,
} from "../lib/dashboardScope.js";
import { fetchMobileCurrencyCodes } from "../lib/dashboardCurrencies.js";
import { computeDisplayConvertedAmount, fetchFrankfurterRates } from "../lib/frankfurterRates.js";
import { DEMO_BOOTSTRAP, dashboardDataIsUsable } from "../lib/demoDashboard.js";
import { DASHBOARD_I18N } from "../translateFile/dashboardTranslate.js";
import { canAccessDashboard, resolveMobileLandingPath } from "../utils/mobilePermissions.js";

const COMPANIES_API = "api/transactions/get_owner_companies_api.php";

function sameStringList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function earningsRowsFromBootstrap(bootstrap, panelMetric, primaryCurrency) {
  const entries = bootstrap?.earnings?.current;
  if (Array.isArray(entries) && entries.length) {
    return entries
      .map(({ code, payload }) => {
        const metrics = computeKpiMetrics(payload);
        const normalized = String(code || "").trim().toUpperCase();
        const earnings =
          normalized === String(primaryCurrency || "").toUpperCase() && panelMetric != null
            ? panelMetric
            : metrics?.netProfit;
        return { code: normalized, earnings };
      })
      .filter((row) => row.code);
  }

  const current = bootstrap?.current;
  const metrics = computeKpiMetrics(current);
  const code = String(current?.currency || current?.settlement_currency || primaryCurrency || "MYR").toUpperCase();
  const earnings = panelMetric ?? metrics?.netProfit ?? null;
  return earnings == null ? [] : [{ code, earnings }];
}

export function useMobileDashboard() {
  const navigate = useNavigate();
  const defaults = defaultDashboardDateRange();
  const [lang] = useState(() => localStorage.getItem("login_lang") || "en");
  const i18n = useMemo(() => DASHBOARD_I18N[lang] || DASHBOARD_I18N.en, [lang]);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupsAllMode, setGroupsAllMode] = useState(false);
  const [groupAllMode, setGroupAllMode] = useState(false);
  const [currency, setCurrency] = useState("MYR");
  const [currencies, setCurrencies] = useState(["MYR"]);
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [activePreset, setActivePreset] = useState("thisMonth");
  const [bootstrap, setBootstrap] = useState(null);
  const [exchangeRates, setExchangeRates] = useState({ rates: { MYR: 1 }, date: null });
  const [exchangeRatesLoading, setExchangeRatesLoading] = useState(false);
  const [chartVisible, setChartVisible] = useState({ 0: true, 1: true, 2: true, 3: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);

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
    async (scopeState) => {
      const q = buildBootstrapQuery(scopeState);
      const res = await fetch(buildApiUrl(`${DASHBOARD_BOOTSTRAP_API}?${q}`), {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data) {
        throw new Error(json?.message || json?.error || i18n.loadError);
      }
      return json.data;
    },
    [i18n.loadError],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), {
          credentials: "include",
          cache: "no-store",
        });
        const meJson = await meRes.json();
        if (cancelled) return;
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

        const coRes = await fetch(buildApiUrl(`${COMPANIES_API}?all=1`), {
          credentials: "include",
          cache: "no-store",
        });
        const coJson = await coRes.json();
        const list = Array.isArray(coJson?.data) ? coJson.data : [];
        const picked = pickCompany(list, user.company_id);
        if (!picked) throw new Error(i18n.loadError);

        setCompanies(list);
        setCompanyId(Number(picked.id));
        setSelectedGroup(null);
        setGroupsAllMode(false);
        setGroupAllMode(false);
      } catch (e) {
        if (!cancelled) setError(e?.message || i18n.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, i18n.loadError]);

  // Load currency pills from company Currency Setting (same source as desktop).
  useEffect(() => {
    if (!companies.length || !companyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const codes = await fetchMobileCurrencyCodes({
          companyId,
          selectedGroup,
          groupAllMode,
          groupsAllMode,
          companies,
        });
        if (cancelled) return;
        setCurrencies((prev) => (sameStringList(prev, codes) ? prev : codes));
        setCurrency((prev) => (codes.includes(prev) ? prev : codes[0] || "MYR"));
      } catch {
        if (!cancelled) {
          setCurrencies((prev) => (prev.length ? prev : ["MYR"]));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companies, companyId, selectedGroup, groupAllMode, groupsAllMode]);

  useEffect(() => {
    if (!companies.length || !companyId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await loadBootstrap({
          dateFrom,
          dateTo,
          currency,
          currencies,
          companyId,
          selectedGroup,
          groupAllMode,
          groupsAllMode,
          companies,
        });
        if (cancelled) return;
        const finalData =
          import.meta.env.DEV && !dashboardDataIsUsable(data) ? DEMO_BOOTSTRAP : data;
        setBootstrap(finalData);
      } catch (e) {
        if (!cancelled) {
          setBootstrap(null);
          setError(e?.message || i18n.loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    loadBootstrap,
    i18n.loadError,
  ]);

  const useConvertedEarnings = currencies.length > 1;

  useEffect(() => {
    if (!useConvertedEarnings || !currency) {
      setExchangeRates({ rates: { [currency]: 1 }, date: null });
      setExchangeRatesLoading(false);
      return undefined;
    }

    let cancelled = false;
    setExchangeRatesLoading(true);
    (async () => {
      try {
        const payload = await fetchFrankfurterRates(currency, currencies);
        if (!cancelled) setExchangeRates(payload);
      } catch {
        if (!cancelled) setExchangeRates({ rates: { [currency]: 1 }, date: null });
      } finally {
        if (!cancelled) setExchangeRatesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currency, currencies, useConvertedEarnings]);

  const kpi = useMemo(() => {
    const current = bootstrap?.current;
    const previous = bootstrap?.previous;
    const metrics = computeKpiMetrics(current);
    if (!metrics) return null;
    const prevMetrics = computeKpiMetrics(previous);
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
  }, [bootstrap]);

  const compareLabel = useMemo(() => {
    const map = {
      today: i18n.vsYesterday,
      yesterday: i18n.vsPreviousPeriod,
      thisWeek: i18n.vsLastWeek,
      thisMonth: i18n.vsLastMonth,
      lastMonth: i18n.vsLastMonth,
      thisYear: i18n.vsLastYear,
    };
    return map[activePreset] || i18n.vsPreviousPeriod;
  }, [activePreset, i18n]);

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
    const tick = resolveDailyChartXAxisTicks(chartRows.length);
    return { ...tick, height: 22, marginBottom: 22 };
  }, [chartRows.length]);

  const panelMetric = kpi?.netProfit ?? null;

  const earningsCurrencyRows = useMemo(() => {
    const rows = earningsRowsFromBootstrap(bootstrap, panelMetric, currency);
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
  }, [bootstrap, panelMetric, currency, useConvertedEarnings, exchangeRates.rates]);

  const summaryValue = useMemo(() => {
    if (!useConvertedEarnings) return panelMetric ?? 0;
    return earningsCurrencyRows.reduce((sum, row) => sum + (Number(row.earningsConverted) || 0), 0);
  }, [earningsCurrencyRows, panelMetric, useConvertedEarnings]);

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
  }, []);

  const syncCompanySession = useCallback(
    async (id) => {
      const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${id}`), {
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || json?.error || i18n.loadError);
      }
    },
    [i18n.loadError],
  );

  const switchCompany = useCallback(
    async (nextId) => {
      const id = Number(nextId);
      if (!Number.isFinite(id) || id <= 0) return;
      const sameCompany = Number(id) === Number(companyId);
      // Allow re-selecting current company to exit Group "All" aggregate mode.
      if (sameCompany && !groupAllMode && !groupsAllMode) return;
      const row = companies.find((c) => Number(c.id) === id);
      setLoading(true);
      setError("");
      try {
        if (!sameCompany) {
          await syncCompanySession(id);
        }
        setCompanyId(id);
        setSelectedGroup(selectedGroup ? resolveViewGroupForCompany(row, selectedGroup) : selectedGroup);
        setGroupsAllMode(false);
        setGroupAllMode(false);
      } catch (e) {
        setError(e?.message || i18n.loadError);
        setLoading(false);
      }
    },
    [companies, companyId, selectedGroup, groupAllMode, groupsAllMode, syncCompanySession, i18n.loadError],
  );

  const resetFilters = useCallback(() => {
    applyPreset("thisMonth");
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
      setGroupsAllMode(false);
      setGroupAllMode(true);
      setSelectedGroup(group);
      const first = resolveCompaniesForPicker(companies, { selectedGroup: group, groupsAllMode: false })[0];
      const nextId = first?.id != null ? Number(first.id) : null;
      if (!nextId || nextId === Number(companyId)) return;
      setLoading(true);
      setError("");
      syncCompanySession(nextId)
        .then(() => setCompanyId(nextId))
        .catch((e) => {
          setError(e?.message || i18n.loadError);
          setLoading(false);
        });
    },
    [companies, companyId, syncCompanySession, i18n.loadError],
  );

  const pickAllGroups = useCallback(() => {
    setGroupsAllMode(true);
    setGroupAllMode(false);
    setSelectedGroup(null);
  }, []);

  const pickAllInGroup = useCallback(() => {
    if (!selectedGroup) return;
    setGroupsAllMode(false);
    setGroupAllMode(true);
  }, [selectedGroup]);

  const toggleChartSeries = useCallback((idx) => {
    setChartVisible((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(buildApiUrl("api/session/logout_api.php"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* continue */
    }
    navigate("/login", { replace: true });
  }, [navigate]);

  return {
    i18n,
    lang,
    me,
    companies,
    groupIds,
    selectedGroup,
    groupsAllMode,
    groupAllMode,
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
    useConvertedEarnings,
    dateRangeText,
    dateRangeShort,
    activePreset,
    applyPreset,
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
    loading,
    error,
    blocked,
    logout,
  };
}
