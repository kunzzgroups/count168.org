import { useCallback, useEffect, useState } from "react";
import { fetchCompanyPermissionsForDataCapture } from "../lib/dataCaptureApi.js";

/**
 * Category pills (Games / Loan / Rate / Money). Same API + localStorage keys as `loadPermissionButtons` in `js/datacapture.js`.
 * Does not call `loadProcessesByDate` on initial auto-select — React form engine already loads processes for `companyId` + date.
 */
export function useDataCaptureCategoryPermissions(companyCode) {
  const [permissions, setPermissions] = useState([]);
  const [selectedPermission, setSelectedPermission] = useState(null);

  useEffect(() => {
    if (!companyCode) {
      setPermissions([]);
      setSelectedPermission(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await fetchCompanyPermissionsForDataCapture(companyCode);
        const raw = result.success && result.data && Array.isArray(result.data.permissions)
          ? result.data.permissions
          : ["Games", "Bank", "Loan", "Rate", "Money"];
        const perms = raw.filter((p) => p !== "Bank");
        if (cancelled) return;
        setPermissions(perms);

        const saved = localStorage.getItem(`selectedPermission_${companyCode}`);
        const pick = saved && perms.includes(saved) ? saved : perms.length > 0 ? perms[0] : null;
        setSelectedPermission(pick);
      } catch {
        if (!cancelled) {
          setPermissions([]);
          setSelectedPermission(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyCode]);

  const selectPermission = useCallback(
    (permission) => {
      setSelectedPermission(permission);
      if (companyCode) {
        localStorage.setItem(`selectedPermission_${companyCode}`, permission);
      }
      if (typeof window.__DC_RELOAD_PROCESSES__ === "function") {
        void window.__DC_RELOAD_PROCESSES__();
      }
    },
    [companyCode]
  );

  const showPermissionFilter = permissions.length > 1;

  return {
    permissions,
    selectedPermission,
    selectPermission,
    showPermissionFilter,
  };
}
