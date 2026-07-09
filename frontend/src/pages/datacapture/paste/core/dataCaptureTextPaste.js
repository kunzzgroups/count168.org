import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import {
  detectHtmlTableInClipboard,
  getClipboardHtml,
  isFormatRichHtmlTable,
} from "./dataCaptureClipboard.js";
import {
  parseAndFillHtmlTableForText,
  parseAndFillHtmlTableForTextWithFormat,
} from "./dataCaptureTextHtmlPaste.js";

/** 1.Text — Excel plain text paste, preserving the clipboard matrix as-is. */
export function handleTextPlainPaste(e, pastedData, anchorCell) {
  const normalized = pastedData.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (!lines.length) return false;

  const dataMatrix = [];
  let maxCols = 0;

  lines.forEach((line) => {
    if (line.includes("\t")) {
      const cells = line.split("\t");
      dataMatrix.push(cells);
      maxCols = Math.max(maxCols, cells.length);
    } else {
      dataMatrix.push([line]);
      maxCols = Math.max(maxCols, 1);
    }
  });

  dataMatrix.forEach((row) => {
    while (row.length < maxCols) row.push("");
  });

  const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
    startColOverride: 0,
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

export function handleTextModePaste(e, pastedData, anchorCell) {
  const html = getClipboardHtml(e);
  const htmlFromDetect = html ? "" : detectHtmlTableInClipboard(e);
  const htmlCandidate = html || htmlFromDetect;

  if (htmlCandidate && isFormatRichHtmlTable(htmlCandidate)) {
    if (parseAndFillHtmlTableForTextWithFormat(htmlCandidate, anchorCell)) return true;

    // Keep user flow unblocked: fallback to legacy 1.Text parsing.
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

  if (handleTextHtmlPaste(html, anchorCell)) return true;
  if (htmlFromDetect && handleTextHtmlPaste(htmlFromDetect, anchorCell)) return true;

  return handleTextPlainPaste(e, pastedData, anchorCell);
}
