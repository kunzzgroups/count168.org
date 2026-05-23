/**
 * Per-cell focus / blur money format / paste — SPA replacement for legacy bindDataCaptureCellEvents.
 */
import { highlightHeadersForCell } from "./dataCaptureGridActiveCell.js";
import { formatMoneyDisplay } from "../paste/core/dataCapturePasteMoneyUtils.js";

function shouldSkipBlurMoneyFormat() {
  const captureType = window.__DC_GET_CAPTURE_TYPE__?.() || "";
  return captureType === "1.Text" || captureType === "2.Format";
}

function onCellFocus() {
  this.classList.add("selected");
  highlightHeadersForCell(this);
}

function onCellBlur() {
  this.classList.remove("selected");
  if (shouldSkipBlurMoneyFormat()) return;

  const t = (this.textContent || "").trim();
  if (!t) return;

  const displayed = formatMoneyDisplay(t);
  if (displayed !== t) {
    this.textContent = displayed;
  }
}

function onCellPaste(e) {
  window.__DC_HANDLE_CELL_PASTE__?.(e);
}

/** Bind focus, blur, and paste on a single editable cell. */
export function bindDataCaptureCellEvents(cell) {
  if (!cell) return;
  cell.addEventListener("focus", onCellFocus);
  cell.addEventListener("blur", onCellBlur);
  cell.addEventListener("paste", onCellPaste);
}
