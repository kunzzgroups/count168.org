import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchJson } from "../lib/fetchJson.js";
import { fetchOwnerCompanies, updateSessionCompany } from "../lib/maintenanceApi.js";
import { pickCompany, sortedUniqueGroupIds } from "../lib/dashboardScope.js";
import { canUseGroupOnlyMode } from "../lib/loginScope.js";
import { resolveMaintenanceScope } from "../lib/mobileMaintenanceScope.js";
import { maintenanceText } from "../translateFile/maintenanceTranslate.js";
import { buildApiUrl } from "../utils/apiUrl.js";
import { resolveMobileLandingPath } from "../utils/mobilePermissions.js";

/**
 * Shared bootstrap for Maintenance pages: session user, companies, scope selection, language.
 * @param {(me:object)=>boolean} canAccess - permission gate for this page
 */
export function useMaintenanceSession({ canAccess }) {
  const navigate = useNavigate();
  const [lang, setLangState] = useState(() => localStorage.getItem("login_lang") || "en");
  const i18n = useMemo(() => maintenanceText(lang), [lang]);

  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMode, setGroupMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const setLang = useCallback((next) => {
    const normalized = next === "zh" ? "zh" : "en";
    localStorage.setItem("login_lang", normalized);
    setLangState(normalized);
  }, []);

  const notify = useCallback((message, tone = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 4000 : 2200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const { res, json } = await fetchJson(buildApiUrl("api/session/current_user_api.php"), {
          signal: ac.signal,
        });
        if (!res.ok || !json?.success || !json?.data) {
          navigate("/login", { replace: true });
          return;
        }
        const user = json.data;
        if (user.needs_owner_secondary || user.needs_user_secondary) {
          navigate(
            user.needs_owner_secondary ? "/owner-secondary-password" : "/user-secondary-password",
            { replace: true },
          );
          return;
        }
        if (typeof canAccess === "function" && !canAccess(user)) {
          setBlocked(true);
          navigate(resolveMobileLandingPath(user), { replace: true });
          return;
        }
        setMe(user);
        const list = await fetchOwnerCompanies(ac.signal);
        const picked = pickCompany(list, user.company_id);
        setCompanies(list);
        setCompanyId(picked?.id ? Number(picked.id) : null);
      } catch (e) {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const scope = useMemo(
    () => resolveMaintenanceScope({ companyId, selectedGroup, groupMode }),
    [companyId, selectedGroup, groupMode],
  );

  const groupIds = useMemo(() => sortedUniqueGroupIds(companies), [companies]);
  /** Group ledger scope only for users the backend will accept (same gate as dashboard/transaction). */
  const allowedGroupIds = useMemo(
    () => groupIds.filter((g) => canUseGroupOnlyMode(me, g, companies)),
    [groupIds, me, companies],
  );
  const selectedCompany = useMemo(
    () => companies.find((row) => Number(row.id) === Number(companyId)) || null,
    [companies, companyId],
  );

  const applyScope = useCallback(
    async (draft) => {
      if (draft?.mode === "group" && draft.groupId) {
        setGroupMode(true);
        setSelectedGroup(String(draft.groupId).trim().toUpperCase());
        setCompanyId(null);
        return true;
      }
      const nextId = Number(draft?.companyId);
      if (!Number.isFinite(nextId) || nextId <= 0) return false;
      if (nextId !== Number(companyId)) {
        try {
          await updateSessionCompany(nextId);
        } catch (e) {
          notify(e?.message || "Failed to switch company", "error");
          return false;
        }
      }
      const row = companies.find((c) => Number(c.id) === nextId) || null;
      setGroupMode(false);
      setSelectedGroup(row?.group_id ? String(row.group_id).trim().toUpperCase() : null);
      setCompanyId(nextId);
      return true;
    },
    [companies, companyId, notify],
  );

  const logout = useCallback(async () => {
    try {
      await fetchJson(buildApiUrl("api/session/logout_api.php"), { method: "POST" });
    } finally {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return {
    lang,
    setLang,
    i18n,
    me,
    companies,
    companyId,
    selectedGroup,
    groupMode,
    scope,
    groupIds,
    allowedGroupIds,
    selectedCompany,
    applyScope,
    loading,
    blocked,
    error,
    toast,
    notify,
    logout,
  };
}
