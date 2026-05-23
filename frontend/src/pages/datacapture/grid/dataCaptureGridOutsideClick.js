/**
 * Deactivate grid selection when clicking outside the table.
 */

export function handleDocumentGridOutsideClick(e) {
  const dataTable = document.getElementById("dataTable");
  const clickedElement = e.target;

  if (dataTable && !dataTable.contains(clickedElement)) {
    const activeElement = document.activeElement;
    const isTableCell =
      activeElement &&
      activeElement.contentEditable === "true" &&
      activeElement.closest("#dataTable");

    if (!isTableCell) {
      window.__DC_SET_TABLE_ACTIVE__?.(false);
      window.__DC_CLEAR_ALL_SELECTIONS__?.();
      if (
        activeElement &&
        activeElement.contentEditable === "true" &&
        activeElement.closest("#dataTable")
      ) {
        activeElement.blur();
      }
    }
  }
}
