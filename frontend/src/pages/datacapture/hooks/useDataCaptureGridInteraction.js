import { useEffect, useLayoutEffect } from "react";
import { handleDocumentGridKeydown } from "../grid/dataCaptureGridDocumentKeyboard.js";
import { handleDocumentGridOutsideClick } from "../grid/dataCaptureGridOutsideClick.js";
import { attachGridMouseDelegation } from "../grid/dataCaptureGridMouseDelegation.js";
import { handleCellKeydown } from "../grid/dataCaptureGridCellKeydown.js";
import { handleCellClick } from "../grid/dataCaptureGridCellClick.js";
import {
  moveCaretToClickPosition,
  moveCaretToEnd,
  setActiveCell,
  setActiveCellCore,
  setActiveCellWithoutFocus,
} from "../grid/dataCaptureGridActiveCell.js";

import {
  hideContextMenu,
  showColumnContextMenu,
  showContextMenu,
  showRowContextMenu,
  updateActiveContextMenuPosition,
  getContextMenuColumnIndex,
  getContextMenuRowIndex,
  setContextMenuColumn,
  setContextMenuRow,
} from "../lib/dataCaptureContextMenu.js";
import {
  clearColumn,
  clearRow,
  deleteColumn,
  deleteRow,
  insertColumnLeft,
  insertColumnRight,
  insertRowAbove,
  insertRowBelow,
  appendGridRow,
  appendGridColumn,
} from "../grid/dataCaptureGridRowColumnCrud.js";
import {
  clearSelectedCells,
  copySelectedCells,
  pasteToSelectedCells,
  selectAllCells,
} from "../grid/dataCaptureGridClipboard.js";
import { bindDataCaptureCellEvents } from "../grid/dataCaptureGridCellBinding.js";
import {
  clearAllSelections,
  getSelectedCellCount,
  getSelectedCells,
  registerSelectedCell,
} from "../grid/dataCaptureGridSelection.js";
import {
  handleCellMouseDown,
  handleCellMouseOver,
  handleColumnHeaderClick,
  handleColumnHeaderMousedown,
  handleColumnHeaderMouseover,
  handleMouseUp,
  handleRowHeaderClick,
  handleRowHeaderMousedown,
  handleRowHeaderMouseover,
  selectColumn,
} from "../grid/dataCaptureGridMouseSelection.js";
import { setTableActive, isTableActive } from "../grid/dataCaptureGridMeta.js";
import {
  clearPasteHistory,
  hasPasteHistory,
  pushPasteHistory,
  undoLastPaste,
} from "../grid/dataCaptureGridPasteHistory.js";

/**
 * Phase 5a–5f: SPA-owned grid interaction, selection, paste history, context menus.
 */
