import { useEffect, useState } from "react";
import { getHistory } from "../lib/transactionApi.js";
import {
  mergeHistoryChunkRows,
  splitHistoryDateChunks,
} from "../lib/transactionHistoryProgressive.js";
import { paymentHistoryParamsReady } from "../lib/transactionPaymentHistoryUrl.js";

/**
 * Progressive Payment History load: first calendar-month chunk paints ASAP,
 * remaining months append (skips duplicate B/F). Short ranges stay one request.
 */
export function usePaymentHistoryProgressive({ scope, scopeApi, enabled }) {
  const [rows, setRows] = useState([]);
  const [accountMeta, setAccountMeta] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  useEffect(() => {
    if (!enabled || !paymentHistoryParamsReady(scope)) {
      setRows([]);
      setAccountMeta(null);
      setIsInitialLoading(false);
      setIsLoadingMore(false);
      setErrorMessage(null);
      setLoadedChunks(0);
      setTotalChunks(0);
      return undefined;
    }

    const ac = new AbortController();
    let cancelled = false;

    const chunks = splitHistoryDateChunks(scope.dateFrom, scope.dateTo);
    setTotalChunks(chunks.length);
    setLoadedChunks(0);
    setRows([]);
    setAccountMeta(null);
    setErrorMessage(null);
    setIsInitialLoading(true);
    setIsLoadingMore(false);

    (async () => {
      let accumulated = [];
      try {
        for (let i = 0; i < chunks.length; i += 1) {
          if (cancelled) return;
          const chunk = chunks[i];
          const data = await getHistory({
            ...scopeApi,
            accountId: scope.accountDbId,
            dateFrom: chunk.dateFrom,
            dateTo: chunk.dateTo,
            currency: scope.currency,
            virtualCompanyCode: scope.virtualCompanyCode,
            pureTypeSearch: scope.pureTypeSearch,
            signal: ac.signal,
          });

          if (cancelled) return;

          if (!data?.success) {
            throw new Error(data?.message || data?.error || "Failed to load history");
          }

          const chunkRows = Array.isArray(data.data) ? data.data : [];
          accumulated = mergeHistoryChunkRows(accumulated, chunkRows, { isFirstChunk: i === 0 });
          setRows(accumulated);
          setLoadedChunks(i + 1);

          if (i === 0 && data.account) {
            setAccountMeta(data.account);
          }

          if (i === 0) {
            setIsInitialLoading(false);
            if (chunks.length > 1) setIsLoadingMore(true);
          }
        }
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setErrorMessage(err?.message || "Failed to load history");
        if (!accumulated.length) {
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setIsInitialLoading(false);
          setIsLoadingMore(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    enabled,
    scope.accountDbId,
    scope.currency,
    scope.dateFrom,
    scope.dateTo,
    scope.pureTypeSearch,
    scope.virtualCompanyCode,
    scopeApi.companyId,
    scopeApi.viewGroup,
    scopeApi.groupId,
    scopeApi.groupAggregate,
    scopeApi.subsidiaryAccountsOnly,
  ]);

  return {
    rows,
    accountMeta,
    isInitialLoading,
    isLoadingMore,
    errorMessage,
    loadedChunks,
    totalChunks,
  };
}
