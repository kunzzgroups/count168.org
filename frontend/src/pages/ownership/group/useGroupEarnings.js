import { useCallback, useEffect, useState } from "react";
import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { getApiMessage, isApiConflict, isApiSuccess } from "../shared/ownershipHelpers.js";
import {
  applyOwnershipRowFieldUpdate,
  calcOwnershipTotal,
  EMPTY_OWNERSHIP_ROW,
  fmtOwnershipPct,
  validateOwnershipRowsForSave,
} from "../shared/ownershipRowHelpers.js";

export function useGroupEarnings(shell) {
  const { activeTab, showToast, readOnlyMode } = shell;

  const [geGroups, setGeGroups] = useState([]);
  const [geLoading, setGeLoading] = useState(false);
  const [geStates, setGeStates] = useState({});
  const [geExpanded, setGeExpanded] = useState(null);
  const [geLoadingGid, setGeLoadingGid] = useState(null);
  const [geSavingGid, setGeSavingGid] = useState(null);

  const loadGeGroups = useCallback(async () => {
    setGeLoading(true);
    try {
      const res = await fetch(buildApiUrl("api/ownership/get_group_earnings_api.php"), {
        credentials: "include",
      });
      const json = await res.json();
      if (isApiSuccess(json)) setGeGroups(json.data || []);
      else showToast(getApiMessage(json, "Failed to load groups"), "error");
    } catch {
      showToast("Server error", "error");
    } finally {
      setGeLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === "group-earnings") void loadGeGroups();
  }, [activeTab, loadGeGroups]);

  const geToggle = useCallback(
    async (gid) => {
      if (geExpanded === gid) {
        setGeExpanded(null);
        return;
      }
      setGeExpanded(gid);
      if (!geStates[gid]) {
        setGeLoadingGid(gid);
        try {
          const [aRes, oRes] = await Promise.all([
            fetch(
              buildApiUrl(
                `api/ownership/get_group_available_accounts_api.php?group_id=${encodeURIComponent(gid)}`,
              ),
              { credentials: "include" },
            ).then((r) => r.json()),
            fetch(
              buildApiUrl(`api/ownership/get_group_owners_api.php?group_id=${encodeURIComponent(gid)}`),
              { credentials: "include" },
            ).then((r) => r.json()),
          ]);
          setGeStates((prev) => ({
            ...prev,
            [gid]: {
              accounts: aRes.status === "success" ? aRes.data : [],
              rows: (oRes.status === "success" ? oRes.data : []).map((o) => ({
                account_id: o.composite_id || o.account_id,
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
          showToast("Error loading group data", "error");
        } finally {
          setGeLoadingGid(null);
        }
      }
    },
    [geExpanded, geStates, showToast],
  );

  const geUpdateRow = useCallback((gid, idx, field, val) => {
    setGeStates((prev) => {
      const st = prev[gid];
      if (!st) return prev;
      const rows = [...st.rows];
      rows[idx] = applyOwnershipRowFieldUpdate(rows[idx], field, val, st.accounts);
      return { ...prev, [gid]: { ...st, rows } };
    });
  }, []);

  const geAddRow = useCallback(
    (gid) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setGeStates((prev) => {
        const st = prev[gid];
        if (!st) return prev;
        return {
          ...prev,
          [gid]: { ...st, rows: [...st.rows, { ...EMPTY_OWNERSHIP_ROW }] },
        };
      });
    },
    [readOnlyMode, showToast],
  );

  const geRemoveRow = useCallback(
    (gid, idx) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      setGeStates((prev) => {
        const st = prev[gid];
        if (!st) return prev;
        const rows = [...st.rows];
        rows.splice(idx, 1);
        return { ...prev, [gid]: { ...st, rows } };
      });
    },
    [readOnlyMode, showToast],
  );

  const geConfirm = useCallback(
    async (groupId) => {
      if (readOnlyMode) return showToast("Read-only: only owner can modify ownership", "error");
      const st = geStates[groupId];
      if (!st) return;
      const { rows } = st;
      const err = validateOwnershipRowsForSave(rows, {
        emptyAccount: "Please select an account.",
        over100: "Total percentage exceeds 100%",
        duplicate: "Duplicate accounts detected.",
      });
      if (err) {
        showToast(err, "error");
        return;
      }
      const total = calcOwnershipTotal(rows);
      setGeSavingGid(groupId);
      try {
        const res = await fetch(buildApiUrl("api/ownership/batch_save_group_owners_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            group_id: groupId,
            owners: rows.map((r) => ({
              account_id: r.account_id,
              percentage: r.percentage,
              read_only: r.read_only,
            })),
          }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Group ownership saved successfully"), "success");
          setGeGroups((g) =>
            g.map((x) => (x.group_id === groupId ? { ...x, allocated_percentage: total } : x)),
          );
          setGeExpanded(null);
        } else showToast(getApiMessage(json, "Save failed"), "error");
      } catch {
        showToast("Server error", "error");
      } finally {
        setGeSavingGid(null);
      }
    },
    [geStates, readOnlyMode, showToast],
  );

  const geLinkPartner = useCallback(
    async (groupId, loginId, forceType = "") => {
      if (readOnlyMode) {
        showToast("Read-only: only owner can modify ownership", "error");
        return false;
      }
      try {
        const res = await fetch(buildApiUrl("api/ownership/add_group_external_partner_api.php"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ group_id: groupId, login_id: loginId, force_type: forceType }),
        });
        const json = await res.json();
        if (isApiSuccess(json)) {
          showToast(getApiMessage(json, "Partner linked successfully"), "success");
          setGeExpanded(null);
          window.setTimeout(() => {
            setGeExpanded(groupId);
            void geToggle(groupId);
          }, 300);
          return true;
        }
        if (isApiConflict(json)) {
          showToast("Multiple matches found. Please specify login or group ID more precisely.", "error");
          return false;
        }
        showToast(getApiMessage(json, "Link partner failed"), "error");
        return false;
      } catch {
        showToast("Server error", "error");
        return false;
      }
    },
    [geToggle, readOnlyMode, showToast],
  );

  return {
    geGroups,
    geLoading,
    geStates,
    geExpanded,
    setGeExpanded,
    geLoadingGid,
    geSavingGid,
    calcTotal: calcOwnershipTotal,
    fmtPct: fmtOwnershipPct,
    geToggle,
    geUpdateRow,
    geAddRow,
    geRemoveRow,
    geConfirm,
    geLinkPartner,
  };
}
