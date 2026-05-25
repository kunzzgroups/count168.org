/**
 * Per-cell keyboard (Tab/Enter/arrows/Delete/Ctrl+Z) — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-grid-cell-keydown.mjs
 */
import { setActiveCell, setActiveCellWithoutFocus } from "./dataCaptureGridActiveCell.js";

function hasPasteHistory() {
  return window.__DC_HAS_PASTE_HISTORY__?.() ?? false;
}

function undoLastPaste() {
  window.__DC_UNDO_LAST_PASTE__?.();
}

function getSelectedCells() {
  return window.__DC_GET_SELECTED_CELLS__?.() ?? [];
}

function recomputeSubmitState() {
  window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
}

function clearAllSelections() {
  window.__DC_CLEAR_ALL_SELECTIONS__?.();
}

function addNewColumn() {
  return window.__DC_ADD_NEW_COLUMN__?.() ?? null;
}

function addNewRow() {
  return window.__DC_ADD_NEW_ROW__?.() ?? null;
}

function isFormatCaptureType() {
  return (window.__DC_GET_CAPTURE_TYPE__?.() || "1.Text") === "2.Format";
}

/** Move focus to the same column on the next row (add row if needed). */
export function moveToNextRowFromCell(cell) {
  if (!cell || cell.contentEditable !== "true") return false;

  const row = cell.parentNode;
  const table = row?.parentNode;
  if (!table) return false;

  const currentRowIndex = Array.from(table.children).indexOf(row);
  const currentCellIndex = Array.from(row.children).indexOf(cell);
  const nextRow = table.children[currentRowIndex + 1];

  if (nextRow) {
    const nextRowCell = nextRow.children[currentCellIndex];
    if (nextRowCell?.contentEditable === "true") {
      setActiveCell(nextRowCell);
      return true;
    }
    return false;
  }

  if (table.children.length >= 702) return false;

  const newRowIndex = addNewRow();
  if (newRowIndex == null) return false;

  const newRow = table.children[newRowIndex];
  const newCell = newRow?.children[currentCellIndex];
  if (newCell?.contentEditable === "true") {
    setActiveCell(newCell);
    return true;
  }
  return false;
}

/** Focus the first editable data cell on the next append row (2.Format). */
export function focusFormatGridAppendCell(preferredColIndex = 1) {
  const tableBody = document.getElementById("tableBody");
  if (!tableBody) return false;

  let lastDataRow = -1;
  for (let i = 0; i < tableBody.children.length; i += 1) {
    const row = tableBody.children[i];
    const hasData = Array.from(row.querySelectorAll('td[contenteditable="true"]')).some((c) =>
      String(c.textContent || "").trim()
    );
    if (hasData) lastDataRow = i;
  }

  const rowIndex = lastDataRow + 1;
  const row = tableBody.children[rowIndex];
  if (!row) return false;

  const colIndex = preferredColIndex >= 1 ? preferredColIndex : 1;
  const cell = row.children[colIndex];
  if (cell?.contentEditable === "true") {
    setActiveCell(cell);
    return true;
  }
  return false;
}

