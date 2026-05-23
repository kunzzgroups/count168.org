/**
 * Grid multi-selection state — SPA-owned Set shared with legacy via __DC_ADOPT_SELECTION_SET__.
 */
export const selectedCells = new Set();

export function clearAllSelections() {
  selectedCells.forEach((cell) => {
    cell.classList.remove("multi-selected");
  });
  selectedCells.clear();

  document.querySelectorAll("#dataTable th").forEach((header) => {
    header.classList.remove("column-selected");
    header.classList.remove("column-active");
  });

  document.querySelectorAll(".row-header").forEach((header) => {
    header.classList.remove("row-selected");
    header.classList.remove("row-active");
  });
}

export function registerSelectedCell(cell) {
  if (cell) selectedCells.add(cell);
}

export function unregisterSelectedCell(cell) {
  if (cell) selectedCells.delete(cell);
}

export function getSelectedCells() {
  return Array.from(selectedCells);
}

export function getSelectedCellCount() {
  return selectedCells.size;
}

export function hasSelectedCell(cell) {
  return selectedCells.has(cell);
}
