/**
 * Read / write grid cell values from the DOM table (#dataTable).
 */

export function readGridDimensions() {
  const tableBody = document.getElementById("tableBody");
  const headerRow = document.getElementById("tableHeader")?.querySelector("tr");
  const rows = tableBody ? tableBody.children.length : 0;
  const cols = headerRow ? Math.max(0, headerRow.children.length - 1) : 0;
  return { rows, cols };
}

export function clearEditableGridCells() {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return;

  tableBody.querySelectorAll('td[contenteditable="true"]').forEach((cell) => {
    cell.textContent = "";
    cell.innerHTML = "";
    cell.removeAttribute("style");
    cell.className = "";
    cell.removeAttribute("colspan");
    cell.style.display = "";
  });
}

/** Restore cell values from `captureTableData()` snapshot shape. */
export function populateGridFromSnapshot(tableData) {
  if (!tableData?.rows?.length) return false;

  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return false;

  tableData.rows.forEach((rowData, rowIndex) => {
    const tableRow = tableBody.children[rowIndex];
    if (!tableRow) return;

    rowData.forEach((cellData, colIndex) => {
      if (cellData.type !== "data" || colIndex <= 0) return;

      const cell = tableRow.children[colIndex];
      if (!cell || cell.contentEditable !== "true") return;

      cell.removeAttribute("colspan");
      cell.style.display = "";

      if (cellData.colspan && cellData.colspan > 1) {
        cell.setAttribute("colspan", String(cellData.colspan));
        for (let i = 1; i < cellData.colspan; i += 1) {
          const hidden = tableRow.children[colIndex + i];
          if (hidden) hidden.style.display = "none";
        }
      }

      cell.textContent = cellData.value || "";
    });
  });

  return true;
}
