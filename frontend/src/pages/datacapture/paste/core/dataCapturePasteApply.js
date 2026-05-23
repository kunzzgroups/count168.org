import { MAX_GRID_ROWS } from "../../grid/dataCaptureGridMeta.js";

/** Shared grid helpers for paste modules (no legacy script required). */
export function ensurePasteGrid(rows, cols) {
  if (typeof window.__DC_INITIALIZE_TABLE__ === "function") {
    window.__DC_INITIALIZE_TABLE__(rows, cols);
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
