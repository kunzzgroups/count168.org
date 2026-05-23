/** VPOWER paste. */
import { parseVPowerTableFormat } from "./dataCaptureVPowerParser.js";



import { ensurePasteGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";

/** @returns {boolean} */
export function handleVPowerPaste(e, pastedData) {
        console.log('VPOWER mode detected, attempting to parse...');
        console.log('Pasted data:', pastedData.substring(0, 200));
        let vpowerParsed = parseVPowerTableFormat(pastedData);
        console.log('VPOWER parse result:', vpowerParsed);

        if (vpowerParsed) {
            const { dataMatrix, maxRows, maxCols } = vpowerParsed;

            const startCell = e.target;
            const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
            // VPOWER 格式：强制从第一列（Column 1）开始粘贴，每行数据都从第一列开始
            const startCol = 0;

            const currentRows = document.querySelectorAll('#tableBody tr').length;
            const currentCols = document.querySelectorAll('#tableHeader th').length - 1;

            const requiredRows = startRow + maxRows;
            const requiredCols = startCol + maxCols;

            if (requiredRows > currentRows || requiredCols > currentCols) {
                const targetRows = Math.max(currentRows, Math.min(requiredRows, 702)); // ZZ = 702 rows
                const targetCols = Math.max(currentCols, requiredCols);
                ensurePasteGrid(targetRows, targetCols);
            }

            const tableBody = document.getElementById('tableBody');
            const currentPasteChanges = [];
            let successCount = 0;

            // 检测是否是列式格式（1行 x N列）
            const isColumnFormat = maxRows === 1 && maxCols > 1;

            dataMatrix.forEach((rowData, rowIndex) => {
                const actualRowIndex = startRow + rowIndex;
                const tableRow = tableBody.children[actualRowIndex];
                if (!tableRow) return;

                rowData.forEach((cellData, colIndex) => {
                    // 每行数据都从第一列（Column 1）开始
                    const actualColIndex = startCol + colIndex;
                    const cell = tableRow.children[actualColIndex + 1]; // +1 跳过行号列

                    if (cell && cell.contentEditable === 'true') {
                        const trimmedData = (cellData || '').trim();
                        currentPasteChanges.push({
                            row: actualRowIndex,
                            col: actualColIndex,
                            oldValue: cell.textContent,
                            newValue: trimmedData
                        });

                        // 对于列式格式，使用 innerHTML 来保留换行符，并设置样式允许多行显示
                        if (isColumnFormat && trimmedData.includes('\n')) {
                            // 设置样式允许多行显示
                            cell.style.whiteSpace = 'pre-wrap';
                            cell.style.wordBreak = 'break-word';
                            // 使用 innerHTML 来保留换行符（转义 HTML 特殊字符）
                            const escapedData = trimmedData
                                .replace(/&/g, '&amp;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;')
                                .replace(/\n/g, '<br>');
                            cell.innerHTML = escapedData;
                        } else {
                            // 普通格式：User Name 转为大写，profit 保持原样
                            if (colIndex === 0) {
                                cell.textContent = trimmedData.toUpperCase();
                            } else {
                                cell.textContent = trimmedData;
                            }
                        }

                        if (trimmedData) {
                            successCount++;
                        }
                    }
                });
            });

            window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);

            if (successCount > 0) {
                window.showNotification?.(`Successfully pasted VPOWER data (${maxRows} rows x ${maxCols} cols)!`, 'success');
            } else {
                window.showNotification?.('No cells were pasted from VPOWER format.', 'danger');
            }

            window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
            return true;
        } else {
            // VPOWER 模式下解析失败，给出提示但不阻止（让用户知道）
            console.log('VPOWER parser returned null, data may not match expected format');
            // 不 return，继续尝试其他解析器
        }
  return false;
}

