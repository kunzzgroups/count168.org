/** AWC paste handler. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { parseAWCPatternBasedData, parseAndFillHtmlTableForAwc } from "./dataCaptureAwcPaste.js";



import { ensurePasteGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";

/** @returns {boolean} */
export function handleAwcPaste(e, pastedData) {
        console.log('AWC mode detected (2.7), attempting to preserve table row format...');
        console.log('Pasted data length:', pastedData.length);
        console.log('Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

        const startCell = e.target;
        let formatDetected = false;

        // 方法1：优先尝试HTML表格格式（从网页复制的内容通常是HTML格式）
        try {
            let htmlData = e.clipboardData.getData('text/html');
            if (htmlData && htmlData.includes('<table')) {
                console.log('AWC (2.7): HTML table format detected');
                const filled = parseAndFillHtmlTableForAwc(htmlData, startCell);
                if (filled) {
                    formatDetected = true;
                    return; // 成功处理，直接返回
                }
            }
        } catch (err) {
            console.log('AWC (2.7): Could not get HTML data from clipboard:', err);
        }

        // 方法2：如果HTML解析失败，尝试使用detectAndParseHTML
        if (!formatDetected) {
            const htmlDataFromDetect = detectHtmlTableInClipboard(e);
            if (htmlDataFromDetect) {
                console.log('AWC (2.7): HTML data detected via detectAndParseHTML');
                const filled = parseAndFillHtmlTableForAwc(htmlDataFromDetect, startCell);
                if (filled) {
                    formatDetected = true;
                    return; // 成功处理，直接返回
                }
            }
        }

        // 方法3：如果HTML解析都失败，尝试制表符分隔格式（Excel格式）
        if (!formatDetected) {
            console.log('AWC (2.7): HTML parsing failed, trying tab-separated format...');
            const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedData.split('\n').filter(line => line.trim() !== '');

            if (lines.length > 0) {
                // 检查是否是多行制表符分隔的数据（标准Excel格式）
                const hasTabSeparator = lines.some(line => line.includes('\t'));

                if (hasTabSeparator) {
                    const dataMatrix = [];
                    let maxCols = 0;

                    lines.forEach(line => {
                        if (line.includes('\t')) {
                            // 制表符分隔，保持原始格式（包括空白单元格）
                            // split('\t') 会保留空白单元格（空字符串）
                            const cells = line.split('\t').map(cell => cell || ''); // 确保空单元格是空字符串，不是undefined
                            dataMatrix.push(cells);
                            maxCols = Math.max(maxCols, cells.length);
                        } else if (line !== '') {
                            dataMatrix.push([line]);
                            maxCols = Math.max(maxCols, 1);
                        }
                    });

                    // 确保所有行都有相同的列数（填充空白单元格以保持列位置）
                    dataMatrix.forEach(row => {
                        while (row.length < maxCols) {
                            row.push(''); // 填充空字符串以保持列位置
                        }
                    });

                    // 填充到表格（包括空白单元格）
                    if (dataMatrix.length > 0 && maxCols > 0) {
                        const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
                        const startCol = parseInt(startCell.dataset.col);

                        const currentRows = document.querySelectorAll('#tableBody tr').length;
                        const currentCols = document.querySelectorAll('#tableHeader th').length - 1;
                        const requiredRows = startRow + dataMatrix.length;
                        const requiredCols = startCol + maxCols;

                        if (requiredRows > currentRows || requiredCols > currentCols) {
                            const targetRows = Math.max(currentRows, Math.min(requiredRows, 702));
                            const targetCols = Math.max(currentCols, requiredCols);
                            ensurePasteGrid(targetRows, targetCols);
                        }

                        const tableBody = document.getElementById('tableBody');
                        const currentPasteChanges = [];
                        let successCount = 0;

                        dataMatrix.forEach((rowData, rowIndex) => {
                            const actualRowIndex = startRow + rowIndex;
                            const tableRow = tableBody.children[actualRowIndex];
                            if (!tableRow) return;

                            rowData.forEach((cellData, colIndex) => {
                                const actualColIndex = startCol + colIndex;
                                const cell = tableRow.children[actualColIndex + 1];

                                if (cell && cell.contentEditable === 'true') {
                                    // 保留空白单元格：即使cellData是空字符串，也要设置
                                    // trim()不会影响空字符串，但会去除空格
                                    const cellValue = (cellData !== null && cellData !== undefined) ? String(cellData).trim() : '';

                                    currentPasteChanges.push({
                                        row: actualRowIndex,
                                        col: actualColIndex,
                                        oldValue: cell.textContent,
                                        newValue: cellValue
                                    });

                                    // 明确设置单元格内容（包括空字符串以保持空白单元格）
                                    cell.textContent = cellValue;

                                    // 即使单元格是空的，也要计入（因为我们保留了空白单元格的位置）
                                    if (cellValue !== '') {
                                        successCount++;
                                    }
                                }
                            });
                        });

                        window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);

                        if (successCount > 0) {
                            window.showNotification?.(`AWC (2.7): 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${maxCols} 列)，已保持表格行格式!`, 'success');
                            window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
                            return true; // 成功处理，直接返回
                        }
                    }
                } else {
                    // 方法3.5：纯文本格式（换行符分隔），尝试根据数据模式智能分组成行
                    console.log('AWC (2.7): No tab separator found, trying pattern-based row grouping...');
                    const dataMatrix = parseAWCPatternBasedData(lines);

                    if (dataMatrix && dataMatrix.length > 0) {
                        const maxCols = Math.max(...dataMatrix.map(row => row.length));

                        // 确保所有行都有相同的列数
                        dataMatrix.forEach(row => {
                            while (row.length < maxCols) {
                                row.push('');
                            }
                        });

                        // 填充到表格
                        const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
                        const startCol = parseInt(startCell.dataset.col);

                        const currentRows = document.querySelectorAll('#tableBody tr').length;
                        const currentCols = document.querySelectorAll('#tableHeader th').length - 1;
                        const requiredRows = startRow + dataMatrix.length;
                        const requiredCols = startCol + maxCols;

                        if (requiredRows > currentRows || requiredCols > currentCols) {
                            const targetRows = Math.max(currentRows, Math.min(requiredRows, 702));
                            const targetCols = Math.max(currentCols, requiredCols);
                            ensurePasteGrid(targetRows, targetCols);
                        }

                        const tableBody = document.getElementById('tableBody');
                        const currentPasteChanges = [];
                        let successCount = 0;

                        dataMatrix.forEach((rowData, rowIndex) => {
                            const actualRowIndex = startRow + rowIndex;
                            const tableRow = tableBody.children[actualRowIndex];
                            if (!tableRow) return;

                            rowData.forEach((cellData, colIndex) => {
                                const actualColIndex = startCol + colIndex;
                                const cell = tableRow.children[actualColIndex + 1];

                                if (cell && cell.contentEditable === 'true') {
                                    const cellValue = (cellData || '').trim();
                                    currentPasteChanges.push({
                                        row: actualRowIndex,
                                        col: actualColIndex,
                                        oldValue: cell.textContent,
                                        newValue: cellValue
                                    });

                                    cell.textContent = cellValue;
                                    if (cellValue) {
                                        successCount++;
                                    }
                                }
                            });
                        });

                        window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);

                        if (successCount > 0) {
                            window.showNotification?.(`AWC (2.7): 成功粘贴 ${successCount} 个单元格 (${dataMatrix.length} 行 x ${maxCols} 列)，已根据数据模式智能分组!`, 'success');
                            window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
                            return true; // 成功处理，直接返回
                        }
                    }
                }
            }
        }

        // 方法4：如果所有解析都失败，继续使用默认处理逻辑（但会智能检测列数，不会强制1列）
        console.log('AWC (2.7): All parsing methods failed, continuing with default logic (will auto-detect columns)');
  return false;
}

