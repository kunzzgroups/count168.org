/**
 * Build #dataTable grid DOM — SPA replacement for legacy buildDataCaptureTable.
 */
import { getRowLabel } from "./dataCaptureGridMeta.js";

let mouseUpBound = false;

export function buildDataCaptureTable(rows = 26, cols = 20) {
  const r = Math.max(1, Number(rows) || 26);
  const c = Math.max(1, Number(cols) || 20);

  const tableBody = document.getElementById("tableBody");
  const tableHeader = document.getElementById("tableHeader");
  if (!tableBody || !tableHeader) {
    console.error("Table elements not found!");
    return;
  }

  window.__DC_CLEAR_ALL_SELECTIONS__?.();
  window.__DC_CLEAR_PASTE_HISTORY__?.();

  tableBody.innerHTML = "";

  let headerRow = tableHeader.querySelector("tr");
  if (!headerRow) {
    headerRow = document.createElement("tr");
    tableHeader.appendChild(headerRow);
  }
  headerRow.innerHTML = "<th></th>";

  for (let j = 0; j < c; j++) {
    const header = document.createElement("th");
    header.textContent = String(j + 1);
    window.__DC_GRID_ATTACH_COLUMN_HEADER__?.(header);
    headerRow.appendChild(header);
  }

  for (let i = 1; i <= r; i++) {
    const row = document.createElement("tr");

    const rowHeader = document.createElement("td");
    rowHeader.className = "row-header";
    rowHeader.textContent = getRowLabel(i - 1);
    window.__DC_GRID_ATTACH_ROW_HEADER__?.(rowHeader);
    row.appendChild(rowHeader);

    for (let j = 0; j < c; j++) {
      const cell = document.createElement("td");
      cell.contentEditable = true;
      cell.dataset.col = String(j);
      window.__DC_LEGACY_BIND_CELL__?.(cell);
      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }

  if (!mouseUpBound) {
    document.addEventListener("mouseup", () => window.__DC_HANDLE_MOUSE_UP__?.());
    mouseUpBound = true;
  }
}
