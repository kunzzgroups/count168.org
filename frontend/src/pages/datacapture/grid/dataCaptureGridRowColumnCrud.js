/**
 * Row/column insert, delete, clear — extracted from js/datacapture.js (Phase 5c).
 * Re-run: node frontend/scripts/extract-grid-row-column-crud.mjs
 */
import { getRowLabel } from "./dataCaptureGridMeta.js";
import { hideContextMenu } from "../lib/dataCaptureContextMenu.js";
import { clearAllSelections } from "./dataCaptureGridSelection.js";
import {
  attachColumnHeaderListeners,
  attachRowHeaderListeners,
  rebindColumnHeadersAfterMutation,
  rebindRowHeadersAfterMutation,
} from "./dataCaptureGridHeaderBinding.js";
import { bindDataCaptureCellEvents } from "./dataCaptureGridCellBinding.js";

function getContextMenuColumn() {
  return window.__DC_GET_CONTEXT_MENU_COLUMN__?.() ?? null;
}

function getContextMenuRow() {
  return window.__DC_GET_CONTEXT_MENU_ROW__?.() ?? null;
}

function recomputeSubmitState() {
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}

function getColumnIndexFromHeader(header) {
  const headerRow = document.querySelector("#tableHeader tr");
  if (!headerRow) return -1;
  const headers = Array.from(headerRow.children);
  const index = headers.indexOf(header);
  return index > 0 ? index - 1 : -1;
}

function getRowIndexFromHeader(rowHeader) {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return -1;
  const rows = Array.from(tableBody.children);
  for (let i = 0; i < rows.length; i++) {
    const rh = rows[i].querySelector(".row-header");
    if (rh === rowHeader) return i;
  }
  return -1;
}

function insertColumnAt(colIndex) {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    if (!tableHeader || !tableBody) return;

    const headerRow = tableHeader.querySelector('tr');
    const currentCols = headerRow.children.length - 1;

    // Create new column header
    const newHeader = document.createElement('th');
    attachColumnHeaderListeners(newHeader);

    // Insert header
    if (colIndex >= currentCols) {
        headerRow.appendChild(newHeader);
    } else {
        headerRow.insertBefore(newHeader, headerRow.children[colIndex + 1]);
    }

    // Update column indices and insert cells
    Array.from(tableBody.children).forEach((row, rowIndex) => {
        const newCell = document.createElement('td');
        newCell.contentEditable = true;
        newCell.dataset.col = colIndex;

        // Update dataset.col for all cells after this column
        for (let c = colIndex; c < row.children.length - 1; c++) {
            const cell = row.children[c + 1];
            if (cell && cell.contentEditable === 'true') {
                const oldCol = parseInt(cell.dataset.col);
                if (!isNaN(oldCol) && oldCol >= colIndex) {
                    cell.dataset.col = oldCol + 1;
                }
            }
        }

        // Add event listeners to new cell
        bindDataCaptureCellEvents(newCell);

        // Insert cell
        if (colIndex >= row.children.length - 1) {
            row.appendChild(newCell);
        } else {
            row.insertBefore(newCell, row.children[colIndex + 1]);
        }
    });

    rebindColumnHeadersAfterMutation(headerRow);
}

export function deleteColumn() {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    if (!tableHeader || !tableBody) return;

    const headerRow = tableHeader.querySelector('tr');
    if (!headerRow) return;

    // Get all selected columns
    const selectedHeaders = Array.from(headerRow.querySelectorAll('th.column-selected'));
    if (selectedHeaders.length === 0) {
        // If no columns are selected, use getContextMenuColumn() as fallback
        if (getContextMenuColumn() === null) return;
        selectedHeaders.push(headerRow.children[getContextMenuColumn() + 1]);
    }

    // Get column indices from selected headers (from back to front for safe deletion)
    const selectedIndices = selectedHeaders
        .map(header => getColumnIndexFromHeader(header))
        .filter(index => index >= 0)
        .sort((a, b) => b - a); // Sort descending to delete from back to front

    if (selectedIndices.length === 0) return;

    const currentCols = headerRow.children.length - 1;
    const remainingCols = currentCols - selectedIndices.length;

    if (remainingCols < 1) {
        window.showNotification?.('Cannot delete the last column', 'danger');
        hideContextMenu();
        return;
    }

    // Delete columns from back to front
    selectedIndices.forEach(colIndex => {
        // Remove column header
        const headerToRemove = headerRow.children[colIndex + 1];
        if (headerToRemove) {
            headerToRemove.remove();
        }

        // Remove cells from each row
        Array.from(tableBody.children).forEach(row => {
            const cellToRemove = row.children[colIndex + 1];
            if (cellToRemove) {
                cellToRemove.remove();
            }
        });
    });

    // Update dataset.col for all remaining cells
    Array.from(tableBody.children).forEach(row => {
        for (let c = 1; c < row.children.length - 1; c++) {
            const cell = row.children[c];
            if (cell && cell.contentEditable === 'true') {
                const oldCol = parseInt(cell.dataset.col);
                if (!isNaN(oldCol)) {
                    // Count how many deleted columns were before this column
                    const deletedBefore = selectedIndices.filter(idx => idx < oldCol).length;
                    cell.dataset.col = oldCol - deletedBefore;
                }
            }
        }
    });

    rebindColumnHeadersAfterMutation(headerRow);

    clearAllSelections();
    hideContextMenu();
}

