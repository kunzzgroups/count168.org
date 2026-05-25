/**
 * Phase 9c: Edit Formula Save orchestration (extracted from datacapturesummary.js).
 * Regenerate: node frontend/scripts/extract-summary-save-formula.mjs
 */
import { parseIdProductColumnRef } from "./summaryFormulaParseUtils.js";
import {
  calculateFormulaResultFromExpression,
  evaluateFormulaExpression,
} from "./summaryFormulaReference.js";
import { applyTemplateFormulaSaveFields } from "../../../shared/formula/index.js";

function call(name, ...args) {
  const fn = window[name];
  if (typeof fn !== "function") {
    throw new Error(`Legacy summary helper missing: ${name}`);
  }
  return fn(...args);
}

const showNotification = (...args) => call("showNotification", ...args);
const getAccountId = (...args) => call("getAccountId", ...args);
const getAccountText = (...args) => call("getAccountText", ...args);
const getColumnsDisplayFromClickedColumns = (...args) =>
  call("getColumnsDisplayFromClickedColumns", ...args);
const getEffectiveClickedRefsForDollarOnlyFormula = (...args) =>
  call("getEffectiveClickedRefsForDollarOnlyFormula", ...args);
const getSummaryRowFormulaRefContext = (...args) =>
  call("getSummaryRowFormulaRefContext", ...args);
const getProcessValueFromRow = (...args) => call("getProcessValueFromRow", ...args);
const getProductValuesFromCell = (...args) => call("getProductValuesFromCell", ...args);
const getRowLabelFromProcessValue = (...args) => call("getRowLabelFromProcessValue", ...args);
const updateFormulaDisplay = (...args) => call("updateFormulaDisplay", ...args);
const createFormulaDisplayFromExpression = (...args) =>
  call("createFormulaDisplayFromExpression", ...args);
const roundProcessedAmountTo2Decimals = (...args) =>
  call("roundProcessedAmountTo2Decimals", ...args);
const updateSubIdProductRow = (...args) => call("updateSubIdProductRow", ...args);
const updateSummaryTableRow = (...args) => call("updateSummaryTableRow", ...args);
const addSubIdProductRow = (...args) => call("addSubIdProductRow", ...args);
const updateIdProductWithDescription = (...args) =>
  call("updateIdProductWithDescription", ...args);
const rebuildUsedAccountIds = (...args) => call("rebuildUsedAccountIds", ...args);
const findSummaryRowForTemplate = (...args) => call("findSummaryRowForTemplate", ...args);
const extractRowDataForTemplate = (...args) => call("extractRowDataForTemplate", ...args);
const saveTemplateAsync = (...args) => call("saveTemplateAsync", ...args);
const closeEditFormulaForm = (...args) => call("closeEditFormulaForm", ...args);
const saveFormulaSourceForRefresh = (opts) => {
  if (typeof window.saveFormulaSourceForRefresh === "function") {
    return window.saveFormulaSourceForRefresh(opts);
  }
  return undefined;
};
const formatNumberWithThousands = (value) => {
  if (typeof window.formatNumberWithThousands === "function") {
    return window.formatNumberWithThousands(value);
  }
  return value;
};
const extractNumbersFromFormula = (...args) => call("extractNumbersFromFormula", ...args);

