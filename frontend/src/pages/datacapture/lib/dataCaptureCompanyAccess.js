import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { fetchCompanyPermissionsForDataCapture } from "./dataCaptureApi.js";

/** Home route when the active company has no Games / Gambling category. */
export const DATA_CAPTURE_HOME_PATH = "/dashboard";

export function permissionsIncludeGames(permissions) {
  return (
    Array.isArray(permissions) &&
    (permissions.includes("Games") || permissions.includes("Gambling"))
  );
}

export async function fetchCompanyHasGamesCategory(companyCode) {
  if (!companyCode) return false;
  try {
    const result = await fetchCompanyPermissionsForDataCapture(companyCode);
    const perms =
      result.success && result.data && Array.isArray(result.data.permissions)
        ? result.data.permissions
        : [];
    return permissionsIncludeGames(perms);
  } catch {
    return false;
  }
}

export async function syncDataCaptureCompanySession(companyId) {
  const response = await fetch(
    buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`),
    { credentials: "include" }
  );
  return response.json();
}

/** @returns {Promise<boolean>} true when company may use Data Capture */
export async function resolveCompanyGamesAccess({ companyId, companyCode, sessionUser }) {
  const numericId = Number(companyId);
  if (!Number.isFinite(numericId) || numericId <= 0) return false;

  const sameAsSession =
    sessionUser?.company_id != null && Number(sessionUser.company_id) === numericId;

  if (sameAsSession && sessionUser.company_has_gambling === false) {
    return false;
  }

  try {
    const syncJson = await syncDataCaptureCompanySession(numericId);
    if (syncJson.success && syncJson.data && syncJson.data.has_gambling === false) {
      return false;
    }
    if (syncJson.success && syncJson.data && syncJson.data.has_gambling === true) {
      return true;
    }
  } catch {
    /* fall through to permissions API */
  }

  return fetchCompanyHasGamesCategory(companyCode);
}
