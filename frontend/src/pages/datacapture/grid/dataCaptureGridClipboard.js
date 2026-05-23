/**
 * Context menu clipboard actions — extracted from js/datacapture.js.
 */
import { hideContextMenu } from "../lib/dataCaptureContextMenu.js";
import {
  clearAllSelections,
  getSelectedCellCount,
  getSelectedCells,
  registerSelectedCell,
} from "./dataCaptureGridSelection.js";

function recomputeSubmitState() {
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}

export function copySelectedCells() {
  if (getSelectedCellCount() === 0) return;

  const cellPositions = getSelectedCells().map((cell) => {
    const row = cell.parentNode;
    const table = row.parentNode;
    const rowIndex = Array.from(table.children).indexOf(row);
    const colIndex = parseInt(cell.dataset.col, 10);
    return { row: rowIndex, col: colIndex, value: cell.textContent };
  });

  const rows = cellPositions.map((pos) => pos.row);
  const cols = cellPositions.map((pos) => pos.col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);

  const dataMatrix = [];
  for (let ri = minRow; ri <= maxRow; ri++) {
    const row = [];
    for (let ci = minCol; ci <= maxCol; ci++) {
      const cellPos = cellPositions.find((pos) => pos.row === ri && pos.col === ci);
      row.push(cellPos ? cellPos.value : "");
    }
    dataMatrix.push(row);
  }

  const textData = dataMatrix.map((row) => row.join("\t")).join("\n");

  navigator.clipboard.writeText(textData).then(() => {
    window.__DC_SET_COPIED_DATA__?.({ data: dataMatrix, minRow, maxRow, minCol, maxCol });
  }).catch((err) => {
    console.error("Failed to copy to clipboard:", err);
  });
}

function resolvePasteAnchorCell() {
  const selected = getSelectedCells()[0];
  if (selected?.contentEditable === "true" && selected.closest("#dataTable")) {
    return selected;
  }

  const active = document.activeElement;
  if (
    active?.contentEditable === "true" &&
    active.closest("#dataTable")
  ) {
    return active;
  }

  const tableBody = document.getElementById("tableBody");
  const firstRow = tableBody?.children[0];
  return firstRow?.children[1] ?? null;
}

async function readClipboardForPaste() {
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      let text = "";
      let html = "";
      for (const item of items) {
        if (item.types.includes("text/plain")) {
          text = await (await item.getType("text/plain")).text();
        }
        if (item.types.includes("text/html")) {
          html = await (await item.getType("text/html")).text();
        }
      }
      return { text, html };
    } catch {
      /* fall through to readText */
    }
  }

  const text = await navigator.clipboard.readText();
  return { text, html: "" };
}

export function pasteToSelectedCells() {
  const anchorCell = resolvePasteAnchorCell();
  if (!anchorCell) return;

  if (getSelectedCellCount() === 0) {
    window.__DC_SET_TABLE_ACTIVE__?.(true);
    window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS__?.(anchorCell);
    registerSelectedCell(anchorCell);
    anchorCell.classList.add("multi-selected");
  }

  readClipboardForPaste()
    .then(({ text, html }) => {
      const mockEvent = {
        preventDefault() {},
        stopPropagation() {},
        clipboardData: {
          types: html ? ["text/plain", "text/html"] : ["text/plain"],
          getData(type) {
            if (type === "text/html") return html;
            if (type === "text/plain" || type === "text" || type === "Text") {
              return text;
            }
            return "";
          },
        },
        target: anchorCell,
      };
      window.__DC_HANDLE_CELL_PASTE__?.(mockEvent);
    })
    .catch((err) => {
      console.error("Failed to read from clipboard:", err);
      window.showNotification?.("Failed to access clipboard", "danger");
    });

  hideContextMenu();
}

export function clearSelectedCells() {
  const cellsToClear = getSelectedCells().filter(
    (cell) => cell && cell.contentEditable === "true" && cell.closest("#dataTable"),
  );

  cellsToClear.forEach((cell) => {
    cell.textContent = "";
  });

  hideContextMenu();
  recomputeSubmitState();
}

export function selectAllCells(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  clearAllSelections();

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) {
    hideContextMenu();
    return;
  }

  const allCells = tableBody.querySelectorAll("td[contenteditable='true']");
  if (allCells.length === 0) {
    hideContextMenu();
    return;
  }

  allCells.forEach((cell) => {
    registerSelectedCell(cell);
    cell.classList.add("multi-selected");
  });

  hideContextMenu();
}