export function clearColumn() {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    if (!tableHeader || !tableBody) return;

    const headerRow = tableHeader.querySelector('tr');
    if (!headerRow) return;

    // Get all selected columns
    const selectedHeaders = Array.from(headerRow.querySelectorAll('th.column-selected'));
    if (selectedHeaders.length === 0) {
        // If no columns are selected, use getContextMenuColumn() as fallback
        if (getContextMenuColumn() === null) return;
        selectedHeaders.push(headerRow.children[getContextMenuColumn() + 1]);
    }

    // Get column indices from selected headers
    const selectedIndices = selectedHeaders
        .map(header => getColumnIndexFromHeader(header))
        .filter(index => index >= 0);

    if (selectedIndices.length === 0) return;

    // Clear all selected columns
    selectedIndices.forEach(colIndex => {
        Array.from(tableBody.children).forEach(row => {
            const cell = row.children[colIndex + 1];
            if (cell && cell.contentEditable === 'true') {
                cell.textContent = '';
            }
        });
    });

    hideContextMenu();
    recomputeSubmitState();
}

function insertRowAt(rowIndex) {
    const tableBody = document.getElementById('tableBody');
    const tableHeader = document.getElementById('tableHeader');
    if (!tableBody || !tableHeader) return;

    const currentRows = tableBody.children.length;
    const currentCols = document.querySelectorAll('#tableHeader th').length - 1;

    // Create new row
    const row = document.createElement('tr');

    // Row header
    const rowHeader = document.createElement('td');
    rowHeader.className = 'row-header';
    rowHeader.textContent = getRowLabel(rowIndex);
    attachRowHeaderListeners(rowHeader);
    row.appendChild(rowHeader);

    // Data cells
    for (let j = 0; j < currentCols; j++) {
        const cell = document.createElement('td');
        cell.contentEditable = true;
        cell.dataset.col = j;
        bindDataCaptureCellEvents(cell);
        row.appendChild(cell);
    }

    // Insert row
    if (rowIndex >= currentRows) {
        tableBody.appendChild(row);
    } else {
        tableBody.insertBefore(row, tableBody.children[rowIndex]);
    }

    rebindRowHeadersAfterMutation(tableBody);
}

export function deleteRow() {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    // Get all selected rows
    const selectedRowHeaders = Array.from(document.querySelectorAll('.row-header.row-selected'));
    let selectedIndices = [];

    if (selectedRowHeaders.length === 0) {
        // If no rows are selected, use getContextMenuRow() as fallback
        if (getContextMenuRow() === null) return;
        selectedIndices = [getContextMenuRow()];
    } else {
        // Get row indices from selected row headers (from back to front for safe deletion)
        selectedIndices = selectedRowHeaders
            .map(rowHeader => getRowIndexFromHeader(rowHeader))
            .filter(index => index >= 0)
            .sort((a, b) => b - a); // Sort descending to delete from back to front
    }

    if (selectedIndices.length === 0) return;

    const currentRows = tableBody.children.length;
    const remainingRows = currentRows - selectedIndices.length;

    if (remainingRows < 1) {
        window.showNotification?.('Cannot delete the last row', 'danger');
        hideContextMenu();
        return;
    }

    // Delete rows from back to front
    selectedIndices.forEach(rowIndex => {
        const rowToRemove = tableBody.children[rowIndex];
        if (rowToRemove) {
            rowToRemove.remove();
        }
    });

    rebindRowHeadersAfterMutation(tableBody);

    clearAllSelections();
    hideContextMenu();
}

export function clearRow() {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    // Get all selected rows
    const selectedRowHeaders = Array.from(document.querySelectorAll('.row-header.row-selected'));
    let selectedIndices = [];

    if (selectedRowHeaders.length === 0) {
        // If no rows are selected, use getContextMenuRow() as fallback
        if (getContextMenuRow() === null) return;
        selectedIndices = [getContextMenuRow()];
    } else {
        // Get row indices from selected row headers
        selectedIndices = selectedRowHeaders
            .map(rowHeader => getRowIndexFromHeader(rowHeader))
            .filter(index => index >= 0);
    }

    if (selectedIndices.length === 0) return;

    // Clear all selected rows
    selectedIndices.forEach(rowIndex => {
        const row = tableBody.children[rowIndex];
        if (row) {
            Array.from(row.children).forEach(cell => {
                if (cell && cell.contentEditable === 'true') {
                    cell.textContent = '';
                }
            });
        }
    });

    hideContextMenu();
    recomputeSubmitState();
}

export function insertColumnLeft() {
  const col = getContextMenuColumn();
  if (col === null) return;
  insertColumnAt(col);
  hideContextMenu();
}

export function insertColumnRight() {
  const col = getContextMenuColumn();
  if (col === null) return;
  insertColumnAt(col + 1);
  hideContextMenu();
}

export function insertRowAbove() {
  const row = getContextMenuRow();
  if (row === null) return;
  insertRowAt(row);
  hideContextMenu();
}

export function insertRowBelow() {
  const row = getContextMenuRow();
  if (row === null) return;
  insertRowAt(row + 1);
  hideContextMenu();
}

/** Append a row at the bottom (keyboard Tab/Enter). Returns new row index. */
export function appendGridRow() {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return null;
  const rowIndex = tableBody.children.length;
  insertRowAt(rowIndex);
  return rowIndex;
}

/** Append a column at the right edge. Returns new column index. */
export function appendGridColumn() {
  const currentCols = document.querySelectorAll("#tableHeader th").length - 1;
  insertColumnAt(currentCols);
  return currentCols;
}

export { insertColumnAt, insertRowAt };