export function handleCellKeydown(e) {
  const raw = e.target;
  const cell =
    raw?.nodeType === Node.TEXT_NODE
      ? raw.parentElement?.closest?.("td[contenteditable='true']")
      : raw?.closest?.("td[contenteditable='true']") ||
        (raw?.contentEditable === "true" ? raw : null);
  if (!cell) return;

  const key = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        // 优先检查是否有粘贴历史记录，如果有就撤销粘贴操作
        if (hasPasteHistory()) {
            e.preventDefault();
            e.stopPropagation();
            undoLastPaste();
            return;
        }
        // 如果没有粘贴历史，不阻止默认行为，让浏览器执行撤销操作
        return;
    }

    // 获取单元格元素（支持文本节点和元素节点）
    const row = cell.parentNode;
    const table = row.parentNode;
    const hasFocus = document.activeElement === cell;

    // 2.Format 允许 Ctrl+V 触发 paste 事件，以便在下一行继续粘贴表格
    if (hasFocus && (e.ctrlKey || e.metaKey) && key === 'v') {
        if (!isFormatCaptureType()) {
            e.preventDefault();
            e.stopPropagation();
        }
        return;
    }

    // 处理 Backspace 和 Delete 键
    if (e.key === 'Backspace' || e.key === 'Delete') {
        const hasContent = cell.textContent.trim() !== '';

        // 获取当前光标位置（仅对 Backspace 有效）
        let cursorAtStart = false;
        if (e.key === 'Backspace' && hasFocus) {
            try {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const textNode = range.startContainer;
                    const offset = range.startOffset;

                    // 检查光标是否在文本开头
                    if (textNode.nodeType === Node.TEXT_NODE) {
                        cursorAtStart = offset === 0;
                    } else {
                        // 如果是元素节点，检查是否在第一个文本节点之前
                        cursorAtStart = offset === 0 && !textNode.previousSibling;
                    }
                }
            } catch (err) {
                // 如果获取光标位置失败，默认不阻止
                cursorAtStart = false;
            }
        }

        // 如果单元格高亮但没有焦点，清除整个内容
        if (!hasFocus && (cell.classList.contains('selected') || getSelectedCells().includes(cell))) {
            e.preventDefault();
            cell.textContent = '';
            recomputeSubmitState();
            return;
        }

        // 如果单元格有焦点
        if (hasFocus) {
            // Backspace 在文本开头时，或者单元格为空时，清除整个单元格
            if (e.key === 'Backspace' && (cursorAtStart || !hasContent)) {
                e.preventDefault();
                cell.textContent = '';
                recomputeSubmitState();
                return;
            }
            // Delete 键在单元格末尾时，清除整个单元格
            if (e.key === 'Delete' && !hasContent) {
                e.preventDefault();
                cell.textContent = '';
                recomputeSubmitState();
                return;
            }
            // 否则让默认行为处理（删除一个字符）
        }
        return;
    }

    // 在 switch 外面声明这些变量，避免在多个 case 中重复声明
    const currentRowIdx = Array.from(table.children).indexOf(row);
    const currentColIdx = parseInt(cell.dataset.col);

    switch (e.key) {
        case 'Tab':
            e.preventDefault();
            const nextCell = e.shiftKey ? cell.previousElementSibling : cell.nextElementSibling;
            if (nextCell && nextCell.contentEditable === 'true') {
                setActiveCell(nextCell);
            } else if (!e.shiftKey) {
                // 如果到达最后一列，动态增加一列（但限制最大列数），且不清空现有数据
                const currentCols = document.querySelectorAll('#tableHeader th').length - 1;
                if (currentCols < 30) { // 限制最大30列
                    const newColIndex = addNewColumn();
                    if (newColIndex !== null) {
                        // 行首是行号，所以需要 +1
                        const newCell = row.children[newColIndex + 1];
                        if (newCell && newCell.contentEditable === 'true') {
                            setActiveCell(newCell);
                        }
                    }
                }
            }
            break;

        case 'Enter':
            if (isFormatCaptureType()) {
                // 2.Format: Enter 单元格内换行；Shift+Enter 预备下一行并聚焦粘贴区
                if (!e.shiftKey) return;
                e.preventDefault();
                window.__DC_PREPARE_FORMAT_NEXT_ROW_PASTE__?.(cell);
                break;
            }
            if (e.shiftKey) return;
            e.preventDefault();
            moveToNextRowFromCell(cell);
            break;

        case 'ArrowUp':
        case 'ArrowDown':
            // 上下键：总是切换单元格（退出编辑模式，只高亮目标单元格）
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡，避免全局监听器也处理
            const verticalDirection = e.key === 'ArrowUp' ? -1 : 1;
            const targetRow = table.children[currentRowIdx + verticalDirection];
            if (targetRow) {
                const targetCell = targetRow.children[currentColIdx + 1]; // +1 因为第一列是行号
                if (targetCell && targetCell.contentEditable === 'true') {
                    // 先退出当前单元格的编辑模式
                    cell.blur();
                    // 切换到目标单元格（只高亮，不进入编辑模式）
                    clearAllSelections();
                    setActiveCellWithoutFocus(targetCell);
                }
            }
            break;
        case 'ArrowLeft':
        case 'ArrowRight':
            // 左右键：总是切换单元格（不检查光标位置）
            e.preventDefault();
            e.stopPropagation(); // 阻止事件冒泡，避免全局监听器也处理
            const horizontalDirection = e.key === 'ArrowLeft' ? -1 : 1;
            const targetColIdx = currentColIdx + horizontalDirection;

            // 检查列边界
            const maxCols = document.querySelectorAll('#tableHeader th').length - 1;
            if (targetColIdx >= 0 && targetColIdx < maxCols) {
                // 先退出当前单元格的编辑模式
                cell.blur();
                // 切换到目标单元格（只高亮，不进入编辑模式）
                const targetCell = row.children[targetColIdx + 1]; // +1 因为第一列是行号
                if (targetCell && targetCell.contentEditable === 'true') {
                    clearAllSelections();
                    setActiveCellWithoutFocus(targetCell);
                }
            }
            break;
    }
}
