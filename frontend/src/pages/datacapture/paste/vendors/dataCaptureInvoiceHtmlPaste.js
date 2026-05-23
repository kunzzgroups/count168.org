/** INVOICE HTML table fill. */



import { ensurePasteGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";

export function parseAndFillHtmlTableForInvoice(htmlString, startCell) {
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        const table = tempDiv.querySelector('table');
        if (!table) {
            return false;
        }

        console.log('2.10 INVOICE: Parsing HTML table and preserving PDF format...');

        // 获取所有行（包括表头）
        const allRows = table.querySelectorAll('tr');
        if (allRows.length === 0) {
            return false;
        }

        // 计算最大列数
        let maxCols = 0;
        allRows.forEach(tr => {
            const cells = tr.querySelectorAll('td, th');
            let colCount = 0;
            cells.forEach(cell => {
                const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                colCount += colspan;
            });
            maxCols = Math.max(maxCols, colCount);
        });

        if (maxCols === 0) {
            return false;
        }

        // 获取起始位置
        const startRow = Array.from(startCell.parentNode.parentNode.children).indexOf(startCell.parentNode);
        const startCol = parseInt(startCell.dataset.col);

        // 扩展表格（如果需要）
        const currentRows = document.querySelectorAll('#tableBody tr').length;
        const currentCols = document.querySelectorAll('#tableHeader th').length - 1;
        const requiredRows = startRow + allRows.length;
        const requiredCols = startCol + maxCols;

        if (requiredRows > currentRows || requiredCols > currentCols) {
            const targetRows = Math.max(currentRows, Math.min(requiredRows, 702)); // ZZ = 702 rows
            const targetCols = Math.max(currentCols, requiredCols);
            initializeTable(targetRows, targetCols);
        }

        // 填充数据并记录粘贴历史（用于撤销）
        const tableBody = document.getElementById('tableBody');
        // 重新获取列数（扩展表格后可能已改变）
        const actualCols = document.querySelectorAll('#tableHeader th').length - 1;
        const currentPasteChanges = [];
        let successCount = 0;

        allRows.forEach((sourceRow, rowIndex) => {
            const actualRowIndex = startRow + rowIndex;
            const tableRow = tableBody.children[actualRowIndex];
            if (!tableRow) return;

            const sourceCells = sourceRow.querySelectorAll('td, th');
            let currentCol = startCol;

            sourceCells.forEach(sourceCell => {
                const colspan = parseInt(sourceCell.getAttribute('colspan') || '1', 10);

                // 获取源单元格的完整HTML内容（包括格式）
                // 保留innerHTML以保持所有格式信息
                let cellContent = sourceCell.innerHTML;

                // 如果单元格为空，使用textContent作为后备
                if (!cellContent || cellContent.trim() === '') {
                    cellContent = sourceCell.textContent || '';
                }

                // 处理第一个单元格（colspan的主单元格）
                if (currentCol < actualCols) {
                    const targetCell = tableRow.children[currentCol + 1]; // +1 跳过行号列

                    if (targetCell && targetCell.contentEditable === 'true') {
                        const oldValue = targetCell.textContent || targetCell.innerHTML || '';

                        // 直接使用innerHTML保持PDF的原始格式
                        // 清理并保留格式：移除可能导致问题的样式，但保留数字格式
                        let cleanContent = cellContent;

                        // 移除可能导致问题的外部样式标签，但保留内联样式和格式
                        // 保留数字格式、日期格式等
                        cleanContent = cleanContent
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除style标签
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''); // 移除script标签

                        // 提取纯文本内容以检查是否需要分离 DESCRIPTION-AMOUNT 格式
                        const textContent = sourceCell.textContent || '';

                        // 检查是否是 DESCRIPTION-AMOUNT 格式（如 "Loyalty-24.79"）
                        // 如果检测到这种格式，且下一列存在且为空，则分离
                        if (/^[A-Za-z]+-[0-9.,-]+$/i.test(textContent.trim())) {
                            const match = textContent.trim().match(/^([A-Za-z]+)(-[0-9.,-]+)$/i);
                            if (match && currentCol + 1 < actualCols) {
                                const nextCell = tableRow.children[currentCol + 2]; // +2 跳过行号列和当前列
                                // 如果下一列存在且为空，才进行分离
                                if (nextCell && nextCell.contentEditable === 'true' &&
                                    (!nextCell.textContent || nextCell.textContent.trim() === '')) {
                                    // 分离 DESCRIPTION 和 AMOUNT
                                    const description = match[1];
                                    const amount = match[2];

                                    // 设置当前单元格为 DESCRIPTION
                                    if (cleanContent.includes('<') && cleanContent.includes('>')) {
                                        targetCell.innerHTML = description;
                                    } else {
                                        targetCell.textContent = description;
                                    }

                                    // 记录下一单元格的旧值（在设置新值之前）
                                    const nextOldValue = nextCell.textContent || nextCell.innerHTML || '';
                                    // 设置下一单元格为 AMOUNT
                                    nextCell.textContent = amount;
                                    currentPasteChanges.push({
                                        row: actualRowIndex,
                                        col: currentCol + 1,
                                        oldValue: nextOldValue,
                                        newValue: amount
                                    });

                                    if (amount && amount.trim() !== '') {
                                        successCount++;
                                    }
                                } else {
                                    // 下一列不为空，保持原样
                                    if (cleanContent.includes('<') && cleanContent.includes('>')) {
                                        targetCell.innerHTML = cleanContent;
                                    } else {
                                        targetCell.textContent = cellContent;
                                    }
                                }
                            } else {
                                // 无法分离或下一列不存在，保持原样
                                if (cleanContent.includes('<') && cleanContent.includes('>')) {
                                    targetCell.innerHTML = cleanContent;
                                } else {
                                    targetCell.textContent = cellContent;
                                }
                            }
                        } else {
                            // 不是 DESCRIPTION-AMOUNT 格式，正常处理
                            if (cleanContent.includes('<') && cleanContent.includes('>')) {
                                targetCell.innerHTML = cleanContent;
                            } else {
                                // 纯文本内容，但保留原始格式（包括空格、换行等）
                                targetCell.textContent = cellContent;
                            }
                        }

                        currentPasteChanges.push({
                            row: actualRowIndex,
                            col: currentCol,
                            oldValue: oldValue,
                            newValue: targetCell.textContent || targetCell.innerHTML
                        });

                        if (cellContent && cellContent.trim() !== '') {
                            successCount++;
                        }
                    }
                }

                // 处理colspan的后续列（填充空单元格）
                for (let i = 1; i < colspan; i++) {
                    currentCol++;
                    if (currentCol < actualCols) {
                        const targetCell = tableRow.children[currentCol + 1];
                        if (targetCell && targetCell.contentEditable === 'true') {
                            const oldValue = targetCell.textContent || targetCell.innerHTML || '';
                            targetCell.textContent = '';
                            currentPasteChanges.push({
                                row: actualRowIndex,
                                col: currentCol,
                                oldValue: oldValue,
                                newValue: ''
                            });
                        }
                    }
                }

                currentCol++;
            });
        });

        // 将本次粘贴操作添加到历史记录
        if (currentPasteChanges.length > 0) {
            pasteHistory.push(currentPasteChanges);
            if (pasteHistory.length > maxHistorySize) {
                pasteHistory.shift();
            }
        }

        if (successCount > 0) {
            showNotification(`2.10 INVOICE: 成功粘贴 ${successCount} 个单元格 (${allRows.length} 行 x ${maxCols} 列)，已保持PDF原始格式!`, 'success');
            setTimeout(updateSubmitButtonState, 0);
            return true;
        } else {
            console.log('2.10 INVOICE: No cells were pasted');
            return false;
        }
    } catch (error) {
        console.error('2.10 INVOICE: Error parsing HTML table:', error);
        return false;
    }
}
