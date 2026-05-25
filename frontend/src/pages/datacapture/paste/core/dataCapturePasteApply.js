import { MAX_GRID_ROWS } from "../../grid/dataCaptureGridMeta.js";
import { readGridDimensions } from "../../grid/dataCaptureGridSnapshot.js";
import { insertColumnAt, insertRowAt } from "../../grid/dataCaptureGridRowColumnCrud.js";

/** Shared grid helpers for paste modules (no legacy script required). */
export function ensurePasteGrid(rows, cols) {
  const targetRows = Math.max(1, Math.min(Number(rows) || 1, MAX_GRID_ROWS));
  const targetCols = Math.max(1, Number(cols) || 1);
  const { rows: currentRows, cols: currentCols } = readGridDimensions();

  if (currentRows === 0 || currentCols === 0) {
    window.__DC_INITIALIZE_TABLE__?.(targetRows, targetCols);
    return;
  }

  if (targetRows <= currentRows && targetCols <= currentCols) return;

  const hasExistingData = findLastFilledGridRow() >= 0;

  if (!hasExistingData) {
    window.__DC_INITIALIZE_TABLE__?.(targetRows, targetCols);
    return;
  }

  for (let colIndex = currentCols; colIndex < targetCols; colIndex += 1) {
    insertColumnAt(colIndex);
  }

  for (let rowIndex = currentRows; rowIndex < targetRows; rowIndex += 1) {
    insertRowAt(rowIndex);
  }
}

export function parseGenericHtmlTable(htmlString, startCell) {
  if (typeof window.__DC_PARSE_GENERIC_HTML__ === "function") {
    return window.__DC_PARSE_GENERIC_HTML__(htmlString, startCell);
  }
  return false;
}

function getGridSize() {
  const rows = document.querySelectorAll("#tableBody tr").length;
  const cols = document.querySelectorAll("#tableHeader th").length - 1;
  return { rows, cols };
}

export function resolvePasteAnchor(cell) {
  if (!cell?.parentNode?.parentNode) return { startRow: 0, startCol: 0 };
  const startRow = Array.from(cell.parentNode.parentNode.children).indexOf(cell.parentNode);
  const startCol = Number.parseInt(cell.dataset.col, 10);
  return {
    startRow: startRow >= 0 ? startRow : 0,
    startCol: Number.isFinite(startCol) ? startCol : 0,
  };
}

/** Last tbody row index that has any editable cell content. */
export function findLastFilledGridRow() {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return -1;

  const rows = Array.from(tableBody.children);
  for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const hasData = Array.from(rows[rowIndex].querySelectorAll('td[contenteditable="true"]')).some(
      (cell) => String(cell.textContent || "").trim() !== ""
    );
    if (hasData) return rowIndex;
  }
  return -1;
}

/** Active/selected grid cell used as 2.Format paste anchor, if any. */
export function getFormatPasteAnchorCell() {
  const active = document.activeElement;
  if (active?.contentEditable === "true" && active.closest("#dataTable")) {
    return active;
  }

  const selected = window.__DC_GET_SELECTED_CELLS__?.()?.[0];
  if (selected?.contentEditable === "true" && selected.closest("#dataTable")) {
    return selected;
  }

  return null;
}

/** Selected/active grid cell, else first editable cell (row A, col 1). */
export function getDefaultPasteAnchorCell() {
  const anchor = getFormatPasteAnchorCell();
  if (anchor) return anchor;

  const tableBody = document.getElementById("tableBody");
  const firstRow = tableBody?.children?.[0];
  const firstCell = firstRow?.querySelector?.('td[contenteditable="true"]');
  return firstCell || null;
}

/** Whether a tbody row has any non-empty editable cell. */
export function rowHasEditableData(rowEl) {
  if (!rowEl) return false;
  return Array.from(rowEl.querySelectorAll('td[contenteditable="true"]')).some(
    (cell) => String(cell.textContent || "").trim() !== ""
  );
}

/**
 * 2.Format paste start row.
 * When grid already has data, append after the last filled row unless the anchor
 * sits on an empty row below all existing data.
 */
export function resolveFormatPasteStartRow(anchorCell = null) {
  const lastFilled = findLastFilledGridRow();
  const appendRow = lastFilled >= 0 ? lastFilled + 1 : 0;

  const cell = anchorCell || getFormatPasteAnchorCell();
  if (!cell?.closest?.("#tableBody")) {
    return appendRow;
  }

  const anchorRow = resolvePasteAnchor(cell).startRow;
  if (lastFilled < 0) {
    return anchorRow;
  }

  if (anchorRow > lastFilled) {
    return anchorRow;
  }

  const anchorRowEl = cell.closest("tr");
  if (anchorRowEl && !rowHasEditableData(anchorRowEl) && anchorRow >= appendRow) {
    return anchorRow;
  }

  return appendRow;
}

export function ensureGridFits(startRow, startCol, matrixRows, matrixCols) {
  const { rows: currentRows, cols: currentCols } = getGridSize();
  const requiredRows = startRow + matrixRows;
  const requiredCols = startCol + matrixCols;
  if (requiredRows <= currentRows && requiredCols <= currentCols) return;

  const targetRows = Math.max(currentRows, Math.min(requiredRows, MAX_GRID_ROWS));
  const targetCols = Math.max(currentCols, requiredCols);
  ensurePasteGrid(targetRows, targetCols);
}

/**
 * Fill editable cells from a 2D matrix.
 * @returns {{ successCount: number, changes: Array }}
 */
export function applyDataMatrixToGrid(dataMatrix, anchorCell, options = {}) {
  const {
    startColOverride = null,
    uppercaseValues = false,
    trimValues = false,
  } = options;

  if (!dataMatrix?.length) return { successCount: 0, changes: [] };

  const maxCols = Math.max(...dataMatrix.map((row) => row.length));
  const { startRow, startCol: anchorCol } = resolvePasteAnchor(anchorCell);
  const startCol = startColOverride != null ? startColOverride : anchorCol;

  ensureGridFits(startRow, startCol, dataMatrix.length, maxCols);

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return { successCount: 0, changes: [] };

  const changes = [];
  let successCount = 0;

  dataMatrix.forEach((rowData, rowIndex) => {
    const actualRowIndex = startRow + rowIndex;
    const tableRow = tableBody.children[actualRowIndex];
    if (!tableRow) return;

    rowData.forEach((cellData, colIndex) => {
      const actualColIndex = startCol + colIndex;
      const cell = tableRow.children[actualColIndex + 1];
      if (!cell || cell.contentEditable !== "true") return;

      let cellValue = cellData ?? "";
      if (trimValues) cellValue = String(cellValue).trim();
      if (uppercaseValues) cellValue = String(cellValue).toUpperCase();

      changes.push({
        row: actualRowIndex,
        col: actualColIndex,
        oldValue: cell.textContent,
        newValue: cellValue,
      });
      cell.textContent = cellValue;
      if (cellValue) successCount += 1;
    });
  });

  if (changes.length > 0) {
    window.__DC_PUSH_PASTE_HISTORY__?.(changes);
  }
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();

  return { successCount, changes, maxRows: dataMatrix.length, maxCols };
}

export function notifyPasteSuccess(message, level = "success") {
  if (typeof window.showNotification === "function") {
    window.showNotification(message, level);
  }
}
