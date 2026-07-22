import { useEffect, useRef } from "react";
import {
  TX_LIST_INVALIDATE_LS_KEY,
  TX_LIST_INVALIDATE_HANDLED_KEY,
  TX_DATA_CHANGED_EVENT,
  buildTxListSessionKey,
} from "../lib/transactionPaymentLogic.js";
import { clearTxSearchCache } from "../../../utils/transaction/transactionSearchCache.js";
import { subscribeTransactionLedgerRealtime } from "../lib/transactionRealtime.js";
import {
  transactionScopeApiParams,
  transactionScopeCacheCompanyKey,
  transactionScopeIsReady,
} from "../lib/transactionScope.js";

function readInvalidateHandledTs() {
  try {
    return parseInt(sessionStorage.getItem(TX_LIST_INVALIDATE_HANDLED_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function markInvalidateHandled(ts) {
  try {
    sessionStorage.setItem(TX_LIST_INVALIDATE_HANDLED_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function useTransactionSync({
  filterSnapshot,
  transactionScope,
  effectiveDateFrom,
  effectiveDateTo,
  selectedCategories,
  searchState,
  showAllCurrencies,
  selectedCurrencies,
  lastSearchCommitMsRef,
  runSearch,
  runTypeSearch,
  typeSearchActive,
  typeSearchFormType,
  submitFocusActive,
  loading,
  forbidden,
  canApproveContra,
  refreshContraInboxBadge,
  initialSearchDoneRef,
}) {
  const runSearchRef = useRef(runSearch);
  const runTypeSearchRef = useRef(runTypeSearch);
  const typeSearchActiveRef = useRef(typeSearchActive);
  const typeSearchFormTypeRef = useRef(typeSearchFormType);
  const submitFocusActiveRef = useRef(submitFocusActive);
  const searchStateRef = useRef(searchState);
  const canApproveContraRef = useRef(canApproveContra);
  const refreshContraInboxBadgeRef = useRef(refreshContraInboxBadge);
  const transactionScopeRef = useRef(transactionScope);
  runSearchRef.current = runSearch;
  runTypeSearchRef.current = runTypeSearch;
  typeSearchActiveRef.current = typeSearchActive;
  typeSearchFormTypeRef.current = typeSearchFormType;
  submitFocusActiveRef.current = submitFocusActive;
  searchStateRef.current = searchState;
  canApproveContraRef.current = canApproveContra;
  refreshContraInboxBadgeRef.current = refreshContraInboxBadge;
  transactionScopeRef.current = transactionScope;

  useEffect(() => {
    let retryTimer = null;
    let refreshInFlight = false;
    const queueRetry = () => {
      if (retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        refreshFromInvalidate();
      }, 650);
    };

    const refreshFromInvalidate = () => {
      const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || "0", 10) || 0;
      const handledTs = readInvalidateHandledTs();
      if (!invalidateTs || invalidateTs <= handledTs) return;
      if (!effectiveDateFrom || !effectiveDateTo) {
        queueRetry();
        return;
      }
      if (!showAllCurrencies && selectedCurrencies.length === 0) {
        queueRetry();
        return;
      }
      if (refreshInFlight) return;
      refreshInFlight = true;
      clearTxSearchCache();
      try {
        const key = buildTxListSessionKey({
          companyId: transactionScopeCacheCompanyKey(transactionScope),
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          selectedCategories,
          showInactive: searchState.showPaymentOnly,
          showCaptureOnly: searchState.showCaptureOnly,
          hideZeroBalance: !searchState.showZeroBalance,
          showAllCurrencies,
          selectedCurrencies,
        });
        if (key) sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      void Promise.resolve(runSearch?.({ silent: true, forceRefresh: true }))
        .then(() => {
          markInvalidateHandled(invalidateTs);
          if (lastSearchCommitMsRef) {
            lastSearchCommitMsRef.current = Date.now();
          }
        })
        .finally(() => {
          refreshInFlight = false;
        });
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    };
    const onStorage = (e) => {
      if (!e || e.key !== TX_LIST_INVALIDATE_LS_KEY) return;
      refreshFromInvalidate();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("storage", onStorage);
    window.addEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
    // Same-tab navigate-back: apply pending invalidate immediately (don't wait for 5s poll).
    refreshFromInvalidate();
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshFromInvalidate();
    }, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TX_DATA_CHANGED_EVENT, refreshFromInvalidate);
      clearInterval(poll);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    transactionScopeCacheCompanyKey(transactionScope),
    effectiveDateFrom,
    effectiveDateTo,
    selectedCategories,
    searchState.showPaymentOnly,
    searchState.showCaptureOnly,
    searchState.showZeroBalance,
    showAllCurrencies,
    selectedCurrencies,
    lastSearchCommitMsRef,
    runSearch,
  ]);

  // Cross-device live sync: SSE ledger_changed → silent refresh (keeps submit-focus filter).
  useEffect(() => {
    // Do not gate on `loading` — tearing SSE down on every data reload drops the live channel.
    if (forbidden) return;
    if (!transactionScopeIsReady(transactionScope)) return;

    let unsubscribe = () => {};
    let waitId = null;
    let refreshInFlight = false;

    const refreshFromRealtime = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshInFlight) return;
      refreshInFlight = true;
      clearTxSearchCache();
      // Invalidate sibling tabs (storage event) without same-tab TX_DATA_CHANGED double-fetch.
      try {
        localStorage.setItem(TX_LIST_INVALIDATE_LS_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }

      const doRefresh = async () => {
        try {
          if (typeSearchActiveRef.current && typeSearchFormTypeRef.current) {
            await runTypeSearchRef.current?.(typeSearchFormTypeRef.current, {
              forceRefresh: true,
              silent: true,
            });
          } else {
            // submit-focus: do not clear focus ids — presentation layer keeps the narrow list.
            await runSearchRef.current?.({
              silent: true,
              forceRefresh: true,
              typeSearchOverride: false,
              searchStateOverride: submitFocusActiveRef.current
                ? {
                    ...searchStateRef.current,
                    showPaymentOnly: false,
                    showCaptureOnly: false,
                    showZeroBalance: true,
                  }
                : undefined,
            });
          }
          // Manager+ Contra Inbox badge/list must update on PENDING submit / approve / reject.
          if (canApproveContraRef.current) {
            const scopeApi = transactionScopeApiParams(transactionScopeRef.current);
            await refreshContraInboxBadgeRef.current?.(scopeApi);
          }
        } finally {
          refreshInFlight = false;
          if (lastSearchCommitMsRef) {
            lastSearchCommitMsRef.current = Date.now();
          }
        }
      };
      void doRefresh();
    };

    const start = () => {
      const scopeApi = transactionScopeApiParams(transactionScope);
      unsubscribe = subscribeTransactionLedgerRealtime({
        scopeApi,
        onLedgerChanged: refreshFromRealtime,
      });
    };

    if (initialSearchDoneRef?.current) {
      start();
    } else {
      waitId = setInterval(() => {
        if (!initialSearchDoneRef?.current) return;
        clearInterval(waitId);
        waitId = null;
        start();
      }, 200);
    }

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      // Ticket may have expired while backgrounded — reconnect by tearing down & remounting effect deps.
      refreshFromRealtime();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (waitId) clearInterval(waitId);
      unsubscribe();
    };
  }, [
    forbidden,
    transactionScope,
    transactionScopeCacheCompanyKey(transactionScope),
    initialSearchDoneRef,
    lastSearchCommitMsRef,
  ]);

  useEffect(() => {
    const scopeApi = transactionScopeApiParams(transactionScope);
    if (loading || forbidden || !canApproveContra || !transactionScopeIsReady(transactionScope)) return;

    const pollContra = async () => {
      if (document.visibilityState !== "visible") return;
      await refreshContraInboxBadge?.(scopeApi);
    };

    let interval = null;
    const startPolling = () => {
      void pollContra();
      interval = setInterval(pollContra, 20000);
    };

    if (initialSearchDoneRef?.current) {
      startPolling();
      return () => {
        if (interval) clearInterval(interval);
      };
    }

    const waitId = setInterval(() => {
      if (!initialSearchDoneRef?.current) return;
      clearInterval(waitId);
      startPolling();
    }, 150);

    return () => {
      clearInterval(waitId);
      if (interval) clearInterval(interval);
    };
  }, [loading, forbidden, canApproveContra, transactionScope, refreshContraInboxBadge, initialSearchDoneRef]);
}
