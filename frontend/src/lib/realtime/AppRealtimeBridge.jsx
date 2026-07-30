import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DASHBOARD_GROUP_FILTER_EVENT,
  readPersistedDashboardGcFilter,
} from "../../utils/company/sharedCompanyFilter.js";
import { transactionQueryKeys } from "../../pages/transaction/lib/transactionApi.js";
import { notifyTransactionListInvalidated } from "../../pages/transaction/lib/transactionPaymentLogic.js";
import { dataCaptureQueryKeys } from "../../pages/datacapture/lib/dataCaptureApi.js";
import { onRealtimeInvalidate, REALTIME_DOMAINS } from "./realtimeEvents.js";
import { subscribeAppRealtime } from "./subscribeAppRealtime.js";

function scopeParamsFromFilter() {
  const filter = readPersistedDashboardGcFilter() || {};
  const companyId =
    filter.companyId != null && filter.companyId !== ""
      ? Number(filter.companyId)
      : null;
  const viewGroup = filter.selectedGroup
    ? String(filter.selectedGroup).trim().toUpperCase()
    : "";
  const groupOnly =
    (companyId == null || !Number.isFinite(companyId) || companyId <= 0) &&
    Boolean(viewGroup);

  return {
    companyId: groupOnly ? undefined : companyId > 0 ? companyId : undefined,
    viewGroup: viewGroup || undefined,
    groupId: viewGroup || undefined,
    groupAggregate: groupOnly ? true : undefined,
  };
}

/**
 * One SSE connection for the authenticated shell.
 * Invalidates TanStack Query caches + leaves window event for manual-fetch pages.
 */
export default function AppRealtimeBridge() {
  const queryClient = useQueryClient();
  const ctlRef = useRef(null);

  useEffect(() => {
    const ctl = subscribeAppRealtime({
      getScopeParams: scopeParamsFromFilter,
    });
    ctlRef.current = ctl;

    let filterTimer = null;
    const onFilter = () => {
      // Dashboard/company session sync can fire this many times in one paint.
      if (filterTimer) clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        filterTimer = null;
        ctl.reconnect();
      }, 300);
    };
    window.addEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilter);

    return () => {
      window.removeEventListener(DASHBOARD_GROUP_FILTER_EVENT, onFilter);
      if (filterTimer) clearTimeout(filterTimer);
      ctl.stop();
      ctlRef.current = null;
    };
  }, []);

  useEffect(() => {
    return onRealtimeInvalidate("*", (detail) => {
      const domain = String(detail.domain || "");

      if (domain === REALTIME_DOMAINS.LEDGER || detail.type === "ledger_changed") {
        notifyTransactionListInvalidated("realtime_ledger");
        void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.searchRoot() });
        void queryClient.invalidateQueries({ queryKey: transactionQueryKeys.contraInboxRoot() });
        return;
      }

      if (domain === REALTIME_DOMAINS.ACCOUNTS) {
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey?.[0];
            return (
              k === "tx-accounts" ||
              k === "tx-company-currencies" ||
              k === "tx-scope-account-currencies"
            );
          },
        });
        return;
      }

      if (domain === REALTIME_DOMAINS.PROCESSES) {
        void queryClient.invalidateQueries({ queryKey: dataCaptureQueryKeys.root() });
        return;
      }

      if (domain === REALTIME_DOMAINS.DATACAPTURE) {
        void queryClient.invalidateQueries({ queryKey: dataCaptureQueryKeys.root() });
        void queryClient.invalidateQueries({
          predicate: (q) => q.queryKey?.[0] === "summary",
        });
        return;
      }

      if (domain === REALTIME_DOMAINS.USERS) {
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const k = q.queryKey?.[0];
            return k === "users" || k === "user-list" || k === "useraccess";
          },
        });
        return;
      }

      // Ownership / maintenance / announcements / domain / app:
      // pages listen via useRealtimeDomain or full refresh hooks.
    });
  }, [queryClient]);

  return null;
}
