import { ensureGridFits, notifyPasteSuccess, resolvePasteAnchor } from "./dataCapturePasteApply.js";
import {
  detectColumnReorder,
  measureHtmlTable,
  sanitizePastedCellHtml,
} from "./dataCaptureClipboard.js";

/**
 * 1.Text — paste Excel HTML table while preserving cell formatting (Phase 4b).
 * Ported from `parseAndFillHTMLTableForText` (1.Text branch only).
 */
export function parseAndFillHtmlTableForText(htmlString, anchorCell) {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const table = tempDiv.querySelector("table");
    if (!table) return false;

    const measured = measureHtmlTable(table);
    if (!measured) return false;

    const { allRows, maxCols } = measured;
    const { startRow, startCol } = resolvePasteAnchor(anchorCell);

    ensureGridFits(startRow, startCol, allRows.length, maxCols);

    const tableBody = document.getElementById("tableBody");
    if (!tableBody) return false;

    const actualCols = document.querySelectorAll("#tableHeader th").length - 1;
    const columnOrder = detectColumnReorder(allRows);
    const changes = [];
    let successCount = 0;

    allRows.forEach((sourceRow, rowIndex) => {
      const actualRowIndex = startRow + rowIndex;
      const tableRow = tableBody.children[actualRowIndex];
      if (!tableRow) return;

      const rawCells = sourceRow.querySelectorAll("td, th");
      const sourceCells =
        columnOrder && rawCells.length >= columnOrder.length
          ? columnOrder.map((i) => rawCells[i])
          : Array.from(rawCells);

      let currentCol = startCol;

      sourceCells.forEach((sourceCell) => {
        const colspan = Number.parseInt(sourceCell.getAttribute("colspan") || "1", 10);
        let cellContent = sourceCell.innerHTML;
        if (!cellContent || cellContent.trim() === "") {
          cellContent = sourceCell.textContent || "";
        }

        if (currentCol < actualCols) {
          const targetCell = tableRow.children[currentCol + 1];
          if (targetCell?.contentEditable === "true") {
            const oldValue = targetCell.textContent || targetCell.innerHTML || "";
            const cellText = sourceCell.textContent || sourceCell.innerText || "";
            const cleanContent = sanitizePastedCellHtml(cellContent);

            if (cleanContent.includes("<") && cleanContent.includes(">")) {
              targetCell.innerHTML = cleanContent;
            } else {
              targetCell.textContent = cellContent;
            }

            changes.push({
              row: actualRowIndex,
              col: currentCol,
              oldValue,
              newValue: targetCell.textContent || targetCell.innerHTML,
            });

            if (cellText.trim() !== "") successCount += 1;
          }
        }

        for (let i = 1; i < colspan; i += 1) {
          currentCol += 1;
          if (currentCol < actualCols) {
            const targetCell = tableRow.children[currentCol + 1];
            if (targetCell?.contentEditable === "true") {
              const oldValue = targetCell.textContent || targetCell.innerHTML || "";
              targetCell.textContent = "";
              changes.push({
                row: actualRowIndex,
                col: currentCol,
                oldValue,
                newValue: "",
              });
            }
          }
        }

        currentCol += 1;
      });
    });

    if (changes.length > 0) {
      window.__DC_PUSH_PASTE_HISTORY__?.(changes);
    }

    if (successCount > 0) {
      notifyPasteSuccess(
        `成功粘贴 ${successCount} 个单元格 (${allRows.length} 行 x ${maxCols} 列)，已保持Excel原始格式!`,
      );
      window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
      return true;
    }

    return false;
  } catch (err) {
    console.error("1.Text: Error parsing HTML table:", err);
    return false;
  }
}
