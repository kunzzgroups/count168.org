import { applyDataMatrixToGrid, notifyPasteSuccess } from "./dataCapturePasteApply.js";
import { recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";
import {
  measureTopLevelTables,
  plainTextFromSanitizedHtml,
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

  const cleanContent = sanitizePastedCellHtml(cellContent);
  const rawText = plainTextFromSanitizedHtml(cleanContent) || getPlainPastedCellValue(sourceCell);
  const cellText = isBlankPastedCellText(rawText) ? "" : rawText;

  if (cleanContent.includes("<") && cleanContent.includes(">")) {
    return {
      value: cellText,
      html: cleanContent,
    };
  }
  return {
    value: cellText,
  };
}

function extractCellLinesForTextMode(sourceCell) {
  const cellHtml = sourceCell.innerHTML || "";
  const cellText = (sourceCell.textContent || sourceCell.innerText || "").trim();

  const hasBrTag = /<br\s*\/?>/i.test(cellHtml) || /<br\s+[^>]*>/i.test(cellHtml);
  const hasNewline = cellText.includes("\n") || cellText.includes("\r\n") || cellText.includes("\r");

  if (hasBrTag) {
    const markerHtml = cellHtml
      .replace(/<br\s+[^>]*>/gi, "|||TEXT_SPLIT|||")
      .replace(/<br\s*\/?>/gi, "|||TEXT_SPLIT|||");
    const markerDiv = document.createElement("div");
    markerDiv.innerHTML = markerHtml;
    const textWithMarker = markerDiv.textContent || markerDiv.innerText || "";
    return textWithMarker
      .split("|||TEXT_SPLIT|||")
      .map((part) => part.trim())
      .filter((part) => part !== "");
  }

  if (hasNewline) {
    return cellText
      .split(/\r?\n|\r/)
      .map((part) => part.trim())
      .filter((part) => part !== "");
  }

  const directChildren = Array.from(sourceCell.childNodes || []);
  const directSpans = directChildren.filter(
    (node) => node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN",
  );
  const hasOnlySpanChildren = directChildren.every((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return !String(node.textContent || "").trim();
    }
    return node.nodeType === Node.ELEMENT_NODE && node.tagName === "SPAN";
  });
  const spansAreBlockLike =
    directSpans.length >= 2 &&
    directSpans.every((span) => {
      const styleAttr = String(span.getAttribute("style") || "").toLowerCase();
      return /\bdisplay\s*:\s*(block|table|flex|grid|list-item)\b/.test(styleAttr);
    });

  if (hasOnlySpanChildren && spansAreBlockLike) {
    const parts = directSpans
      .map((span) => (span.textContent || "").trim())
      .filter((part) => part !== "");
    if (parts.length >= 2) return [parts[0], parts[1]];
  }

  return [];
}

function detectVerticalSplitForTextMode(sourceCells) {
  let hasVerticalSplit = false;
  const cellsWithSplit = [];

  sourceCells.forEach((sourceCell, cellIndex) => {
    const lines = extractCellLinesForTextMode(sourceCell);
    if (lines.length >= 2) {
      hasVerticalSplit = true;
      cellsWithSplit.push({
        index: cellIndex,
        topData: lines[0],
        bottomData: lines[1],
      });
    }
  });

  const firstCellSplit = cellsWithSplit.some((entry) => entry.index === 0);
  return {
    shouldSplit: hasVerticalSplit && firstCellSplit && cellsWithSplit.length > 0,
    cellsWithSplit,
  };
}

function extractPlainTextValue(sourceCell) {
  return (sourceCell.textContent || sourceCell.innerText || "").trim();
}

