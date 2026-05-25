/**
 * Reset / restore grid snapshot — extracted from js/datacapture.js (Phase 5g).
 */
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS } from "./dataCaptureGridMeta.js";
import { clearAllSelections } from "./dataCaptureGridSelection.js";
import {
  clearEditableGridCells,
  populateGridFromSnapshot,
} from "./dataCaptureGridSnapshot.js";
import { clearFormatPreviewHtml, setFormatPreviewHtml } from "../format/dataCaptureFormat.js";
import {
  clearFormatStyles,
  setFormatGridReady,
  toggleTableDisplayForFormat,
} from "../format/dataCaptureFormat.js";
import { renderFormatPreview } from "../paste/core/dataCaptureFormatPreview.js";
import { normalizeCaptureType } from "../lib/dataCaptureFormRules.js";
import {
  buildFormatPreviewHtmlFromTableSnapshot,
  snapshotDataCellDomIndex,
} from "../lib/dataCaptureTableSnapshot.js";

function rebuildDefaultColumnHeaders(headerRow) {
  headerRow.innerHTML = "<th></th>";
  for (let j = 0; j < DEFAULT_GRID_COLS; j += 1) {
    const header = document.createElement("th");
    header.textContent = String(j + 1);
    window.__DC_GRID_ATTACH_COLUMN_HEADER__?.(header);
    headerRow.appendChild(header);
  }
}

export function clearCaptureTableForReset() {
  clearEditableGridCells();

  const tableHeader = document.getElementById("tableHeader");
  if (tableHeader) {
    const headerRow = tableHeader.querySelector("tr");
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll("th");
      const currentCols = headerCells.length - 1;

      headerCells.forEach((cell, index) => {
        if (index === 0) return;
        cell.removeAttribute("style");
        const essentialClasses = ["column-selected", "column-active"];
        Array.from(cell.classList).forEach((cls) => {
          if (!essentialClasses.includes(cls)) {
            cell.classList.remove(cls);
          }
        });
        cell.textContent = String(index);
        cell.innerHTML = String(index);
      });

      if (currentCols === 0) {
        rebuildDefaultColumnHeaders(headerRow);
      }
    }
  }

  clearFormatStyles();

  const pasteAreaFormat = document.getElementById("pasteAreaFormat");
  if (pasteAreaFormat) {
    pasteAreaFormat.innerHTML = "";
  }

  const tablePreviewFormat = document.getElementById("tablePreviewFormat");
  if (tablePreviewFormat) {
    tablePreviewFormat.innerHTML = "";
    tablePreviewFormat.style.display = "none";
  }

  renderFormatPreview("");

  const captureType = window.__DC_GET_CAPTURE_TYPE__?.() || "1.Text";
  if (captureType === "2.Format") {
    clearFormatPreviewHtml();
  }

  setFormatGridReady(false);
  clearAllSelections();
}

export async function restoreCaptureTableFromData(tableData, savedType) {
  const type = normalizeCaptureType(savedType || "1.Text") || "1.Text";

  if (!tableData?.rows?.length) {
    if (type) window.__DC_APPLY_CAPTURE_TYPE__?.(type);
    window.__DC_ENSURE_GRID_READY__?.(DEFAULT_GRID_ROWS, DEFAULT_GRID_COLS);
    return;
  }

  const requiredRows = tableData.rowCount || tableData.rows.length;
  const requiredCols = Math.max(
    tableData.colCount || (tableData.headers ? tableData.headers.length - 1 : 15),
    15,
  );

  if (typeof window.__DC_INITIALIZE_TABLE__ === "function") {
    window.__DC_INITIALIZE_TABLE__(requiredRows, requiredCols);
  } else {
    window.__DC_ENSURE_GRID_READY__?.(requiredRows, requiredCols);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

  const populated = populateGridFromSnapshot(tableData);

  const tableBody = document.getElementById("tableBody");
  if (!populated && tableBody) {
    tableData.rows.forEach((rowData, rowIndex) => {
      const tableRow = tableBody.children[rowIndex];
      if (!tableRow) return;

      rowData.forEach((cellData, colIndex) => {
        if (cellData.type !== "data") return;
        const domColIndex = snapshotDataCellDomIndex(cellData, colIndex);
        if (domColIndex == null) return;
        const cell = tableRow.children[domColIndex];
        if (!cell || cell.contentEditable !== "true") return;

        cell.removeAttribute("colspan");
        cell.style.display = "";
        if (cellData.colspan && cellData.colspan > 1) {
          cell.setAttribute("colspan", String(cellData.colspan));
          for (let i = 1; i < cellData.colspan; i += 1) {
            const hiddenCellIndex = domColIndex + i;
            if (tableRow.children[hiddenCellIndex]) {
              tableRow.children[hiddenCellIndex].style.display = "none";
            }
          }
        }
        cell.textContent = cellData.value || "";
      });
    });
  }

  if (tableBody) {
    let hasData = false;
    tableData.rows.forEach((rowData) => {
      if (hasData) return;
      rowData.forEach((cellData) => {
        if (cellData.type === "data" && cellData.value && cellData.value.trim() !== "") {
          hasData = true;
        }
      });
    });

    if (hasData) {
      setFormatGridReady(true);
      try {
        const html = buildFormatPreviewHtmlFromTableSnapshot(tableData);
        if (html) {
          setFormatPreviewHtml(html);
          renderFormatPreview(html);
        }
      } catch {
        /* ignore */
      }
    } else {
      setFormatGridReady(false);
      clearFormatPreviewHtml();
    }

    setTimeout(() => {
      window.__DC_FIX_CITIBET_AMOUNTS__?.();
    }, 200);
  }

  if (type) {
    window.__DC_APPLY_CAPTURE_TYPE__?.(type);
  }

  const captureType = window.__DC_GET_CAPTURE_TYPE__?.() || type;
  if (captureType === "2.Format") {
    setTimeout(() => {
      toggleTableDisplayForFormat();
    }, 100);
  }
}
