/**
 * Cell click: first click highlight, second click edit (extracted from bindDataCaptureCellEvents).
 */
import { moveCaretToClickPosition, setActiveCellCore, setActiveCellWithoutFocus } from "./dataCaptureGridActiveCell.js";

export function handleCellClick(e, cellEl) {
  const cell = cellEl || e.currentTarget || e.target;
  if (!cell || cell.contentEditable !== "true") return;

  window.__DC_SET_TABLE_ACTIVE__?.(true);
  const isCtrlPressed = e.ctrlKey || e.metaKey;
  if (isCtrlPressed) return;

  const hasFocus = document.activeElement === cell;
  if (hasFocus) {
    moveCaretToClickPosition(cell, e);
  } else if (!cell.classList.contains("selected")) {
    setActiveCellWithoutFocus(cell);
  } else {
    setActiveCellCore(cell);
    cell.focus();
    setTimeout(() => {
      moveCaretToClickPosition(cell, e);
    }, 0);
  }
}
