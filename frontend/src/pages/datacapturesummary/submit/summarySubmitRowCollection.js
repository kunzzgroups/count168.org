import { validateSummaryRowsCurrencyFormula } from "./summarySubmitRowValidation.js";

/** Collect summary table DOM rows into API payload objects. */
export function collectSummarySubmitRowsFromTable(rows, parsedProcessData) {
  const summaryRows = [];
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');

    // 如果 Select 列被勾选，则整行不提交到数据库
    const selectCheckbox = row.querySelector('.summary-select-checkbox');
    if (selectCheckbox && selectCheckbox.checked) {
        console.log('Skipping row because Select is checked');
        return;
    }

    // Check if row has data (Account column should not be empty and should not just contain a button)
    const accountCell = cells[1]; // Account column (now index 1)
    if (!accountCell) return;

    const accountText = accountCell.textContent.trim();
    const hasButton = accountCell.querySelector('.add-account-btn');

    // Skip rows that are empty or only have a + button (button is now in Account column)
    if (!accountText || accountText === '+' || hasButton) return;

    // Extract data from row
    const idProductCell = cells[0];
    const productValues = window.getProductValuesFromCell?.(idProductCell) || { main: "", sub: "" };
    const idProductMainRaw = productValues.main || '';
    const idProductSubRaw = productValues.sub || '';
    const idProductCellText = idProductCell ? idProductCell.textContent.trim() : '';

    // Extract product ID：id_product 整串保留（含冒号等），与资料库一致
    let cleanIdProductMain = '';
    // Description 不再从单元格文本重新截取，而是统一使用行上的 data-original-description，
    // 避免像 "FAH07P1* (红股10%)" 这类已经带描述的值在再次提交时被误判为“无描述”并清空。
    let descriptionMain = row.getAttribute('data-original-description') || '';
    if (idProductMainRaw) {
        cleanIdProductMain = idProductMainRaw.trim();
    }
    let cleanIdProductSub = '';
    let descriptionSub = '';
    if (idProductSubRaw) {
        cleanIdProductSub = idProductSubRaw.trim();
    }

    // Determine product type: 'main' if Main value has value, 'sub' if only Sub value has value
    let productType = 'main';
    let idProduct = cleanIdProductMain;

    if (!cleanIdProductMain && cleanIdProductSub) {
        productType = 'sub';
        idProduct = cleanIdProductSub;
    }

    const account = accountText;
    // ⚠ 列索引说明（参考表头）：
    // 0: Id Product, 1: Account, 2: 按钮列, 3: Currency, 4: Formula, 
    // 5: Source %, 6: Rate, 7: Rate Value, 8: Processed Amount, 9: Skip, 10: Delete
    const currencyText = cells[3] ? cells[3].textContent.trim().replace(/[()]/g, '') : '';
    // Columns column removed, get from data attribute instead
    const columnsValue = row.getAttribute('data-source-columns') || '';
    // Source column removed
    const sourceValue = '';
    // IMPORTANT: Always prioritize data-source-percent attribute (stores multiplier format: 1, 2, 0.5)
    // This ensures we use the correct value that was set when user edited inline
    let sourcePercent = row.getAttribute('data-source-percent') || '';
    if (!sourcePercent || sourcePercent.trim() === '') {
        // Fallback: if data attribute is empty, read from cell display (should be multiplier format)
        const sourcePercentCell = cells[5];
        if (sourcePercentCell) {
            const displayValue = sourcePercentCell.textContent.trim();
            // Remove any % symbol if present (shouldn't be there, but just in case)
            sourcePercent = displayValue.replace('%', '').trim() || '1';
        }
    }
    // If sourcePercent is still empty, set it to "1" (multiplier format)
    if (!sourcePercent || sourcePercent.trim() === '' || sourcePercent.trim().toLowerCase() === 'source') {
        sourcePercent = '1';
    }
    // Formula column is at index 4
    const formulaCell = cells[4];
    const formula = formulaCell ? (formulaCell.querySelector('.formula-text')?.textContent.trim() || formulaCell.textContent.trim()) : '';

    // Get data attributes first (needed for recalculation if needed)
    // 首先获取 data 属性（如果需要重新计算时会用到）
    const formulaOperatorsAttr = row.getAttribute('data-formula-operators') || '';
    const sourceColumnsAttr = row.getAttribute('data-source-columns') || '';
    const inputMethodAttr = row.getAttribute('data-input-method') || '';
    const enableInputMethodAttr = inputMethodAttr ? true : false;
    // Auto-enable if source percent has value
    const sourcePercentAttrForEnable = row.getAttribute('data-source-percent') || '';
    const enableSourcePercentAttr = sourcePercentAttrForEnable && sourcePercentAttrForEnable.trim() !== '';

    // WYSIWYG: Submit 时优先按当前表格里显示的 Formula 现算，
    // 避免旧的 data-formula-operators 把页面上已经正确的金额又算回旧值。
    let processedAmountValue = '';
    try {
        const displayedFormula = formula && formula.trim() !== '' && formula !== 'Formula' ? formula.trim() : '';
        if (displayedFormula) {
            const processValueForFormula = window.getProcessValueFromRow?.(row) ?? null;
            const refCtxSubmit = window.getSummaryRowFormulaRefContext?.(row) ?? {
              clickedCellRefs: "",
              rowIndexOverride: null,
            };
            let recalculatedBaseAmount = window.evaluateFormulaExpression?.(
              displayedFormula,
              processValueForFormula,
              refCtxSubmit.clickedCellRefs,
              refCtxSubmit.rowIndexOverride
            );
            if (!Number.isNaN(Number(recalculatedBaseAmount)) && Number.isFinite(Number(recalculatedBaseAmount))) {
                recalculatedBaseAmount = Number(recalculatedBaseAmount);
                if (enableInputMethodAttr && inputMethodAttr && typeof window.applyInputMethodTransformation === 'function') {
                    recalculatedBaseAmount = window.applyInputMethodTransformation?.(recalculatedBaseAmount, inputMethodAttr);
                }
                const recalculatedDisplayedAmount = typeof window.applyRateToProcessedAmount === 'function'
                    ? window.applyRateToProcessedAmount?.(row, recalculatedBaseAmount)
                    : recalculatedBaseAmount;
                if (!Number.isNaN(Number(recalculatedDisplayedAmount)) && Number.isFinite(Number(recalculatedDisplayedAmount))) {
                    processedAmountValue = String(Number(recalculatedDisplayedAmount));
                }
            }
        }
    } catch (e) { /* ignore */ }
    if (!processedAmountValue || processedAmountValue === '' || processedAmountValue === 'null') {
        const processedAmountText = cells[8] ? cells[8].textContent.trim() : '';
        const cellValueRaw = processedAmountText ? (typeof window.removeThousandsSeparators === 'function' ? window.removeThousandsSeparators?.(processedAmountText) : processedAmountText.replace(/,/g, '')) : '';
        const cellNum = parseFloat(cellValueRaw);
        if (cellValueRaw !== '' && !isNaN(cellNum) && isFinite(cellNum)) {
            processedAmountValue = String(cellNum);
        }
    }
    if (!processedAmountValue || processedAmountValue === '' || processedAmountValue === 'null') {
        processedAmountValue = row.getAttribute('data-base-processed-amount') || '';
    }
    // ⚠ IMPORTANT:
    // 这里不再把 0 当成「无效」数值。
    // 如果界面上的 Processed Amount 是 0.00，用户就是希望保存 0。
    // 只有在完全空白/无数字时才尝试回退计算。
    if (!processedAmountValue || processedAmountValue === 'null') {
        // Fallback 1: Recalculate from source data
        const sourceData = (row.getAttribute('data-formula-operators') || sourceValue || '').trim();
        const inputMethod = inputMethodAttr || '';
        const enableInputMethod = enableInputMethodAttr;
        if (sourceData && sourceData !== 'Source') {
            try {
                const pvFallback = window.getProcessValueFromRow?.(row) ?? null;
                const refCtxFb = window.getSummaryRowFormulaRefContext?.(row) ?? {
                  clickedCellRefs: "",
                  rowIndexOverride: null,
                };
                const recalc = window.calculateFormulaResultFromExpression?.(
                    sourceData,
                    sourcePercent,
                    inputMethod,
                    enableInputMethod,
                    enableSourcePercentAttr,
                    pvFallback,
                    refCtxFb.clickedCellRefs,
                    refCtxFb.rowIndexOverride
                );
                if (recalc != null && !isNaN(parseFloat(String(recalc)))) {
                    processedAmountValue = String(recalc);
                    console.log('Recalculated processed amount from source data:', processedAmountValue);
                }
            } catch (e) { /* ignore */ }
        }
        if ((!processedAmountValue || processedAmountValue === '') && formula && formula.trim() !== '') {
            try {
                const sanitized =
                  typeof window.removeThousandsSeparators === "function"
                    ? window.removeThousandsSeparators(formula.trim().replace(/\s+/g, ""))
                    : formula.trim().replace(/\s+/g, "").replace(/,/g, "");
                if (sanitized && /^[\d+\-*/().\s]+$/.test(sanitized)) {
                    const evaluated = typeof window.evaluateExpression === 'function' ? window.evaluateExpression?.(sanitized) : null;
                    if (evaluated !== null && !isNaN(evaluated) && isFinite(evaluated)) {
                        processedAmountValue = String(evaluated);
                        console.log('Recalculated processed amount from formula expression:', processedAmountValue);
                    }
                }
            } catch (e) { /* ignore */ }
        }
        if (!processedAmountValue || processedAmountValue === '' || processedAmountValue === 'null') {
            const processedAmountText = cells[8] ? cells[8].textContent.trim() : '';
            processedAmountValue =
              processedAmountText && typeof window.removeThousandsSeparators === "function"
                ? window.removeThousandsSeparators(processedAmountText)
                : (processedAmountText || "").replace(/,/g, "");
            if (processedAmountValue === '') processedAmountValue = '0';
            console.warn('Using value from cell text (final fallback):', processedAmountValue);
        }
    }
    // Batch Selection column removed
    const batchSelectionValue = false;
    // Get rate checkbox state and rate input value (Rate column is at index 6)
    const rateCheckbox = cells[6] ? cells[6].querySelector('.rate-checkbox') : null;
    const rateChecked = rateCheckbox ? rateCheckbox.checked : false;
    const rateInput = document.getElementById('rateInput');
    // Get Rate Value from Rate Value column (index 7)
    const rateValueCell = cells[7];
    const rateValueFromColumn = rateValueCell && rateValueCell.textContent ? rateValueCell.textContent.trim() : '';

    // Priority: Rate Value column > Global rateInput (if checkbox checked)
    let rateValue = null;
    if (rateValueFromColumn !== '') {
        // Use Rate Value column value
        rateValue = rateValueFromColumn;
    } else if (rateChecked && rateInput && rateInput.value) {
        // Use global rateInput value if checkbox is checked
        const rateInputValue = rateInput.value.trim();
        if (rateInputValue.startsWith('*') || rateInputValue.startsWith('/')) {
            // Extract number after "*" or "/"
            rateValue = rateInputValue.substring(1);
        } else {
            // Use value as is (backward compatibility)
            rateValue = rateInputValue;
        }
    }
    const templateKeyAttr = row.getAttribute('data-template-key') || '';
    const productTypeAttr = row.getAttribute('data-product-type');
    const parentIdProductAttr = row.getAttribute('data-parent-id-product');
    const templateIdAttr = row.getAttribute('data-template-id');
    const templateId = templateIdAttr && templateIdAttr !== '' ? parseInt(templateIdAttr, 10) : null;
    const subOrderAttr = row.getAttribute('data-sub-order');
    const subOrder = subOrderAttr && subOrderAttr !== '' && !Number.isNaN(Number(subOrderAttr))
        ? Number(subOrderAttr)
        : null;
    // Get formulaVariant from row attribute if available
    const formulaVariantAttr = row.getAttribute('data-formula-variant');
    const formulaVariant = formulaVariantAttr && formulaVariantAttr !== '' ? parseInt(formulaVariantAttr, 10) : null;

    // Get displayOrder from data-row-index attribute to preserve row order
    // This ensures rows are displayed in the same order as in Data Capture Table
    const rowIndexAttr = row.getAttribute('data-row-index');
    const displayOrder = (rowIndexAttr !== null && rowIndexAttr !== '' && !Number.isNaN(Number(rowIndexAttr)))
        ? Number(rowIndexAttr)
        : null;

    if (productTypeAttr) {
        productType = productTypeAttr;
    }

    // Get account ID and currency ID from data attributes (stored when saving formula)
    let accountId = cells[1] ? cells[1].getAttribute('data-account-id') : null;
    let currencyId = cells[3] ? cells[3].getAttribute('data-currency-id') : null;

    // Fallback: try to find from select options if data attribute not available
    if (!accountId) {
        accountId = window.getAccountIdByAccountText?.(account, window.__summaryAccountListCache);
    }
    if (!currencyId) {
        currencyId = window.getCurrencyIdByCode?.(currencyText);
    }

    // Submit the Processed Amount as displayed (do not multiply by Rate on submit).
    // 如果单元格里有数字（包括 0），优先使用单元格里的值；只有在完全没有数字时才回退到公式计算。
    // Rate 列仅用于显示/换算；保存到数据库的永远是 Summary 表中的 Processed Amount。
    const hasDisplayAmount = processedAmountValue !== '' && processedAmountValue !== 'null' && !isNaN(parseFloat(processedAmountValue));
    let finalProcessedAmount = hasDisplayAmount ? parseFloat(processedAmountValue) : 0;

    // source_percent == 1 时，以基础公式重算金额的逻辑只在「没有显示金额」时才启用；
    // 否则会把用户手动改成 0 的金额又改回公式计算值。
    const sourcePercentForSend = sourcePercent || '1';
    const isSourceOne = Math.abs(parseFloat(sourcePercentForSend) - 1) < 0.0001;
    const formulaToSend = (isSourceOne && formula && typeof window.removeTrailingSourcePercentExpression === 'function')
        ? window.removeTrailingSourcePercentExpression?.(formula)
        : formula;
    if (!hasDisplayAmount && isSourceOne && formulaToSend && formulaToSend.trim() !== '') {
        try {
            const sanitized = (typeof window.removeThousandsSeparators === 'function' ? window.removeThousandsSeparators?.(formulaToSend.trim().replace(/\s+/g, '')) : formulaToSend.trim().replace(/\s+/g, '').replace(/,/g, ''));
            if (sanitized && /^[\d+\-*/().\s]+$/.test(sanitized) && typeof evaluateExpression === 'function') {
                const baseAmount = evaluateExpression(sanitized);
                if (baseAmount != null && !isNaN(baseAmount) && isFinite(baseAmount)) {
                    finalProcessedAmount = baseAmount;
                }
            }
        } catch (e) { /* use cell value */ }
    }

    // Debug log
    console.log('Row data extracted:', {
        cleanIdProductMain,
        descriptionMain,
        cleanIdProductSub,
        descriptionSub,
        productType,
        idProduct,
        account,
        accountId,
        currencyText,
        currencyId,
        formulaVariant
    });

    // Validate required fields
    if (!idProduct || idProduct.trim() === '') {
        console.warn('Skipping row with empty idProduct');
        return;
    }

    if (!accountId) {
        console.warn('Skipping row with missing accountId. Account text:', account);
        return;
    }

    // 不再在前端根据 product/account/formula 去重。
    // Summary 表中的每一行（只要有有效的 Id Product 和 Account）都应当提交到后端，
    // 由后端根据 captureId 和业务规则决定是新增还是覆盖。
    // sourcePercentForSend, isSourceOne, formulaToSend 已在上方计算完毕。
    summaryRows.push({
        idProductMain: cleanIdProductMain || null,
        descriptionMain: descriptionMain || null,
        idProductSub: cleanIdProductSub || null,
        descriptionSub: descriptionSub || null,
        productType: productType,
        parentIdProduct: parentIdProductAttr || (cleanIdProductMain || null),
        idProduct: idProduct,
        accountId: accountId,
        account: account,
        accountDisplay: account,
        currencyId: currencyId || parsedProcessData.currency, // Fallback to main currency
        currency: currencyText || parsedProcessData.currencyName,
        currencyDisplay: currencyText || parsedProcessData.currencyName,
        columns: columnsValue,
        sourceColumns: sourceColumnsAttr || columnsValue, // Use saved sourceColumns or fallback to columnsValue
        source: sourceValue,
        sourcePercent: sourcePercentForSend,
        enableSourcePercent: enableSourcePercentAttr ? 1 : 0,
        formulaOperators: formulaOperatorsAttr, // Now stores the full formula expression
        formula: formulaToSend,
        processedAmount: finalProcessedAmount, // Use finalProcessedAmount (with rate applied if checked)
        inputMethod: inputMethodAttr,
        enableInputMethod: enableInputMethodAttr ? 1 : 0,
        batchSelection: batchSelectionValue ? 1 : 0,
        templateKey: templateKeyAttr || null,
        templateId: templateId, // Keep template identity so submit updates the exact sub row
        subOrder: subOrder, // Keep sub row order so same formula/account rows don't collapse
        formulaVariant: formulaVariant, // Include formulaVariant to help backend distinguish rows with same account
        rateChecked: rateChecked, // Rate checkbox state
        rateValue: rateValue, // Rate Value column value (priority) or global rateInput value (if checkbox checked)
        displayOrder: displayOrder // Preserve row order from Data Capture Table
    });
  });
  return summaryRows;
}

/** Preload accounts, validate rows, collect payload rows. */
export async function prepareSummarySubmitCollection(parsedProcessData) {
  const summaryTableBody = document.getElementById("summaryTableBody");
  if (!summaryTableBody) {
    return { ok: false, message: "Summary table not found.", rows: [] };
  }

  const rows = summaryTableBody.querySelectorAll("tr");
  if (typeof window.fetchSummaryAccountList === "function") {
    window.__summaryAccountListCache = await window.fetchSummaryAccountList();
  }

  const rowValidation = validateSummaryRowsCurrencyFormula(rows);
  if (!rowValidation.ok) {
    return { ok: false, message: rowValidation.message, rows: [] };
  }

  const summaryRows = collectSummarySubmitRowsFromTable(rows, parsedProcessData);
  if (summaryRows.length === 0) {
    return {
      ok: false,
      warning: true,
      message: "No data to submit. Please add at least one row with data.",
      rows: [],
    };
  }

  return { ok: true, rows: summaryRows };
}
