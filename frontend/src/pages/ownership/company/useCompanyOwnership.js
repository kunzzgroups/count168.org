import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getApiMessage, isApiConflict, isApiSuccess, rebuildGroupIds } from "../shared/ownershipHelpers.js";
import {
  applyOwnershipRowFieldUpdate,
  calcOwnershipTotal,
  EMPTY_OWNERSHIP_ROW,
  fmtOwnershipPct,
  reorderOwnershipRows,
  validateOwnershipRowsForSave,
} from "../shared/ownershipRowHelpers.js";

export function useCompanyOwnership(shell) {
  const {
    allCompanies,
    setAllCompanies,
    fetchCompanies,
    showToast,
    readOnlyMode,
    setConflict,
  } = shell;

  const [groupFilter, setGroupFilter] = useState(null);
  const [companyStates, setCompanyStates] = useState({});
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);
  const [loadingCompanyId, setLoadingCompanyId] = useState(null);
  const [savingCompanyId, setSavingCompanyId] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState(new Set());
  const [bulkGroupSelect, setBulkGroupSelect] = useState("");
  const [openGroupForCompanyId, setOpenGroupForCompanyId] = useState(null);
  const dragRef = useRef({ companyId: null, idx: null });

  useEffect(() => {
    const onDoc = (e) => {
      if (!e.target.closest?.(".own-group-btn-wrap")) setOpenGroupForCompanyId(null);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  useEffect(() => {
    setSelectedCompanyIds(new Set());
    setSelectionMode(false);
  }, [groupFilter]);

  const allGroupIds = useMemo(() => rebuildGroupIds(allCompanies), [allCompanies]);

  const companiesData = useMemo(() => {
    if (groupFilter !== null) {
      return allCompanies.filter(
        (c) => c.group_id && String(c.group_id).toLowerCase() === String(groupFilter).toLowerCase(),
      );
    }
    const independent = allCompanies.filter((c) => !c.group_id);
    if (independent.length > 0) return independent;
    if (allGroupIds.length === 0) return independent;
    const firstGroup = allGroupIds[0];
    return allCompanies.filter(
      (c) => c.group_id && String(c.group_id).toLowerCase() === String(firstGroup).toLowerCase(),
    );
  }, [allCompanies, groupFilter, allGroupIds]);

  useEffect(() => {
    if (groupFilter !== null) return;
    const independent = allCompanies.filter((c) => !c.group_id);
    if (independent.length > 0 || allGroupIds.length === 0) return;
    setGroupFilter(allGroupIds[0]);
  }, [groupFilter, allCompanies, allGroupIds]);

  const toggleCard = useCallback(
    async (cid) => {
      if (expandedCompanyId === cid) {
        setExpandedCompanyId(null);
        return;
      }
      setExpandedCompanyId(cid);
      if (!companyStates[cid]) {
        setLoadingCompanyId(cid);
        try {
          const compData = allCompanies.find((c) => Number(c.id) === cid);
          const compGid = compData?.group_id || "";
          const [aRes, oRes] = await Promise.all([
            fetch(buildApiUrl(`api/ownership/get_available_accounts_api.php?company_id=${cid}`), {
              credentials: "include",
            }).then((r) => r.json()),
            fetch(buildApiUrl(`api/ownership/get_owners_api.php?company_id=${cid}`), {
              credentials: "include",
            }).then((r) => r.json()),
          ]);
          const accounts = aRes.status === "success" ? aRes.data : [];
          if (compGid && !accounts.some((a) => String(a.id) === `G_${compGid}`)) {
            accounts.push({
              id: `G_${compGid}`,
              account_name: `Group: ${compGid}`,
              name: `Group Equity`,
              role: "GROUP",
              type: "group",
              is_main_owner: 0,
            });
          }
          setCompanyStates((prev) => ({
            ...prev,
            [cid]: {
              accounts,
              rows: (oRes.status === "success" ? oRes.data : []).map((o) => ({
                account_id: o.account_id,
                percentage: parseFloat(o.percentage),
                role: o.role || "",
                user_raw_id: o.user_raw_id || null,
                ownership_id: o.ownership_id || null,
                is_external_partner: parseInt(o.is_external_partner, 10) === 1,
                read_only: o.read_only !== null ? parseInt(o.read_only, 10) : 1,
              })),
            },
          }));
        } catch {
          showToast("Error loading data", "error");
        } finally {
          setLoadingCompanyId(null);
        }
      }
    },
    [allCompanies, companyStates, expandedCompanyId, showToast],
  );

  const updateRow = useCallback((cid, idx, field, val) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      const rows = [...st.rows];
      rows[idx] = applyOwnershipRowFieldUpdate(rows[idx], field, val, st.accounts);
      return { ...prev, [cid]: { ...st, rows } };
    });
  }, []);

  const addRow = useCallback(
    (cid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setCompanyStates((prev) => {
        const st = prev[cid];
        if (!st) return prev;
        return {
          ...prev,
          [cid]: { ...st, rows: [...st.rows, { ...EMPTY_OWNERSHIP_ROW }] },
        };
      });
    },
    [readOnlyMode, showToast],
  );

  const removeRow = useCallback(
    (cid, idx) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setCompanyStates((prev) => {
        const st = prev[cid];
        if (!st) return prev;
        const rows = [...st.rows];
        rows.splice(idx, 1);
        return { ...prev, [cid]: { ...st, rows } };
      });
    },
    [readOnlyMode, showToast],
  );

  const reorderRows = useCallback((cid, from, to, insertAfter) => {
    setCompanyStates((prev) => {
      const st = prev[cid];
      if (!st) return prev;
      return { ...prev, [cid]: { ...st, rows: reorderOwnershipRows(st.rows, from, to, insertAfter) } };
    });
  }, []);

  const linkPartner = useCallback(
    async (cid, loginId, forceType = "") => {
      if (readOnlyMode) {
        showToast("Read-only: only owner can modify ownership", "error");
        return false;
      }
      try {
        const res = await fetch(buildApiUrl("api/ownership/add_external_partner_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ company_id: cid, login_id: loginId, force_type: forceType }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Partner linked successfully"), "success");
          setExpandedCompanyId(null);
          window.setTimeout(() => void toggleCard(cid), 300);
          return true;
        }
        if (isApiConflict(json)) {
          setConflict({ companyId: cid, loginId, data: json.data });
          return false;
        }
        showToast(getApiMessage(json, "Link partner failed"), "error");
        return false;
      } catch {
        showToast("Server error", "error");
        return false;
      }
    },
    [readOnlyMode, setConflict, showToast, toggleCard],
  );

  const confirmCompany = useCallback(
    async (cid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      const st = companyStates[cid];
      if (!st) return;
      const { rows } = st;
      const err = validateOwnershipRowsForSave(rows, {
        emptyAccount: "Please select an account for all rows.",
        over100: "Total percentage exceeds 100%",
        duplicate: "Duplicate accounts detected.",
      });
      if (err) {
        showToast(err, "error");
        return;
      }
      const total = calcOwnershipTotal(rows);
      setSavingCompanyId(cid);
      try {
        const res = await fetch(buildApiUrl("api/ownership/batch_save_owners_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            company_id: cid,
            owners: rows.map((r) => ({
              account_id: r.account_id,
              percentage: r.percentage,
              read_only: r.read_only,
            })),
          }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Saved successfully"), "success");
          setAllCompanies((prev) =>
            prev.map((c) => (Number(c.id) === cid ? { ...c, allocated_percentage: total } : c)),
          );
          setExpandedCompanyId(null);
        } else showToast(getApiMessage(json, "Save failed"), "error");
      } catch {
        showToast("Server error", "error");
      } finally {
        setSavingCompanyId(null);
      }
    },
    [companyStates, readOnlyMode, setAllCompanies, showToast],
  );

  const joinGroup = useCallback(
    async (cid, gid, companyName) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      try {
        const res = await fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ company_id: cid, group_id: gid }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(`"${companyName}" joined group "${gid}"`, "success");
          void fetchCompanies();
        } else showToast(getApiMessage(json, "Join group failed"), "error");
      } catch {
        showToast("Server error", "error");
      }
    },
    [fetchCompanies, readOnlyMode, showToast],
  );

  const ungroupCompany = useCallback(
    async (cid, companyName) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      try {
        const res = await fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ company_id: cid }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(`"${companyName}" removed from group`, "success");
          void fetchCompanies();
        } else showToast(getApiMessage(json, "Ungroup failed"), "error");
      } catch {
        showToast("Server error", "error");
      }
    },
    [fetchCompanies, readOnlyMode, showToast],
  );

  const toggleSelectionMode = useCallback(() => {
    if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
    setSelectionMode((prev) => !prev);
    setSelectedCompanyIds(new Set());
  }, [readOnlyMode, showToast]);

  const toggleCompanySelect = useCallback(
    (comp, e) => {
      if (!selectionMode) return;
      const id = Number(comp.id);
      const gid = comp.group_id || null;
      const selectable = allGroupIds.length > 0 && (!gid || groupFilter !== null);
      if (!selectable) return;
      if (e.target.closest("button, .own-group-panel")) return;
      e.stopPropagation();
      setSelectedCompanyIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [allGroupIds.length, groupFilter, selectionMode],
  );

  const bulkJoin = useCallback(
    async (gid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      if (!gid) {
        showToast("Please select a group", "error");
        return;
      }
      try {
        const ids = Array.from(selectedCompanyIds);
        const results = await Promise.all(
          ids.map((cid) =>
            fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ company_id: cid, group_id: gid }),
            }).then((r) => r.json()),
          ),
        );
        const failed = results.filter((r) => !isApiSuccess(r));
        if (failed.length === 0) {
          showToast(`Added ${selectedCompanyIds.size} companies to ${gid}`, "success");
          setSelectedCompanyIds(new Set());
          setSelectionMode(false);
          void fetchCompanies();
        } else showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, "error");
      } catch {
        showToast("Server error", "error");
      }
    },
    [fetchCompanies, readOnlyMode, selectedCompanyIds, showToast],
  );

  const bulkUngroup = useCallback(async () => {
    if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
    try {
      const ids = Array.from(selectedCompanyIds);
      const results = await Promise.all(
        ids.map((cid) =>
          fetch(buildApiUrl("api/ownership/update_company_group_api.php"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ company_id: cid, group_id: null }),
          }).then((r) => r.json()),
        ),
      );
      const failed = results.filter((r) => !isApiSuccess(r));
      if (failed.length === 0) {
        showToast(`Removed ${selectedCompanyIds.size} companies from group`, "success");
        setSelectedCompanyIds(new Set());
        setSelectionMode(false);
        void fetchCompanies();
      } else showToast(`${ids.length - failed.length} succeeded, ${failed.length} failed`, "error");
    } catch {
      showToast("Server error", "error");
    }
  }, [fetchCompanies, readOnlyMode, selectedCompanyIds, showToast]);

  return {
    groupFilter,
    setGroupFilter,
    allGroupIds,
    companiesData,
    companyStates,
    expandedCompanyId,
    setExpandedCompanyId,
    loadingCompanyId,
    savingCompanyId,
    selectionMode,
    setSelectionMode,
    selectedCompanyIds,
    setSelectedCompanyIds,
    bulkGroupSelect,
    setBulkGroupSelect,
    openGroupForCompanyId,
    setOpenGroupForCompanyId,
    dragRef,
    calcTotal: calcOwnershipTotal,
    fmtPct: fmtOwnershipPct,
    toggleCard,
    updateRow,
    addRow,
    removeRow,
    reorderRows,
    linkPartner,
    confirmCompany,
    joinGroup,
    ungroupCompany,
    toggleSelectionMode,
    toggleCompanySelect,
    bulkJoin,
    bulkUngroup,
  };
}
