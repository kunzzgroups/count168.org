import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getHistory,
  loadContraInbox,
  approveContra as approveContraApi,
  rejectContra as rejectContraApi,
  transactionQueryKeys,
} from "../lib/transactionApi.js";

export function useTransactionUI() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState([]);
  const [history, setHistory] = useState({ open: false, title: "", rows: [], loading: false });
  const [contraInbox, setContraInbox] = useState({ open: false, loading: false, items: [] });
  const closeToastTimer = useRef(null);

  const pushToast = useCallback((message, type = "info") => {
    setToast((prev) => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, type, message }];
      return next.slice(-2);
    });
    if (closeToastTimer.current) clearTimeout(closeToastTimer.current);
    closeToastTimer.current = setTimeout(() => {
      setToast((prev) => prev.slice(1));
    }, 2500);
  }, []);

  const resolveHistoryAccountName = useCallback((row, accountMeta) => {
    const rowName = String(row?.account_name ?? "").trim();
    const apiName = String(accountMeta?.name ?? "").trim();
    const bad = (n) => !n || n.toUpperCase() === "CURRENCY";
    if (!bad(rowName)) return rowName;
    if (!bad(apiName)) return apiName;
    return String(accountMeta?.account_id ?? row?.account_id ?? "").trim();
  }, []);

  const paymentHistoryTitle = useCallback(
    (row, accountMeta) => {
      const code = String(accountMeta?.account_id ?? row?.account_id ?? "").trim();
      const name = resolveHistoryAccountName(row, accountMeta) || code;
      return `Payment History - ${code} (${name})`;
    },
    [resolveHistoryAccountName],
  );

  const onViewHistory = useCallback(
    async (row, dateFrom, dateTo, companyId, opts = {}) => {
      if (!row || !companyId) return;
      const title = paymentHistoryTitle(row, null);
      setHistory({ open: true, title, rows: [], loading: true });
      try {
        const accountDbId = row.account_db_id ? String(row.account_db_id) : "";
        const virtualCompanyCode = !accountDbId ? String(row.account_id || "").trim().toUpperCase() : "";
        const { selectedCurrencies = [], showAllCurrencies = true } = opts;
        let currency = String(row.currency || "").toUpperCase().trim();
        if (!currency && !showAllCurrencies && Array.isArray(selectedCurrencies) && selectedCurrencies.length > 0) {
          currency = [...selectedCurrencies]
            .map((c) => String(c || "").toUpperCase().trim())
            .filter(Boolean)
            .join(",");
        }
        const res = await queryClient.fetchQuery({
          queryKey: transactionQueryKeys.history({
            companyId,
            accountDbId,
            dateFrom,
            dateTo,
            currency,
            virtualCompanyCode,
          }),
          queryFn: ({ signal }) =>
            getHistory({
              companyId,
              accountId: accountDbId,
              dateFrom,
              dateTo,
              currency,
              virtualCompanyCode,
              signal,
            }),
          staleTime: 30_000,
          gcTime: 5 * 60_000,
        });
        if (res?.success) {
          const rows = Array.isArray(res.data) ? res.data : [];
          const meta = res.account ? { ...res.account, name: resolveHistoryAccountName(row, res.account) } : null;
          const nextTitle = meta ? paymentHistoryTitle(row, meta) : title;
          setHistory((s) => ({ ...s, rows, loading: false, title: nextTitle }));
        } else {
          pushToast(res?.message || "Failed to load history", "error");
          setHistory((s) => ({ ...s, loading: false }));
        }
      } catch (e) {
        pushToast(e.message, "error");
        setHistory((s) => ({ ...s, loading: false }));
      }
    },
    [pushToast, paymentHistoryTitle, resolveHistoryAccountName, queryClient],
  );

  const refreshContraInboxBadge = useCallback(
    async (companyId) => {
      if (!companyId) return null;
      setContraInbox((s) => ({ ...s, loading: true }));
      try {
        const res = await queryClient.fetchQuery({
          queryKey: transactionQueryKeys.contraInbox(companyId),
          queryFn: ({ signal }) => loadContraInbox({ companyId, signal }),
          staleTime: 10_000,
          gcTime: 5 * 60_000,
        });
        if (res?.success) {
          setContraInbox((s) => ({ ...s, loading: false, items: Array.isArray(res.data) ? res.data : [] }));
        } else {
          setContraInbox((s) => ({ ...s, loading: false, items: [] }));
        }
        return res;
      } catch {
        setContraInbox((s) => ({ ...s, loading: false }));
        return null;
      }
    },
    [queryClient],
  );

  const approveContraMutation = useMutation({
    mutationFn: ({ id, companyId }) => approveContraApi({ transactionId: id, companyId }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInbox(vars.companyId) });
    },
  });

  const rejectContraMutation = useMutation({
    mutationFn: ({ id, companyId }) => rejectContraApi({ transactionId: id, companyId }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
      queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInbox(vars.companyId) });
    },
  });

  const onApproveContra = useCallback(
    async (id, companyId, onSearch) => {
      if (!id || !companyId) return null;
      try {
        const res = await approveContraMutation.mutateAsync({ id, companyId });
        if (res?.success) {
          pushToast("Contra approved", "success");
          await refreshContraInboxBadge(companyId);
          if (onSearch) await onSearch({ silent: false });
        } else {
          pushToast(res?.message || "Failed to approve contra", "error");
        }
        return res;
      } catch (e) {
        pushToast(e.message, "error");
        return null;
      }
    },
    [approveContraMutation, pushToast, refreshContraInboxBadge],
  );

  const onRejectContra = useCallback(
    async (id, companyId) => {
      if (!id || !companyId) return null;
      try {
        const res = await rejectContraMutation.mutateAsync({ id, companyId });
        if (res?.success) {
          pushToast("Contra rejected", "success");
          await refreshContraInboxBadge(companyId);
        } else {
          pushToast(res?.message || "Failed to reject contra", "error");
        }
        return res;
      } catch (e) {
        pushToast(e.message, "error");
        return null;
      }
    },
    [rejectContraMutation, pushToast, refreshContraInboxBadge],
  );

  return {
    toast,
    setToast,
    pushToast,
    history,
    setHistory,
    contraInbox,
    setContraInbox,
    onViewHistory,
    refreshContraInboxBadge,
    onApproveContra,
    onRejectContra,
  };
}