function buildDisplayTextPatch(sourceCell, displayText) {
  const normalized = isBlankPastedCellText(displayText) ? "" : String(displayText ?? "").trim();
  if (normalized === "") return emptyPatch();
  return { value: normalized };
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

function buildRowPatchesWithSpanOccupancy(sourceRows, maxCols) {
  const pendingRowspanCols = Array.from({ length: maxCols }, () => 0);
  const matrix = [];

  const buildOneOutputRow = (sourceCells, lineSelector = null) => {
    const row = Array.from({ length: maxCols }, () => emptyPatch());
    const occupiedFromPreviousRowspan = pendingRowspanCols.map((n) => n > 0);
    const occupiedCols = [...occupiedFromPreviousRowspan];

    occupiedFromPreviousRowspan.forEach((occupied, colIndex) => {
      if (occupied) row[colIndex] = emptyPatch();
    });

    let nextCol = 0;

    sourceCells.forEach((sourceCell, cellIndex) => {
      while (nextCol < maxCols && occupiedCols[nextCol]) nextCol += 1;
      if (nextCol >= maxCols) return;

      const colspan = Math.max(1, parseInt(sourceCell.getAttribute("colspan") || "1", 10) || 1);
      const rowspan = Math.max(1, parseInt(sourceCell.getAttribute("rowspan") || "1", 10) || 1);
      const displayText = typeof lineSelector === "function" ? lineSelector(cellIndex, sourceCell) : null;
      const patch =
        displayText != null ? buildDisplayTextPatch(sourceCell, displayText) : patchFromSourceCell(sourceCell);

      for (let offset = 0; offset < colspan; offset += 1) {
        const targetCol = nextCol + offset;
        if (targetCol >= maxCols) break;
        row[targetCol] = offset === 0 ? patch : emptyPatch();
        occupiedCols[targetCol] = true;
        if (rowspan > 1) {
          pendingRowspanCols[targetCol] = Math.max(pendingRowspanCols[targetCol], rowspan - 1);
        }
      }

      nextCol += colspan;
    });

    occupiedFromPreviousRowspan.forEach((occupied, colIndex) => {
      if (occupied && pendingRowspanCols[colIndex] > 0) {
        pendingRowspanCols[colIndex] -= 1;
      }
    });

    return row;
  };

  sourceRows.forEach((sourceRow) => {
    const sourceCells = Array.from(sourceRow.querySelectorAll("td, th"));
    const splitInfo = detectVerticalSplitForTextMode(sourceCells);

    if (!splitInfo.shouldSplit) {
      matrix.push(buildOneOutputRow(sourceCells));
      return;
    }

    const topRow = buildOneOutputRow(sourceCells, (cellIndex, sourceCell) => {
      const split = splitInfo.cellsWithSplit.find((entry) => entry.index === cellIndex);
      if (split) return split.topData;
      return extractPlainTextValue(sourceCell);
    });
    matrix.push(topRow);

    const bottomRow = buildOneOutputRow(sourceCells, (cellIndex, sourceCell) => {
      const split = splitInfo.cellsWithSplit.find((entry) => entry.index === cellIndex);
      if (split) return split.bottomData;
      return extractPlainTextValue(sourceCell);
    });
    matrix.push(bottomRow);
  });

  return matrix;
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

/**
 * 1.Text format-merge mode: keep Text-like display while expanding rowspan occupancy.
 */
export function parseAndFillHtmlTableForTextWithFormat(htmlString, anchorCell) {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const table = tempDiv.querySelector("table");
    if (!table) return false;

    const measured = measureTopLevelTables(tempDiv);
    if (!measured) return false;

    const { allRows, maxCols } = measured;
    const dataMatrix = buildRowPatchesWithSpanOccupancy(allRows, maxCols);

    const { successCount, maxRows, maxCols: cols } = applyDataMatrixToGrid(dataMatrix, anchorCell, {
      trimValues: false,
      uppercaseValues: false,
      alignTotalRows: false,
    });

    if (successCount > 0) {
      notifyPasteSuccess(
        `成功粘贴 ${successCount} 个单元格 (${maxRows} 行 x ${cols} 列)，已按1.Text显示并兼容合并格占位!`,
      );
      recomputeSubmitStateAfterPaste();
      return true;
    }

    return false;
  } catch (err) {
    console.error("1.Text format-merge: Error parsing HTML table:", err);
    return false;
  }
}
