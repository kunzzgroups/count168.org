import { useEffect, useState } from "react";
import { getHistory } from "../lib/transactionApi.js";
import {
  assembleContiguousSuffix,
  HISTORY_CHUNK_CONCURRENCY,
  historyChunkFetchOrder,
  splitHistoryDateChunks,
} from "../lib/transactionHistoryProgressive.js";
import { paymentHistoryParamsReady } from "../lib/transactionPaymentHistoryUrl.js";

async function mapPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return;
  const limit = Math.max(1, Math.min(concurrency, list.length));
  let cursor = 0;
  async function run() {
    while (cursor < list.length) {
      const idx = cursor;
      cursor += 1;
      await worker(list[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => run()));
}

/**
 * Progressive Payment History: newest month first (fast meaningful paint),
 * then older months in parallel; assemble contiguous suffix as slots fill.
 */
export function usePaymentHistoryProgressive({ scope, scopeApi, enabled }) {
  const [rows, setRows] = useState([]);
  const [accountMeta, setAccountMeta] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [loadedChunks, setLoadedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [tableReady, setTableReady] = useState(false);

  useEffect(() => {
    if (!enabled || !paymentHistoryParamsReady(scope)) {
      setRows([]);
      setAccountMeta(null);
      setIsInitialLoading(false);
      setIsLoadingMore(false);
      setErrorMessage(null);
      setLoadedChunks(0);
      setTotalChunks(0);
      setTableReady(false);
      return undefined;
    }

    const ac = new AbortController();
    let cancelled = false;

    const chunks = splitHistoryDateChunks(scope.dateFrom, scope.dateTo);
    const slots = chunks.map(() => null);
    setTotalChunks(chunks.length);
    setLoadedChunks(0);
    setRows([]);
    setAccountMeta(null);
    setErrorMessage(null);
    setIsInitialLoading(true);
    setIsLoadingMore(false);
    setTableReady(false);

    const publish = () => {
      if (cancelled) return;
      setRows(assembleContiguousSuffix(slots));
      setLoadedChunks(slots.filter((s) => s != null).length);
    };

    const fetchChunk = async (chunkIndex) => {
      const chunk = chunks[chunkIndex];
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
      if (cancelled) return null;
      if (!data?.success) {
        throw new Error(data?.message || data?.error || "Failed to load history");
      }
      slots[chunkIndex] = Array.isArray(data.data) ? data.data : [];
      if (data.account) {
        setAccountMeta((prev) => prev || data.account);
      }
      publish();
      return data;
    };

    (async () => {
      try {
        if (!chunks.length) {
          setIsInitialLoading(false);
          return;
        }

        const order = historyChunkFetchOrder(chunks.length);
        const newestIdx = order[0];

        // 1) Newest month first — meaningful first paint
        await fetchChunk(newestIdx);
        if (cancelled) return;
        setIsInitialLoading(false);
        setTableReady(true);
        if (chunks.length > 1) setIsLoadingMore(true);

        // 2) Older months in parallel
        const rest = order.slice(1);
        await mapPool(rest, HISTORY_CHUNK_CONCURRENCY, async (chunkIndex) => {
          if (cancelled) return;
          await fetchChunk(chunkIndex);
        });
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setErrorMessage(err?.message || "Failed to load history");
        if (!slots.some((s) => s != null)) {
          setRows([]);
          setTableReady(false);
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
    tableReady,
  };
}
