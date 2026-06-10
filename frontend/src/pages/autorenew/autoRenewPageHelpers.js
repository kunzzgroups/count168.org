import { calculateCountdown } from "../domain/domainHelpers.js";

export const AUTO_RENEW_PAGE_SIZE = 20;

const PERIOD_SORT_ORDER = {
  "7days": 1,
  "1month": 2,
  "3months": 3,
  "6months": 4,
  "1year": 5,
};

const STATUS_SORT_ORDER = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

function compareStrings(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { sensitivity: "base", numeric: true });
}

function compareNullableNumber(a, b, nullsLast = true) {
  if (a == null && b == null) return 0;
  if (a == null) return nullsLast ? 1 : -1;
  if (b == null) return nullsLast ? -1 : 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function rowSortKey(row) {
  if (row?.request_id) return Number(row.request_id);
  if (row?.deleted_payment_id) return Number(row.deleted_payment_id);
  return 0;
}

export function periodToLabelKey(period) {
  const map = {
    "7days": "period7days",
    "1month": "period1month",
    "3months": "period3months",
    "6months": "period6months",
    "1year": "period1year",
  };
  return map[period] || null;
}

export function formatRemainingForRow(row, t) {
  if (!row?.expiration_date) return t("noExpirationDate");
  const countdown = calculateCountdown(row.expiration_date);
  if (countdown?.text) return countdown.text;
  const days = row.days_until_expiration;
  if (days == null) return t("notSet");
  if (days < 0) return t("expExpired");
  if (days === 0) return t("expToday");
  return t("expDaysLeft", { days });
}

export function rowMatchesSearch(row, searchTerm) {
  const q = String(searchTerm || "").trim().toUpperCase();
  if (!q) return true;
  const company = String(row.company_code || "").toUpperCase();
  const name = String(row.owner_name || "").toUpperCase();
  const group = String(row.group_id || "").toUpperCase();
  return company.includes(q) || name.includes(q) || group.includes(q);
}

export function filterAutoRenewRows(rows, { searchTerm }) {
  return (Array.isArray(rows) ? rows : []).filter((row) => rowMatchesSearch(row, searchTerm));
}

export function sortAutoRenewRows(rows, sortColumn, sortDirection) {
  const list = [...rows];
  const dir = sortDirection === "desc" ? -1 : 1;

  const tiebreak = (a, b) => {
    let r = compareStrings(a.company_code, b.company_code);
    if (r !== 0) return r;
    r = compareStrings(a.expiration_date, b.expiration_date);
    if (r !== 0) return r;
    return rowSortKey(a) - rowSortKey(b);
  };

  list.sort((a, b) => {
    let result = 0;
    switch (sortColumn) {
      case "no":
        result = rowSortKey(a) - rowSortKey(b);
        break;
      case "company":
        result = compareStrings(a.company_code, b.company_code);
        break;
      case "name":
        result = compareStrings(a.owner_name, b.owner_name);
        break;
      case "price":
        result = compareNullableNumber(parseFloat(a.price || "0") || 0, parseFloat(b.price || "0") || 0, false);
        break;
      case "group":
        result = compareStrings(a.group_id, b.group_id);
        break;
      case "expiration":
        result = compareStrings(a.expiration_date, b.expiration_date);
        break;
      case "remaining":
        result = compareNullableNumber(a.days_until_expiration, b.days_until_expiration, true);
        break;
      case "submitter":
        result = compareStrings(a.submitter || a.processed_by, b.submitter || b.processed_by);
        if (result === 0) {
          result = compareStrings(a.submitter_at || a.processed_at, b.submitter_at || b.processed_at);
        }
        break;
      case "status": {
        const av = STATUS_SORT_ORDER[a.status] ?? 99;
        const bv = STATUS_SORT_ORDER[b.status] ?? 99;
        result = av - bv;
        if (result === 0) result = compareStrings(a.status, b.status);
        break;
      }
      case "period": {
        const av = PERIOD_SORT_ORDER[a.period] ?? 99;
        const bv = PERIOD_SORT_ORDER[b.period] ?? 99;
        result = av - bv;
        if (result === 0) result = compareStrings(a.period, b.period);
        break;
      }
      default:
        result = compareStrings(a.company_code, b.company_code);
        break;
    }
    if (result === 0) result = tiebreak(a, b);
    return result * dir;
  });

  return list;
}

export function paginateRows(rows, page, pageSize = AUTO_RENEW_PAGE_SIZE) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    total,
    rows: rows.slice(start, start + pageSize),
  };
}

export function getRowDraftValues(row, drafts) {
  const draft = drafts[row.request_id] || {};
  return {
    period: draft.period ?? row.period ?? "",
    fromAccountId: draft.fromAccountId ?? row.from_account_id ?? row.default_from_account_id ?? "",
    toAccountId: draft.toAccountId ?? row.to_account_id ?? "",
  };
}

export function formatSubmitterAt(value) {
  if (!value) return "";
  const raw = String(value).trim();
  const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${mins}`;
}

export function rowStableKey(row) {
  if (row?.is_payment_deleted && row.deleted_payment_id) {
    return `deleted-${row.deleted_payment_id}`;
  }
  return String(row?.request_id ?? "");
}

export function canApproveRow(row, drafts) {
  if (row.status !== "pending" || !row.can_approve) return false;
  const { period, fromAccountId, toAccountId } = getRowDraftValues(row, drafts);
  return Boolean(period && fromAccountId && toAccountId && row.price);
}
