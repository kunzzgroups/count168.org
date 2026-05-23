/**
 * Submit-time SUB TOTAL / GRAND TOTAL row split — extracted from js/datacapture.js.
 * Re-run: node frontend/scripts/extract-convert-table-submit.mjs
 */
import { getRowLabel } from "../grid/dataCaptureGridMeta.js";

function resolveCaptureType(captureType) {
  if (captureType) return captureType;
  if (typeof window.__DC_GET_CAPTURE_TYPE__ === "function") return window.__DC_GET_CAPTURE_TYPE__() || "";
  return "";
}

function ensureSubmitGrid(rows, cols) {
  if (typeof window.__DC_INITIALIZE_TABLE__ === "function") {
    window.__DC_INITIALIZE_TABLE__(rows, cols);
  } else if (typeof window.__DC_LEGACY_BUILD_TABLE__ === "function") {
    window.__DC_LEGACY_BUILD_TABLE__(rows, cols);
  }
}

function bindLegacyGridCell(cell) {
  if (typeof window.__DC_LEGACY_BIND_CELL__ === "function") {
    window.__DC_LEGACY_BIND_CELL__(cell);
  }
}

export function convertTableFormatOnSubmit(captureType) {
  captureType = resolveCaptureType(captureType);
// WBET 和 WBET_API 格式：保持原始格式，不执行任何转换（特别是保持 Sub Total 和 Grand Total 分开成两行）
    if (typeof captureType !== 'undefined' && (captureType === 'WBET' || captureType === 'WBET_API')) {
        console.log(`${captureType} format detected: Skipping format conversion to preserve Sub Total and Grand Total as separate rows`);
        return;
    }

    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;

    const rows = Array.from(tableBody.children);
    if (rows.length === 0) return;

    console.log('Converting table format on submit...');

    // 查找 SUB TOTAL 和 GRAND TOTAL 行
    let subTotalRowIndex = -1;
    let grandTotalRowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const firstCell = row.children[1]; // 跳过行号列
        const secondCell = row.children[2];

        if (firstCell && secondCell) {
            const firstText = (firstCell.textContent || '').toString().toUpperCase().trim();
            const secondText = (secondCell.textContent || '').toString().toUpperCase().trim();

            if (firstText === 'SUB TOTAL' || firstText.includes('SUB TOTAL') ||
                secondText === 'SUB TOTAL' || secondText.includes('SUB TOTAL')) {
                if (subTotalRowIndex < 0) {
                    subTotalRowIndex = i;
                }
            }

            if (firstText === 'GRAND TOTAL' || firstText.includes('GRAND TOTAL') ||
                secondText === 'GRAND TOTAL' || secondText.includes('GRAND TOTAL')) {
                if (grandTotalRowIndex < 0) {
                    grandTotalRowIndex = i;
                }
            }
        }
    }

    // 如果 SUB TOTAL 和 GRAND TOTAL 在同一行（第一列是 SUB TOTAL，第二列是 GRAND TOTAL）
    if (subTotalRowIndex >= 0 && subTotalRowIndex === grandTotalRowIndex) {
        const headerRow = rows[subTotalRowIndex];
        const firstCell = headerRow.children[1];
        const secondCell = headerRow.children[2];

        if (firstCell && secondCell) {
            const firstText = (firstCell.textContent || '').toString().toUpperCase().trim();
            const secondText = (secondCell.textContent || '').toString().toUpperCase().trim();

            if ((firstText === 'SUB TOTAL' || firstText.includes('SUB TOTAL')) &&
                (secondText === 'GRAND TOTAL' || secondText.includes('GRAND TOTAL'))) {
                console.log('Found SUB TOTAL and GRAND TOTAL in same row, converting...');

                // 收集后续行的数据（每行2列，分别是 SUB TOTAL 和 GRAND TOTAL 的数据）
                const subTotalCells = ['SUB TOTAL'];
                const grandTotalCells = ['GRAND TOTAL'];

                // 额外处理：有些报表在同一行第三列就已经放了一个合计值（例如：SUB TOTAL | GRAND TOTAL | 334）
                // 这格数字原本是和 GRAND TOTAL 绑定的，如果不特殊处理会在转换时被完全忽略。
                // 为了保留这格数据，我们：
                //  - 始终把它记到 GRAND TOTAL 行里（作为 GRAND TOTAL 的第一个数值列）
                //  - 视业务需要也可以同时放到 SUB TOTAL 行；目前只放到 GRAND TOTAL，避免重复 334。
                if (headerRow.children.length > 3) {
                    const thirdCell = headerRow.children[3];
                    if (thirdCell && thirdCell.contentEditable === 'true') {
                        const thirdTextRaw = (thirdCell.textContent || '').toString().trim();
                        if (thirdTextRaw !== '') {
                            const thirdText = thirdTextRaw.toUpperCase();
                            console.log('Detected extra value on SUB/GRAND TOTAL header row:', thirdText);
                            // 这里仅加入 GRAND TOTAL 行，保证「GRAND TOTAL 后面的数值」不会丢失
                            grandTotalCells.push(thirdText);
                        }
                    }
                }
                let currentRow = subTotalRowIndex + 1;

                // 获取预期列数（参考前面的数据行）
                let expectedCols = 0;
                if (subTotalRowIndex > 0) {
                    const prevRow = rows[subTotalRowIndex - 1];
                    expectedCols = prevRow.children.length - 1; // 减去行号列
                }

                while (currentRow < rows.length) {
                    const row = rows[currentRow];
                    const cells = Array.from(row.children).slice(1); // 跳过行号列
                    const nonEmptyCells = cells.filter(cell => {
                        const text = (cell.textContent || '').toString().trim();
                        return text !== '' && cell.contentEditable === 'true';
                    });

                    // 如果这一行只有2个非空单元格，可能是 SUB TOTAL / GRAND TOTAL 的数据
                    if (nonEmptyCells.length === 2) {
                        const cell1 = (nonEmptyCells[0].textContent || '').toString().trim();
                        const cell2 = (nonEmptyCells[1].textContent || '').toString().trim();

                        if (cell1 !== '' && cell2 !== '' &&
                            !cell1.toUpperCase().includes('TOTAL') &&
                            !cell2.toUpperCase().includes('TOTAL')) {
                            subTotalCells.push(cell1);
                            grandTotalCells.push(cell2);
                            currentRow++;
                            continue;
                        }
                    }

                    // 如果这一行有很多非空单元格，可能是新的数据行，停止收集
                    if (nonEmptyCells.length > 3) {
                        break;
                    }

                    // 如果这一行只有1个非空单元格
                    if (nonEmptyCells.length === 1) {
                        const cell = (nonEmptyCells[0].textContent || '').toString().trim();
                        if (subTotalCells.length > grandTotalCells.length) {
                            grandTotalCells.push(cell);
                        } else {
                            subTotalCells.push(cell);
                        }
                        currentRow++;
                        continue;
                    }

                    break;
                }

                // 如果收集到了足够的数据，重建两行
                if (subTotalCells.length > 1 || grandTotalCells.length > 1) {
                    const maxLength = Math.max(subTotalCells.length, grandTotalCells.length, expectedCols);

                    // 检查表格是否有足够的列，如果不够则扩展
                    const currentCols = document.querySelectorAll('#tableHeader th').length - 1; // 减去行号列
                    if (maxLength > currentCols) {
                        console.log(`Expanding table columns from ${currentCols} to ${maxLength} for SUB/GRAND TOTAL conversion`);
                        const currentRows = document.querySelectorAll('#tableBody tr').length;
                        ensureSubmitGrid(currentRows, maxLength);
                        // 重新获取行引用，因为表格被重新初始化了
                        const updatedRows = Array.from(tableBody.children);
                        rows[subTotalRowIndex] = updatedRows[subTotalRowIndex];
                        if (subTotalRowIndex + 1 < updatedRows.length) {
                            rows[subTotalRowIndex + 1] = updatedRows[subTotalRowIndex + 1];
                        }
                    }

                    // 重建 SUB TOTAL 行
                    const subTotalRow = rows[subTotalRowIndex];
                    // 确保有足够的单元格，如果没有则添加
                    const tableHeader = document.getElementById('tableHeader');
                    const headerRow = tableHeader ? tableHeader.querySelector('tr') : null;
                    while (subTotalRow.children.length - 1 < maxLength) {
                        const newColIndex = subTotalRow.children.length - 1;

                        // 添加表头（如果还没有）
                        if (headerRow && headerRow.children.length - 1 <= newColIndex) {
                            const newHeader = document.createElement('th');
                            newHeader.textContent = newColIndex + 1; // 1, 2, 3, ...
                            newHeader.addEventListener('click', () => {
                                window.__DC_SET_TABLE_ACTIVE__?.(true);
                                window.__DC_SELECT_COLUMN__?.(newColIndex);
                            });
                            newHeader.style.cursor = 'pointer';
                            headerRow.appendChild(newHeader);
                        }

                        // 为所有行添加新单元格（如果还没有）
                        const allRows = Array.from(tableBody.children);
                        allRows.forEach(row => {
                            if (row.children.length - 1 <= newColIndex) {
                                const newCell = document.createElement('td');
                                newCell.contentEditable = true;
                                newCell.dataset.col = newColIndex;
                                bindLegacyGridCell(newCell);
                                row.appendChild(newCell);
                            }
                        });
                    }

                    // 现在填充数据（不再检查 children.length，因为我们已经确保有足够的单元格）
                    for (let i = 0; i < maxLength; i++) {
                        const cell = subTotalRow.children[i + 1];
                        if (cell && cell.contentEditable === 'true') {
                            cell.textContent = i < subTotalCells.length ? subTotalCells[i].toUpperCase() : '';
                        }
                    }

                    // 删除被合并的行
                    const rowsToRemove = currentRow - subTotalRowIndex - 1;
                    if (rowsToRemove > 0) {
                        // 在删除之前，先创建 GRAND TOTAL 行
                        const grandTotalRow = rows[subTotalRowIndex + 1];
                        if (grandTotalRow) {
                            // 确保有足够的单元格（表头已经在上面处理过了）
                            while (grandTotalRow.children.length - 1 < maxLength) {
                                const newColIndex = grandTotalRow.children.length - 1;
                                const newCell = document.createElement('td');
                                newCell.contentEditable = true;
                                newCell.dataset.col = newColIndex;
                                bindLegacyGridCell(newCell);
                                grandTotalRow.appendChild(newCell);
                            }

                            // 填充数据
                            for (let i = 0; i < maxLength; i++) {
                                const cell = grandTotalRow.children[i + 1];
                                if (cell && cell.contentEditable === 'true') {
                                    cell.textContent = i < grandTotalCells.length ? grandTotalCells[i].toUpperCase() : '';
                                }
                            }

                            // 删除中间的行（从后往前删除，避免索引问题）
                            for (let i = currentRow - 1; i > subTotalRowIndex + 1; i--) {
                                if (rows[i] && rows[i].parentNode) {
                                    rows[i].remove();
                                }
                            }

                            // 更新后续行的行号
                            const remainingRows = Array.from(tableBody.children);
                            for (let i = subTotalRowIndex + 2; i < remainingRows.length; i++) {
                                if (remainingRows[i] && remainingRows[i].children[0]) {
                                    remainingRows[i].children[0].textContent = getRowLabel(i);
                                }
                            }
                        }
                    } else {
                        // 如果没有行需要删除，需要插入 GRAND TOTAL 行
                        const newRow = rows[subTotalRowIndex].cloneNode(true);
                        const rowNum = subTotalRowIndex + 2;
                        newRow.children[0].textContent = getRowLabel(rowNum - 1);

                        // 清除所有单元格内容
                        for (let i = 1; i < newRow.children.length; i++) {
                            const cell = newRow.children[i];
                            if (cell && cell.contentEditable === 'true') {
                                cell.textContent = '';
                            }
                        }

                        // 确保新行有足够的单元格（表头已经在上面处理过了）
                        while (newRow.children.length - 1 < maxLength) {
                            const newColIndex = newRow.children.length - 1;
                            const newCell = document.createElement('td');
                            newCell.contentEditable = true;
                            newCell.dataset.col = newColIndex;
                            bindLegacyGridCell(newCell);
                            newRow.appendChild(newCell);
                        }

                        // 填充 GRAND TOTAL 数据
                        for (let i = 0; i < maxLength; i++) {
                            const cell = newRow.children[i + 1];
                            if (cell && cell.contentEditable === 'true') {
                                cell.textContent = i < grandTotalCells.length ? grandTotalCells[i].toUpperCase() : '';
                            }
                        }

                        // 插入新行
                        rows[subTotalRowIndex].parentNode.insertBefore(newRow, rows[subTotalRowIndex].nextSibling);

                        // 更新后续行的行号
                        const remainingRows = Array.from(tableBody.children);
                        for (let i = subTotalRowIndex + 2; i < remainingRows.length; i++) {
                            if (remainingRows[i] && remainingRows[i].children[0]) {
                                remainingRows[i].children[0].textContent = getRowLabel(i);
                            }
                        }
                    }

                    console.log('Converted SUB TOTAL and GRAND TOTAL rows on submit');
                }
            }
        }
    }

    // 检测并重命名重复的 id product
    // 已禁用：取消自动添加序号功能
    // try {
    //     renameDuplicateIdProducts();
    // } catch (err) {
    //     console.error('renameDuplicateIdProducts failed:', err);
    // }

    // Citibet: 确保 MY EARNINGS / TOTAL 金额落在第 11 列
    try {
        window.__DC_FIX_CITIBET_AMOUNTS__?.();
    } catch (err) {
        console.error('fixCitibetAmountColumns failed:', err);
    }
}
