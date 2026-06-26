import { buildApiUrl } from "../../../utils/core/apiUrl.js";
import { formatDmyFromYmd } from "../../maintenance/shared/maintenanceDateHelpers.js";
import { computeTableTotals, formatPaymentHistoryMoney } from "../../member/memberPageHelpers.js";
import { parseJsonResponse } from "../../member/memberWinLossApi.js";
import { formatMemberRowDescription, getMemberText } from "../../../translateFile/pages/memberTranslate.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productCell(row) {
  if (row?.is_bank_process_transaction) return row.card_owner || "-";
  return row?.product || "-";
}

function remarkCell(row) {
  const raw = row?.remark || row?.sms || "-";
  return String(raw).toUpperCase();
}

/** Account currencies for export modal (member report scope). */
export async function fetchPaymentHistoryExportCurrencies(accountId, companyId, signal) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  if (!id || !cid) return [];
  const res = await fetch(
    buildApiUrl(
      `api/accounts/account_currency_api.php?action=get_account_currencies&account_id=${id}&company_id=${cid}`,
    ),
    { credentials: "include", cache: "no-store", signal },
  );
  const json = await parseJsonResponse(await res.text());
  if (!json?.success || !Array.isArray(json.data)) return [];
  return json.data
    .map((row) =>
      String(row.currency_code || row.code || "")
        .trim()
        .toUpperCase(),
    )
    .filter(Boolean);
}

/**
 * Member Win/Loss table rows — same request + same formatting as the Member page.
 * `member_view=1` forces the backend to apply the member-side description rules
 * (PAYMENT → Payment Settlement, CLAIM → Claim Settlement, RATE → Currency Exchange,
 * CONTRA → Contra Account) even when an agent/admin triggers the export.
 */
export async function fetchMemberReportHistory({ accountId, companyId, dateFrom, dateTo, currency, signal }) {
  const id = Number(accountId) || 0;
  const cid = Number(companyId) || 0;
  if (!id || !cid) {
    throw new Error("Account or company is missing");
  }
  const params = new URLSearchParams({
    account_id: String(id),
    date_from: String(dateFrom),
    date_to: String(dateTo),
    company_id: String(cid),
    currency: String(currency || "")
      .trim()
      .toUpperCase(),
    member_view: "1",
  });
  const res = await fetch(buildApiUrl(`api/transactions/history_api.php?${params}&_t=${Date.now()}`), {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await parseJsonResponse(await res.text());
  if (!json?.success) {
    throw new Error(json?.error || json?.message || "History request failed");
  }
  return Array.isArray(json.data?.history) ? json.data.history : [];
}

export function resolveExportCurrencyDefault(scopeCurrency, currencies) {
  const list = Array.isArray(currencies) ? currencies : [];
  const raw = String(scopeCurrency || "")
    .trim()
    .toUpperCase();
  if (!raw) return list[0] || "";
  const parts = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (parts.length === 1 && list.includes(parts[0])) return parts[0];
  for (const code of parts) {
    if (list.includes(code)) return code;
  }
  return list[0] || "";
}

export function ymdRangeToDmy(dateFromYmd, dateToYmd) {
  return {
    dateFrom: formatDmyFromYmd(dateFromYmd),
    dateTo: formatDmyFromYmd(dateToYmd),
  };
}

function buildPrintDocumentHtml({ title, subtitle, headers, bodyRows, footerRow }) {
  const headCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const body = bodyRows
    .map(
      (cells) =>
        `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  const foot = footerRow
    ? `<tfoot><tr class="total">${footerRow.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr></tfoot>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 210mm; min-height: 297mm; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 { margin: 0 0 4px; font-size: 15px; }
    .sub { margin: 0 0 10px; color: #475569; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
    th, td { border: 1px solid #b8cfe8; padding: 4px 5px; text-align: left; vertical-align: top; word-break: break-word; }
    th { background: linear-gradient(180deg, #dce9f8 0%, #c5daf2 100%); color: #1e3a5f; font-weight: 700; }
    tr:nth-child(even) td { background: #f8fafc; }
    tr.total td { font-weight: 700; background: #eff6ff; }
    .num { text-align: right; white-space: nowrap; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="sub">${escapeHtml(subtitle)}</p>
  <table>
    <thead><tr>${headCells}</tr></thead>
    <tbody>${body}</tbody>
    ${foot}
  </table>
</body>
</html>`;
}

export function buildMemberReportPrintHtml({
  rows,
  currency,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const t = (key, params) => getMemberText(lang, key, params);
  const { totalWinLoss, totalCrDr, closingBalance } = computeTableTotals(rows);
  const title = t("currencyTitle", { currency });
  const subtitle = `${accountCode}${accountName ? ` (${accountName})` : ""} · ${dateFrom} – ${dateTo}`;
  const headers = [
    t("colDate"),
    t("colIdProduct"),
    t("colRate"),
    t("colWinLoss"),
    t("colCrDr"),
    t("colBalance"),
    t("colDescription"),
    t("colRemark"),
  ];
  const bodyRows = (rows || []).map((row) => [
    row.date || "-",
    productCell(row),
    row.rate || "-",
    formatPaymentHistoryMoney(row.win_loss),
    formatPaymentHistoryMoney(row.cr_dr),
    formatPaymentHistoryMoney(row.balance),
    formatMemberRowDescription(lang, row),
    remarkCell(row),
  ]);
  const footerRow = [
    t("totalRow", { currency }),
    "",
    "",
    formatPaymentHistoryMoney(totalWinLoss.toString()),
    formatPaymentHistoryMoney(totalCrDr.toString()),
    formatPaymentHistoryMoney(closingBalance.toString()),
    "",
    "",
  ];
  return buildPrintDocumentHtml({ title, subtitle, headers, bodyRows, footerRow });
}

/**
 * Open the print window synchronously (must run inside the click handler so the
 * browser keeps the user-gesture context — otherwise it becomes a blocked/blank tab).
 */
export function openReportPrintWindow(loadingLabel = "Loading…") {
  const win = window.open("", "_blank");
  if (!win) return null;
  win.document.open();
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${escapeHtml(loadingLabel)}</title>` +
      `<style>body{font-family:"Segoe UI",Arial,sans-serif;color:#475569;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>` +
      `</head><body>${escapeHtml(loadingLabel)}</body></html>`,
  );
  win.document.close();
  return win;
}

/** Render report HTML into an already-opened window and trigger the print dialog. */
export function renderReportToWindow(win, { html, documentTitle }) {
  if (!win || win.closed) throw new Error("Popup blocked");
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.document.title = documentTitle;
  } catch {
    /* ignore */
  }
  const triggerPrint = () => {
    win.focus();
    win.print();
  };
  if (win.document.readyState === "complete") {
    window.setTimeout(triggerPrint, 300);
  } else {
    win.addEventListener("load", () => window.setTimeout(triggerPrint, 300));
  }
}

export function buildMemberReportFilename({ accountCode, currency, dateFrom, dateTo }) {
  const code = String(accountCode || "account").replace(/[^\w.-]+/g, "_");
  const cu = String(currency || "CCY").toUpperCase();
  const from = String(dateFrom || "").replace(/\//g, "-");
  const to = String(dateTo || "").replace(/\//g, "-");
  return `WinLoss-${code}-${cu}-${from}-${to}`;
}
