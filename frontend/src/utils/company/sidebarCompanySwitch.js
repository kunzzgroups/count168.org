import { notifyCompanySessionUpdated } from "./companySessionEvents.js";
import { peekCompanySessionFlags } from "./companySessionFlagsCache.js";
import { normalizeCompanyCode } from "./loginScope.js";
import { notifyDashboardGroupFilterChanged } from "./sharedCompanyFilter.js";
import { resolveCompanyCategoryFlagsFromRow } from "./companyCategoryFlags.js";

export { resolveCompanyCategoryFlagsFromRow } from "./companyCategoryFlags.js";

export function resolveRowCompanyCode(companyRow, apiData = null) {
  const fromApi = normalizeCompanyCode(apiData?.company_code);
  if (fromApi) return fromApi;
  const fromRow = normalizeCompanyCode(companyRow?.company_id ?? companyRow?.companyId);
  if (fromRow) return fromRow;
  const cached = peekCompanySessionFlags(Number(companyRow?.id));
  return normalizeCompanyCode(cached?.company_code);
}

/** Category flags from session API payload or in-memory cache. */
export function categoryFlagsFromSession(apiData, companyId) {
  if (apiData && typeof apiData === "object") {
    if (apiData.has_gambling != null || apiData.has_bank != null) {
      return {
        hasGambling: Boolean(apiData.has_gambling),
        hasBank: Boolean(apiData.has_bank),
      };
    }
  }
  const cached = peekCompanySessionFlags(Number(companyId));
  if (cached) {
    return {
      hasGambling: Boolean(cached.has_gambling),
      hasBank: Boolean(cached.has_bank),
    };
  }
  return null;
}

export function isBankOnlyCategoryFlags(flags) {
  if (!flags) return false;
  return flags.hasBank && !flags.hasGambling;
}

export function isGamesOnlyCategoryFlags(flags) {
  if (!flags) return false;
  return flags.hasGambling && !flags.hasBank;
}

/**
 * Patch sidebar `me` immediately after company session sync (all pages).
 * Pass `update_company_session_api.php` payload when available.
 */
export function applySidebarForCompanySwitch(viewGroup, companyRow, apiData) {
  const cid = Number(companyRow?.id);
  if (!Number.isFinite(cid) || cid <= 0) return;

  const companyCode = resolveRowCompanyCode(companyRow, apiData);
  const vg =
    viewGroup != null && String(viewGroup).trim() !== ""
      ? String(viewGroup).trim().toUpperCase()
      : null;

  if (apiData && typeof apiData === "object") {
    notifyCompanySessionUpdated(apiData);
  }

  const flags = categoryFlagsFromSession(apiData, cid);
  const opts = { ignoreGroupOnly: true, companyCode };
  if (flags) {
    opts.hasGambling = flags.hasGambling;
    opts.hasBank = flags.hasBank;
  }
  notifyDashboardGroupFilterChanged(vg, cid, opts);
}

/** Bank-only companies may use payment-maintenance and bankprocess-maintenance. */
export function isBankOnlyAllowedMaintenancePath(path) {
  const p = String(path || "");
  return p === "/bankprocess-maintenance" || p === "/payment-maintenance";
}

/**
 * When company category does not match the current maintenance route, return redirect path.
 * Bank-only (e.g. CX): leave games maintenance → dashboard; may stay on payment/bankprocess maintenance.
 * Always call applySidebarForCompanySwitch before navigating.
 */
export function resolveMaintenanceRedirectForSession(sessionData, currentPath) {
  const flags = categoryFlagsFromSession(sessionData, sessionData?.company_id);
  if (!flags) return null;
  const path = String(currentPath || "");

  if (isBankOnlyCategoryFlags(flags)) {
    if (isBankOnlyAllowedMaintenancePath(path)) return null;
    if (path === "/dashboard") return null;
    return "/dashboard";
  }

  if (isGamesOnlyCategoryFlags(flags)) {
    if (path === "/bankprocess-maintenance") return "/capture-maintenance";
    return null;
  }

  if (!flags.hasGambling && !flags.hasBank) {
    return "/dashboard";
  }

  return null;
}
