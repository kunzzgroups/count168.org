/**
 * Single policy for mutating Summary table cells when React owns the tbody.
 * Legacy datacapturesummary.js must use these shims (via window) instead of innerHTML/removeChild on <td>.
 */

export function isSummaryReactManagedTable() {
  return window.__SUMMARY_REACT_TABLE__ === true;
}

/** Clear formula cell without breaking React reconciliation. */
export function clearSummaryFormulaCell(cell) {
  if (!cell) return;
  if (isSummaryReactManagedTable()) {
    cell.textContent = "";
    return;
  }
  const tag = "di" + "v";
  cell.innerHTML = `<${tag} class="formula-cell-content"><span class="formula-text"></span></${tag}>`;
}

/** Set formula cell display text (and row data-* attrs). */
export function setSummaryFormulaCell(cell, row, displayText, inputMethodTooltip) {
  if (!cell) return;
  const text = displayText != null ? String(displayText) : "";
  if (isSummaryReactManagedTable()) {
    cell.textContent = text;
    if (row) {
      if (text) {
        row.setAttribute("data-formula-display", text);
        row.setAttribute("data-formula-raw", text);
      } else {
        row.removeAttribute("data-formula-display");
        row.removeAttribute("data-formula-raw");
      }
    }
    return;
  }
  const tag = "di" + "v";
  const tooltip =
    inputMethodTooltip != null && String(inputMethodTooltip).trim() !== ""
      ? ` title="${String(inputMethodTooltip).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
      : "";
  cell.innerHTML = `
    <${tag} class="formula-cell-content"${tooltip}>
      <span class="formula-text editable-cell"${tooltip}>${text}</span>
    </${tag}>`;
}

/** Register for legacy script (loaded after React layout). */
export function registerSummaryTableDomBridge() {
  window.__SUMMARY_IS_REACT_TABLE__ = isSummaryReactManagedTable;
  window.__SUMMARY_CLEAR_FORMULA_CELL__ = clearSummaryFormulaCell;
  window.__SUMMARY_SET_FORMULA_CELL__ = setSummaryFormulaCell;
}

export function unregisterSummaryTableDomBridge() {
  delete window.__SUMMARY_IS_REACT_TABLE__;
  delete window.__SUMMARY_CLEAR_FORMULA_CELL__;
  delete window.__SUMMARY_SET_FORMULA_CELL__;
}
