import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { notifyCompanySessionUpdated } from "../../../utils/company/companySessionEvents.js";
import {
  dedupeOwnerCompaniesByCode,
  filterCompaniesWithDisplayId,
  normalizeCompanyGroupId,
  normalizeOwnerCompanyRow,
  persistDashboardGroupFilter,
  resolveInitialSelectedGroupFromSession,
  sortedUniqueGroupIds,
} from "../../../utils/company/sharedCompanyFilter.js";
import {
  getAccounts,
  getCategories,
  getCompanyCurrencies,
  getUserCurrencyOrder,
  transactionQueryKeys,
} from "../lib/transactionApi.js";
import { isPartnershipAuditReadOnlyLocked } from "../../../utils/audit/partnershipAuditReadOnly.js";
import { orderCurrencyRows, readTransactionCurrencyFilterState } from "../lib/transactionPaymentLogic.js";

export function useTransactionData({
  todayDmy,
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [filterSnapshot, setFilterSnapshot] = useState(null);
  const [categories, setCategories] = useState([]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [currencyOptions, setCurrencyOptions] = useState([]);
  const [currencyRowsOrdered, setCurrencyRowsOrdered] = useState([]);
  const currencyInitCompanyRef = useRef(null);
  const filterSnapshotRef = useRef(null);

  useEffect(() => {
    filterSnapshotRef.current = filterSnapshot;
  }, [filterSnapshot]);

  // Initial authentication and company list loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, companiesRes] = await Promise.all([
          fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" }),
          fetch(buildApiUrl("api/transactions/get_owner_companies_api.php?all=1"), { credentials: "include" }),
        ]);
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) {
          navigate("/login", { replace: true });
          return;
        }
        const u = meJson.data;
        if (String(u.user_type || "").toLowerCase() === "member") {
          window.location.assign(new URL("/member", window.location.origin).href);
          return;
        }
        const perms = Array.isArray(u.permissions) ? u.permissions : [];
        const hasFull = perms.length === 0;
        const canPay = hasFull || perms.includes("payment");
        if (!canPay) {
          if (!cancelled) setForbidden(true);
          return;
        }

        const companiesJson = await companiesRes.json();
        const rawRows = Array.isArray(companiesJson?.data) ? companiesJson.data : [];
        const rows = rawRows.map((r) => normalizeOwnerCompanyRow(r)).filter(Boolean);

        const url = new URL(window.location.href);
        const queryCompany = url.searchParams.get("company_id");
        let effective = queryCompany || u.company_id || rows[0]?.id || null;
        effective = effective ? Number(effective) : null;

        const snapRows = dedupeOwnerCompaniesByCode(rows, effective);

        if (queryCompany && rows.some((c) => Number(c.id) === Number(queryCompany))) {
          const sync = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${queryCompany}`), {
            credentials: "include",
          });
          const sj = await sync.json();
          if (!sync.ok || !sj.success) {
            effective = u.company_id ? Number(u.company_id) : rows[0]?.id ? Number(rows[0].id) : null;
          } else {
            notifyCompanySessionUpdated();
          }
        }

        const current = snapRows.find((c) => Number(c.id) === Number(effective));
        const selGroup = resolveInitialSelectedGroupFromSession(snapRows, current);

        if (!cancelled) {
          setFilterSnapshot({
            companyId: effective,
            selectedGroup: selGroup,
            /** Same as User List: follow = filter companies by selected group; all = every company; ungrouped = no group_id only */
            groupFilterKind: "follow",
            snapCompanies: snapRows,
            snapGroupIds: sortedUniqueGroupIds(snapRows),
            viewerRole: String(u.role || "").toLowerCase(),
            mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
          });
        }
      } catch {
        if (!cancelled) navigate("/login", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    const refreshSessionFlags = async () => {
      try {
        const meRes = await fetch(buildApiUrl("api/session/current_user_api.php"), { credentials: "include" });
        const meJson = await meRes.json();
        if (!meRes.ok || !meJson.success || !meJson.data) return;
        const u = meJson.data;
        setFilterSnapshot((prev) =>
          prev
            ? {
                ...prev,
                viewerRole: String(u.role || "").toLowerCase(),
                mutationsBlocked: isPartnershipAuditReadOnlyLocked(u),
              }
            : prev,
        );
      } catch {
        // ignore transient refresh failures
      }
    };
    const onCompanySession = () => {
      void refreshSessionFlags();
    };
    window.addEventListener("eazycount:company-session-updated", onCompanySession);
    return () => window.removeEventListener("eazycount:company-session-updated", onCompanySession);
  }, []);

  useEffect(() => {
    if (loading || forbidden || !filterSnapshot) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await queryClient.fetchQuery({
          queryKey: transactionQueryKeys.categories(),
          queryFn: () => getCategories(),
          staleTime: 5 * 60_000,
          gcTime: 30 * 60_000,
        });
        const roles = Array.isArray(c?.data) ? c.data : Array.isArray(c) ? c : [];
        if (!cancelled) setCategories(roles.map((r) => String(r).toUpperCase()));
      } catch {
        if (!cancelled) setCategories([]);
      }

      try {
        const cid = filterSnapshot.companyId;
        const [acc, cur, ord] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: transactionQueryKeys.accounts(cid),
            queryFn: ({ signal }) => getAccounts({ companyId: cid, signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          }),
          queryClient.fetchQuery({
            queryKey: transactionQueryKeys.companyCurrencies(cid),
            queryFn: ({ signal }) => getCompanyCurrencies({ companyId: cid, signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          }),
          queryClient.fetchQuery({
            queryKey: transactionQueryKeys.userCurrencyOrder(),
            queryFn: ({ signal }) => getUserCurrencyOrder({ signal }),
            staleTime: 60_000,
            gcTime: 10 * 60_000,
          }),
        ]);
        if (cancelled) return;
        setAccountOptions(Array.isArray(acc?.data) ? acc.data : []);
        const rawCur = Array.isArray(cur?.data) ? cur.data : [];
        const ordered = orderCurrencyRows(rawCur, ord);
        setCurrencyRowsOrdered(ordered);
        const codes = ordered.map((x) => String(x.code || x.currency || "").toUpperCase().trim()).filter(Boolean);
        setCurrencyOptions([...new Set(codes)]);
      } catch {
        if (!cancelled) {
          setAccountOptions([]);
          setCurrencyOptions([]);
          setCurrencyRowsOrdered([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, forbidden, filterSnapshot?.companyId, todayDmy, queryClient]);

  const onCompanyButtonClick = useCallback(
    async (comp) => {
      const cid = comp.id;
      if (!cid) return;
      try {
        const res = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${cid}`), {
          credentials: "include",
        });
        const sj = await res.json();
        if (res.ok && sj.success) {
          notifyCompanySessionUpdated();
          const numericCid = Number(cid);

          // Warm up next-company data before switching state to reduce list refresh latency.
          void Promise.all([
            queryClient.prefetchQuery({
              queryKey: transactionQueryKeys.accounts(numericCid),
              queryFn: ({ signal }) => getAccounts({ companyId: numericCid, signal }),
              staleTime: 60_000,
            }),
            queryClient.prefetchQuery({
              queryKey: transactionQueryKeys.companyCurrencies(numericCid),
              queryFn: ({ signal }) => getCompanyCurrencies({ companyId: numericCid, signal }),
              staleTime: 60_000,
            }),
            queryClient.prefetchQuery({
              queryKey: transactionQueryKeys.userCurrencyOrder(),
              queryFn: ({ signal }) => getUserCurrencyOrder({ signal }),
              staleTime: 60_000,
            }),
          ]);

          const url = new URL(window.location.href);
          url.searchParams.set("company_id", String(cid));
          window.history.replaceState(null, "", url.toString());
          setFilterSnapshot((prev) => (prev ? { ...prev, companyId: numericCid } : prev));
        }
      } catch (e) {
        if (e?.name === "AbortError" || isCancelledError(e)) return;
        console.error(e);
      }
    },
    [queryClient],
  );

  /**
   * Match User List `handlePickGroup`: use **current company's group** for "same group" detection,
   * not `selectedGroup` alone — after ALL, `selectedGroup` can still be AP while `groupFilterKind` is `all`;
   * clicking AP must enter follow for AP, not run legacy toggle-off (empty company row).
   */
  const onGroupButtonClick = useCallback(
    async (gid) => {
      const snap = filterSnapshotRef.current;
      if (!snap) return;
      const g = String(gid || "").trim().toUpperCase();
      if (!g) return;

      const currentCo = snap.snapCompanies.find((c) => Number(c.id) === Number(snap.companyId));
      const selectedGroupKey = String(currentCo?.group_id || "").trim().toUpperCase();

      if (snap.groupFilterKind === "follow" && g === selectedGroupKey) {
        setFilterSnapshot((prev) => (prev ? { ...prev, groupFilterKind: "ungrouped" } : prev));
        return;
      }

      persistDashboardGroupFilter(g);
      setFilterSnapshot((prev) => (prev ? { ...prev, selectedGroup: g, groupFilterKind: "follow" } : prev));

      if (g === selectedGroupKey) return;

      const list = filterCompaniesWithDisplayId(snap.snapCompanies);
      const first = list.find((c) => normalizeCompanyGroupId(c) === g) ?? null;
      if (first && Number(first.id) !== Number(snap.companyId)) {
        await onCompanyButtonClick(first);
      }
    },
    [onCompanyButtonClick],
  );

  /** Matches User List: ALL toggles between show-all companies and ungrouped-only companies. */
  const onGroupFilterAllClick = useCallback(() => {
    setFilterSnapshot((prev) => {
      if (!prev) return prev;
      const next = prev.groupFilterKind === "all" ? "ungrouped" : "all";
      return { ...prev, groupFilterKind: next };
    });
  }, []);

  return {
    loading,
    setLoading,
    forbidden,
    setForbidden,
    filterSnapshot,
    setFilterSnapshot,
    categories,
    setCategories,
    accountOptions,
    setAccountOptions,
    currencyOptions,
    setCurrencyOptions,
    currencyRowsOrdered,
    setCurrencyRowsOrdered,
    currencyInitCompanyRef,
    onGroupButtonClick,
    onGroupFilterAllClick,
    onCompanyButtonClick,
  };
}

