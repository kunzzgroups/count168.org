// domainHelpers.js — Pure utility functions extracted from domain.js

// ★★★ SINGLE_CATEGORY_MODE ★★★
// true: Company Settings 弹窗中 Permissions 只能选择一个分类（互斥）
export const SINGLE_CATEGORY_MODE = true;

export const ROWS_PER_PAGE = 20;
export const MAX_VISIBLE_CHIPS = 3;

// ===================== Date Helpers =====================

/**
 * 计算到期日期
 * @param {string} period - '7days'|'1month'|'3months'|'6months'|'1year'
 * @param {string|null} startDate - YYYY-MM-DD, null → today
 * @returns {string} YYYY-MM-DD
 */
export function calculateExpirationDate(period, startDate = null) {
  const baseDate = startDate ? new Date(startDate) : new Date();
  const expDate = new Date(baseDate);

  switch (period) {
    case "7days":
      expDate.setDate(baseDate.getDate() + 7);
      break;
    case "1month":
      expDate.setMonth(baseDate.getMonth() + 1);
      break;
    case "3months":
      expDate.setMonth(baseDate.getMonth() + 3);
      break;
    case "6months":
      expDate.setMonth(baseDate.getMonth() + 6);
      break;
    case "1year":
      expDate.setFullYear(baseDate.getFullYear() + 1);
      break;
    default:
      expDate.setMonth(baseDate.getMonth() + 1);
  }

  return expDate.toISOString().split("T")[0];
}

/** 格式化日期显示 */
export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** 计算倒计时 */
export function calculateCountdown(expirationDate) {
  if (!expirationDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate);
  exp.setHours(0, 0, 0, 0);

  const diffTime = exp - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: "Expired", days: diffDays, status: "expired" };
  } else if (diffDays === 0) {
    return { text: "Expires today", days: 0, status: "warning" };
  } else if (diffDays <= 7) {
    return {
      text: `${diffDays} day${diffDays > 1 ? "s" : ""} left`,
      days: diffDays,
      status: "warning",
    };
  } else if (diffDays <= 30) {
    return { text: `${diffDays} days left`, days: diffDays, status: "normal" };
  } else {
    const months = Math.floor(diffDays / 30);
    const days = diffDays % 30;
    if (days === 0) {
      return {
        text: `${months} month${months > 1 ? "s" : ""} left`,
        days: diffDays,
        status: "normal",
      };
    }
    return { text: `${months}m ${days}d left`, days: diffDays, status: "normal" };
  }
}

/** 根据到期日期反推 period */
export function getPeriodFromDate(expirationDate) {
  if (!expirationDate) return "1month";

  const today = new Date();
  const exp = new Date(expirationDate);
  const diffMonths =
    (exp.getFullYear() - today.getFullYear()) * 12 +
    (exp.getMonth() - today.getMonth());
  const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

  if (diffDays >= 360 && diffDays <= 370) return "1year";
  if (diffDays >= 175 && diffDays <= 190) return "6months";
  if (diffDays >= 88 && diffDays <= 95) return "3months";
  if (diffDays >= 28 && diffDays <= 32) return "1month";
  if (diffDays >= 5 && diffDays <= 9) return "7days";

  if (diffMonths >= 11) return "1year";
  if (diffMonths >= 5) return "6months";
  if (diffMonths >= 2) return "3months";
  if (diffDays >= 28) return "1month";
  return "7days";
}

// ===================== Fee Share Helpers =====================

export function defaultFeeShareAllocations() {
  return { profit: [], sales: [], cs: [], it: [] };
}

export function normalizeFeeShareFromServer(raw) {
  const d = defaultFeeShareAllocations();
  if (!raw || typeof raw !== "object") return d;
  ["profit", "sales", "cs", "it"].forEach((k) => {
    if (Array.isArray(raw[k])) {
      d[k] = raw[k]
        .map((r) => ({
          account_id: parseInt(r.account_id, 10) || 0,
          percentage: r.percentage != null ? parseFloat(r.percentage) : 0,
        }))
        .filter((r) => r.account_id !== 0);
    }
  });
  return d;
}

export function ensureCompanyFeeShare(company) {
  if (!company) return;
  if (
    !company.fee_share_allocations ||
    typeof company.fee_share_allocations !== "object"
  ) {
    company.fee_share_allocations = defaultFeeShareAllocations();
  }
  ["profit", "sales", "cs", "it"].forEach((k) => {
    if (!Array.isArray(company.fee_share_allocations[k])) {
      company.fee_share_allocations[k] = [];
    }
  });
}

export function isFeeShareAllocationsEmpty(fs) {
  if (!fs || typeof fs !== "object") return true;
  return (
    (!fs.profit || !fs.profit.length) &&
    (!fs.sales || !fs.sales.length) &&
    (!fs.cs || !fs.cs.length) &&
    (!fs.it || !fs.it.length)
  );
}

