import { buildApiUrl } from "../../utils/core/apiUrl.js";
import { dispatchRealtimeInvalidate } from "./realtimeEvents.js";

/**
 * Single EventSource for the authenticated shell.
 * Returns unsubscribe.
 *
 * @param {object} opts
 * @param {() => Record<string, string|number|undefined|null>} opts.getScopeParams
 * @param {(err: Error) => void} [opts.onError]
 */
export function subscribeAppRealtime({ getScopeParams, onError } = {}) {
  let closed = false;
  let es = null;
  let reconnectTimer = null;
  let attempt = 0;
  let warnedDisabled = false;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
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

  const fetchTicket = async () => {
    const scope = typeof getScopeParams === "function" ? getScopeParams() || {} : {};
    const params = new URLSearchParams();
    if (scope.companyId != null && scope.companyId !== "") {
      params.set("company_id", String(scope.companyId));
    }
    if (scope.viewGroup) params.set("view_group", String(scope.viewGroup));
    if (scope.groupId) params.set("group_id", String(scope.groupId));
    if (scope.groupAggregate) params.set("group_aggregate", "1");
    if (scope.subsidiaryAccountsOnly) params.set("subsidiary_accounts_only", "1");

    const res = await fetch(buildApiUrl(`api/realtime/ticket_api.php?${params}`), {
      credentials: "include",
      cache: "no-cache",
      headers: { "Cache-Control": "no-cache" },
    });
    return res.json();
  };

  const onPayload = (type, data) => {
    attempt = 0;
    let payload = data;
    if (typeof data === "string") {
      try {
        payload = JSON.parse(data);
      } catch {
        payload = { raw: data };
      }
    }
    dispatchRealtimeInvalidate({
      type: type || payload?.type || "domain_changed",
      domain: payload?.domain,
      source: payload?.source,
      rev: payload?.rev,
      ts: payload?.ts,
      ...payload,
    });
  };

  const connect = async () => {
    if (closed) return;
    closeEs();
    try {
      const ticketRes = await fetchTicket();
      if (closed) return;
      const data = ticketRes?.data;
      if (!ticketRes?.success || !data?.enabled || !data?.ticket) {
        if (!warnedDisabled) {
          warnedDisabled = true;
          console.warn(
            "[app-realtime] ticket disabled or failed:",
            ticketRes?.message || ticketRes?.error || "enabled=false",
          );
        }
        attempt += 1;
        const delay = Math.min(60_000, 5_000 * attempt);
        reconnectTimer = setTimeout(connect, delay);
        return;
      }
      warnedDisabled = false;

      const ssePath = String(data.sse_path || "/realtime/sse");
      const path = ssePath.startsWith("/") ? ssePath : `/${ssePath}`;
      const url = `${window.location.origin}${path}?ticket=${encodeURIComponent(data.ticket)}`;
      es = new EventSource(url);

      es.addEventListener("ledger_changed", (ev) => onPayload("ledger_changed", ev.data));
      es.addEventListener("domain_changed", (ev) => onPayload("domain_changed", ev.data));

      es.onerror = () => {
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

  return {
    stop: () => {
      closed = true;
      clearTimers();
      closeEs();
    },
    reconnect: () => {
      if (closed) return;
      clearTimers();
      attempt = 0;
      void connect();
    },
  };
}
