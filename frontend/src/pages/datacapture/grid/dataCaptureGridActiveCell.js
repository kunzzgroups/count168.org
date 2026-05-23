/**
 * Active cell highlight, focus, and caret — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-grid-active-cell.mjs
 */

function clearAllSelections() {
  window.__DC_CLEAR_ALL_SELECTIONS__?.();
}

function registerSelectedCell(cell) {
  window.__DC_REGISTER_SELECTED_CELL__?.(cell);
}

export function highlightHeadersForCell(cell) {
    if (!cell || cell.contentEditable !== 'true') return;

    // Get column index from cell
    const colIndex = parseInt(cell.dataset.col);
    if (isNaN(colIndex)) return;

    // Get row index
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    const row = cell.parentElement;
    const rowIndex = Array.from(tableBody.children).indexOf(row);
    if (rowIndex === -1) return;

    // Clear previous cell-based header highlights (but keep column/row selection highlights)
    const headers = document.querySelectorAll('#dataTable th');
    headers.forEach((header, index) => {
        if (index === 0) return; // Skip first empty header
        if (index === colIndex + 1) {
            // Highlight this column header if not already selected
            if (!header.classList.contains('column-selected')) {
                header.classList.add('column-active');
            }
        } else {
            // Remove cell-based highlight (but keep selection highlight)
            if (!header.classList.contains('column-selected')) {
                header.classList.remove('column-active');
            }
        }
    });

    // Highlight row header
    const rowHeader = row.querySelector('.row-header');
    if (rowHeader) {
        if (!rowHeader.classList.contains('row-selected')) {
            // Only add active class if not already selected
            rowHeader.classList.add('row-active');
        }
    }

    // Remove active class from other row headers
    const allRows = Array.from(tableBody.children);
    allRows.forEach((r, index) => {
        const rh = r.querySelector('.row-header');
        if (rh) {
            if (index !== rowIndex && !rh.classList.contains('row-selected')) {
                rh.classList.remove('row-active');
            }
        }
    });
}

// Internal: Set current active cell highlight and selectedCells, does not control focus
export function setActiveCellCore(cell) {
    if (!cell || cell.contentEditable !== 'true') return;

    // First let the previously editing cell lose focus, hide old cursor
    const activeEl = document.activeElement;
    if (activeEl && activeEl !== cell && activeEl.contentEditable === 'true') {
        activeEl.blur();
    }

    // Clear all previous selections (including multi-select, column select, etc.)
    clearAllSelections();

    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
        const prevSelected = tableBody.querySelectorAll('td.selected');
        prevSelected.forEach(c => c.classList.remove('selected'));
    }

    // Set visual highlight for current cell
    cell.classList.add('selected');
    // Also serves as the current unique "multi-select" cell, convenient for Delete / Copy / Paste logic reuse
    registerSelectedCell(cell);
    cell.classList.add('multi-selected');

    // Highlight corresponding column and row headers
    highlightHeadersForCell(cell);
}

// Keyboard navigation / used when direct editing is needed: highlight and focus, show cursor
export function setActiveCell(cell) {
    if (!cell || cell.contentEditable !== 'true') return;
    setActiveCellCore(cell);
    cell.focus();
}

// Set cursor to end of cell text
export function moveCaretToEnd(cell) {
    try {
        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(cell);
        range.collapse(false); // false = cursor to end of content

        selection.removeAllRanges();
        selection.addRange(range);
    } catch (err) {
        console.error('Failed to move caret to end:', err);
    }
}

// First mouse click only highlights, no cursor appears
export function setActiveCellWithoutFocus(cell) {
    if (!cell || cell.contentEditable !== 'true') return;
    setActiveCellCore(cell);
}

// Second mouse click enters edit mode: highlight + focus + move cursor to end
export function setActiveCellForMouseEdit(cell) {
    if (!cell || cell.contentEditable !== 'true') return;
    setActiveCellCore(cell);
    cell.focus();
    moveCaretToEnd(cell);
}

// Move cursor to click position
export function moveCaretToClickPosition(cell, clickEvent) {
    try {
        // Ensure cell is focused
        if (document.activeElement !== cell) {
            cell.focus();
        }

        const selection = window.getSelection();
        if (!selection) return;

        // Use setTimeout to ensure focus is set and DOM is updated
        setTimeout(() => {
            try {
                let range = null;

                // Method 1: Try using caretRangeFromPoint (Chrome/Safari/Edge)
                if (document.caretRangeFromPoint) {
                    range = document.caretRangeFromPoint(clickEvent.clientX, clickEvent.clientY);
                    // Ensure range is within cell
                    if (range && cell.contains(range.commonAncestorContainer)) {
                        selection.removeAllRanges();
                        selection.addRange(range);
                        return;
                    }
                }

                // Method 2: Try using caretPositionFromPoint (Firefox)
                if (document.caretPositionFromPoint) {
                    const caretPos = document.caretPositionFromPoint(clickEvent.clientX, clickEvent.clientY);
                    if (caretPos && caretPos.offsetNode) {
                        // Ensure position is within cell
                        if (cell.contains(caretPos.offsetNode)) {
                            range = document.createRange();
                            range.setStart(caretPos.offsetNode, caretPos.offset);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                            return;
                        }
                    }
                }

                // Method 3: Manually calculate click position (fallback method)
                const rect = cell.getBoundingClientRect();
                const x = clickEvent.clientX - rect.left;
                const text = cell.textContent || '';

                if (text.length === 0) {
                    // If cell is empty, cursor at beginning
                    const newRange = document.createRange();
                    newRange.setStart(cell, 0);
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    return;
                }

                // Get text node
                let textNode = null;
                if (cell.firstChild && cell.firstChild.nodeType === Node.TEXT_NODE) {
                    textNode = cell.firstChild;
                } else {
                    // If no text node, create one
                    textNode = document.createTextNode(text);
                    cell.textContent = '';
                    cell.appendChild(textNode);
                }

                // Use more precise method to calculate character position
                // Create a temporary range to measure position of each character
                const tempRange = document.createRange();
                let charIndex = text.length; // Default at end
                let minDistance = Infinity;

                // Iterate through each character position to find character closest to click position
                for (let i = 0; i <= text.length; i++) {
                    tempRange.setStart(textNode, i);
                    tempRange.setEnd(textNode, i);
                    const charRect = tempRange.getBoundingClientRect();
                    const charX = charRect.left - rect.left;
                    const distance = Math.abs(x - charX);

                    // If this position is closer to click position, update index
                    if (distance < minDistance) {
                        minDistance = distance;
                        charIndex = i;
                    }

                    // If click position is before this character, select this position
                    if (x < charX && i > 0) {
                        charIndex = i;
                        break;
                    }
                }

                // Ensure index is within valid range
                charIndex = Math.max(0, Math.min(charIndex, text.length));

                // Create range and set cursor position
                const newRange = document.createRange();
                newRange.setStart(textNode, charIndex);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);

            } catch (err) {
                console.error('Error setting caret position:', err);
                // If all fail, at least ensure cursor is at end
                moveCaretToEnd(cell);
            }
        }, 10);
    } catch (err) {
        console.error('Error moving caret to click position:', err);
        // If error occurs, at least ensure cursor is at end
        cell.focus();
        moveCaretToEnd(cell);
    }
}
