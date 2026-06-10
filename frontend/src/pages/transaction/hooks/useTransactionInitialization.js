import { useLayoutEffect, useRef } from "react";
import { readTransactionCurrencyFilterState } from "../lib/transactionPaymentLogic.js";
import {
  buildDashboardCurrencyScopeKey,
  resolveCrossPageCurrencyPreference,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  transactionScopeCacheCompanyKey,
  transactionScopeCacheKey,
} from "../lib/transactionScope.js";

function sameCurrencySelection(a, b) {
  const left = Array.isArray(a) ? a.map((x) => String(x || "").toUpperCase()) : [];
  const right = Array.isArray(b) ? b.map((x) => String(x || "").toUpperCase()) : [];
  if (left.length !== right.length) return false;
  return left.every((code, idx) => code === right[idx]);
}

/** Session memory uses { showAll, currencies }; normalize legacy { showAllCurrencies, selectedCurrencies }. */
function resolveSavedCurrencyPrefs(companyCacheKey, memoryStore) {
  const mem = companyCacheKey != null ? memoryStore[companyCacheKey] : null;
  const fromStorage = readTransactionCurrencyFilterState(companyCacheKey);

  const memCurrencies = Array.isArray(mem?.currencies)
    ? mem.currencies
    : Array.isArray(mem?.selectedCurrencies)
      ? mem.selectedCurrencies
      : [];

  if (memCurrencies.length > 0) {
    return {
      showAll: !!(mem?.showAll ?? mem?.showAllCurrencies),
      currencies: memCurrencies.map((c) => String(c || "").trim()).filter(Boolean),
    };
  }

  return fromStorage;
}

export function useTransactionInitialization({
  loading,
  forbidden,
  filterSnapshot,
  transactionScope,
  currencyScopeBundle,
  todayDmy,
  search,
  form,
}) {
  const currencyRestoredScopeKeyRef = useRef(null);
  const currencyPrefsByCompanyRef = useRef({});
  const prevCompanyCacheKeyRef = useRef(null);
  const prevScopeCacheKeyRef = useRef(null);
  const searchRef = useRef(search);
  const formRef = useRef(form);
  searchRef.current = search;
  formRef.current = form;

  useLayoutEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;

    const activeSearch = searchRef.current;
    const activeForm = formRef.current;
    if (!activeSearch || !activeForm) return;

    const scopeCacheKey = transactionScopeCacheKey(transactionScope);
    const companyCacheKey =
      transactionScopeCacheCompanyKey(transactionScope) ?? filterSnapshot.companyId ?? null;

    if (prevScopeCacheKeyRef.current !== scopeCacheKey) {
      currencyRestoredScopeKeyRef.current = null;
      prevScopeCacheKeyRef.current = scopeCacheKey;
    }

    const prevCompanyKey = prevCompanyCacheKeyRef.current;
    if (prevCompanyKey != null && prevCompanyKey !== companyCacheKey) {
      currencyPrefsByCompanyRef.current[prevCompanyKey] = {
        showAll: activeSearch.showAllCurrencies,
        currencies: [...activeSearch.selectedCurrencies],
      };
    }
    prevCompanyCacheKeyRef.current = companyCacheKey;

    const cid = companyCacheKey;
    const scopeKey = transactionScope
      ? `${transactionScope.scopeCompanyId > 0 ? transactionScope.scopeCompanyId : `group:${transactionScope.selectedGroup || ""}`}:${transactionScope.viewGroup || ""}`
      : String(cid ?? "");

    activeSearch.setDateFrom((v) => v || todayDmy);
    activeSearch.setDateTo((v) => v || todayDmy);
    activeForm.setTxDate((v) => v || todayDmy);
    activeForm.setRateDate((v) => v || todayDmy);

    if (!scopeCacheKey || currencyScopeBundle.scopeKey !== scopeCacheKey) return;
    if (currencyScopeBundle.rows.length === 0) return;

    const rows = currencyScopeBundle.rows;
    const codes = rows.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);

    let preferredDefault = resolveCrossPageCurrencyPreference({
      scopeKey: buildDashboardCurrencyScopeKey({
        companyId: transactionScope?.scopeCompanyId > 0 ? transactionScope.scopeCompanyId : cid,
        selectedGroup: transactionScope?.selectedGroup ?? filterSnapshot?.selectedGroup,
      }),
      availableCodes: codes,
    });
    if (!preferredDefault) {
      try {
        preferredDefault =
          String(localStorage.getItem(`transaction_default_currency_${cid || 0}`))
            .trim()
            .toUpperCase() || null;
      } catch {
        preferredDefault = null;
      }
    }

    const pickDefault =
      (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
      rows[0];

    const ensureCurrencySelection = () => {
      if (activeSearch.showAllCurrencies || rows.length === 0) return;
      const valid = activeSearch.selectedCurrencies.filter((code) =>
        codes.includes(String(code || "").toUpperCase().trim()),
      );
      if (valid.length > 0) {
        if (!sameCurrencySelection(activeSearch.selectedCurrencies, valid)) {
          activeSearch.setSelectedCurrencies(valid);
        }
        return;
      }
      const pick =
        (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
        rows[0];
      if (pick?.code) {
        activeSearch.setSelectedCurrencies([pick.code]);
      }
    };

    const resetSelection = currencyRestoredScopeKeyRef.current !== scopeKey;

    if (!resetSelection) {
      ensureCurrencySelection();
      if (pickDefault?.code) {
        activeForm.setTxCurrency((v) => v || pickDefault.code);
        activeForm.setRateCurrencyFrom((v) => v || pickDefault.code);
        if (codes.includes("MYR")) activeForm.setRateCurrencyTo((v) => v || "MYR");
      }
      return;
    }

    const saved = resolveSavedCurrencyPrefs(cid, currencyPrefsByCompanyRef.current);
    let nextShowAll = false;
    let nextSel = [];

    if (saved?.showAll) {
      nextShowAll = false;
      nextSel = rows.map((c) => String(c.code || "").toUpperCase().trim()).filter(Boolean);
    } else if (saved?.currencies?.length) {
      const valid = saved.currencies.filter((code) => rows.some((c) => String(c.code) === String(code)));
      if (valid.length > 0) nextSel = valid;
    }

    if (!nextShowAll && nextSel.length === 0 && rows.length > 0) {
      const pick =
        (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
        rows[0];
      if (pick?.code) nextSel = [pick.code];
    }

    activeSearch.setShowAllCurrencies((prev) => (prev === nextShowAll ? prev : nextShowAll));
    activeSearch.setSelectedCurrencies((prev) => (sameCurrencySelection(prev, nextSel) ? prev : nextSel));
    currencyRestoredScopeKeyRef.current = scopeKey;

    if (pickDefault?.code) {
      activeForm.setTxCurrency((v) => (v === pickDefault.code ? v : pickDefault.code));
      activeForm.setRateCurrencyFrom((v) => (v === pickDefault.code ? v : pickDefault.code));
      if (codes.includes("MYR")) activeForm.setRateCurrencyTo((v) => (v === "MYR" ? v : "MYR"));
    }
  }, [
    loading,
    forbidden,
    filterSnapshot,
    transactionScope,
    transactionScope?.scopeCompanyId,
    transactionScope?.viewGroup,
    currencyScopeBundle,
    todayDmy,
  ]);
}