export function pruneEmptyShareRows(fs) {
  const out = defaultFeeShareAllocations();
  if (!fs || typeof fs !== "object") return out;
  ["profit", "sales", "cs", "it"].forEach((role) => {
    const rows = Array.isArray(fs[role]) ? fs[role] : [];
    out[role] = rows
      .filter((row) => {
        const aid =
          row && row.account_id !== undefined
            ? parseInt(row.account_id, 10)
            : 0;
        return aid !== 0;
      })
      .map((row) => {
        const pct =
          row &&
          row.percentage !== undefined &&
          row.percentage !== null &&
          row.percentage !== ""
            ? parseFloat(row.percentage)
            : "";
        return {
          account_id: parseInt(row.account_id, 10) || 0,
          percentage: isFinite(pct) ? pct : "",
        };
      });
  });
  return out;
}

/** 将 tempCompany 对象映射为 API payload entry */
export function companyToDomainPayloadEntry(c) {
  return {
    company_id: c.company_id,
    expiration_date: c.expiration_date,
    permissions: Array.isArray(c.permissions) ? c.permissions : [],
    group_id: c.group_id || null,
    fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations),
    apply_commission_payments_on_domain_save:
      !!c.apply_commission_payments_on_domain_save,
  };
}

// ===================== Display Helpers =====================

/** 固定两位小数展示 */
export function formatDomainFeeDisplay2(val) {
  if (val === null || val === undefined || val === "") return "—";
  const n = Number(val);
  if (!isFinite(n)) return "—";
  return n.toFixed(2);
}

/** 固定两位小数用于输入框 */
export function formatDomainFeeEdit2(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = Number(val);
  if (!isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatShareRowAmount2(value) {
  const n = Number(value);
  if (!isFinite(n)) return "0.00";
  return n.toFixed(2);
}

/** Sum percentages for a fee share role */
export function sumFeeShareRolePercentages(rows) {
  if (!rows || !rows.length) return 0;
  return rows.reduce((acc, r) => acc + (parseFloat(r && r.percentage) || 0), 0);
}

/** Check if a card/domain contains protected company C168 */
export function hasProtectedCompany(companiesFull) {
  if (!Array.isArray(companiesFull) || companiesFull.length === 0) return false;
  return companiesFull.some(
    (c) => String(c.company_id || "").trim().toUpperCase() === "C168"
  );
}

// ===================== Input Helpers =====================

/** Force uppercase */
export function forceUppercaseValue(value) {
  return String(value || "").toUpperCase();
}

/** Force lowercase and filter Chinese characters */
export function forceLowercaseValue(value) {
  return String(value || "")
    .replace(/[\u4e00-\u9fa5]/g, "")
    .toLowerCase();
}

/** Force numeric only, max 6 digits */
export function forceNumericValue(value) {
  return String(value || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 6);
}

/** Search input filter: uppercase alphanumeric only */
export function forceSearchValue(value) {
  return String(value || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

// ===================== Share Calculation =====================

/**
 * Calculate share totals for all roles, given the fee_share_allocations
 * and the domain fee price.
 * Returns { profit, sales, cs, it } totals and per-row amounts.
 */
export function computeShareTotals(fsa, price) {
  const p = Number(price) || 0;
  const salesSum = sumFeeShareRolePercentages(fsa.sales);
  const csSum = sumFeeShareRolePercentages(fsa.cs);
  const itSum = sumFeeShareRolePercentages(fsa.it);
  const otherSum = salesSum + csSum + itSum;
  const profitPool = Math.max(0, 100 - otherSum);

  // Profit: evenly split remainder among assigned accounts
  const profitRows = Array.isArray(fsa.profit) ? fsa.profit : [];
  const profitAssigned = profitRows.filter(
    (r) => parseInt(r.account_id, 10) !== 0
  ).length;
  const profitPerBase = profitAssigned > 0 ? profitPool / profitAssigned : 0;
  const profitPerRounded = Math.round(profitPerBase * 10000) / 10000;

  let assignedSoFar = 0;
  let assignedSumPct = 0;
  const profitRowAmounts = profitRows.map((r) => {
    const aid = parseInt(r.account_id, 10) || 0;
    if (aid === 0) return { percentage: 0, amount: 0 };
    assignedSoFar++;
    const isLast = assignedSoFar === profitAssigned;
    const pct = isLast
      ? Math.round((profitPool - assignedSumPct) * 10000) / 10000
      : profitPerRounded;
    if (!isLast) assignedSumPct += pct;
    return { percentage: pct, amount: p * (pct / 100) };
  });

  const computeRowAmounts = (rows) =>
    (rows || []).map((r) => {
      const pct = parseFloat(r.percentage) || 0;
      return { percentage: pct, amount: p * (pct / 100) };
    });

  return {
    salesSum,
    csSum,
    itSum,
    otherSum,
    profitPool,
    grand: otherSum + profitPool,
    profitRowAmounts,
    salesRowAmounts: computeRowAmounts(fsa.sales),
    csRowAmounts: computeRowAmounts(fsa.cs),
    itRowAmounts: computeRowAmounts(fsa.it),
  };
}
