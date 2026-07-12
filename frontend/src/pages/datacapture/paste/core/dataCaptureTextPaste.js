import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import {
  detectHtmlTableInClipboard,
  getClipboardHtml,
} from "./dataCaptureClipboard.js";
import {
  clipboardHtmlLooksLikeGrid,
  normalizeClipboardHtmlToTable,
} from "./dataCaptureFormatClipboardNormalize.js";
import {
  parseAndFillHtmlTableForText,
  parseAndFillHtmlTableForTextWithFormat,
} from "./dataCaptureTextHtmlPaste.js";

function isMoneyOrNumberLikeToken(text) {
  const cleaned = String(text ?? "")
    .trim()
    .replace(/[,$]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return false;
  return /^-?\d+(?:\.\d+)?$/.test(cleaned);
}

function isSummaryLabelToken(text) {
  const normalized = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  return normalized === "SUBTOTAL" || normalized === "SUB TOTAL" || normalized === "TOTAL AMOUNT";
}

function detectFlattenedStatementColCount(tokens) {
  const summaryIndices = [];
  tokens.forEach((token, index) => {
    if (isSummaryLabelToken(token)) summaryIndices.push(index);
  });
  if (!summaryIndices.length) return null;

  const candidateDiffs = [];
  for (let i = 1; i < summaryIndices.length; i += 1) {
    const diff = summaryIndices[i] - summaryIndices[i - 1];
    if (diff >= 8 && diff <= 20) candidateDiffs.push(diff);
  }
  if (candidateDiffs.length) {
    // Prefer the most common spacing between summary rows.
    const counts = new Map();
    candidateDiffs.forEach((diff) => counts.set(diff, (counts.get(diff) || 0) + 1));
    let best = candidateDiffs[0];
    let bestCount = 0;
    counts.forEach((count, diff) => {
      if (count > bestCount) {
        best = diff;
        bestCount = count;
      }
    });
    return best;
  }

  const firstIdx = summaryIndices[0];
  // Typical statement width is ~8–12 columns.
  if (firstIdx >= 8 && firstIdx <= 12) return firstIdx;
  // Header row + first data row before SUBTOTAL → index ≈ 2× width.
  if (firstIdx >= 16 && firstIdx <= 24) {
    const half = Math.round(firstIdx / 2);
    if (half >= 8 && half <= 12) return half;
  }
  return 10;
}

function parseFlattenedStatementMatrix(nonEmptyLines) {
  if (nonEmptyLines.length < 8) return null;

  const tokens = nonEmptyLines.map((line) => line.trim()).filter(Boolean);
  const numericLikeCount = tokens.filter((token) => isMoneyOrNumberLikeToken(token)).length;
  if (numericLikeCount < Math.ceil(tokens.length * 0.4)) return null;

  const colCount = detectFlattenedStatementColCount(tokens);
  if (!colCount || colCount < 2) return null;

  // Drop a leading header row when the first summary aligns to 2× width.
  let start = 0;
  const firstSummary = tokens.findIndex((token) => isSummaryLabelToken(token));
  if (firstSummary > colCount && firstSummary % colCount === 0) {
    start = firstSummary % colCount === 0 && firstSummary >= colCount * 2 ? colCount : 0;
    // If tokens before first summary are exactly 2 rows, skip the first (headers).
    if (firstSummary === colCount * 2) start = colCount;
  }

  const dataTokens = tokens.slice(start);
  const dataRows = [];
  for (let i = 0; i < dataTokens.length; i += colCount) {
    dataRows.push(dataTokens.slice(i, i + colCount));
  }
  if (dataRows.length < 2) return null;

  const hasSummaryRow = dataRows.some((row) => row.length && isSummaryLabelToken(row[0]));
  if (!hasSummaryRow) return null;

  dataRows.forEach((row) => {
    while (row.length < colCount) row.push("");
  });
  return dataRows;
}

/** Exported for Citibet-style statement matrix paste (1.Text / 2.Format). */
export function parsePlainTextMatrix(pastedData) {
  const normalized = pastedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) return [];

  if (normalized.includes("\t")) {
    const tabRows = normalized
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!tabRows.length) return [];

    const maxCols = Math.max(...tabRows.map((row) => row.length));
    tabRows.forEach((row) => {
      while (row.length < maxCols) row.push("");
    });
    return tabRows;
  }

  const rawLines = normalized.split("\n");
  const hasBlankLine = rawLines.some((line) => line.trim() === "");
  if (hasBlankLine) {
    const rowBlocks = [];
    let currentRow = [];

    rawLines.forEach((line) => {
      if (line.trim() === "") {
        if (currentRow.length) {
          rowBlocks.push(currentRow);
          currentRow = [];
        }
        return;
      }
      currentRow.push(line);
    });
    if (currentRow.length) rowBlocks.push(currentRow);

    const hasMultiColBlock = rowBlocks.some((row) => row.length > 1);
    if (rowBlocks.length >= 2 && hasMultiColBlock) {
      const maxCols = Math.max(...rowBlocks.map((row) => row.length));
      rowBlocks.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return rowBlocks;
    }
  }

  const nonEmptyLines = rawLines.filter((line) => line.trim() !== "");
  const spacingSplitRows = nonEmptyLines.map((line) =>
    line
      .trim()
      .split(/\s{2,}/)
      .map((cell) => cell.trim())
      .filter((cell) => cell !== ""),
  );
  if (spacingSplitRows.length >= 2) {
    const maxCols = Math.max(...spacingSplitRows.map((row) => row.length));
    const multiColRows = spacingSplitRows.filter((row) => row.length >= 2).length;
    const minRowsForWideSplit = Math.max(2, Math.ceil(spacingSplitRows.length * 0.6));

    // Plain-text copies from report tables often use repeated spaces instead of tabs.
    // Only promote to matrix when most rows clearly look multi-column.
    if (maxCols >= 2 && multiColRows >= minRowsForWideSplit) {
      spacingSplitRows.forEach((row) => {
        while (row.length < maxCols) row.push("");
      });
      return spacingSplitRows;
    }
  }

  const flattenedStatementRows = parseFlattenedStatementMatrix(nonEmptyLines);
  if (flattenedStatementRows) return flattenedStatementRows;

  return nonEmptyLines.map((line) => [line]);
}

