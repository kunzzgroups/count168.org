import { convertBracketedToNegative } from "./dataCaptureBracket.js";
import { normalizeStoredCaptureType } from "./dataCaptureStorage.js";

const FORMAT_LABEL_FIRST_COLUMNS = new Set(["AGENT", "PLAYER", "MEMBER", "USER"]);

function resolveSnapshotCaptureType(captureType) {
  return (
    normalizeStoredCaptureType(captureType) ||
    normalizeStoredCaptureType(window.__DC_GET_CAPTURE_TYPE__?.()) ||
    "1.Text"
  );
}

function readEditableCellValue(cell) {
  if (!cell) return "";
  const text = (cell.textContent || cell.innerText || "").trim();
  if (text) return text;
  const html = cell.innerHTML || "";
  if (!html.includes("<")) return "";
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "").trim();
}

function isPlaceholderIdColumn(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;
  if (/^\d{1,2}$/.test(trimmed)) return true;
  return FORMAT_LABEL_FIRST_COLUMNS.has(trimmed.toUpperCase());
}

function swapRowDataCells(a, b) {
  const tempValue = a.value;
  a.value = b.value;
  b.value = tempValue;
  const tempColspan = a.colspan;
  a.colspan = b.colspan;
  b.colspan = tempColspan;
  const tempCol = a.col;
  a.col = b.col;
  b.col = tempCol;
}

/** Move first real id product into column A for Text / Format / Return rows. */
function normalizeIdProductColumnForRow(rowData, captureType, rowIndex) {
  if (!["1.Text", "2.Format", "4.RETURN"].includes(captureType) || rowData.length <= 1) {
    return;
  }

  const firstDataCell = rowData[1];
  if (firstDataCell?.type !== "data") return;

  if (isPlaceholderIdColumn(firstDataCell.value)) {
    for (let i = 2; i < rowData.length; i += 1) {
      const cell = rowData[i];
      if (cell?.type !== "data") continue;
      const candidate = String(cell.value || "").trim();
      if (!candidate || FORMAT_LABEL_FIRST_COLUMNS.has(candidate.toUpperCase())) continue;
      swapRowDataCells(firstDataCell, cell);
      console.log(
        `${captureType}: Row ${rowIndex} - adjusted id product from column ${cell.col + 1} (value: "${candidate}") to first column`
      );
      return;
    }
  }
}

/**
 * Reads the Excel grid DOM for submit / restore snapshots.
 */
export function captureTableDataFromDom(captureType) {
  const currentDataCaptureType = resolveSnapshotCaptureType(captureType);
  const table = document.getElementById("dataTable");
  const tableData = {
    headers: [],
    rows: [],
    rowCount: 0,
    colCount: 0,
  };

  if (!table) return tableData;

  const headerRow = table.querySelector("thead tr");
  if (headerRow) {
    headerRow.querySelectorAll("th").forEach((header) => {
      tableData.headers.push(header.textContent);
    });
  }

  const tbody = table.querySelector("tbody");
  if (!tbody) return tableData;

  const rows = tbody.querySelectorAll("tr");
  tableData.rowCount = rows.length;

  let maxDataCols = 0;
  const allRowData = [];

  rows.forEach((row, rowIndex) => {
    const rowData = [];
    const cells = row.querySelectorAll("td");

    cells.forEach((cell, colIndex) => {
      if (colIndex === 0) {
        rowData.push({ type: "header", value: cell.textContent });
        return;
      }

      const hidden = cell.style.display === "none";
      const rawValue = readEditableCellValue(cell);
      if (hidden && !rawValue) return;

      let cellValue = convertBracketedToNegative(rawValue.toUpperCase());
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

      rowData.push({
        type: "data",
        value: cellValue,
        col: colIndex - 1,
        colspan: colspan > 1 ? colspan : undefined,
      });
    });

    normalizeIdProductColumnForRow(rowData, currentDataCaptureType, rowIndex);

    const dataCols = rowData.length - 1;
    if (dataCols > maxDataCols) maxDataCols = dataCols;
    allRowData.push(rowData);
  });

  allRowData.forEach((rowData) => {
    const currentDataCols = rowData.length - 1;
    if (currentDataCols < maxDataCols) {
      for (let i = currentDataCols; i < maxDataCols; i += 1) {
        rowData.push({ type: "data", value: "", col: i });
      }
    }
  });

  tableData.colCount = maxDataCols + 1;

  if (headerRow) {
    const currentHeaderCount = tableData.headers.length;
    if (currentHeaderCount < tableData.colCount) {
      for (let i = currentHeaderCount; i < tableData.colCount; i += 1) {
        tableData.headers.push(i === 0 ? "" : String(i));
      }
    } else if (currentHeaderCount > tableData.colCount) {
      tableData.headers = tableData.headers.slice(0, tableData.colCount);
    }
  }

  tableData.rows = allRowData;
  return tableData;
}

export function tableSnapshotHasData(tableData) {
  if (!tableData?.rows?.length) return false;
  return tableData.rows.some((row) =>
    row.some((cell) => cell.type === "data" && String(cell.value || "").trim() !== "")
  );
}
