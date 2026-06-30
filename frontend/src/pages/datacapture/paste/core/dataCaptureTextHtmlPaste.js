import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  measureTopLevelTables,
  sanitizePastedCellHtml,
} from "./dataCaptureClipboard.js";

function emptyPatch() {
  return { value: "" };
}

function isBlankPastedCellText(text) {
  const collapsed = String(text ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (collapsed === "") return true;
  return /^&(?:nbsp|#0*160);?$/i.test(collapsed);
}

function getPlainPastedCellValue(sourceCell) {
  const text = sourceCell.textContent ?? sourceCell.innerText ?? "";
  if (isBlankPastedCellText(text)) return "";
  return text;
}

function patchFromSourceCell(sourceCell) {
  let cellContent = sourceCell.innerHTML;
  if (!cellContent || cellContent.trim() === "") {
    cellContent = sourceCell.textContent || "";
  }

  const cellText = getPlainPastedCellValue(sourceCell);
  const cleanContent = sanitizePastedCellHtml(cellContent);

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return { value: cellText, html: cleanContent };
  }
  return { value: cellText };
}

function buildRowPatches(sourceRow, maxCols, columnOrder) {
  const row = Array.from({ length: maxCols }, () => emptyPatch());
  const rawCells = sourceRow.querySelectorAll("td, th");
  const sourceCells =
    columnOrder && rawCells.length >= columnOrder.length
      ? columnOrder.map((i) => rawCells[i])
      : Array.from(rawCells);

  // 1.Text follows Excel's visible left-to-right cell order without report fixes.
  sourceCells.forEach((sourceCell, index) => {
    if (index < maxCols) {
      row[index] = patchFromSourceCell(sourceCell);
    }
  });

  return row;
}

/**
 * 1.Text — paste Excel HTML table while preserving cell formatting (Phase 4b).
 * Ported from `parseAndFillHTMLTableForText` (1.Text branch only).
 */
export function parseAndFillHtmlTableForText(htmlString, anchorCell) {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const table = tempDiv.querySelector("table");
    if (!table) return false;

    // Collect rows across every top-level table: some reports split the data
    // rows and the TOTAL footer row into separate sibling tables, so reading
    // only the first table would drop the TOTAL row (matches the PHP site).
    const measured = measureTopLevelTables(tempDiv);
    if (!measured) return false;

    const { allRows, maxCols } = measured;
    const dataMatrix = allRows.map((sourceRow) => buildRowPatches(sourceRow, maxCols, null));

    const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
      trimValues: false,
      uppercaseValues: false,
      alignTotalRows: false,
    });

    if (successCount > 0) {
      notifyPasteSuccess(
        `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已保持Excel原始格式!`,
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    return false;
  } catch (err) {
    console.error("1.Text: Error parsing HTML table:", err);
    return false;
  }
}