export function useDataCaptureGridInteraction(scriptsReady) {
  useLayoutEffect(() => {
    window.__DC_SET_ACTIVE_CELL_CORE_REACT__ = setActiveCellCore;
    window.__DC_SET_ACTIVE_CELL_REACT__ = setActiveCell;
    window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS_REACT__ = setActiveCellWithoutFocus;
    window.__DC_MOVE_CARET_TO_END_REACT__ = moveCaretToEnd;
    window.__DC_MOVE_CARET_TO_CLICK_REACT__ = moveCaretToClickPosition;
    window.__DC_HANDLE_CELL_CLICK_REACT__ = handleCellClick;
    window.__DC_HANDLE_CELL_CLICK__ = handleCellClick;
    window.__DC_HANDLE_CELL_KEYDOWN_REACT__ = handleCellKeydown;
    window.__DC_SET_ACTIVE_CELL__ = setActiveCell;
    window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS__ = setActiveCellWithoutFocus;
    window.__DC_MOVE_CARET_TO_END__ = moveCaretToEnd;

    window.__DC_SHOW_CONTEXT_MENU_REACT__ = showContextMenu;
    window.__DC_SHOW_COLUMN_CONTEXT_MENU_REACT__ = showColumnContextMenu;
    window.__DC_SHOW_ROW_CONTEXT_MENU_REACT__ = showRowContextMenu;
    window.__DC_SHOW_COLUMN_CONTEXT_MENU__ = showColumnContextMenu;
    window.__DC_SHOW_ROW_CONTEXT_MENU__ = showRowContextMenu;
    window.__DC_HIDE_CONTEXT_MENU__ = hideContextMenu;
    window.__DC_UPDATE_CONTEXT_MENU_POSITION__ = updateActiveContextMenuPosition;
    window.updateActiveContextMenuPosition = updateActiveContextMenuPosition;
    window.__DC_SET_CONTEXT_MENU_COLUMN__ = setContextMenuColumn;
    window.__DC_GET_CONTEXT_MENU_COLUMN__ = getContextMenuColumnIndex;
    window.__DC_SET_CONTEXT_MENU_ROW__ = setContextMenuRow;
    window.__DC_GET_CONTEXT_MENU_ROW__ = getContextMenuRowIndex;

    window.__DC_INSERT_COLUMN_LEFT__ = insertColumnLeft;
    window.__DC_INSERT_COLUMN_RIGHT__ = insertColumnRight;
    window.__DC_DELETE_COLUMN__ = deleteColumn;
    window.__DC_CLEAR_COLUMN__ = clearColumn;
    window.__DC_INSERT_ROW_ABOVE__ = insertRowAbove;
    window.__DC_INSERT_ROW_BELOW__ = insertRowBelow;
    window.__DC_DELETE_ROW__ = deleteRow;
    window.__DC_CLEAR_ROW__ = clearRow;
    window.__DC_ADD_NEW_ROW__ = appendGridRow;
    window.__DC_ADD_NEW_COLUMN__ = appendGridColumn;
    window.insertColumnLeft = insertColumnLeft;
    window.insertColumnRight = insertColumnRight;
    window.deleteColumn = deleteColumn;
    window.clearColumn = clearColumn;
    window.insertRowAbove = insertRowAbove;
    window.insertRowBelow = insertRowBelow;
    window.deleteRow = deleteRow;
    window.clearRow = clearRow;

    window.copySelectedCells = copySelectedCells;
    window.pasteToSelectedCells = pasteToSelectedCells;
    window.clearSelectedCells = clearSelectedCells;
    window.selectAllCells = selectAllCells;

    window.__DC_BIND_GRID_CELL__ = bindDataCaptureCellEvents;
    window.__DC_LEGACY_BIND_CELL__ = bindDataCaptureCellEvents;

    window.__DC_CLEAR_ALL_SELECTIONS__ = clearAllSelections;
    window.__DC_GET_SELECTED_CELLS__ = getSelectedCells;
    window.__DC_GET_SELECTED_CELL_COUNT__ = getSelectedCellCount;
    window.__DC_REGISTER_SELECTED_CELL__ = registerSelectedCell;

    window.__DC_SET_TABLE_ACTIVE__ = setTableActive;
    window.__DC_GET_TABLE_ACTIVE__ = isTableActive;
    window.__DC_PUSH_PASTE_HISTORY__ = pushPasteHistory;
    window.__DC_CLEAR_PASTE_HISTORY__ = clearPasteHistory;
    window.__DC_HAS_PASTE_HISTORY__ = hasPasteHistory;
    window.__DC_UNDO_LAST_PASTE__ = undoLastPaste;

    window.__DC_HANDLE_CELL_MOUSEDOWN__ = handleCellMouseDown;
    window.__DC_HANDLE_CELL_MOUSEOVER__ = handleCellMouseOver;
    window.__DC_HANDLE_MOUSE_UP__ = handleMouseUp;
    window.__DC_HANDLE_COLUMN_HEADER_MOUSEDOWN__ = handleColumnHeaderMousedown;
    window.__DC_HANDLE_COLUMN_HEADER_MOUSEOVER__ = handleColumnHeaderMouseover;
    window.__DC_HANDLE_COLUMN_HEADER_CLICK__ = handleColumnHeaderClick;
    window.__DC_HANDLE_ROW_HEADER_MOUSEDOWN__ = handleRowHeaderMousedown;
    window.__DC_HANDLE_ROW_HEADER_MOUSEOVER__ = handleRowHeaderMouseover;
    window.__DC_HANDLE_ROW_HEADER_CLICK__ = handleRowHeaderClick;
    window.__DC_SELECT_COLUMN__ = selectColumn;

    return () => {
      delete window.__DC_SET_ACTIVE_CELL_CORE_REACT__;
      delete window.__DC_SET_ACTIVE_CELL_REACT__;
      delete window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS_REACT__;
      delete window.__DC_MOVE_CARET_TO_END_REACT__;
      delete window.__DC_MOVE_CARET_TO_CLICK_REACT__;
      delete window.__DC_HANDLE_CELL_CLICK_REACT__;
      if (window.__DC_HANDLE_CELL_CLICK__ === handleCellClick) delete window.__DC_HANDLE_CELL_CLICK__;
      delete window.__DC_HANDLE_CELL_KEYDOWN_REACT__;
      delete window.__DC_SHOW_CONTEXT_MENU_REACT__;
      delete window.__DC_SHOW_COLUMN_CONTEXT_MENU_REACT__;
      delete window.__DC_SHOW_ROW_CONTEXT_MENU_REACT__;
      delete window.__DC_SHOW_COLUMN_CONTEXT_MENU__;
      delete window.__DC_SHOW_ROW_CONTEXT_MENU__;
      delete window.__DC_HIDE_CONTEXT_MENU__;
      delete window.__DC_UPDATE_CONTEXT_MENU_POSITION__;
      delete window.__DC_SET_CONTEXT_MENU_COLUMN__;
      delete window.__DC_GET_CONTEXT_MENU_COLUMN__;
      delete window.__DC_SET_CONTEXT_MENU_ROW__;
      delete window.__DC_GET_CONTEXT_MENU_ROW__;
      if (window.updateActiveContextMenuPosition === updateActiveContextMenuPosition) {
        delete window.updateActiveContextMenuPosition;
      }
      delete window.__DC_INSERT_COLUMN_LEFT__;
      delete window.__DC_INSERT_COLUMN_RIGHT__;
      delete window.__DC_DELETE_COLUMN__;
      delete window.__DC_CLEAR_COLUMN__;
      delete window.__DC_INSERT_ROW_ABOVE__;
      delete window.__DC_INSERT_ROW_BELOW__;
      delete window.__DC_DELETE_ROW__;
      delete window.__DC_CLEAR_ROW__;
      if (window.__DC_ADD_NEW_ROW__ === appendGridRow) delete window.__DC_ADD_NEW_ROW__;
      if (window.__DC_ADD_NEW_COLUMN__ === appendGridColumn) delete window.__DC_ADD_NEW_COLUMN__;
      if (window.insertColumnLeft === insertColumnLeft) delete window.insertColumnLeft;
      if (window.insertColumnRight === insertColumnRight) delete window.insertColumnRight;
      if (window.deleteColumn === deleteColumn) delete window.deleteColumn;
      if (window.clearColumn === clearColumn) delete window.clearColumn;
      if (window.insertRowAbove === insertRowAbove) delete window.insertRowAbove;
      if (window.insertRowBelow === insertRowBelow) delete window.insertRowBelow;
      if (window.deleteRow === deleteRow) delete window.deleteRow;
      if (window.clearRow === clearRow) delete window.clearRow;
      if (window.copySelectedCells === copySelectedCells) delete window.copySelectedCells;
      if (window.pasteToSelectedCells === pasteToSelectedCells) delete window.pasteToSelectedCells;
      if (window.clearSelectedCells === clearSelectedCells) delete window.clearSelectedCells;
      if (window.selectAllCells === selectAllCells) delete window.selectAllCells;
      if (window.__DC_BIND_GRID_CELL__ === bindDataCaptureCellEvents) delete window.__DC_BIND_GRID_CELL__;
      if (window.__DC_LEGACY_BIND_CELL__ === bindDataCaptureCellEvents) delete window.__DC_LEGACY_BIND_CELL__;
      if (window.__DC_CLEAR_ALL_SELECTIONS__ === clearAllSelections) delete window.__DC_CLEAR_ALL_SELECTIONS__;
      if (window.__DC_GET_SELECTED_CELLS__ === getSelectedCells) delete window.__DC_GET_SELECTED_CELLS__;
      if (window.__DC_GET_SELECTED_CELL_COUNT__ === getSelectedCellCount) delete window.__DC_GET_SELECTED_CELL_COUNT__;
      if (window.__DC_REGISTER_SELECTED_CELL__ === registerSelectedCell) delete window.__DC_REGISTER_SELECTED_CELL__;
      if (window.__DC_SET_TABLE_ACTIVE__ === setTableActive) delete window.__DC_SET_TABLE_ACTIVE__;
      if (window.__DC_GET_TABLE_ACTIVE__ === isTableActive) delete window.__DC_GET_TABLE_ACTIVE__;
      if (window.__DC_PUSH_PASTE_HISTORY__ === pushPasteHistory) delete window.__DC_PUSH_PASTE_HISTORY__;
      if (window.__DC_CLEAR_PASTE_HISTORY__ === clearPasteHistory) delete window.__DC_CLEAR_PASTE_HISTORY__;
      if (window.__DC_HAS_PASTE_HISTORY__ === hasPasteHistory) delete window.__DC_HAS_PASTE_HISTORY__;
      if (window.__DC_UNDO_LAST_PASTE__ === undoLastPaste) delete window.__DC_UNDO_LAST_PASTE__;
      if (window.__DC_HANDLE_CELL_MOUSEDOWN__ === handleCellMouseDown) delete window.__DC_HANDLE_CELL_MOUSEDOWN__;
      if (window.__DC_HANDLE_CELL_MOUSEOVER__ === handleCellMouseOver) delete window.__DC_HANDLE_CELL_MOUSEOVER__;
      if (window.__DC_HANDLE_MOUSE_UP__ === handleMouseUp) delete window.__DC_HANDLE_MOUSE_UP__;
      if (window.__DC_HANDLE_COLUMN_HEADER_MOUSEDOWN__ === handleColumnHeaderMousedown) {
        delete window.__DC_HANDLE_COLUMN_HEADER_MOUSEDOWN__;
      }
      if (window.__DC_HANDLE_COLUMN_HEADER_MOUSEOVER__ === handleColumnHeaderMouseover) {
        delete window.__DC_HANDLE_COLUMN_HEADER_MOUSEOVER__;
      }
      if (window.__DC_HANDLE_COLUMN_HEADER_CLICK__ === handleColumnHeaderClick) {
        delete window.__DC_HANDLE_COLUMN_HEADER_CLICK__;
      }
      if (window.__DC_HANDLE_ROW_HEADER_MOUSEDOWN__ === handleRowHeaderMousedown) {
        delete window.__DC_HANDLE_ROW_HEADER_MOUSEDOWN__;
      }
      if (window.__DC_HANDLE_ROW_HEADER_MOUSEOVER__ === handleRowHeaderMouseover) {
        delete window.__DC_HANDLE_ROW_HEADER_MOUSEOVER__;
      }
      if (window.__DC_HANDLE_ROW_HEADER_CLICK__ === handleRowHeaderClick) delete window.__DC_HANDLE_ROW_HEADER_CLICK__;
      if (window.__DC_SELECT_COLUMN__ === selectColumn) delete window.__DC_SELECT_COLUMN__;
    };
  }, []);

  useEffect(() => {
    if (!scriptsReady) return;

    document.addEventListener("keydown", handleDocumentGridKeydown);
    document.addEventListener("click", handleDocumentGridOutsideClick);

    let detachMouse = () => {};
    let pollId = null;

    const attachMouse = () => {
      const dataTable = document.getElementById("dataTable");
      if (!dataTable) return false;
      detachMouse = attachGridMouseDelegation(dataTable);
      return true;
    };

    if (!attachMouse()) {
      pollId = setInterval(() => {
        if (attachMouse()) clearInterval(pollId);
      }, 200);
    }

    return () => {
      clearInterval(pollId);
      detachMouse();
      document.removeEventListener("keydown", handleDocumentGridKeydown);
      document.removeEventListener("click", handleDocumentGridOutsideClick);
    };
  }, [scriptsReady]);
}
