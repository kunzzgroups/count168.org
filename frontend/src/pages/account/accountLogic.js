/** Account List Logic Helpers */

import { buildApiUrl } from "../../utils/core/apiUrl.js";

export const PAGE_SIZE = 20;

export const ROLE_PRIORITY = ["CAPITAL", "BANK", "CASH", "PROFIT", "EXPENSES", "COMPANY", "PARTNER", "STAFF", "SUPPLIER", "AGENT", "MEMBER", "DEBTOR"];

export const DEFAULT_FORM = {
  id: "",
  account_id: "",
  name: "",
  role: "",
  password: "",
  remark: "",
  payment_alert: "0",
  alert_type: "",
  alert_start_date: "",
  alert_amount: "",
};

export function toUpper(v) {
  return String(v || "").toUpperCase();
}

export function normalizeAlertAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const num = Number(raw);
  if (Number.isNaN(num)) return "";
  if (num > 0) return `-${num}`;
  return String(num);
}

export function roleSortOrder(role, knownRoles) {
  const base = [...ROLE_PRIORITY];
  (knownRoles || []).forEach((r) => {
    const key = toUpper(r) === "UPLINE" ? "SUPPLIER" : toUpper(r);
    if (!base.includes(key)) base.push(key);
  });
  return base.indexOf(toUpper(role) === "UPLINE" ? "SUPPLIER" : toUpper(role));
}

export function getOrderedRoles(roles) {
  const map = new Map();
  (roles || []).forEach((r) => {
    const t = String(r || "").trim();
    if (t) map.set(toUpper(t), t);
  });
  ["PARTNER", "STAFF", "DEBTOR"].forEach((r) => {
    if (!map.has(r)) map.set(r, r);
  });
  const out = [];
  ROLE_PRIORITY.forEach((p) => {
    if (map.has(p)) {
      out.push(map.get(p));
      map.delete(p);
    } else if (p === "SUPPLIER" && map.has("UPLINE")) {
      out.push(map.get("UPLINE"));
      map.delete("UPLINE");
    }
  });
  return [...out, ...Array.from(map.values()).sort((a, b) => a.localeCompare(b))];
}

export function normalizeCompanyRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    group_id: row.group_id ?? row.groupId ?? row.group ?? null,
    company_id: row.company_id ?? row.companyId ?? row.code ?? "",
  };
}

/** 与 User List 一致：隐藏集团分润/合并产生的虚拟公司行 */
export function isVirtualGroupLinkCompanyRow(c) {
  const ls = c?.link_source_group ?? c?.linkSourceGroup;
  return ls != null && String(ls).trim() !== "";
}

export function buildAccountsFetchKey(companyId, searchTerm, showInactive, showAll) {
  return `${companyId || ""}|${String(searchTerm || "").trim()}|${showInactive ? "1" : "0"}|${showAll ? "1" : "0"}`;
}

export function buildAccountsUrl(companyId, searchTerm, showInactive, showAll) {
  const url = new URL(buildApiUrl("api/accounts/accountlistapi.php"));
  url.searchParams.set("company_id", String(companyId));
  if (String(searchTerm || "").trim()) url.searchParams.set("search", String(searchTerm || "").trim());
  if (showInactive) url.searchParams.set("showInactive", "1");
  if (showAll) url.searchParams.set("showAll", "1");
  return url;
}

/** Add Account：列表中有 MYR 时默认勾选 */
export function pickDefaultAddCurrencyIds(currencies) {
  const myr = (currencies || []).find((c) => toUpper(c.code) === "MYR");
  return myr ? [Number(myr.id)] : [];
}
