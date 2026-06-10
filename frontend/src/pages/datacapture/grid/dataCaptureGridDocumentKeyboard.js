/**
 * Document-level grid keyboard shortcuts — extracted from js/datacapture.js.
 */

import {
  clearBridgeCells,
  gridClearAllSelections,
  gridCopySelectedCells,
  gridGetSelectedCellCount,
  gridGetSelectedCells,
  gridGetTableActive,
  gridHasPasteHistory,
  gridMoveCaretToEnd,
  gridPasteToSelectedCells,
  gridRecomputeSubmitState,
  gridSelectAllCells,
  gridSetActiveCell,
  gridSetActiveCellWithoutFocus,
  gridUndoLastPaste,
  updateBridgeCell,
} from "../lib/dataCaptureBridge.js";

function isTableActive() {
  return gridGetTableActive();
}

function cellPosition(cell) {
  if (!cell?.parentNode?.parentNode) return null;
  const row = cell.parentNode;
  const table = row.parentNode;
  const rowIndex = Array.from(table.children).indexOf(row);
  const colIndex = Number.parseInt(cell.dataset.col, 10);
  if (rowIndex < 0 || !Number.isFinite(colIndex)) return null;
  return { rowIndex, colIndex };
}

function hasPasteHistory() {
  return gridHasPasteHistory();
}

function undoLastPaste() {
  gridUndoLastPaste();
}

function clearAllSelections() {
  gridClearAllSelections();
}

function getSelectedCells() {
  return gridGetSelectedCells();
}

function getSelectedCellCount() {
  return gridGetSelectedCellCount();
}

function setActiveCellWithoutFocus(cell) {
  gridSetActiveCellWithoutFocus(cell);
}

function setActiveCell(cell) {
  gridSetActiveCell(cell);
}

function moveCaretToEnd(cell) {
  gridMoveCaretToEnd(cell);
}

function recomputeSubmitState() {
  gridRecomputeSubmitState();
}

function selectAllCells() {
  gridSelectAllCells();
}

function copySelectedCells() {
  gridCopySelectedCells();
}

function pasteToSelectedCells() {
  gridPasteToSelectedCells();
}

