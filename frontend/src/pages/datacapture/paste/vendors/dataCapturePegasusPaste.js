/** PEGASUS paste. */



import { ensurePasteGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";

/** @returns {boolean} */
export function handlePegasusPaste(e, pastedData) {
        console.log('PEGASUS mode detected, attempting to parse and merge into single row...');
        console.log('Pasted data length:', pastedData.length);
        console.log('Pasted data raw (first 500 chars):', pastedData.substring(0, 500));

        let dataMatrix = [];
        let allCells = [];

        // 优先尝试 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);

        if (htmlDataFromDetect) {
            console.log('PEGASUS: HTML data detected via detectAndParseHTML');
            dataMatrix = htmlDataFromDetect;
        } else {
            // 如果 HTML 解析失败，尝试手动解析 HTML
            let htmlData = null;
            try {
                htmlData = e.clipboardData.getData('text/html');
                if (htmlData && htmlData.toLowerCase().includes('<table')) {
                    console.log('PEGASUS: HTML data detected, parsing manually...');
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlData;

                    const table = tempDiv.querySelector('table');
                    if (table) {
                        // 处理表头（如果有）
                        const thead = table.querySelector('thead');
                        if (thead) {
                            const headerRows = thead.querySelectorAll('tr');
                            headerRows.forEach(tr => {
                                const cells = tr.querySelectorAll('th, td');
                                cells.forEach(cell => {
                                    const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                    let text = cell.textContent || cell.innerText || '';
                                    text = text.replace(/\s+/g, ' ').trim();
                                    if (text) allCells.push(text);
                                    for (let i = 1; i < colspan; i++) {
                                        allCells.push('');
                                    }
                                });
                            });
                        }

                        // 处理表体
                        let bodyContainer = table.querySelector('tbody');
                        if (!bodyContainer) {
                            bodyContainer = table;
                        }

                        const bodyRows = bodyContainer.querySelectorAll('tr');
                        bodyRows.forEach((tr) => {
                            if (thead && tr.closest('thead')) {
                                return;
                            }

                            const cells = tr.querySelectorAll('td, th');
                            cells.forEach(cell => {
                                const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                let text = cell.textContent || cell.innerText || '';
                                text = text.replace(/\s+/g, ' ').trim();
                                if (text) allCells.push(text);
                                for (let i = 1; i < colspan; i++) {
                                    allCells.push('');
                                }
                            });
                        });
                    }
                }
            } catch (err) {
                console.log('PEGASUS: Could not get HTML data from clipboard:', err);
            }
        }

        // 如果 HTML 解析成功，从 dataMatrix 提取所有单元格
        if (dataMatrix && dataMatrix.length > 0) {
            console.log('PEGASUS: Extracting cells from HTML data matrix...');
            dataMatrix.forEach(row => {
                if (Array.isArray(row)) {
                    row.forEach(cell => {
                        const trimmed = (cell || '').toString().trim();
                        if (trimmed) allCells.push(trimmed);
                    });
                }
            });
        }

        // 如果 HTML 解析失败或没有数据，尝试纯文本解析
        if (allCells.length === 0) {
            console.log('PEGASUS: Trying text-based parsing...');
            const normalizedData = pastedData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalizedData.split('\n').map(line => line.trim()).filter(line => line !== '');

            lines.forEach(line => {
                if (line.includes('\t')) {
                    // 制表符分隔
                    const cells = line.split('\t').map(c => c.trim()).filter(c => c !== '');
                    allCells.push(...cells);
                } else {
                    // 空格分隔（多个空格或单个空格）
                    const cells = line.split(/\s+/).map(c => c.trim()).filter(c => c !== '');
                    allCells.push(...cells);
                }
            });
        }

        // 合并所有单元格成一行
        if (allCells.length > 0) {
            console.log('PEGASUS: Merged all data into single row with', allCells.length, 'cells');
            console.log('PEGASUS: First 10 cells:', allCells.slice(0, 10));

            const startCell = e.target;
            const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
            // PEGASUS 格式：强制从第一列（Column 1）开始粘贴
            const startCol = 0;

            const currentRows = document.querySelectorAll('#tableBody tr').length;
            const currentCols = document.querySelectorAll('#tableHeader th').length - 1;
            const requiredCols = startCol + allCells.length;

            if (requiredCols > currentCols) {
                const targetCols = Math.max(currentCols, requiredCols);
                ensurePasteGrid(currentRows, targetCols);
            }

            const tableBody = document.getElementById('tableBody');
            const tableRow = tableBody.children[startRow];
            const currentPasteChanges = [];
            let successCount = 0;

            allCells.forEach((cellData, colIndex) => {
                const actualColIndex = startCol + colIndex;
                const cell = tableRow.children[actualColIndex + 1]; // +1 跳过行号列

                if (cell && cell.contentEditable === 'true') {
                    const trimmedData = (cellData || '').trim();
                    currentPasteChanges.push({
                        row: startRow,
                        col: actualColIndex,
                        oldValue: cell.textContent,
                        newValue: trimmedData
                    });

                    // 保持原始数据，不做任何转换
                    cell.textContent = trimmedData;

                    if (trimmedData) {
                        successCount++;
                    }
                }
            });

            window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);

            if (successCount > 0) {
                window.showNotification?.(`Successfully pasted PEGASUS data (1 row x ${allCells.length} cols)!`, 'success');
            } else {
                window.showNotification?.('No cells were pasted from PEGASUS format.', 'danger');
            }

            window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
            return true;
        } else {
            console.log('PEGASUS: No data extracted, continuing with other parsers');
        }
  return false;
}

