import { fetchRealtimeTicket } from "./transactionApi.js";

/**
 * Subscribe to ledger_changed SSE for the current transaction scope.
 * Returns an unsubscribe function.
 *
 * @param {object} opts
 * @param {Record<string, string|number|undefined|null>} opts.scopeApi
 * @param {() => void} opts.onLedgerChanged
 * @param {(err: Error) => void} [opts.onError]
 */
export function subscribeTransactionLedgerRealtime({
  scopeApi,
  onLedgerChanged,
  onError,
} = {}) {
  let closed = false;
  let es = null;
  let reconnectTimer = null;
  let debounceTimer = null;
  let attempt = 0;
  let warnedDisabled = false;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const closeEs = () => {
    if (es) {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      es = null;
    }
  };

  const scheduleChanged = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        onLedgerChanged?.();
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }, 200);
  };

  const connect = async () => {
    if (closed) return;
    closeEs();
    try {
      const ticketRes = await fetchRealtimeTicket(scopeApi || {});
      if (closed) return;
      const data = ticketRes?.data;
      if (!ticketRes?.success || !data?.enabled || !data?.ticket) {
        if (!warnedDisabled) {
          warnedDisabled = true;
          console.warn(
            "[tx-realtime] ticket disabled or failed:",
            ticketRes?.message || ticketRes?.error || "enabled=false",
          );
        }
        // Realtime off on server — quiet retry later (config may be enabled after deploy).
        attempt += 1;
        const delay = Math.min(60_000, 5_000 * attempt);
        reconnectTimer = setTimeout(connect, delay);
        return;
      }
      warnedDisabled = false;

      // Site-root absolute URL — avoid SPA path / basePath resolving to wrong host path.
      const ssePath = String(data.sse_path || "/realtime/sse");
      const path = ssePath.startsWith("/") ? ssePath : `/${ssePath}`;
      const url = `${window.location.origin}${path}?ticket=${encodeURIComponent(data.ticket)}`;
      es = new EventSource(url);

      es.addEventListener("ledger_changed", () => {
        attempt = 0;
        scheduleChanged();
      });

      es.onerror = () => {
        // EventSource auto-reconnects while CONNECTING; only re-ticket when fully closed.
        if (es && es.readyState !== EventSource.CLOSED) return;
        closeEs();
        if (closed) return;
        attempt += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 4));
        reconnectTimer = setTimeout(connect, delay);
      };

      es.onopen = () => {
        attempt = 0;
      };
    } catch (e) {
      if (closed) return;
      onError?.(e instanceof Error ? e : new Error(String(e)));
      attempt += 1;
      const delay = Math.min(30_000, 2_000 * attempt);
      reconnectTimer = setTimeout(connect, delay);
    }
  };

  void connect();

  return () => {
    closed = true;
    clearTimers();
    closeEs();
  };
}
