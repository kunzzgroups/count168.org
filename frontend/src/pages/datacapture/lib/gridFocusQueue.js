/** Pending cell focus after grid row/column append (applied on next grid render). */
let pendingFocus = null;

export function requestGridCellFocus(rowIndex, colIndex) {
  pendingFocus = { rowIndex, colIndex };
}

export function peekPendingGridCellFocus() {
  return pendingFocus;
}

export function takePendingGridCellFocus() {
  const next = pendingFocus;
  pendingFocus = null;
  return next;
}
