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

function parseMoneyNumber(value) {
  if (value === "-" || value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatMoneyHtml(value) {
  const n = parseMoneyNumber(value);
  const display = formatPaymentHistoryMoney(value);
  if (n === null) return '<span class="amt amt--empty">–</span>';
  if (n === 0) return '<span class="amt amt--zero">-</span>';
  const tone = n > 0 ? "pos" : "neg";
  return `<span class="amt amt--${tone}">${escapeHtml(display)}</span>`;
}

function moneyCellClass(value) {
  const n = parseMoneyNumber(value);
  if (n === 0) return "num num--zero";
  return "num";
}

/** Print CSS aligned with Member Win/Loss table (`member-winloss-table--by-currency`). */
const MEMBER_REPORT_PRINT_CSS = `
  @page { size: A4 portrait; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body {
    width: 100%;
    margin: 0;
    padding: 0;
  }
  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    color: #0f172a;
    font-size: 10pt;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-header {
    margin: 0 0 14px;
    padding-bottom: 10px;
    border-bottom: 2px solid #002c49;
  }
  .doc-title {
    margin: 0 0 4px;
    font-size: 14pt;
    font-weight: 700;
    color: #002c49;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .doc-meta {
    margin: 0;
    font-size: 9.5pt;
    font-weight: 600;
    color: #475569;
  }
  .report-section {
    margin: 0 0 18px;
    page-break-inside: avoid;
  }
  .report-section + .report-section {
    page-break-before: always;
    margin-top: 0;
    padding-top: 4px;
  }
  .section-title {
    margin: 0 0 8px;
    font-size: 11pt;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: 0.01em;
  }
  .section-meta {
    margin: 0 0 10px;
    font-size: 9pt;
    font-weight: 600;
    color: #64748b;
  }
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid #e2e8f0;
    font-size: 9.5pt;
  }
  table.report-table col.col-date { width: 11%; }
  table.report-table col.col-product { width: 12%; }
  table.report-table col.col-rate { width: 6%; }
  table.report-table col.col-winloss,
  table.report-table col.col-crdr,
  table.report-table col.col-balance { width: 10%; }
  table.report-table col.col-description { width: 34%; }
  table.report-table col.col-remark { width: 7%; }
  table.report-table thead { display: table-header-group; }
  table.report-table tfoot { display: table-footer-group; }
  table.report-table th {
    background: #002c49;
    color: #ffffff;
    padding: 7px 8px;
    border: 1px solid #1e3a5f;
    font-size: 9.5pt;
    font-weight: 700;
    text-align: left;
    vertical-align: middle;
    white-space: nowrap;
  }
  table.report-table th.col-rate,
  table.report-table th.col-winloss,
  table.report-table th.col-crdr,
  table.report-table th.col-balance {
    text-align: right;
  }
  table.report-table td {
    padding: 6px 8px;
    border: 1px solid #e8edf3;
    font-size: 9.5pt;
    font-weight: 600;
    color: #0f172a;
    vertical-align: middle;
    word-break: break-word;
  }
  table.report-table tbody tr:nth-child(odd) td { background: #ffffff; }
  table.report-table tbody tr:nth-child(even) td { background: #f4f7fc; }
  table.report-table tbody tr.row-bf td {
    background: #eef4ff !important;
    color: #1e3a5f;
  }
  table.report-table td.col-date { white-space: nowrap; }
  table.report-table td.col-product { text-align: left; }
  table.report-table td.col-rate,
  table.report-table td.col-remark {
    text-align: right;
    color: #64748b;
    font-variant-numeric: tabular-nums;
  }
  table.report-table td.col-remark { text-align: center; }
  table.report-table td.col-description {
    text-align: left;
    text-transform: uppercase;
  }
  table.report-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.report-table tbody td.num--zero { text-align: center; }
  table.report-table .amt {
    display: inline-block;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    min-width: 3.5rem;
  }
  table.report-table .amt--pos { color: #172a9f; }
  table.report-table .amt--neg { color: #b91c1c; }
  table.report-table .amt--zero {
    color: #002c49;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  table.report-table .amt--empty {
    color: #cbd5e1;
    font-weight: 400;
  }
  table.report-table tr.total-row td {
    background: #eef4ff !important;
    color: #0f172a !important;
    font-weight: 700;
    border-color: #e2e8f0;
    border-top: 2px solid #d6e3f2;
  }
  table.report-table td.total-label {
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  table.report-table tr.total-row td.num { text-align: right; }
  @media print {
    body { width: auto; }
    .report-section { page-break-inside: auto; }
    table.report-table tr { page-break-inside: avoid; }
  }
`;

const REPORT_TABLE_COLGROUP = `<colgroup>
  <col class="col-date" />
  <col class="col-product" />
  <col class="col-rate" />
  <col class="col-winloss" />
  <col class="col-crdr" />
  <col class="col-balance" />
  <col class="col-description" />
  <col class="col-remark" />
</colgroup>`;

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
  return resolveExportCurrenciesDefault(scopeCurrency, currencies).codes[0] || "";
}

/** Initial multi-select state for export modal (comma-separated scope currency or ALL). */
export function resolveExportCurrenciesDefault(scopeCurrency, currencies) {
  const list = Array.isArray(currencies) ? currencies : [];
  if (!list.length) {
    return { isAllSelected: true, codes: [] };
  }
  const raw = String(scopeCurrency || "")
    .trim()
    .toUpperCase();
  if (!raw || raw === "ALL") {
    return { isAllSelected: true, codes: [] };
  }
  const parts = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const matched = parts.filter((p) => list.includes(p));
  if (!matched.length) {
    return { isAllSelected: true, codes: [] };
  }
  if (matched.length === list.length) {
    return { isAllSelected: true, codes: [] };
  }
  return { isAllSelected: false, codes: matched };
}

export function exportCurrencyCodes(isAllSelected, selectedCurrencies, availableCurrencies) {
  const list = Array.isArray(availableCurrencies) ? availableCurrencies : [];
  if (!list.length) return [];
  if (isAllSelected) return [...list];
  const picked = (selectedCurrencies || []).filter((c) => list.includes(c));
  return picked.length ? picked : [...list];
}

export function ymdRangeToDmy(dateFromYmd, dateToYmd) {
  return {
    dateFrom: formatDmyFromYmd(dateFromYmd),
    dateTo: formatDmyFromYmd(dateToYmd),
  };
}

function buildReportTableHead(headers) {
  const colClasses = [
    "col-date",
    "col-product",
    "col-rate",
    "col-winloss",
    "col-crdr",
    "col-balance",
    "col-description",
    "col-remark",
  ];
  const cells = headers
    .map((h, i) => `<th class="${colClasses[i] || ""}">${escapeHtml(h)}</th>`)
    .join("");
  return `<thead><tr>${cells}</tr></thead>`;
}

function buildReportDataRowHtml(row, lang) {
  const bfClass = row?.row_type === "bf" ? " row-bf" : "";
  return `<tr class="data-row${bfClass}">
    <td class="col-date">${escapeHtml(row.date || "-")}</td>
    <td class="col-product">${escapeHtml(productCell(row))}</td>
    <td class="col-rate">${escapeHtml(row.rate || "-")}</td>
    <td class="${moneyCellClass(row.win_loss)}">${formatMoneyHtml(row.win_loss)}</td>
    <td class="${moneyCellClass(row.cr_dr)}">${formatMoneyHtml(row.cr_dr)}</td>
    <td class="${moneyCellClass(row.balance)}">${formatMoneyHtml(row.balance)}</td>
    <td class="col-description">${escapeHtml(formatMemberRowDescription(lang, row))}</td>
    <td class="col-remark">${escapeHtml(remarkCell(row))}</td>
  </tr>`;
}

function buildReportFooterHtml(totalLabel, totalWinLoss, totalCrDr, closingBalance) {
  return `<tfoot><tr class="total-row">
    <td class="total-label" colspan="3">${escapeHtml(totalLabel)}</td>
    <td class="num">${formatMoneyHtml(totalWinLoss.toString())}</td>
    <td class="num">${formatMoneyHtml(totalCrDr.toString())}</td>
    <td class="num">${formatMoneyHtml(closingBalance.toString())}</td>
    <td colspan="2"></td>
  </tr></tfoot>`;
}

function buildPrintShellHtml({ documentTitle, bodyContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)}</title>
  <style>${MEMBER_REPORT_PRINT_CSS}</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

function buildPrintDocumentHtml({ title, subtitle, headers, rows, footerLabel, totalWinLoss, totalCrDr, closingBalance, lang }) {
  const head = buildReportTableHead(headers);
  const body = (rows || []).map((row) => buildReportDataRowHtml(row, lang)).join("");
  const foot = buildReportFooterHtml(footerLabel, totalWinLoss, totalCrDr, closingBalance);
  const content = `
  <header class="doc-header">
    <h1 class="doc-title">${escapeHtml(title)}</h1>
    <p class="doc-meta">${escapeHtml(subtitle)}</p>
  </header>
  <table class="report-table">
    ${REPORT_TABLE_COLGROUP}
    ${head}
    <tbody>${body}</tbody>
    ${foot}
  </table>`;
  return buildPrintShellHtml({ documentTitle: title, bodyContent: content });
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
  const section = buildMemberReportSectionData({
    rows,
    currency,
    accountCode,
    accountName,
    dateFrom,
    dateTo,
    lang,
  });
  return buildPrintDocumentHtml({
    title: section.docTitle,
    subtitle: section.docMeta,
    headers: section.headers,
    rows: section.rows,
    footerLabel: section.footerLabel,
    totalWinLoss: section.totalWinLoss,
    totalCrDr: section.totalCrDr,
    closingBalance: section.closingBalance,
    lang,
  });
}

function buildMemberReportSectionData({
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
  const accountLabel = `${accountCode}${accountName ? ` (${accountName})` : ""}`;
  const dateLabel = `${dateFrom} – ${dateTo}`;
  return {
    currencyTitle: t("currencyTitle", { currency }),
    docTitle: `${accountCode} - ${t("exportPdfTitle")}`,
    docMeta: `${accountLabel} · ${dateLabel}`,
    sectionMeta: `${accountLabel} · ${dateLabel}`,
    headers: [
      t("colDate"),
      t("colIdProduct"),
      t("colRate"),
      t("colWinLoss"),
      t("colCrDr"),
      t("colBalance"),
      t("colDescription"),
      t("colRemark"),
    ],
    rows: rows || [],
    footerLabel: t("totalRow", { currency }),
    totalWinLoss,
    totalCrDr,
    closingBalance,
  };
}

function buildMemberReportSectionHtml(sectionData, lang) {
  const head = buildReportTableHead(sectionData.headers);
  const body = (sectionData.rows || []).map((row) => buildReportDataRowHtml(row, lang)).join("");
  const foot = buildReportFooterHtml(
    sectionData.footerLabel,
    sectionData.totalWinLoss,
    sectionData.totalCrDr,
    sectionData.closingBalance,
  );
  return `<section class="report-section">
  <h2 class="section-title">${escapeHtml(sectionData.currencyTitle)}</h2>
  <p class="section-meta">${escapeHtml(sectionData.sectionMeta)}</p>
  <table class="report-table">
    ${REPORT_TABLE_COLGROUP}
    ${head}
    <tbody>${body}</tbody>
    ${foot}
  </table>
</section>`;
}

/** One print document with a table per selected currency (page break between sections). */
export function buildCombinedMemberReportPrintHtml({
  sections,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
}) {
  const firstSection = buildMemberReportSectionData({
    rows: sections?.[0]?.rows || [],
    currency: sections?.[0]?.currency || "",
    accountCode,
    accountName,
    dateFrom,
    dateTo,
    lang,
  });
  const sectionHtml = (sections || [])
    .map(({ currency, rows }) =>
      buildMemberReportSectionHtml(
        buildMemberReportSectionData({
          rows,
          currency,
          accountCode,
          accountName,
          dateFrom,
          dateTo,
          lang,
        }),
        lang,
      ),
    )
    .join("");
  const docTitle = firstSection.docTitle;
  const bodyContent = `
  <header class="doc-header">
    <h1 class="doc-title">${escapeHtml(firstSection.docTitle)}</h1>
    <p class="doc-meta">${escapeHtml(firstSection.docMeta)}</p>
  </header>
  ${sectionHtml}`;

  return buildPrintShellHtml({ documentTitle: docTitle, bodyContent });
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

function rowToTableCells(row, lang) {
  return [
    row.date || "-",
    productCell(row),
    row.rate || "-",
    formatPaymentHistoryMoney(row.win_loss),
    formatPaymentHistoryMoney(row.cr_dr),
    formatPaymentHistoryMoney(row.balance),
    formatMemberRowDescription(lang, row),
    remarkCell(row),
  ];
}

function moneyTone(value) {
  const n = parseMoneyNumber(value);
  if (n === null) return "empty";
  if (n === 0) return "zero";
  return n > 0 ? "pos" : "neg";
}

function applyPdfMoneyStyle(cell, rawValue) {
  const tone = moneyTone(rawValue);
  cell.styles.halign = "right";
  if (tone === "pos") {
    cell.styles.textColor = [23, 42, 159];
    cell.styles.fontStyle = "bold";
  } else if (tone === "neg") {
    cell.styles.textColor = [185, 28, 28];
    cell.styles.fontStyle = "bold";
  } else if (tone === "zero") {
    cell.styles.textColor = [0, 44, 73];
    cell.styles.fontStyle = "bold";
    cell.styles.halign = "center";
  } else {
    cell.styles.textColor = [203, 213, 225];
    cell.styles.fontStyle = "normal";
    cell.styles.halign = "center";
  }
}

/** A4 portrait — column widths total ~190mm (210mm page − 10mm margins). */
const PDF_TABLE_COLUMN_STYLES = {
  0: { cellWidth: 21 },
  1: { cellWidth: 23 },
  2: { cellWidth: 11, halign: "right" },
  3: { cellWidth: 19, halign: "right" },
  4: { cellWidth: 19, halign: "right" },
  5: { cellWidth: 19, halign: "right" },
  6: { cellWidth: 65 },
  7: { cellWidth: 13, halign: "center" },
};

/**
 * Generate a proper A4 portrait PDF and trigger download (no browser print dialog).
 */
export async function downloadMemberReportPdf({
  sections,
  accountCode,
  accountName,
  dateFrom,
  dateTo,
  lang,
  filename,
}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 10;
  let cursorY = 14;

  const headerSection = buildMemberReportSectionData({
    rows: sections?.[0]?.rows || [],
    currency: sections?.[0]?.currency || "",
    accountCode,
    accountName,
    dateFrom,
    dateTo,
    lang,
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 44, 73);
  doc.text(headerSection.docTitle, marginX, cursorY);
  cursorY += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(headerSection.docMeta, marginX, cursorY);
  cursorY += 9;

  const sectionList = sections || [];
  sectionList.forEach((section, sectionIdx) => {
    const sectionData = buildMemberReportSectionData({
      rows: section.rows,
      currency: section.currency,
      accountCode,
      accountName,
      dateFrom,
      dateTo,
      lang,
    });
    const sourceRows = section.rows || [];

    if (sectionList.length > 1) {
      if (sectionIdx > 0 && cursorY > pageH - 40) {
        doc.addPage();
        cursorY = 14;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      doc.text(sectionData.currencyTitle, marginX, cursorY);
      cursorY += 6;
    }

    const body = sourceRows.map((row) => rowToTableCells(row, lang));
    const foot = [
      [
        {
          content: sectionData.footerLabel,
          colSpan: 3,
          styles: { halign: "left", fontStyle: "bold" },
        },
        formatPaymentHistoryMoney(sectionData.totalWinLoss.toString()),
        formatPaymentHistoryMoney(sectionData.totalCrDr.toString()),
        formatPaymentHistoryMoney(sectionData.closingBalance.toString()),
        { content: "", colSpan: 2 },
      ],
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      tableWidth: pageW - marginX * 2,
      head: [sectionData.headers],
      body,
      foot,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 2.5,
        lineColor: [232, 237, 243],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [0, 44, 73],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 9,
      },
      footStyles: {
        fillColor: [238, 244, 255],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      columnStyles: PDF_TABLE_COLUMN_STYLES,
      didParseCell: (hookData) => {
        if (hookData.section === "body") {
          const row = sourceRows[hookData.row.index];
          if (row?.row_type === "bf") {
            hookData.cell.styles.fillColor = [238, 244, 255];
            hookData.cell.styles.textColor = [30, 58, 95];
          }
          if (hookData.column.index === 3) applyPdfMoneyStyle(hookData.cell, row?.win_loss);
          if (hookData.column.index === 4) applyPdfMoneyStyle(hookData.cell, row?.cr_dr);
          if (hookData.column.index === 5) applyPdfMoneyStyle(hookData.cell, row?.balance);
          if (hookData.column.index === 6) {
            hookData.cell.styles.fontStyle = "bold";
          }
          if (hookData.column.index === 2 || hookData.column.index === 7) {
            hookData.cell.styles.textColor = [100, 116, 139];
          }
        }
        if (hookData.section === "foot") {
          const col = hookData.column.index;
          if (col === 3) applyPdfMoneyStyle(hookData.cell, sectionData.totalWinLoss.toString());
          if (col === 4) applyPdfMoneyStyle(hookData.cell, sectionData.totalCrDr.toString());
          if (col === 5) applyPdfMoneyStyle(hookData.cell, sectionData.closingBalance.toString());
        }
      },
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 12;
  });

  const safeName = String(filename || "WinLoss-Report").replace(/[<>:"/\\|?*]+/g, "_");
  doc.save(`${safeName}.pdf`);
}

export function buildMemberReportFilename({ accountCode, currency, currencies, dateFrom, dateTo }) {
  const code = String(accountCode || "account").replace(/[^\w.-]+/g, "_");
  const list = Array.isArray(currencies) && currencies.length
    ? currencies
    : [String(currency || "CCY").toUpperCase()];
  const cu =
    list.length === 1
      ? list[0]
      : list.length <= 3
        ? list.join("-")
        : "MULTI";
  const from = String(dateFrom || "").replace(/\//g, "-");
  const to = String(dateTo || "").replace(/\//g, "-");
  return `WinLoss-${code}-${cu}-${from}-${to}`;
}