export function handleDocumentGridKeydown(e) {
const key = (e.key || '').toLowerCase();
    // Check if cell is being edited (cell has focus)
    const activeElement = document.activeElement;
    const isEditingCell = activeElement &&
        activeElement.contentEditable === 'true' &&
        activeElement.closest('#dataTable');

    // If table is not active, only allow Ctrl+Z undo, ignore other table-related keyboard events
    if (!isTableActive() && !isEditingCell) {
        // Allow Ctrl+Z undo even when table is not active (for paste history)
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
            // Check if there's paste history to undo
            if (hasPasteHistory()) {
                e.preventDefault();
                undoLastPaste();
            }
            return;
        }
        // Ignore all other table-related keyboard events when table is not active
        return;
    }

    // Ctrl+Z undo (case-insensitive, compatible with Caps Lock)
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        // 获取事件目标元素（支持文本节点和元素节点）
        const targetElement = e.target.nodeType === Node.TEXT_NODE ? e.target.parentElement : e.target;

        // 检查多个条件，只要有一个满足就允许撤销：
        // 1. 当前活动元素在表格内
        const activeEl = document.activeElement;
        const activeElInTable = activeEl && activeEl.closest && activeEl.closest('#dataTable');

        // 2. 事件目标在表格内
        const targetInTable = targetElement && (
            (targetElement.closest && targetElement.closest('#dataTable')) ||
            targetElement.id === 'dataTable'
        );

        // 3. 有选中的单元格在表格内
        const hasSelectedCellsInTable = getSelectedCellCount() > 0 &&
            getSelectedCells().some(cell => cell && cell.closest && cell.closest('#dataTable'));

        // 4. 单元格正在被编辑
        // isEditingCell 已经在上面定义了

        // 如果满足任何一个条件，说明在表格内
        if (activeElInTable || targetInTable || hasSelectedCellsInTable || isEditingCell) {
            // 优先检查是否有粘贴历史记录，如果有就撤销粘贴操作
            if (hasPasteHistory()) {
                e.preventDefault();
                e.stopPropagation();
                undoLastPaste();
                return;
            }

            // 如果没有粘贴历史，但有选中的单元格但没有焦点，需要先聚焦到单元格才能执行撤销
            // 因为浏览器的撤销操作需要元素有焦点
            if (hasSelectedCellsInTable && !activeElInTable && !isEditingCell) {
                const firstSelectedCell = getSelectedCells()[0];
                if (firstSelectedCell && firstSelectedCell.contentEditable === 'true') {
                    // 先聚焦到单元格
                    firstSelectedCell.focus();
                    // 移动光标到文本末尾，确保焦点正确设置
                    try {
                        const selection = window.getSelection();
                        const range = document.createRange();
                        range.selectNodeContents(firstSelectedCell);
                        range.collapse(false); // 折叠到末尾
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } catch (err) {
                        // 如果设置光标位置失败，继续执行
                    }

                    // 阻止默认行为，稍后手动触发撤销
                    e.preventDefault();
                    e.stopPropagation();

                    // 使用 setTimeout 确保焦点和光标位置已设置完成
                    setTimeout(() => {
                        // 现在单元格有焦点了，使用 execCommand 执行撤销
                        try {
                            const success = document.execCommand('undo', false, null);
                            if (!success) {
                                // 如果 execCommand 失败，尝试使用 InputEvent 触发撤销
                                console.log('execCommand undo failed');
                            }
                        } catch (err) {
                            console.error('Error executing undo:', err);
                        }
                    }, 0);
                    return;
                }
            }
            // 如果单元格已经有焦点且没有粘贴历史，不阻止默认行为，让浏览器执行撤销操作
            return;
        }

        // 如果不在表格内，执行自定义撤销（比如撤销粘贴操作）
        e.preventDefault();
        undoLastPaste();
        return;
    }

    if (e.key === 'Escape') {
        clearAllSelections();
    } else if (e.key.startsWith('Arrow')) {
        // Arrow key navigation: switch cells like Excel
        // If cell is being edited, let handleCellKeydown handle it (it will prevent event propagation)
        // Here only handle arrow key navigation in highlighted state
        if (isEditingCell) {
            // When cell is being edited, let cell-level event handler handle it
            // handleCellKeydown will handle and prevent event propagation
            return;
        }

        // 检查是否在 process 下拉菜单中（锁定表格，让 process 下拉菜单处理箭头键）
        const processButton = document.getElementById('capture_process');
        const processDropdown = document.getElementById('capture_process_dropdown');
        const processSearchInput = processDropdown?.querySelector('.custom-select-search input');
        const isProcessDropdownOpen = processDropdown && processDropdown.classList.contains('show');
        const isProcessElementFocused = activeElement === processButton ||
            activeElement === processSearchInput ||
            (processDropdown && processDropdown.contains(activeElement));

        // 如果 process 下拉菜单打开或焦点在 process 相关元素上，不处理箭头键（让 process 下拉菜单处理）
        if (isProcessDropdownOpen || isProcessElementFocused) {
            return;
        }

        // 检查是否在 currency 或 date 字段中（锁定表格）
        const currencySelect = document.getElementById('capture_currency');
        const dateSelect = document.getElementById('capture_date');
        const isCurrencyFocused = activeElement === currencySelect;
        const isDateFocused = activeElement === dateSelect;

        // 如果焦点在 currency 或 date 字段上，不处理箭头键
        if (isCurrencyFocused || isDateFocused) {
            return;
        }

        // 获取当前单元格：优先使用选中的单元格，其次使用焦点所在的单元格，最后使用第一个单元格
        let currentCell = null;
        if (getSelectedCellCount() > 0) {
            currentCell = getSelectedCells()[0];
        } else if (activeElement && activeElement.contentEditable === 'true' && activeElement.closest('#dataTable')) {
            currentCell = activeElement;
        } else {
            // 如果没有选中或焦点单元格，从第一个单元格开始
            const tableBody = document.getElementById('tableBody');
            if (tableBody && tableBody.children.length > 0) {
                const firstRow = tableBody.children[0];
                if (firstRow && firstRow.children.length > 1) {
                    currentCell = firstRow.children[1]; // +1 因为第一列是行号
                }
            }
        }

        if (currentCell && currentCell.contentEditable === 'true') {
            // Get current cell position
            const currentRow = currentCell.parentNode;
            const tableBody = currentRow.parentNode;
            const currentRowIndex = Array.from(tableBody.children).indexOf(currentRow);
            const currentColIndex = parseInt(currentCell.dataset.col);

            // Calculate target cell position
            let targetRowIndex = currentRowIndex;
            let targetColIndex = currentColIndex;

            switch (e.key) {
                case 'ArrowUp':
                    targetRowIndex = Math.max(0, currentRowIndex - 1);
                    break;
                case 'ArrowDown':
                    targetRowIndex = Math.min(tableBody.children.length - 1, currentRowIndex + 1);
                    break;
                case 'ArrowLeft':
                    targetColIndex = Math.max(0, currentColIndex - 1);
                    break;
                case 'ArrowRight':
                    // Get maximum column count of current table
                    const maxCols = document.querySelectorAll('#tableHeader th').length - 1;
                    targetColIndex = Math.min(maxCols - 1, currentColIndex + 1);
                    break;
            }

            // If position hasn't changed, don't process (e.g., already at boundary)
            if (targetRowIndex === currentRowIndex && targetColIndex === currentColIndex) {
                return;
            }

            e.preventDefault();

            // Get target cell
            const targetRow = tableBody.children[targetRowIndex];
            if (targetRow) {
                const targetCell = targetRow.children[targetColIndex + 1]; // +1 because first column is row number

                if (targetCell && targetCell.contentEditable === 'true') {
                    // 切换到目标单元格（只高亮，不进入编辑模式）
                    clearAllSelections();
                    setActiveCellWithoutFocus(targetCell);
                }
            }
        }
        return;
    } else if (e.key === 'Delete') {
        if (getSelectedCellCount() > 0) {
            e.preventDefault();
            const positions = getSelectedCells()
                .map((cell) => cellPosition(cell))
                .filter(Boolean);
            if (positions.length) clearBridgeCells(positions);
            recomputeSubmitState();
        }
    } else if (e.key === 'Backspace') {
        if (!isEditingCell && getSelectedCellCount() > 0) {
            e.preventDefault();
            const positions = getSelectedCells()
                .map((cell) => cellPosition(cell))
                .filter(Boolean);
            if (positions.length) clearBridgeCells(positions);
            recomputeSubmitState();
        }
    } else if (e.ctrlKey && key === 'a') {
        // Ctrl+A select all cells (unless cell is being edited)
        if (!isEditingCell) {
            e.preventDefault();
            selectAllCells();
        }
    } else if (e.ctrlKey && key === 'c') {
        // Ctrl+C copy selected cells (unless cell is being edited)
        if (!isEditingCell) {
            e.preventDefault();
            copySelectedCells();
        }
    } else if (e.ctrlKey && key === 'v') {
        if (!isEditingCell && getSelectedCellCount() > 0) {
            e.preventDefault();
            pasteToSelectedCells();
        }
    } else if (!isEditingCell && getSelectedCellCount() > 0) {
        // If cell is highlighted but not focused, and input is printable character, automatically enter edit mode
        // Check if it's a printable character (length 1, and not control character or function key)
        const isPrintableChar = e.key.length === 1 &&
            !e.ctrlKey && !e.metaKey && !e.altKey &&
            e.key !== 'Enter' && e.key !== 'Tab' &&
            !e.key.startsWith('Arrow') && !e.key.startsWith('F') &&
            e.key !== 'Home' && e.key !== 'End' &&
            e.key !== 'PageUp' && e.key !== 'PageDown' &&
            e.key !== 'Escape' && e.key !== 'Delete' && e.key !== 'Backspace';

        if (isPrintableChar) {
            const firstCell = getSelectedCells()[0];
            if (firstCell && firstCell.contentEditable === 'true') {
                const pos = cellPosition(firstCell);
                const typedChar = e.key.toUpperCase();
                setActiveCell(firstCell);
                if (pos) {
                    updateBridgeCell(pos.rowIndex, pos.colIndex, { value: typedChar });
                }
                firstCell.textContent = typedChar;
                moveCaretToEnd(firstCell);
                e.preventDefault();
                recomputeSubmitState();
            }
        }
    }
}
