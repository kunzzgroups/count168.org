import { useLayoutEffect, useRef } from "react";
import { readTransactionCurrencyFilterState } from "../lib/transactionPaymentLogic.js";

function sameCurrencySelection(a, b) {
  const left = Array.isArray(a) ? a.map((x) => String(x || "").toUpperCase()) : [];
  const right = Array.isArray(b) ? b.map((x) => String(x || "").toUpperCase()) : [];
  if (left.length !== right.length) return false;
  return left.every((code, idx) => code === right[idx]);
}

export function useTransactionInitialization({
  loading,
  forbidden,
  filterSnapshot,
  currencyRowsOrdered,
  todayDmy,
  search,
  form,
}) {
  const currencyInitCompanyRef = useRef(null);
  const searchRef = useRef(search);
  const formRef = useRef(form);
  searchRef.current = search;
  formRef.current = form;

  useLayoutEffect(() => {
    if (loading || forbidden || !filterSnapshot || currencyRowsOrdered.length === 0) return;

    const activeSearch = searchRef.current;
    const activeForm = formRef.current;
    if (!activeSearch || !activeForm) return;

    const cid = filterSnapshot.companyId;
    const resetSelection = currencyInitCompanyRef.current !== cid;
    currencyInitCompanyRef.current = cid;

    activeSearch.setDateFrom((v) => v || todayDmy);
    activeSearch.setDateTo((v) => v || todayDmy);
    activeForm.setTxDate((v) => v || todayDmy);
    activeForm.setRateDate((v) => v || todayDmy);

    const rows = currencyRowsOrdered;
    const codes = rows.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);

    let preferredDefault = null;
    try {
      preferredDefault =
        String(localStorage.getItem(`transaction_default_currency_${cid || 0}`))
          .trim()
          .toUpperCase() || null;
    } catch {
      preferredDefault = null;
    }

    const pickDefault =
      (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
      rows[0];

    if (!resetSelection) {
      if (!activeSearch.showAllCurrencies && activeSearch.selectedCurrencies.length === 0 && rows.length > 0) {
        const pick =
          (preferredDefault ? rows.find((c) => String(c.code || "").toUpperCase() === preferredDefault) : null) ||
          rows[0];
        if (pick?.code) {
          activeSearch.setSelectedCurrencies((prev) => (sameCurrencySelection(prev, [pick.code]) ? prev : [pick.code]));
          activeSearch.persistCurrencyFilter(cid, false, [pick.code]);
        }
      }
      if (pickDefault?.code) {
        activeForm.setTxCurrency((v) => v || pickDefault.code);
        activeForm.setRateCurrencyFrom((v) => v || pickDefault.code);
        if (codes.includes("MYR")) activeForm.setRateCurrencyTo((v) => v || "MYR");
      }
      return;
    }

    const saved = readTransactionCurrencyFilterState(cid);
    let nextShowAll = false;
    let nextSel = [];

    if (saved?.showAll) {
      nextShowAll = true;
      nextSel = [];
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
    activeSearch.persistCurrencyFilter(cid, nextShowAll, nextSel);

    if (pickDefault?.code) {
      activeForm.setTxCurrency((v) => (v === pickDefault.code ? v : pickDefault.code));
      activeForm.setRateCurrencyFrom((v) => (v === pickDefault.code ? v : pickDefault.code));
      if (codes.includes("MYR")) activeForm.setRateCurrencyTo((v) => (v === "MYR" ? v : "MYR"));
    }
  }, [loading, forbidden, filterSnapshot?.companyId, currencyRowsOrdered, todayDmy]);
}
