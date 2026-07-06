/** Mirrors desktop sidebarPermissions.js for mobile routes only. */

export function normRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isOwnerUser(me) {
  return normRole(me?.role) === "owner";
}

export function getUserPermissions(me) {
  return Array.isArray(me?.permissions) ? me.permissions : [];
}

/** Empty permissions = unrestricted (owner / legacy). */
export function hasFullPermissions(me) {
  if (isOwnerUser(me) || String(me?.user_type || "").toLowerCase() === "owner") return true;
  return getUserPermissions(me).length === 0;
}

export function canAccessPermission(me, key) {
  if (hasFullPermissions(me)) return true;
  return getUserPermissions(me).includes(key);
}

export function canAccessDashboard(me) {
  return canAccessPermission(me, "home");
}

export function canAccessReport(me) {
  return canAccessPermission(me, "report");
}

export function canAccessTransaction(me) {
  return canAccessPermission(me, "payment");
}

/** First mobile route after login — aligned with desktop sidebar order where possible. */
export function resolveMobileLandingPath(me) {
  if (!me) return "/login";

  const userType = String(me.user_type || "").toLowerCase();
  if (userType === "member") return "/member";
  if (me.needs_owner_secondary) return "/owner-secondary-password";
  if (me.needs_user_secondary) return "/user-secondary-password";

  if (canAccessDashboard(me)) return "/dashboard";
  if (canAccessReport(me)) return "/report";
  if (canAccessTransaction(me)) return "/transaction";
  return "/more";
}

export function mobileNavItems(me) {
  const items = [];
  if (canAccessDashboard(me)) {
    items.push({ to: "/dashboard", icon: "fa-house", key: "navHome" });
  }
  if (canAccessReport(me)) {
    items.push({ to: "/report", icon: "fa-file-lines", key: "navReport" });
  }
  if (canAccessTransaction(me)) {
    items.push({ to: "/transaction", icon: "fa-money-bill-transfer", key: "navTransaction" });
  }
  items.push({ to: "/more", icon: "fa-ellipsis", key: "navMore" });
  return items;
}
