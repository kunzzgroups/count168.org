/**
 * SPA: delegated mouse selection on #dataTable (cells + column/row headers).
 * Legacy still owns selection state; React owns listener registration.
 */

function withTargetEvent(e, target) {
  if (e.target === target) return e;
  return new Proxy(e, {
    get(obj, prop) {
      if (prop === "target") return target;
      const val = obj[prop];
      return typeof val === "function" ? val.bind(obj) : val;
    },
  });
}

function findEditableCell(target, root) {
  const cell = target?.closest?.("td[contenteditable='true']");
  if (!cell || !root.contains(cell)) return null;
  return cell;
}

export function attachGridMouseDelegation(dataTable) {
  if (!dataTable) return () => {};

  const onMouseDown = (e) => {
    const colHeader = e.target?.closest?.("#tableHeader th");
    if (colHeader && colHeader.cellIndex > 0) {
      window.__DC_HANDLE_COLUMN_HEADER_MOUSEDOWN__?.(e);
      return;
    }

    const rowHeader = e.target?.closest?.(".row-header");
    if (rowHeader && dataTable.contains(rowHeader)) {
      window.__DC_HANDLE_ROW_HEADER_MOUSEDOWN__?.(e);
      return;
    }

    const cell = findEditableCell(e.target, dataTable);
    if (cell) {
      window.__DC_HANDLE_CELL_MOUSEDOWN__?.(withTargetEvent(e, cell));
    }
  };

  const onMouseOver = (e) => {
    const colHeader = e.target?.closest?.("#tableHeader th");
    if (colHeader && colHeader.cellIndex > 0) {
      window.__DC_HANDLE_COLUMN_HEADER_MOUSEOVER__?.(e);
      return;
    }

    const rowHeader = e.target?.closest?.(".row-header");
    if (rowHeader && dataTable.contains(rowHeader)) {
      window.__DC_HANDLE_ROW_HEADER_MOUSEOVER__?.(e);
      return;
    }

    const cell = findEditableCell(e.target, dataTable);
    if (cell) {
      window.__DC_HANDLE_CELL_MOUSEOVER__?.(withTargetEvent(e, cell));
    }
  };

  const onContextMenu = (e) => {
    const colHeader = e.target?.closest?.("#tableHeader th");
    if (colHeader && colHeader.cellIndex > 0) {
      e.preventDefault();
      window.__DC_SHOW_COLUMN_CONTEXT_MENU_REACT__?.(e, colHeader);
      return;
    }

    const rowHeader = e.target?.closest?.(".row-header");
    if (rowHeader && dataTable.contains(rowHeader)) {
      e.preventDefault();
      window.__DC_SHOW_ROW_CONTEXT_MENU_REACT__?.(e, rowHeader);
      return;
    }

    const cell = findEditableCell(e.target, dataTable);
    if (cell) {
      e.preventDefault();
      window.__DC_SHOW_CONTEXT_MENU_REACT__?.(e, cell);
    }
  };

  dataTable.addEventListener("mousedown", onMouseDown);
  dataTable.addEventListener("mouseover", onMouseOver);
  dataTable.addEventListener("contextmenu", onContextMenu);

  const onClick = (e) => {
    const cell = findEditableCell(e.target, dataTable);
    if (cell) {
      window.__DC_HANDLE_CELL_CLICK__?.(e, cell);
    }
  };

  const onKeyDown = (e) => {
    const cell = findEditableCell(e.target, dataTable);
    if (!cell) return;
    if (typeof window.__DC_HANDLE_CELL_KEYDOWN_REACT__ === "function") {
      window.__DC_HANDLE_CELL_KEYDOWN_REACT__(e);
    }
  };

  dataTable.addEventListener("click", onClick);
  dataTable.addEventListener("keydown", onKeyDown, true);

  return () => {
    dataTable.removeEventListener("mousedown", onMouseDown);
    dataTable.removeEventListener("mouseover", onMouseOver);
    dataTable.removeEventListener("contextmenu", onContextMenu);
    dataTable.removeEventListener("click", onClick);
    dataTable.removeEventListener("keydown", onKeyDown, true);
  };
}