/** 1.Text — Excel plain text paste, preserving the clipboard matrix as-is. */
export function handleTextPlainPaste(e, pastedData, anchorCell) {
  const dataMatrix = parsePlainTextMatrix(pastedData);
  if (!dataMatrix.length) return false;

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    uppercaseValues: false,
    trimValues: false,
    alignTotalRows: false,
  });

  if (successCount > 0) {
    notifyPasteSuccess(
      `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
    );
    return true;
  }
  return false;
}

/** 1.Text — HTML table paste (Phase 4b, React-owned). */
export function handleTextHtmlPaste(html, anchorCell) {
  if (!html || !html.includes("<table")) return false;
  return parseAndFillHtmlTableForText(html, anchorCell);
}

/**
 * Secondary 1.Text path after the shared Excel-format pipeline
 * (`handleFormatCellPaste` with allowOutsideFormatMode) fails.
 * Keeps matrix reconstruction + light style HTML fill as a safety net.
 */
export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  const htmlFromDetect = html ? "" : detectHtmlTableInClipboard(e);
  const rawHtmlCandidate = html || htmlFromDetect;
  const htmlCandidate =
    rawHtmlCandidate && clipboardHtmlLooksLikeGrid(rawHtmlCandidate)
      ? normalizeClipboardHtmlToTable(rawHtmlCandidate) || rawHtmlCandidate
      : rawHtmlCandidate;

  if (htmlCandidate && htmlCandidate.includes("<table")) {
    if (parseAndFillHtmlTableForTextWithFormat(htmlCandidate, anchorCell)) return true;

    if (handleTextHtmlPaste(htmlCandidate, anchorCell)) {
      notifyPasteSuccess("格式保留失败，已按纯文本粘贴。", "danger");
      return true;
    }

    if (handleTextPlainPaste(e, pastedData, anchorCell)) {
      notifyPasteSuccess("格式保留失败，已按纯文本粘贴。", "danger");
      return true;
    }
    return false;
  }

  if (handleTextHtmlPaste(htmlCandidate, anchorCell)) return true;
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextPlainPaste(e, pastedData, anchorCell);
}