export function saveFormula() {
    // 最先校验：Edit Formula 里 Currency 未选（Select Currency）则绝对不能 Save，先弹通知再 return
    const currencySelect = document.getElementById('currency');
    if (!currencySelect) {
        showNotification('Error', 'Please select a currency', 'error');
        return;
    }
    const selIdx = currencySelect.selectedIndex;
    const selOpt = (selIdx >= 0 && currencySelect.options[selIdx]) ? currencySelect.options[selIdx] : null;
    const currencyVal = (selOpt && selOpt.value != null) ? String(selOpt.value).trim() : '';
    const currencyText = (selOpt && selOpt.text) ? String(selOpt.text).trim() : '';
    const isCurrencyPlaceholder = (selIdx === 0 && selOpt && selOpt.value === '') || /^select\s*curren/i.test(currencyText);
    if (!currencyVal || isCurrencyPlaceholder) {
        showNotification('Error', '请先选择 Currency 后再保存。Please select a currency.', 'error');
        return;
    }

    // 再校验 Account、Formula
    const accountButton = document.getElementById('account');
    const accountValue = accountButton ? getAccountId(accountButton) : null;
    let currencyValue = currencyVal;
    let currencyName = currencyText;
    const formulaInput = document.getElementById('formula');
    const formulaValue = (formulaInput && formulaInput.value != null) ? String(formulaInput.value || '').trim() : '';
    // 用于让 Summary 表的 Formula 与 Edit Formula 的 Display Formula 一致（解析 $n / [id,n] 必需）
    const clickedCellRefsForPayload = formulaInput ? String(formulaInput.getAttribute('data-clicked-cell-refs') || '').trim() : '';
    // $n-only 公式（无 [id,n] 跨行引用）标识：若 refs 全部指向其他 id_product，视为历史脏数据，应丢弃
    const formulaOnlyCurrentRowRefs = !!(formulaValue && formulaValue.includes('$') && !formulaValue.includes('[') && /^[\s\$0-9+\-*/().]+$/.test(formulaValue.trim()));

    if (!accountValue) {
        showNotification('Error', 'Please select an account', 'error');
        return;
    }
    if (!formulaValue) {
        showNotification('Error', 'Please enter a formula', 'error');
        return;
    }

    // 与 loadCurrenciesForAccount 里 "Currency set to MYR (prioritized)" 同风格，点 Save 时打出当前选中的货币
    console.log('Currency set to', currencyName, '(user selected)');

    // IMPORTANT: Always use the Id Product from the modal (the one that was set when the modal was opened)
    const processValue = document.getElementById('process').value;
    const accountId = getAccountText(accountButton); // Display text
    // Source Percent：如果用户没有填写，则默认 1 (1 = 100%)
    let sourcePercentValue = document.getElementById('sourcePercent').value.trim();
    if (!sourcePercentValue) {
        sourcePercentValue = '1';
    }
    const inputMethodSelect = document.getElementById('inputMethod');
    const inputMethodValue = (inputMethodSelect && inputMethodSelect.value != null) ? String(inputMethodSelect.value).trim() : '';
    const inputMethodOpt = inputMethodSelect && inputMethodSelect.selectedIndex >= 0 && inputMethodSelect.options[inputMethodSelect.selectedIndex]
        ? inputMethodSelect.options[inputMethodSelect.selectedIndex] : null;
    const inputMethodName = (inputMethodOpt && inputMethodOpt.text) ? String(inputMethodOpt.text).trim() : '';
    if (formulaInput) {
        console.log('saveFormula - Formula value read from input:', formulaInput.value, 'Type:', typeof formulaInput.value);
    }
    const descriptionValue = document.getElementById('description').value;
    const enableValue = inputMethodValue ? true : false;
    const sourcePercentEnableValue = sourcePercentValue && sourcePercentValue.trim() !== '';

    const isEditMode = !!window.currentEditRow;
    const currentButton = window.currentAddAccountButton;
    const row = currentButton ? currentButton.closest('tr') : null;
    // 与 Edit 弹窗 Display 一致：用当前编辑行上的 id / refs / row_index 解析 $n，避免重复 id_product 时落到首行（如 MARI 2800 vs GXS 3200）
    const editingRowForSave = window.currentEditRow || row;
    const processValueForCalc = (editingRowForSave && typeof getProcessValueFromRow === 'function')
        ? (String(getProcessValueFromRow(editingRowForSave) || '').trim() || String(processValue || '').trim())
        : String(processValue || '').trim();
    let clickedForCalc = (clickedCellRefsForPayload && clickedCellRefsForPayload.trim() !== '')
        ? clickedCellRefsForPayload.trim()
        : (editingRowForSave && typeof getSummaryRowFormulaRefContext === 'function'
            ? getSummaryRowFormulaRefContext(editingRowForSave).clickedCellRefs
            : '');
    const rowIdxForCalc = (() => {
        if (!editingRowForSave) return null;
        const a = editingRowForSave.getAttribute('data-row-index');
        if (a === null || a === '' || a === '999999') return null;
        const n = Number(a);
        return !Number.isNaN(n) && n >= 0 ? n : null;
    })();
    clickedForCalc = typeof getEffectiveClickedRefsForDollarOnlyFormula === 'function'
        ? getEffectiveClickedRefsForDollarOnlyFormula(formulaValue, processValueForCalc, clickedForCalc)
        : clickedForCalc
    const idProductCell = row ? row.querySelector('td:first-child') : null;
    const productValues = getProductValuesFromCell(idProductCell);
    // 优先用 data-product-type 判断：点击 sub 行的 + 时新行必须插在该 sub 底下；否则用单元格 main 是否为空
    const clickedRowIsSub = row && (row.getAttribute('data-product-type') || 'main') === 'sub';
    const isSubIdProduct = clickedRowIsSub || !productValues.main || !productValues.main.trim();
    const oldAccountDbId = (isEditMode && window.currentEditRow) ? (window.currentEditRow.querySelector('td:nth-child(2)')?.getAttribute('data-account-id') || null) : null;

    console.log('Formula data:', {
        process: processValue,
        account: accountValue,
        accountId: accountId,
        sourcePercent: sourcePercentValue,
        currency: currencyValue,
        currencyName: currencyName,
        inputMethod: inputMethodValue,
        inputMethodName: inputMethodName,
        formula: formulaValue,
        description: descriptionValue,
        enable: enableValue,
        isSubIdProduct: isSubIdProduct
    });

    // Evaluate the formula expression directly（与下方 calculateFormulaResultFromExpression 同一套上下文）
    const formulaResult = evaluateFormulaExpression(formulaValue, processValueForCalc, clickedForCalc, rowIdxForCalc);

    // Get Columns display from clicked columns (preferred) or extract from formula
    const clickedColumnsDisplay = getColumnsDisplayFromClickedColumns();

    // 获取列引用格式（用于保存到 sourceColumns）
    // 格式：id_product:row_label:column_index，如 "GGG:A:10 GGG:A:8"
    // IMPORTANT: 优先从 data-clicked-cell-refs 读取，因为它包含了正确的 id_product（可能来自其他 id product 的数据）
    // 重要：优先从 data-clicked-cell-refs 读取，因为它包含了正确的 id_product（可能来自其他 id product 的数据）
    // CRITICAL: 只有当公式中包含 $ 符号时，才保存 source_columns
    // 如果没有 $ 符号，说明是手动输入的纯公式（如 "(100+1)+(11-1)"），不应该保存列数据
    let sourceColumns = '';
    // formulaInput 已经在上面声明过了，直接使用
    // 检查公式中是否包含 $ 符号
    const hasDollarSign = formulaValue && formulaValue.includes('$');
    if (formulaInput && formulaValue && formulaValue.trim() !== '' && hasDollarSign) {
        // 优先从 data-clicked-cell-refs 读取引用（格式：id_product:row_label:column_index 或 id_product:column_index）
        // 这包含了用户从其他 id product 选择的数据的正确引用
        const _rawClickedRefs = formulaInput.getAttribute('data-clicked-cell-refs') || '';
        const clickedCellRefs = typeof getEffectiveClickedRefsForDollarOnlyFormula === 'function'
            ? getEffectiveClickedRefsForDollarOnlyFormula(formulaValue, processValueForCalc, _rawClickedRefs)
            : _rawClickedRefs
        if (clickedCellRefs && clickedCellRefs.trim() !== '') {
            // 直接使用 data-clicked-cell-refs 中的引用，它们已经包含了正确的 id_product
            // 但是需要转换为保存格式：id_product:row_label:column_index（如果引用中没有 row_label，需要添加）
            const refs = clickedCellRefs.trim().split(/\s+/).filter(r => r.trim() !== '');
            const columnRefs = [];

            // 匹配所有 $数字，按顺序匹配对应的引用
            const dollarPattern = /\$(\d+)(?!\d)/g;
            let match;
            dollarPattern.lastIndex = 0;
            const dollarMatches = [];

            while ((match = dollarPattern.exec(formulaValue)) !== null) {
                const columnNumber = parseInt(match[1]);
                if (!isNaN(columnNumber) && columnNumber > 0) {
                    dollarMatches.push({
                        columnNumber: columnNumber,
                        displayColumnIndex: columnNumber,
                        dataColumnIndex: columnNumber - 1
                    });
                }
            }

            // CRITICAL FIX: 只保存 formula 中实际使用的引用
            // 按顺序匹配：第一个 $数字 匹配第一个引用，第二个 $数字 匹配第二个引用
            // IMPORTANT: 引用中存储的是 dataColumnIndex，需要匹配
            // 但是，我们需要确保只保存 formula 中实际存在的 $数字 对应的引用
            // 如果 data-clicked-cell-refs 中有多余的引用（比如被删除的数据），不应该保存

            // 首先，创建一个映射：dataColumnIndex -> 引用列表（使用 parseIdProductColumnRef 保留完整 id_product）
            const refMapByDataColumnIndex = new Map();
            refs.forEach((ref, index) => {
                const parsed = typeof parseIdProductColumnRef === 'function' ? parseIdProductColumnRef(ref) : null;
                if (parsed) {
                    if (!refMapByDataColumnIndex.has(parsed.dataColumnIndex)) {
                        refMapByDataColumnIndex.set(parsed.dataColumnIndex, []);
                    }
                    refMapByDataColumnIndex.get(parsed.dataColumnIndex).push({
                        ref: ref,
                        index: index,
                        idProduct: parsed.idProduct,
                        rowLabel: parsed.rowLabel,
                        dataColumnIndex: parsed.dataColumnIndex
                    });
                }
            });

            // 然后，按 formula 中 $数字 的顺序，只保存匹配的引用
            for (let i = 0; i < dollarMatches.length; i++) {
                const dollarMatch = dollarMatches[i];
                let matched = false;

                // 查找匹配 dataColumnIndex 的引用
                const matchingRefs = refMapByDataColumnIndex.get(dollarMatch.dataColumnIndex);
                if (matchingRefs && matchingRefs.length > 0) {
                    const matchedRef = matchingRefs[0];
                    let refIdProduct = matchedRef.idProduct;
                    const refRowLabel = matchedRef.rowLabel;
                    // 当前编辑行保存时一律用 processValue，保证 source_columns/columns_display 为当前账号（如 ALLBET95MS(KM)MYR）
                    const normalizeSpaces = function (s) { return (s || '').trim().replace(/\s+/g, ''); };
                    if (processValueForCalc && normalizeSpaces(refIdProduct) === normalizeSpaces(processValueForCalc)) {
                        refIdProduct = processValueForCalc;
                    }
                    let rowLabel = refRowLabel;
                    if (!rowLabel) {
                        const idxForRef = (processValueForCalc && normalizeSpaces(refIdProduct) === normalizeSpaces(processValueForCalc))
                            ? rowIdxForCalc
                            : null;
                        rowLabel = getRowLabelFromProcessValue(refIdProduct, idxForRef);
                    }
                    if (rowLabel) {
                        const columnRef = `${refIdProduct}:${rowLabel}:${dollarMatch.dataColumnIndex}`;
                        if (!columnRefs.includes(columnRef)) {
                            columnRefs.push(columnRef);
                        }
                    } else {
                        const columnRef = `${refIdProduct}:${dollarMatch.dataColumnIndex}`;
                        if (!columnRefs.includes(columnRef)) {
                            columnRefs.push(columnRef);
                        }
                    }
                    matched = true;
                }

                // 如果没有找到匹配的引用，使用当前编辑的 id_product 作为回退
                if (!matched) {
                    const rowLabel = getRowLabelFromProcessValue(processValueForCalc, rowIdxForCalc);
                    if (rowLabel) {
                        // IMPORTANT: 保存 dataColumnIndex 而不是 displayColumnIndex
                        const columnRef = `${processValueForCalc}:${rowLabel}:${dollarMatch.dataColumnIndex}`;
                        if (!columnRefs.includes(columnRef)) {
                            columnRefs.push(columnRef);
                        }
                    }
                }
            }

            if (columnRefs.length > 0) {
                sourceColumns = columnRefs.join(' ');
                console.log('saveFormula - Using sourceColumns from data-clicked-cell-refs:', sourceColumns);
            }
        }

        // 如果没有 data-clicked-cell-refs，从 formulaValue 中提取所有 $数字，转换为列引用格式
        // 这种情况下，使用当前编辑的 id_product（processValue）
        if (!sourceColumns) {
            const rowLabel = getRowLabelFromProcessValue(processValueForCalc, rowIdxForCalc);
            if (rowLabel) {
                const dollarPattern = /\$(\d+)(?!\d)/g;
                let match;
                dollarPattern.lastIndex = 0;
                const columnRefs = [];

                while ((match = dollarPattern.exec(formulaValue)) !== null) {
                    const columnNumber = parseInt(match[1]);
                    if (!isNaN(columnNumber) && columnNumber > 0) {
                        // 格式：id_product:row_label:dataColumnIndex
                        // IMPORTANT: columnNumber 是 displayColumnIndex，需要转换为 dataColumnIndex
                        const dataColumnIndex = columnNumber - 1;
                        const columnRef = `${processValueForCalc}:${rowLabel}:${dataColumnIndex}`;
                        if (!columnRefs.includes(columnRef)) {
                            columnRefs.push(columnRef);
                        }
                    }
                }

                if (columnRefs.length > 0) {
                    sourceColumns = columnRefs.join(' ');
                }
            }

            // 如果从 $数字 格式中没有提取到列引用，尝试从 data-clicked-columns 属性中获取
            // 这适用于用户通过键盘直接输入数字（如"$2+$6"）的情况
            // 注意：只有当公式中包含 $ 符号时才尝试提取列数据
            if (!sourceColumns && formulaInput && hasDollarSign) {
                const clickedColumns = formulaInput.getAttribute('data-clicked-columns') || '';
                if (clickedColumns && clickedColumns.trim() !== '') {
                    const rowLabel = getRowLabelFromProcessValue(processValueForCalc, rowIdxForCalc);
                    if (rowLabel) {
                        const columnsArray = clickedColumns.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c) && c > 0);
                        if (columnsArray.length > 0) {
                            // IMPORTANT: colNum 是 displayColumnIndex，需要转换为 dataColumnIndex
                            const columnRefs = columnsArray.map(colNum => {
                                const dataColumnIndex = colNum - 1;
                                return `${processValueForCalc}:${rowLabel}:${dataColumnIndex}`;
                            });
                            sourceColumns = columnRefs.join(' ');
                            console.log('saveFormula - Built sourceColumns from data-clicked-columns:', sourceColumns);
                        }
                    }
                }
            }
        }
    } else if (formulaInput && formulaValue && formulaValue.trim() !== '' && !hasDollarSign) {
        // 如果公式中没有 $ 符号，清空 sourceColumns，不保存列数据
        sourceColumns = '';
        console.log('saveFormula - Formula contains no $ symbols, clearing sourceColumns');
    }

    // In edit mode, prefer existing sourceColumns over extracting from formula
    // This prevents incorrect column extraction when formula contains manual inputs like /4
    // CRITICAL: 如果公式中没有 $ 符号，不应该提取列数据
    let columnsDisplay = '';
    if (!hasDollarSign) {
        // 如果公式中没有 $ 符号，清空 columnsDisplay
        columnsDisplay = '';
        console.log('saveFormula - Formula contains no $ symbols, clearing columnsDisplay');
    } else if (isEditMode && window.currentEditRow) {
        const existingSourceColumns = window.currentEditRow.getAttribute('data-source-columns') || '';
        columnsDisplay = sourceColumns || clickedColumnsDisplay || existingSourceColumns || extractNumbersFromFormula(formulaValue);
    } else {
        columnsDisplay = sourceColumns || clickedColumnsDisplay || extractNumbersFromFormula(formulaValue);
    }

    // 优先使用 formulaDisplay 输入框的值（转换后的值，如 "9+7*0.7/5"）
    // 如果 formulaDisplay 输入框为空，则从 formulaValue 转换
    const formulaDisplayInput = document.getElementById('formulaDisplay');
    let formulaDisplay = '';

    if (!formulaValue || formulaValue.trim() === '') {
        formulaDisplay = '';
        columnsDisplay = ''; // Clear columnsDisplay when formula is empty
        sourceColumns = ''; // Clear sourceColumns when formula is empty
        console.log('Formula value is empty, keeping formulaDisplay as empty string and clearing columnsDisplay');
    } else {
        // 纯按键输入时 keypad 只写入 #formula，不更新 #formulaDisplay；有 $ 引用时 keypad 追加的尾部（如 *0.1225）也只存在 #formula
        // 因此：保存前先用 formulaValue 同步 formulaDisplay，再读取，避免显示被截断
        const trimmedFormula = formulaValue.trim();
        const hasRefs = /\[\s*[^,\]]+\s*,\s*\d+\s*\]|\$\d+/.test(trimmedFormula);
        const processValueForDisplay = processValueForCalc || processValue;
        updateFormulaDisplay(trimmedFormula, processValueForDisplay);

        const convertedFormula = formulaDisplayInput ? formulaDisplayInput.value.trim() : '';
        if (convertedFormula && convertedFormula !== '') {
            formulaDisplay = createFormulaDisplayFromExpression(
                convertedFormula,
                sourcePercentValue,
                sourcePercentEnableValue,
                processValueForCalc,
                clickedForCalc,
                rowIdxForCalc
            );
            console.log('saveFormula - Using formulaDisplay (synced from formula):', convertedFormula, 'Final formulaDisplay:', formulaDisplay);
        } else {
            formulaDisplay = createFormulaDisplayFromExpression(
                trimmedFormula,
                sourcePercentValue,
                sourcePercentEnableValue,
                processValueForCalc,
                clickedForCalc,
                rowIdxForCalc
            );
            console.log('saveFormula - Created formulaDisplay from formulaValue:', formulaDisplay);
        }
    }

    // Calculate processed amount
    // 页面 Processed Amount 为展示用四舍五入 2 位；保存 processedAmount 与展示一致（合计另按 6 位截断逐行累加，见 updateProcessedAmountTotal）。
    let processedAmount = 0;
    // If formula is empty, keep processedAmount as 0
    if (!formulaValue || formulaValue.trim() === '' || formulaDisplay === 'formula') {
        processedAmount = 0;
        console.log('Formula is empty, processedAmount set to 0');
    } else {
        // 不再根据公式中是否包含 *0.1 之类来决定是否应用 Source Percent，
        // 一律走统一的计算函数，由 enableSourcePercent 和 sourcePercentValue 控制是否乘以百分比
        // 计算原始值后按展示口径四舍五入到 2 位再保存，与页面 Processed Amount 一致
        const rawAmount = calculateFormulaResultFromExpression(
            formulaValue,
            sourcePercentValue,
            inputMethodValue,
            enableValue,
            sourcePercentEnableValue,
            processValueForCalc,
            clickedForCalc,
            rowIdxForCalc
        );
        processedAmount = typeof roundProcessedAmountTo2Decimals === 'function' ? roundProcessedAmountTo2Decimals(rawAmount) : rawAmount;
        console.log('saveFormula - Calculated processedAmount:', {
            formulaValue: formulaValue,
            sourcePercentValue: sourcePercentValue,
            inputMethodValue: inputMethodValue,
            enableValue: enableValue,
            sourcePercentEnableValue: sourcePercentEnableValue,
            processedAmount: processedAmount
        });
    }

    // Get Batch Selection checkbox state from the table row
    // In edit mode, use the editing row; otherwise, try to find the row from currentButton or targetRow
    let batchSelectionChecked = false;
    let targetRowForBatchSelection = null;

    if (isEditMode && window.currentEditRow) {
        targetRowForBatchSelection = window.currentEditRow;
    } else if (currentButton) {
        targetRowForBatchSelection = currentButton.closest('tr');
    }

    if (targetRowForBatchSelection) {
        const cells = targetRowForBatchSelection.querySelectorAll('td');
        // Batch Selection column removed
        const batchCheckbox = null;
        if (batchCheckbox) {
            batchSelectionChecked = batchCheckbox.checked;
        }
    }

    let descriptionTargetRow = null

    // Check if we're in edit mode
    if (isEditMode && window.currentEditRow) {
        const editingRow = window.currentEditRow;
        descriptionTargetRow = editingRow
        const editingType = editingRow.getAttribute('data-product-type') || 'main';
        const existingSourceColumns = editingRow.getAttribute('data-source-columns') || '';
        // If formula is empty or doesn't contain $, also clear sourceColumns to prevent regeneration on page refresh
        // 优先使用从 $数字 提取的列引用格式（如 "GGG:A:10 GGG:A:8"）
        // CRITICAL: 如果公式中没有 $ 符号，清空 sourceColumns，不使用旧的 existingSourceColumns
        const finalSourceColumns = (!formulaValue || formulaValue.trim() === '' || !hasDollarSign) ? '' : (sourceColumns || clickedColumnsDisplay || existingSourceColumns || '');
        const basePayload = {
            idProduct: processValue,
            description: descriptionValue,
            originalDescription: descriptionValue,
            account: accountId || 'Account',
            accountDbId: accountValue,
            currency: currencyName || 'Currency',
            currencyDbId: currencyValue,
            columns: columnsDisplay,
            // $n-only 公式若检测到脏 refs 已丢弃（clickedForCalc=''），用正确构建的 sourceColumns 覆盖，
            // 以便同步更新行的 data-clicked-cell-refs，避免下次重算时仍读到 MARI 等历史错误引用
            clickedColumns: (formulaOnlyCurrentRowRefs && clickedForCalc === '' && clickedCellRefsForPayload && sourceColumns)
                ? sourceColumns
                : clickedCellRefsForPayload,
            // 优先使用从 $数字 提取的列引用格式（如 "GGG:A:10 GGG:A:8"）
            // 如果formula为空，清空sourceColumns以防止页面刷新时重新生成formula
            sourceColumns: sourceColumns || finalSourceColumns,
            batchSelection: batchSelectionChecked, // Use actual checkbox state from table row
            source: formulaValue || 'Source', // Use formula as source
            // 如果没有填写 Source Percent，则显示/保存为 1 (1 = 100%)
            sourcePercent: sourcePercentValue || '1',
            formula: formulaDisplay,
            formulaDisplay: formulaDisplay,
            formulaOperators: (formulaValue !== undefined && formulaValue !== null) ? formulaValue : '', // Store the full formula expression (including empty string)
            processedAmount: processedAmount,
            inputMethod: inputMethodValue,
            enableInputMethod: enableValue,
            enableSourcePercent: sourcePercentEnableValue
        };

        if (editingType === 'sub') {
            // 在编辑模式下，保留原有的 formula_variant 和 template_id，确保更新现有模板而不是创建新模板
            const existingFormulaVariant = editingRow.getAttribute('data-formula-variant');
            const existingTemplateId = editingRow.getAttribute('data-template-id');
            const existingParentRowIndex = editingRow.getAttribute('data-parent-row-index');
            updateSubIdProductRow(processValue, {
                ...basePayload,
                productType: 'sub',
                templateKey: editingRow.getAttribute('data-template-key') || null,
                formulaVariant: existingFormulaVariant || null,
                templateId: existingTemplateId || null,
                parentRowIndex: (existingParentRowIndex !== null && existingParentRowIndex !== '' && !Number.isNaN(Number(existingParentRowIndex)))
                    ? Number(existingParentRowIndex)
                    : null
            }, editingRow);
        } else {
            // 在编辑模式下，保留原有的 formula_variant 和 template_id，确保更新现有模板而不是创建新模板
            const existingFormulaVariant = editingRow.getAttribute('data-formula-variant');
            const existingTemplateId = editingRow.getAttribute('data-template-id');
            updateSummaryTableRow(processValue, {
                ...basePayload,
                productType: 'main',
                templateKey: editingRow.getAttribute('data-template-key') || null,
                formulaVariant: existingFormulaVariant || null,
                templateId: existingTemplateId || null
            }, editingRow);
        }
    } else if (isSubIdProduct) {
        // 点击的是某个 sub row 的 +：在该 Id Product 下"当前行之后"新增一条 sub 行
        const baseRow = currentButton ? currentButton.closest('tr') : null;
        const newRow = addSubIdProductRow(processValue, baseRow);
        descriptionTargetRow = newRow
        const baseRowSourceCols = baseRow ? (baseRow.getAttribute('data-source-columns') || '') : '';
        // If formula is empty or doesn't contain $, also clear sourceColumns to prevent regeneration on page refresh
        // CRITICAL: 如果公式中没有 $ 符号，清空 sourceColumns，不使用旧的 baseRowSourceCols
        const finalSourceColumnsForSub = (!formulaValue || formulaValue.trim() === '' || !hasDollarSign) ? '' : (sourceColumns || clickedColumnsDisplay || baseRowSourceCols || '');
        // Get row_index from the new row (should be set by addSubIdProductRow)
        const newRowIndex = newRow ? newRow.getAttribute('data-row-index') : null;
        const rowIndexValue = (newRowIndex && newRowIndex !== '' && newRowIndex !== '999999') ? Number(newRowIndex) : null;
        const newParentRowIndex = newRow ? newRow.getAttribute('data-parent-row-index') : null;
        const parentRowIndexValue = (newParentRowIndex && newParentRowIndex !== '' && newParentRowIndex !== '999999') ? Number(newParentRowIndex) : null;

        // Get sub_order from the new row (calculated by addSubIdProductRow)
        const subOrderValue = newRow ? (newRow.getAttribute('data-sub-order') || null) : null;
        const subOrderNumber = subOrderValue && subOrderValue !== '' && !Number.isNaN(Number(subOrderValue)) ? Number(subOrderValue) : null;

        updateSubIdProductRow(processValue, {
            idProduct: processValue,
            description: descriptionValue,
            originalDescription: descriptionValue, // Store original description separately
            account: accountId || 'Account',
            accountDbId: accountValue, // Database ID
            currency: currencyName || 'Currency',
            currencyDbId: currencyValue, // Database ID
            columns: columnsDisplay,
            clickedColumns: clickedCellRefsForPayload,
            sourceColumns: finalSourceColumnsForSub, // Store clicked column numbers
            batchSelection: batchSelectionChecked, // Use actual checkbox state from table row
            source: formulaValue || 'Source', // Use formula as source
            sourcePercent: sourcePercentValue || '1',
            formula: formulaDisplay,
            formulaDisplay: formulaDisplay,
            formulaOperators: (formulaValue !== undefined && formulaValue !== null) ? formulaValue : '', // Store the full formula expression (including empty string)
            processedAmount: processedAmount,
            inputMethod: inputMethodValue,
            enableInputMethod: enableValue,
            enableSourcePercent: sourcePercentEnableValue,
            productType: 'sub',
            rowIndex: rowIndexValue, // Pass row_index to preserve order
            subOrder: subOrderNumber, // Pass sub_order to preserve order
            parentRowIndex: parentRowIndexValue
        }, newRow);

        // 记录刚创建的 sub 行，供后面的模板保存使用
        window.lastCreatedRowForTemplateSave = newRow;
    } else {
        // main 行点击 +：如果主行还没有账号，就更新主行；否则为该 Id Product 新增一条 sub 行
        const targetRow = currentButton ? currentButton.closest('tr') : null;
        const accountCell = targetRow ? targetRow.querySelector('td:nth-child(2)') : null;
        const accountText = accountCell ? accountCell.textContent.trim() : '';
        const mainHasData = !!accountText;

        if (!mainHasData) {
            // main 无数据：直接填充该 main 行（不新增行）
            if (targetRow) {
                descriptionTargetRow = targetRow
                const targetRowSourceCols = targetRow.getAttribute('data-source-columns') || '';
                const finalSourceColumnsForMain = (!formulaValue || formulaValue.trim() === '' || !hasDollarSign) ? '' : (sourceColumns || clickedColumnsDisplay || targetRowSourceCols || '');
                updateSummaryTableRow(processValue, {
                    idProduct: processValue,
                    description: descriptionValue,
                    originalDescription: descriptionValue,
                    account: accountId || 'Account',
                    accountDbId: accountValue,
                    currency: currencyName || 'Currency',
                    currencyDbId: currencyValue,
                    columns: columnsDisplay,
                    clickedColumns: clickedCellRefsForPayload,
                    sourceColumns: finalSourceColumnsForMain,
                    batchSelection: batchSelectionChecked,
                    source: formulaValue || 'Source',
                    sourcePercent: sourcePercentValue || '1',
                    formula: formulaDisplay,
                    formulaDisplay: formulaDisplay,
                    formulaOperators: (formulaValue !== undefined && formulaValue !== null) ? formulaValue : '',
                    processedAmount: processedAmount,
                    inputMethod: inputMethodValue,
                    enableInputMethod: enableValue,
                    enableSourcePercent: sourcePercentEnableValue,
                    productType: 'main'
                }, targetRow);
            }
        } else {
            // 主行已有账号：为该 Id Product 在「点击的那一行」之后新增一条 sub 行（点击 main 则插在 main 下，点击 sub 则插在该 sub 下）
            const baseRow = currentButton ? currentButton.closest('tr') : null;
            const newRow = addSubIdProductRow(processValue, baseRow);
            descriptionTargetRow = newRow
            // If formula is empty or doesn't contain $, also clear sourceColumns to prevent regeneration on page refresh
            // CRITICAL: 如果公式中没有 $ 符号，清空 sourceColumns
            const finalSourceColumnsForSub2 = (!formulaValue || formulaValue.trim() === '' || !hasDollarSign) ? '' : (sourceColumns || clickedColumnsDisplay || '');

            // Get row_index from the new row (should be set by addSubIdProductRow)
            const newRowIndex2 = newRow ? newRow.getAttribute('data-row-index') : null;
            const rowIndexValue2 = (newRowIndex2 && newRowIndex2 !== '' && newRowIndex2 !== '999999') ? Number(newRowIndex2) : null;
            const newParentRowIndex2 = newRow ? newRow.getAttribute('data-parent-row-index') : null;
            const parentRowIndexValue2 = (newParentRowIndex2 && newParentRowIndex2 !== '' && newParentRowIndex2 !== '999999') ? Number(newParentRowIndex2) : null;

            // Get sub_order from the new row (calculated by addSubIdProductRow)
            const subOrderValue2 = newRow ? (newRow.getAttribute('data-sub-order') || null) : null;
            const subOrderNumber2 = subOrderValue2 && subOrderValue2 !== '' && !Number.isNaN(Number(subOrderValue2)) ? Number(subOrderValue2) : null;

            updateSubIdProductRow(processValue, {
                idProduct: processValue,
                description: descriptionValue,
                originalDescription: descriptionValue, // Store original description separately
                account: accountId || 'Account',
                accountDbId: accountValue, // Database ID
                currency: currencyName || 'Currency',
                currencyDbId: currencyValue, // Database ID
                columns: columnsDisplay,
                clickedColumns: clickedCellRefsForPayload,
                sourceColumns: finalSourceColumnsForSub2, // Store clicked column numbers
                batchSelection: batchSelectionChecked, // Use actual checkbox state from table row
                source: formulaValue || 'Source', // Use formula as source
                sourcePercent: sourcePercentValue || '1',
                formula: formulaDisplay,
                formulaDisplay: formulaDisplay,
                formulaOperators: (formulaValue !== undefined && formulaValue !== null) ? formulaValue : '', // Store the full formula expression (including empty string)
                processedAmount: processedAmount,
                inputMethod: inputMethodValue,
                enableInputMethod: enableValue,
                enableSourcePercent: sourcePercentEnableValue,
                productType: 'sub',
                rowIndex: rowIndexValue2, // Pass row_index to preserve order
                subOrder: subOrderNumber2, // Pass sub_order to preserve order
                parentRowIndex: parentRowIndexValue2
            }, newRow);

            // 记录刚创建的 sub 行，供后面的模板保存使用
            window.lastCreatedRowForTemplateSave = newRow;
        }
    }

    // After updating the summary row(s), append description to the Id Product cell if provided
    if (descriptionValue && descriptionValue.trim() !== '' && typeof updateIdProductWithDescription === 'function') {
        updateIdProductWithDescription(processValue, descriptionValue.trim(), descriptionTargetRow);
    }

    // Rebuild used accounts after updates
    rebuildUsedAccountIds();

    // Auto-save template after saving formula
    // Try multiple methods to find the correct row:
    // 1. If in edit mode, use the edit row
    // 2. Otherwise, try to find by idProduct, accountId, and product type (most reliable)
    // 3. Fallback to currentButton's row
    let targetRow = null;

    // 如果本次操作刚刚创建了新的行（尤其是 sub 行），优先使用那一行来保存模板
    if (!isEditMode && window.lastCreatedRowForTemplateSave) {
        targetRow = window.lastCreatedRowForTemplateSave;
        window.lastCreatedRowForTemplateSave = null;
    } else if (isEditMode && window.currentEditRow) {
        targetRow = window.currentEditRow;
    } else {
        // Find row by idProduct, accountId, and product type (most reliable after update)
        targetRow = findSummaryRowForTemplate(processValue, accountValue, isSubIdProduct);

        // Fallback to currentButton's row if not found
        if (!targetRow && currentButton) {
            targetRow = currentButton.closest('tr');
        }
    }

    if (targetRow) {
        // 根据目标行本身的属性来判断是 main 还是 sub，避免误用 isSubIdProduct
        const targetProductType = targetRow.getAttribute('data-product-type') || (isSubIdProduct ? 'sub' : 'main');
        const isSubForTemplate = targetProductType === 'sub';

        // If this is a new sub row (not edit mode) and formula is empty, don't save template
        // This prevents saving empty sub rows that will be filled later by Batch Source Columns
        if (!isEditMode && isSubForTemplate && (!formulaValue || formulaValue.trim() === '')) {
            console.log('Skipping template save for empty sub row (will be saved when Batch Source Columns is used)');
            // Still close the form and clean up
            closeEditFormulaForm();
            window.currentAddAccountButton = null;
            window.currentEditRow = null;
            window.isEditMode = false;
            return;
        }

        const rowData = extractRowDataForTemplate(targetRow, {
            processValue,
            accountValue,
            accountId,
            currencyValue,
            currencyName,
            columnsDisplay,
            clickedColumnsDisplay,
            sourcePercentValue,
            sourcePercentEnableValue,
            formulaDisplay,
            formulaValue,
            processedAmount,
            inputMethodValue,
            enableValue,
            descriptionValue,
            isSubIdProduct: isSubForTemplate
        });

        applyTemplateFormulaSaveFields(rowData, targetRow, {
            processValue,
            accountValue,
            accountId,
            currencyValue,
            currencyName,
            columnsDisplay,
            clickedColumnsDisplay,
            sourcePercentValue,
            sourcePercentEnableValue,
            formulaDisplay,
            formulaValue,
            processedAmount,
            inputMethodValue,
            enableValue,
            descriptionValue,
            isSubIdProduct: isSubForTemplate,
            sourcePercent: sourcePercentValue,
            lastSourceValue: formulaDisplay,
        });

        // 二次校验：Currency、Formula 任一项空则绝不调用 saveTemplateAsync
        const hasCurrencyForSave = (rowData.currency_id != null && String(rowData.currency_id).trim() !== '');
        const hasFormulaForSave = (rowData.formula_operators != null && String(rowData.formula_operators).trim() !== '') ||
            (rowData.last_source_value != null && String(rowData.last_source_value).trim() !== '');
        if (!hasCurrencyForSave || !hasFormulaForSave) {
            showNotification('Error', 'Currency and Formula are required. Cannot save.', 'error');
            return;
        }

        // Save template asynchronously (don't block UI)
        // Pass targetRow so template_key can be updated after save
        saveTemplateAsync(rowData, targetRow).then(result => {
            if (result.success && result.template_key) {
                // Update the row's data-template-key attribute after successful save
                // This is now handled inside saveTemplateAsync, but keep this as backup
                if (targetRow) {
                    targetRow.setAttribute('data-template-key', result.template_key);
                    console.log('Updated data-template-key on row:', result.template_key);
                }
            }
        }).catch(error => {
            console.error('Failed to auto-save template:', error);
            // Don't show error notification to avoid interrupting user workflow
        });
    }

    // Close form
    closeEditFormulaForm();

    // 使用刚才保存的 isEditMode 来判断之前是否为编辑模式
    const wasEditMode = isEditMode;

    // Clean up the global references
    window.currentAddAccountButton = null;
    window.currentEditRow = null;
    window.isEditMode = false;

    const actionText = wasEditMode ? 'updated' : 'saved';
    showNotification('Success', `Formula ${actionText} successfully! Processed Amount: ${formatNumberWithThousands(processedAmount)}`, 'success');
    // 除 Rate 外：Formula/Source/排列 设置好即马上保存（Rate 仅随 Rate 的 Submit 持久化）
    saveFormulaSourceForRefresh({ includeRateValue: false });
}

export function registerSummarySaveFormula() {
  window.__SUMMARY_SAVE_FORMULA__ = saveFormula;
  window.saveFormula = saveFormula;
}

export function unregisterSummarySaveFormula() {
  delete window.__SUMMARY_SAVE_FORMULA__;
}
