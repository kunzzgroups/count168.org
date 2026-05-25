/** Ported from js/datacapture.js — 2.Format grid fill (Phase 4c). */

import {
  sanitizeFormatHtmlFragment,
  sanitizeCopiedStyleString,
  stripBackgroundFromStyle,
} from './dataCaptureFormatStyleUtils.js';


import { ensurePasteGrid } from './dataCapturePasteApply.js';

export function parseAndFillHtmlTableForFormat(htmlString, options = {}) {
    const startRow = Number.isFinite(options.startRow) && options.startRow >= 0 ? options.startRow : 0;
    try {
        // 在解析前先检查原始HTML是否包含<br>标签
        // Check if original HTML contains <br> tags before parsing
        const hasBrInOriginal = /<br\s+[^>]*>/i.test(htmlString) || /<br\s*\/?>/i.test(htmlString);
        console.log(`Format: Parsing HTML table with header support... hasBrInOriginal=${hasBrInOriginal}`);

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        const table = tempDiv.querySelector('table');
        if (!table) {
            return false;
        }

        // 获取所有行（包括表头）
        const allRows = table.querySelectorAll('tr');
        if (allRows.length === 0) {
            return false;
        }

        // 分离表头行和数据行
        const headerRows = [];
        const dataRows = [];

        allRows.forEach(tr => {
            const hasTh = tr.querySelectorAll('th').length > 0;
            if (hasTh) {
                headerRows.push(tr);
            } else {
                dataRows.push(tr);
            }
        });

        // 计算最大列数（包括表头和数据行）
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

        // 确保表格有足够的行和列
        let tableBody = document.getElementById('tableBody');
        const tableHeader = document.getElementById('tableHeader');
        if (!tableBody || !tableHeader) {
            return false;
        }

        const currentRows = tableBody.children.length;
        const currentCols = document.querySelectorAll('#tableHeader th').length - 1;

        // 2.Format模式：预先检测需要拆分的行，计算实际需要的行数
        // 2.Format mode: Pre-detect rows that need splitting, calculate actual required rows
        let actualRequiredRows = dataRows.length;
        dataRows.forEach((sourceRow) => {
            const sourceCells = sourceRow.querySelectorAll('td, th');
            if (sourceCells.length === 0) return;
            // 只根据第一格（行标签列）的 BR/SPAN 结构判断，不抓字
            const firstCell = sourceCells[0];
            let cellHtml = firstCell.innerHTML || '';
            let cellText = (firstCell.textContent || firstCell.innerText || '').trim();
            let hasBrTag = /<br\s*\/?>/i.test(cellHtml) || /<br\s+[^>]*>/i.test(cellHtml);
            let hasNewline = cellText.includes('\n') || cellText.includes('\r\n') || cellText.includes('\r');
            let needsSplit = false;
            if (hasBrTag || hasNewline) {
                let lines = [];
                if (hasBrTag) {
                    let htmlWithMarker = cellHtml.replace(/<br\s+[^>]*>/gi, '|||SPLIT_MARKER|||').replace(/<br\s*\/?>/gi, '|||SPLIT_MARKER|||');
                    let tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlWithMarker;
                    let textWithMarker = tempDiv.textContent || tempDiv.innerText || '';
                    lines = textWithMarker.split('|||SPLIT_MARKER|||').map(e => (e || '').trim()).filter(e => e !== '');
                } else {
                    lines = cellText.split(/\r?\n|\r/).map(e => e.trim()).filter(e => e !== '');
                }
                if (lines.length >= 2) needsSplit = true;
            } else {
                let directSpans = firstCell.querySelectorAll(':scope > span');
                if (directSpans.length >= 2) {
                    let parts = Array.from(directSpans).map(s => (s.textContent || '').trim()).filter(e => e !== '');
                    if (parts.length >= 2) needsSplit = true;
                }
            }
            if (needsSplit) {
                actualRequiredRows++; // 第一格有 BR/SPAN 结构时占用两行
            }
        });

        const requiredRows = startRow + actualRequiredRows;
        const requiredCols = Math.max(maxCols, currentCols);

        if (requiredRows > currentRows || requiredCols > currentCols) {
            const targetRows = Math.max(currentRows, Math.min(requiredRows, 702));
            const targetCols = Math.max(currentCols, requiredCols);
            ensurePasteGrid(targetRows, targetCols);
        }

        // 重新获取表头和表体（因为可能被重新初始化）
        const headerRow = tableHeader.querySelector('tr');
        const actualCols = document.querySelectorAll('#tableHeader th').length - 1;
        const currentPasteChanges = [];
        let successCount = 0;

        // 处理表头行：填充到tableHeader（追加粘贴时跳过，避免覆盖已有表头）
        if (startRow === 0 && headerRows.length > 0 && headerRow) {
            const firstHeaderRow = headerRows[0];
            const headerCells = firstHeaderRow.querySelectorAll('th, td');
            let currentCol = 0;

            headerCells.forEach((sourceCell, index) => {
                if (index === 0 && currentCol === 0) {
                    // 跳过第一个空表头（行号列的表头）
                    currentCol++;
                }

                const colspan = parseInt(sourceCell.getAttribute('colspan') || '1', 10);
                const cellContent = sourceCell.innerHTML || sourceCell.textContent || '';
                const cellText = sourceCell.textContent || sourceCell.innerText || '';

                // 处理表头单元格
                if (currentCol < actualCols) {
                    const targetHeader = headerRow.children[currentCol + 1];
                    if (targetHeader) {
                        const oldValue = targetHeader.textContent || targetHeader.innerHTML || '';

                        // 保留所有格式和样式
                        let cleanContent = cellContent
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/javascript:/gi, '')
                            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

                        if (cleanContent.includes('<') && cleanContent.includes('>')) {
                            // 2.Format：移除class/id与布局样式，避免跑到页面最上面
                            targetHeader.innerHTML = sanitizeFormatHtmlFragment(cleanContent);
                        } else {
                            targetHeader.textContent = cellText;
                        }

                        // 保留样式（包括背景色、文字颜色等所有样式）
                        const sourceCellStyle = sourceCell.getAttribute('style');
                        const sourceCellComputedStyle = window.getComputedStyle(sourceCell);

                        if (sourceCellStyle) {
                            const sanitizedStyle = sanitizeCopiedStyleString(sourceCellStyle);
                            if (sanitizedStyle) {
                                targetHeader.setAttribute('style', sanitizedStyle);
                                targetHeader.style.cssText = sanitizedStyle;
                            } else {
                                targetHeader.removeAttribute('style');
                                targetHeader.style.cssText = '';
                            }
                        } else {
                            // 即使没有style属性，也尝试从computed style获取样式
                            const bgColor = sourceCellComputedStyle.backgroundColor;
                            const color = sourceCellComputedStyle.color;
                            const fontWeight = sourceCellComputedStyle.fontWeight;
                            const textAlign = sourceCellComputedStyle.textAlign;

                            let styleString = '';
                            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                                styleString += ` background-color: ${bgColor} !important;`;
                            }
                            if (color && color !== 'rgb(0, 0, 0)') {
                                styleString += ` color: ${color} !important;`;
                            }
                            if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') {
                                styleString += ` font-weight: ${fontWeight} !important;`;
                            }
                            if (textAlign && textAlign !== 'left') {
                                styleString += ` text-align: ${textAlign} !important;`;
                            }
                            if (styleString) {
                                targetHeader.setAttribute('style', styleString);
                                targetHeader.style.cssText = styleString;
                            }
                        }

                        // 2.Format：不要复制class，避免外部CSS（如fixedDataTable...）影响布局

                        currentPasteChanges.push({
                            type: 'header',
                            col: currentCol,
                            oldValue: oldValue,
                            newValue: cellText || cleanContent
                        });

                        if (cellText && cellText.trim() !== '') {
                            successCount++;
                        }
                    }
                }

                // 处理colspan
                for (let i = 1; i < colspan; i++) {
                    currentCol++;
                    if (currentCol < actualCols) {
                        const targetHeader = headerRow.children[currentCol + 1];
                        if (targetHeader) {
                            targetHeader.textContent = '';
                        }
                    }
                }

                currentCol++;
            });
        }

        // 处理数据行：填充到tableBody
        // 使用实际行索引（考虑拆分后的行）
        // Use actual row index (considering split rows)
        let actualRowIndex = startRow;
        console.log(`Format: Starting to process ${dataRows.length} data rows at row ${startRow}`);
        dataRows.forEach((sourceRow, sourceRowIndex) => {
            let tableRow = tableBody.children[actualRowIndex];
            if (!tableRow) {
                console.warn(`Format: tableRow not found at actualRowIndex ${actualRowIndex}`);
                return;
            }

            console.log(`Format: Processing source row ${sourceRowIndex}, actual row ${actualRowIndex}`);

            // 保留行的样式（包括背景色等）
            const sourceRowStyle = sourceRow.getAttribute('style');
            const sourceRowComputedStyle = window.getComputedStyle(sourceRow);

            const sourceCells = sourceRow.querySelectorAll('td, th');
            console.log(`Format: Source row ${sourceRowIndex} has ${sourceCells.length} cells`);

            // 2.Format模式：检测任何单元格中有上下两个数据的情况
            // 支持：1)<br>标签 2)换行符 3)无br时文本连在一起（如 "Sub TotalGrand Total"、"191191"）
            // 2.Format mode: Detect any cell with top and bottom data (br, newline, or concatenated text)
            let hasVerticalSplit = false;
            let cellsWithSplit = [];

            // 先检查整个行的HTML，看是否有<br>标签
            // First check the entire row HTML to see if there are <br> tags
            let rowHtml = sourceRow.innerHTML || '';
            let rowHasBr = /<br\s+[^>]*>/i.test(rowHtml) || /<br\s*\/?>/i.test(rowHtml);
            console.log(`Format: Row ${sourceRowIndex}: rowHasBr=${rowHasBr}, checking individual cells...`);

            sourceCells.forEach((sourceCell, cellIndex) => {
                let cellHtml = sourceCell.innerHTML || '';
                let cellText = (sourceCell.textContent || sourceCell.innerText || '').trim();

                // 更严格的<br>检测：检查各种可能的<br>写法（包括带属性的）
                // More strict <br> detection: check various <br> formats (including with attributes)
                let hasBrTag = /<br\s*\/?>/i.test(cellHtml) ||
                    /<br\s+[^>]*>/i.test(cellHtml) ||
                    /<br\s+style[^>]*>/i.test(cellHtml);

                let hasNewline = cellText.includes('\n') || cellText.includes('\r\n') || cellText.includes('\r');

                // 调试日志：显示前几个单元格的检测结果
                if (cellIndex < 5) {
                    console.log(`Format: Row ${sourceRowIndex}, Cell ${cellIndex}: hasBrTag=${hasBrTag}, hasNewline=${hasNewline}, htmlLength=${cellHtml.length}, text="${cellText.substring(0, 60)}"`);
                }

                let lines = [];

                if (hasBrTag) {
                    // 使用<br>标签拆分（优先处理）
                    // 将各种<br>标签（包括带属性的）替换为特殊标记，然后拆分
                    // Replace various <br> tags (including with attributes) with special marker, then split
                    let htmlWithMarker = cellHtml.replace(/<br\s+[^>]*>/gi, '|||SPLIT_MARKER|||')
                        .replace(/<br\s*\/?>/gi, '|||SPLIT_MARKER|||');
                    let tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlWithMarker;
                    let textWithMarker = tempDiv.textContent || tempDiv.innerText || '';
                    lines = textWithMarker.split('|||SPLIT_MARKER|||').map(e => {
                        let cleanDiv = document.createElement('div');
                        cleanDiv.innerHTML = e;
                        return (cleanDiv.textContent || cleanDiv.innerText || '').trim();
                    }).filter(e => e !== '');

                    if (cellIndex < 5 || lines.length >= 2) {
                        console.log(`Format: Row ${sourceRowIndex}, Cell ${cellIndex}: Split by <br> tag, found ${lines.length} lines:`, lines);
                    }
                } else if (hasNewline) {
                    lines = cellText.split(/\r?\n|\r/).map(e => e.trim()).filter(e => e !== '');
                    if (cellIndex < 5) {
                        console.log(`Format: Row ${sourceRowIndex}, Cell ${cellIndex}: Split by newline, found ${lines.length} lines:`, lines);
                    }
                } else {
                    // 无 br/换行：只抓取 SPAN 结构，不抓字。多个直接子 span 视为上下两段
                    let directSpans = sourceCell.querySelectorAll(':scope > span');
                    if (directSpans.length >= 2) {
                        let parts = Array.from(directSpans).map(s => (s.textContent || '').trim()).filter(e => e !== '');
                        if (parts.length >= 2) {
                            lines = [parts[0], parts[1]];
                        }
                        if (cellIndex < 5 && lines.length >= 2) {
                            console.log(`Format: Row ${sourceRowIndex}, Cell ${cellIndex}: Split by span, found ${parts.length} parts`);
                        }
                    }
                }

                if (lines.length >= 2) {
                    hasVerticalSplit = true;
                    cellsWithSplit.push({
                        index: cellIndex,
                        cell: sourceCell,
                        topData: lines[0],
                        bottomData: lines[1],
                        allLines: lines
                    });
                    if (cellIndex < 5) {
                        console.log(`Format: Row ${sourceRowIndex}, Cell ${cellIndex}: Added to cellsWithSplit - top="${lines[0]}", bottom="${lines[1]}"`);
                    }
                }
            });

            // 若本行已因第一格 BR/SPAN 被标记为需拆分，对尚未拆分的单元格按“长度一半”拆（如 53,627.0053,627.00）
            if (hasVerticalSplit && cellsWithSplit.length > 0) {
                sourceCells.forEach((sourceCell, cellIndex) => {
                    if (cellsWithSplit.some(s => s.index === cellIndex)) return;
                    let cellText = (sourceCell.textContent || sourceCell.innerText || '').trim();
                    if (cellText.length < 4) return;
                    const half = Math.floor(cellText.length / 2);
                    const first = cellText.substring(0, half).trim();
                    const second = cellText.substring(half).trim();
                    if (first !== '' && second !== '') {
                        cellsWithSplit.push({
                            index: cellIndex,
                            cell: sourceCell,
                            topData: first,
                            bottomData: second,
                            allLines: [first, second]
                        });
                    }
                });
            }

            console.log(`Format: Row ${sourceRowIndex}: Final check - hasVerticalSplit=${hasVerticalSplit}, cellsWithSplit.length=${cellsWithSplit.length}`);

            // 不抓字，只抓 BR/SPAN：仅当第一格（行标签列）有 BR 或 多 SPAN 结构时才拆分
            let isFirstCellWithBrOrSpan = cellsWithSplit.some(s => s.index === 0);
            if (isFirstCellWithBrOrSpan && hasVerticalSplit && cellsWithSplit.length > 0) {
                console.log(`Format: ✓ Detected ${cellsWithSplit.length} cell(s) with vertically stacked data in source row ${sourceRowIndex} (actual row ${actualRowIndex}), splitting into two rows`);
                console.log(`Format: cellsWithSplit details:`, cellsWithSplit.map(s => ({ index: s.index, top: s.topData, bottom: s.bottomData })));

                // 确保有足够的行（需要两行：第一行和第二行）
                // Ensure enough rows (need two rows: first row and second row)
                let nextRowIndex = actualRowIndex + 1;
                if (nextRowIndex >= tableBody.children.length) {
                    const currentRowsCount = tableBody.children.length;
                    console.log(`Format: Expanding table from ${currentRowsCount} rows to ${nextRowIndex + 1} rows`);
                    ensurePasteGrid(Math.max(currentRowsCount, nextRowIndex + 1), actualCols);
                    // 重新获取tableBody和tableRow
                    const updatedTableBody = document.getElementById('tableBody');
                    if (!updatedTableBody) {
                        console.error('Format: Failed to get updated tableBody after expansion');
                        return;
                    }
                    tableBody = updatedTableBody;
                    tableRow = tableBody.children[actualRowIndex];
                    if (!tableRow) {
                        console.error(`Format: Failed to get tableRow at index ${actualRowIndex} after expansion`);
                        return;
                    }
                    // 重新获取actualCols（可能已改变）
                    actualCols = document.querySelectorAll('#tableHeader th').length - 1;
                }

                const nextTableRow = tableBody.children[nextRowIndex];
                if (!nextTableRow) {
                    console.error(`Format: Failed to get nextTableRow at index ${nextRowIndex}`);
                    return;
                }

                // 2.Format模式：数据行不保留背景色，只保留其他样式（如有）
                if (sourceRowStyle) {
                    const sanitizedRowStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceRowStyle));
                    if (sanitizedRowStyle) {
                        tableRow.setAttribute('style', sanitizedRowStyle);
                        tableRow.style.cssText = sanitizedRowStyle;
                        nextTableRow.setAttribute('style', sanitizedRowStyle);
                        nextTableRow.style.cssText = sanitizedRowStyle;
                    }
                }
                // 不再从 computed 复制行背景色

                // 处理每个单元格，拆分上下数据
                // Process each cell, split top and bottom data
                let currentCol = 0;
                sourceCells.forEach((sourceCell, cellIndex) => {
                    const colspan = parseInt(sourceCell.getAttribute('colspan') || '1', 10);

                    // 检测单元格中的上下数据
                    // Detect top and bottom data in cell
                    let topData = '';
                    let bottomData = '';

                    // 查找这个单元格是否在cellsWithSplit中
                    // Find if this cell is in cellsWithSplit
                    const splitInfo = cellsWithSplit.find(s => s.index === cellIndex);

                    if (splitInfo) {
                        // 这个单元格有上下两个数据，使用已提取的数据
                        // This cell has top and bottom data, use extracted data
                        topData = splitInfo.topData;
                        bottomData = splitInfo.bottomData;
                    } else {
                        // 这个单元格没有上下拆分，需要提取纯文本（不包含HTML标签）
                        // This cell has no vertical split, extract plain text (without HTML tags)
                        let cellHtml = sourceCell.innerHTML || '';
                        let tempDiv = document.createElement('div');
                        tempDiv.innerHTML = cellHtml;
                        let plainText = (tempDiv.textContent || tempDiv.innerText || '').trim();
                        // 上下数据相同（复制到两行）
                        // Top and bottom data are the same (copy to both rows)
                        topData = plainText;
                        bottomData = plainText;
                    }

                    // 获取源单元格样式（用于保留颜色）
                    // Get source cell styles (to preserve colors)
                    const sourceCellStyle = sourceCell.getAttribute('style');
                    const sourceCellComputedStyle = window.getComputedStyle(sourceCell);

                    // 填充第一行（当前行）- 使用上面的数据
                    // Fill first row (current row) - use top data
                    if (currentCol < actualCols) {
                        const targetCell = tableRow.children[currentCol + 1];
                        if (targetCell && targetCell.contentEditable === 'true') {
                            const oldValue = targetCell.textContent || targetCell.innerHTML || '';
                            targetCell.textContent = topData;

                            // 2.Format模式：数据格不保留背景色，只保留边框及其他样式
                            if (sourceCellStyle) {
                                const sanitizedCellStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceCellStyle));
                                let mergedStyle = sanitizedCellStyle && !sanitizedCellStyle.includes('border') ? `border: 1px solid #d0d7de !important; ${sanitizedCellStyle}` : (sanitizedCellStyle || 'border: 1px solid #d0d7de !important;');
                                targetCell.setAttribute('style', mergedStyle);
                                targetCell.style.cssText = mergedStyle;
                            } else if (sourceCellComputedStyle) {
                                const color = sourceCellComputedStyle.color;
                                const fontWeight = sourceCellComputedStyle.fontWeight;
                                const textAlign = sourceCellComputedStyle.textAlign;
                                let styleString = 'border: 1px solid #d0d7de !important;';
                                if (color && color !== 'rgb(0, 0, 0)') styleString += ` color: ${color} !important;`;
                                if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') styleString += ` font-weight: ${fontWeight} !important;`;
                                if (textAlign && textAlign !== 'left') styleString += ` text-align: ${textAlign} !important;`;
                                targetCell.setAttribute('style', styleString);
                                targetCell.style.cssText = styleString;
                            } else {
                                targetCell.style.border = '1px solid #d0d7de';
                                targetCell.style.padding = '4px 8px';
                            }
                            if (!targetCell.style.border || targetCell.style.border === 'none' || targetCell.style.border === '0px') {
                                targetCell.style.border = '1px solid #d0d7de';
                            }
                            currentPasteChanges.push({
                                row: actualRowIndex,
                                col: currentCol,
                                oldValue: oldValue,
                                newValue: topData
                            });

                            if (topData && topData.trim() !== '') {
                                successCount++;
                            }
                        }
                    }

                    // 填充第二行（下一行）- 使用下面的数据
                    // Fill second row (next row) - use bottom data
                    if (currentCol < actualCols) {
                        const targetCell = nextTableRow.children[currentCol + 1];
                        if (targetCell && targetCell.contentEditable === 'true') {
                            const oldValue = targetCell.textContent || targetCell.innerHTML || '';
                            targetCell.textContent = bottomData;

                            // 2.Format模式：数据格不保留背景色
                            if (sourceCellStyle) {
                                const sanitizedCellStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceCellStyle));
                                let mergedStyle = sanitizedCellStyle && !sanitizedCellStyle.includes('border') ? `border: 1px solid #d0d7de !important; ${sanitizedCellStyle}` : (sanitizedCellStyle || 'border: 1px solid #d0d7de !important;');
                                targetCell.setAttribute('style', mergedStyle);
                                targetCell.style.cssText = mergedStyle;
                            } else if (sourceCellComputedStyle) {
                                const color = sourceCellComputedStyle.color;
                                const fontWeight = sourceCellComputedStyle.fontWeight;
                                const textAlign = sourceCellComputedStyle.textAlign;
                                let styleString = 'border: 1px solid #d0d7de !important;';
                                if (color && color !== 'rgb(0, 0, 0)') styleString += ` color: ${color} !important;`;
                                if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') styleString += ` font-weight: ${fontWeight} !important;`;
                                if (textAlign && textAlign !== 'left') styleString += ` text-align: ${textAlign} !important;`;
                                targetCell.setAttribute('style', styleString);
                                targetCell.style.cssText = styleString;
                            } else {
                                targetCell.style.border = '1px solid #d0d7de';
                                targetCell.style.padding = '4px 8px';
                            }
                            if (!targetCell.style.border || targetCell.style.border === 'none' || targetCell.style.border === '0px') {
                                targetCell.style.border = '1px solid #d0d7de';
                            }
                            currentPasteChanges.push({
                                row: nextRowIndex,
                                col: currentCol,
                                oldValue: oldValue,
                                newValue: bottomData
                            });

                            if (bottomData && bottomData.trim() !== '') {
                                successCount++;
                            }
                        }
                    }

                    // 处理colspan的后续列
                    // Process colspan subsequent columns
                    for (let i = 1; i < colspan; i++) {
                        currentCol++;
                        if (currentCol < actualCols) {
                            // 第一行
                            const targetCell1 = tableRow.children[currentCol + 1];
                            if (targetCell1 && targetCell1.contentEditable === 'true') {
                                targetCell1.textContent = '';
                            }
                            // 第二行
                            const targetCell2 = nextTableRow.children[currentCol + 1];
                            if (targetCell2 && targetCell2.contentEditable === 'true') {
                                targetCell2.textContent = '';
                            }
                        }
                    }

                    currentCol++;
                });

                // 跳过后续的正常处理，因为已经特殊处理了
                // Skip subsequent normal processing, as already specially processed
                // 更新实际行索引：因为这一行被拆分为两行，所以下一行的索引要+2
                // Update actual row index: since this row is split into two rows, next row index should be +2
                actualRowIndex += 2;
                return;
            }

            // 2.Format模式：数据行不保留背景色
            if (sourceRowStyle) {
                const sanitizedRowStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceRowStyle));
                if (sanitizedRowStyle) {
                    tableRow.setAttribute('style', sanitizedRowStyle);
                    tableRow.style.cssText = sanitizedRowStyle;
                } else {
                    tableRow.removeAttribute('style');
                    tableRow.style.cssText = '';
                }
            }
            // 不再从 computed 复制行背景色

            let currentCol = 0;

            sourceCells.forEach(sourceCell => {
                const colspan = parseInt(sourceCell.getAttribute('colspan') || '1', 10);
                let cellContent = sourceCell.innerHTML;

                if (!cellContent || cellContent.trim() === '') {
                    cellContent = sourceCell.textContent || '';
                }

                const cellText = sourceCell.textContent || sourceCell.innerText || '';

                // 处理第一个单元格（colspan的主单元格）
                if (currentCol < actualCols) {
                    const targetCell = tableRow.children[currentCol + 1];

                    if (targetCell && targetCell.contentEditable === 'true') {
                        const oldValue = targetCell.textContent || targetCell.innerHTML || '';

                        let cleanContent = cellContent
                            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                            .replace(/javascript:/gi, '')
                            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

                        // 保留所有HTML格式
                        if (cleanContent.includes('<') && cleanContent.includes('>')) {
                            // 2.Format：移除class/id与布局样式，避免跑到页面最上面
                            targetCell.innerHTML = sanitizeFormatHtmlFragment(cleanContent);
                        } else if (cellText && cellText.trim() !== '') {
                            const sourceCellStyle = sourceCell.getAttribute('style');
                            if (sourceCellStyle) {
                                const sanitizedSpanStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceCellStyle));
                                if (sanitizedSpanStyle) {
                                    targetCell.innerHTML = `<span style="${sanitizedSpanStyle}">${cellText}</span>`;
                                } else {
                                    targetCell.textContent = cellText;
                                }
                            } else {
                                targetCell.textContent = cellText;
                            }
                        } else {
                            targetCell.textContent = '';
                        }

                        // 2.Format模式：数据格不保留背景色，只保留边框及文字颜色等
                        const sourceCellStyle = sourceCell.getAttribute('style');
                        const sourceCellComputedStyle = window.getComputedStyle(sourceCell);
                        if (sourceCellStyle) {
                            const sanitizedCellStyle = stripBackgroundFromStyle(sanitizeCopiedStyleString(sourceCellStyle));
                            let mergedStyle = sanitizedCellStyle && !sanitizedCellStyle.includes('border') ? `border: 1px solid #d0d7de !important; ${sanitizedCellStyle}` : (sanitizedCellStyle || 'border: 1px solid #d0d7de !important;');
                            targetCell.setAttribute('style', mergedStyle);
                            targetCell.style.cssText = mergedStyle;
                        } else {
                            const color = sourceCellComputedStyle.color;
                            const fontWeight = sourceCellComputedStyle.fontWeight;
                            const textAlign = sourceCellComputedStyle.textAlign;
                            let styleString = 'border: 1px solid #d0d7de !important;';
                            if (color && color !== 'rgb(0, 0, 0)') styleString += ` color: ${color} !important;`;
                            if (fontWeight && fontWeight !== 'normal' && fontWeight !== '400') styleString += ` font-weight: ${fontWeight} !important;`;
                            if (textAlign && textAlign !== 'left') styleString += ` text-align: ${textAlign} !important;`;
                            targetCell.setAttribute('style', styleString);
                            targetCell.style.cssText = styleString;
                        }
                        if (!targetCell.style.border || targetCell.style.border === 'none' || targetCell.style.border === '0px') {
                            targetCell.style.border = '1px solid #d0d7de';
                        }
                        currentPasteChanges.push({
                            row: actualRowIndex,
                            col: currentCol,
                            oldValue: oldValue,
                            newValue: targetCell.textContent || targetCell.innerHTML
                        });

                        if (cellText && cellText.trim() !== '') {
                            successCount++;
                        }
                    }
                }

                // 处理colspan的后续列
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

            // 更新实际行索引：正常处理的行只占用一行
            // Update actual row index: normally processed row only occupies one row
            actualRowIndex++;
        });

        window.__DC_PUSH_PASTE_HISTORY__?.(currentPasteChanges);

        if (successCount > 0) {
            window.showNotification?.(`成功粘贴表格 (${headerRows.length} 个表头行, ${dataRows.length} 个数据行 x ${maxCols} 列)，已保持完整表格结构!`, 'success');
            window.__DC_RECOMPUTE_SUBMIT_STATE__?.();
            return true;
        } else {
            console.log('Format: No cells were pasted');
            return false;
        }
    } catch (error) {
        console.error('Format: Error parsing HTML table:', error);
        return false;
    }
}
