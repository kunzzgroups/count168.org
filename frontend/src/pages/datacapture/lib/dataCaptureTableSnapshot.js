import { convertBracketedToNegative } from "./dataCaptureBracket.js";
import { normalizeStoredCaptureType } from "./dataCaptureStorage.js";

/**
 * Reads the Excel grid DOM for submit / restore snapshots.
 */
export function captureTableDataFromDom(captureType) {
  const currentDataCaptureType = normalizeStoredCaptureType(captureType);
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
      if (cell.style.display === "none") return;

      let cellValue = convertBracketedToNegative((cell.textContent || "").toUpperCase());
      const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);

      rowData.push({
        type: "data",
        value: cellValue,
        col: colIndex - 1,
        colspan: colspan > 1 ? colspan : undefined,
      });
    });

    if (
      (currentDataCaptureType === "1.Text" ||
        currentDataCaptureType === "2.Format" ||
        currentDataCaptureType === "4.RETURN") &&
      rowData.length > 1
    ) {
      const firstDataCell = rowData[1];
      if (firstDataCell?.type === "data" && (firstDataCell.value || "").trim() === "") {
        for (let i = 2; i < rowData.length; i += 1) {
          const cell = rowData[i];
          if (cell?.type === "data" && (cell.value || "").trim() !== "") {
            const firstValue = firstDataCell.value;
            const targetValue = cell.value;
            firstDataCell.value = targetValue;
            cell.value = firstValue;
            const firstColspan = firstDataCell.colspan;
            const targetColspan = cell.colspan;
            firstDataCell.colspan = targetColspan;
            cell.colspan = firstColspan;
            const firstCol = firstDataCell.col;
            const targetCol = cell.col;
            firstDataCell.col = targetCol;
            cell.col = firstCol;
            console.log(
              `${currentDataCaptureType}: Row ${rowIndex} - adjusted id product from column ${targetCol + 1} (value: "${targetValue}") to first column`
            );
            break;
          }
        }
      }
    }

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
