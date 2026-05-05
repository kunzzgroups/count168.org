window.BankProcessList = (function () {
    'use strict';
/** Bank 表头与数据行共用同一 grid-template-columns，保证列对齐 */
const BANK_GRID_TEMPLATE_COLUMNS = '0.2fr 0.8fr 0.6fr 0.7fr 0.5fr 0.6fr 0.6fr 0.6fr 0.7fr 0.4fr 0.4fr 0.4fr 0.45fr 0.5fr 0.36fr';
const BANK_STATUS_SELECT_OPTIONS = [
    { value: 'active', label: 'ACTIVE' },
    { value: 'inactive', label: 'INACTIVE' },
    { value: 'official', label: 'OFFICIAL' },
    { value: 'e_invoice', label: 'E-INVOICE' },
    { value: 'block', label: 'BLOCK' }
];

// Bank Supplier 列的排序状态（A→Z / Z→A）
let bankSupplierSortDirection = 'asc'; // 'asc' | 'desc'
let bankAddProcessDataPromise = null;
let bankAddProcessDataLoaded = false;
let currentQuickRemarkProcessId = null;
let pendingBankStatusSelection = null;
let bankProcessSubmitInFlight = false;
const pendingResendScheduleByProcessId = {};
const BANK_ALLOWED_ACCOUNT_ROLES = ['PARTNER', 'SUPPLIER', 'UPLINE', 'STAFF', 'AGENT', 'MEMBER', 'PROFIT'];

function normalizeBankAccountRole(role) {
    return String(role || '').trim().toUpperCase();
}

function isAllowedBankAccountRole(role) {
    return BANK_ALLOWED_ACCOUNT_ROLES.includes(normalizeBankAccountRole(role));
}

function formatBankAccountDisplay(codeRaw, nameRaw, fallbackRaw) {
    const code = String(codeRaw || '').trim();
    const name = String(nameRaw || '').trim();
    const fallback = String(fallbackRaw || '').trim();
    // Always show account_id[name] when account_id exists.
    // If name is empty, fall back to account_id itself: EXPENSES[EXPENSES].
    if (code) {
        const safeName = name || code;
        return code + '[' + safeName + ']';
    }
    if (name) return name;
    return fallback;
}

function notifyTransactionDataChanged(sourceTag) {
    const ts = String(Date.now());
    try {
        localStorage.setItem('count168_tx_invalidate_ts', ts);
    } catch (eInv) { /* ignore */ }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('tx-data-changed', { detail: { ts: ts, source: sourceTag || 'bank_process_list' } }));
        } catch (eEvt) { /* ignore */ }
    }
}

function sortBankProcessesBySupplier() {
    if (!Array.isArray(processes) || processes.length === 0) return;
    processes.sort(function (a, b) {
        const aKey = String(a.card_lower || a.supplier || '').toLowerCase();
        const bKey = String(b.card_lower || b.supplier || '').toLowerCase();
        let result = 0;
        if (aKey < bKey) result = -1;
        else if (aKey > bKey) result = 1;
        if (bankSupplierSortDirection === 'desc') result = -result;
        return result;
    });
}

function updateBankSupplierSortIndicator() {
    const indicator = document.getElementById('bankSupplierSortIndicator');
    if (!indicator) return;
    indicator.textContent = bankSupplierSortDirection === 'asc' ? '▲' : '▼';
}

function toggleBankSupplierSort() {
    if (selectedPermission !== 'Bank') return;
    bankSupplierSortDirection = bankSupplierSortDirection === 'asc' ? 'desc' : 'asc';
    sortBankProcessesBySupplier();
    currentPage = 1;
    renderTable();
    updateBankSupplierSortIndicator();
}

function buildBankRemarkActionButton(processId) {
    return '<button class="edit-btn remark-action-btn" onclick="openQuickRemarkModal(' + processId + ')" aria-label="Remark" title="Remark">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '</button>';
}

/** Icon control aligned with Edit / Remark; restores row to Accounting Due after Maintenance deleted the posting. */
function buildBankResendActionButton(processId) {
    return '<button type="button" class="bank-resend-btn" data-bank-resend-for="' + processId + '" onclick="resendBankProcessAccountingDue(' + processId + ')" ' +
        'aria-label="Resend to Accounting Due" ' +
        'title="Resend">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '</button>';
}

function getProcessListPageByPermission(permission) {
    const normalizedPermission = String(permission || '').trim().toLowerCase();
    if (normalizedPermission === 'bank') return 'bank_process_list.php';
    if (normalizedPermission === 'games' || normalizedPermission === 'gambling') return 'processlist.php';
    return '';
}

function redirectToProcessListPage(targetPage, permission) {
    if (!targetPage || targetPage === currentProcessListPage) return false;
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/[^/]*$/, targetPage);
    const normalizedPermission = String(permission || '').trim();
    if (normalizedPermission) {
        const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');
        if (currentCompanyCode) {
            localStorage.setItem(`selectedPermission_${currentCompanyCode}`, normalizedPermission);
        }
    }
    window.location.href = url.toString();
    return true;
}

function isBankInactiveLike(status, issueFlag) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedIssueFlag = normalizeBankIssueFlag(issueFlag);
    return normalizedStatus === 'inactive' || normalizedIssueFlag === 'official' || normalizedIssueFlag === 'e_invoice' || normalizedIssueFlag === 'block';
}

function bankProcessNormalizeDayStartYmd(dayStartField) {
    if (dayStartField == null) return null;
    const s = String(dayStartField).trim();
    if (!s) return null;
    const head = s.length >= 10 ? s.substring(0, 10) : String(s.split(' ')[0] || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

/**
 * Resend 弹窗 Day start 客户端校验（曾禁止等于今天，现已允许与后端一致）。
 * @returns {string|null} 错误提示文案；null 表示可提交
 */
function bankResendScheduleDayStartForbiddenMessage(chosenTrim, anchorRaw) {
    void anchorRaw;
    void chosenTrim;
    return null;
}

function isBankResendDayStartBackendErrorMessage(text) {
    const s = String(text || '');
    return s.indexOf('不可与今天相同') !== -1
        || s.indexOf('Day start cannot be today') !== -1
        || s.indexOf('Resend 所填 Day start') !== -1
        || s.indexOf('same calendar date as the current contract Day start') !== -1;
}

function clearBankResendDayStartInlineError() {
    const box = document.getElementById('bankResendDayStartInlineError');
    const input = document.getElementById('bank_resend_day_start');
    if (box) {
        box.textContent = '';
        box.hidden = true;
    }
    if (input) {
        input.classList.remove('bank-resend-control--error');
        input.removeAttribute('aria-invalid');
    }
}

/** 弹窗打开时：在表单项旁显示醒目错误；无弹窗时：仅走右上角强提示 toast（仅此业务） */
function presentBankResendDayStartValidationError(message) {
    const msg = String(message || '').trim();
    if (!msg) return;
    const modal = document.getElementById('confirmBankResendModal');
    const modalOpen = modal && modal.style.display === 'block';
    const box = document.getElementById('bankResendDayStartInlineError');
    const input = document.getElementById('bank_resend_day_start');
    if (modalOpen && box) {
        box.textContent = msg;
        box.hidden = false;
        box.setAttribute('role', 'alert');
        if (input) {
            input.classList.add('bank-resend-control--error');
            input.setAttribute('aria-invalid', 'true');
            try {
                input.focus();
            } catch (e) { /* ignore */ }
        }
        try {
            box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (e2) { /* ignore */ }
        return;
    }
    if (typeof showNotification === 'function') {
        showNotification(msg, 'danger', { durationMs: 14500, prominent: true });
    }
}

function isBankProcessInactiveLike(process) {
    if (!process) return false;
    return isBankInactiveLike(process.status, process.issue_flag);
}

function isBankRowInactiveLike(row) {
    if (!row) return false;
    return isBankInactiveLike(row.getAttribute('data-status'), row.getAttribute('data-issue-flag'));
}

function isRealBankInactive(status) {
    return String(status || '').trim().toLowerCase() === 'inactive';
}

function parseDmyDate(value) {
    const text = String(value || '').trim();
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return null;
    const parts = text.split('/').map(Number);
    const date = new Date(parts[2], parts[1] - 1, parts[0]);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function parseIsoDate(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text === '0000-00-00') return null;
    const parts = text.split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
}

function normalizeBankScheduleValue(value) {
    return value == null ? '' : String(value).trim();
}

function getPendingResendScheduleForProcess(processId) {
    const id = parseInt(processId, 10);
    if (!id) return null;
    const row = pendingResendScheduleByProcessId[id];
    if (!row || typeof row !== 'object') return null;
    return {
        day_start: normalizeBankScheduleValue(row.day_start),
        day_end: normalizeBankScheduleValue(row.day_end),
        day_start_frequency: row.day_start_frequency === 'monthly' ? 'monthly' : '1st_of_every_month'
    };
}

function setPendingResendScheduleForProcess(processId, schedule) {
    const id = parseInt(processId, 10);
    if (!id) return;
    if (!schedule || typeof schedule !== 'object') {
        delete pendingResendScheduleByProcessId[id];
        return;
    }
    pendingResendScheduleByProcessId[id] = {
        day_start: normalizeBankScheduleValue(schedule.day_start),
        day_end: normalizeBankScheduleValue(schedule.day_end),
        day_start_frequency: schedule.day_start_frequency === 'monthly' ? 'monthly' : '1st_of_every_month'
    };
}

function getProcessListDateRange() {
    const fromInput = document.getElementById('date_from');
    const toInput = document.getElementById('date_to');
    return {
        from: parseDmyDate(fromInput ? fromInput.value : ''),
        to: parseDmyDate(toInput ? toInput.value : '')
    };
}

function updateProcessListDateClearButton() {
    const clearBtn = document.getElementById('processListDateClearBtn');
    if (!clearBtn) return;
    const range = getProcessListDateRange();
    clearBtn.style.display = range.from || range.to ? 'inline-flex' : 'none';
}

function processMatchesSelectedDate(process) {
    if (selectedPermission !== 'Bank') return true;
    const range = getProcessListDateRange();
    if (!range.from || !range.to) return true;
    const processDate = parseIsoDate(process && (process.date || process.day_start));
    if (!processDate) return false;
    const time = processDate.getTime();
    return time >= range.from.getTime() && time <= range.to.getTime();
}

function updateProcessListDateFilterVisibility() {
    const filterEl = document.getElementById('processListDateFilter');
    if (!filterEl) return;
    filterEl.style.display = selectedPermission === 'Bank' ? 'inline-flex' : 'none';
    updateProcessListDateClearButton();
}

function initProcessListDateFilter() {
    if (!window.MaintenanceDateRangePicker) return;
    window.MaintenanceDateRangePicker.init({
        dateFromId: 'date_from',
        dateToId: 'date_to',
        allowEmpty: true,
        placeholder: 'Select date range',
        onChange: function () {
            updateProcessListDateClearButton();
            currentPage = 1;
            renderTable();
            renderPagination();
        }
    });
    updateProcessListDateClearButton();

    const clearBtn = document.getElementById('processListDateClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (window.MaintenanceDateRangePicker && typeof window.MaintenanceDateRangePicker.clear === 'function') {
                window.MaintenanceDateRangePicker.clear();
            }
        });
    }
}

function buildBankActionCellHtml(processId, status, hasTransactions, issueFlag) {
    const isBankStatusActive = String(status || '').trim().toLowerCase() === 'active';
    // Official / E-INVOICE / Block 仍为 status=active；Resend 不依赖 Maintenance 待办表
    const showResend = isBankStatusActive && !isBankInactiveLike(status, issueFlag);
    const resendBtn = showResend ? buildBankResendActionButton(processId) : '';
    const actionButtons =
        '<span class="bank-action-tools">' +
        '<button class="edit-btn" onclick="editProcess(' + processId + ')" aria-label="Edit" title="Edit"><img src="images/edit.svg" alt="Edit" /></button>' +
        buildBankRemarkActionButton(processId) +
        resendBtn +
        '</span>';
    const showDeleteCheckbox = isRealBankInactive(status);
    if (!showDeleteCheckbox) {
        return actionButtons;
    }
    const disabledAttr = hasTransactions ? ' disabled' : '';
    const titleText = hasTransactions ? 'Cannot delete: process has transactions' : 'Select for deletion';
    return actionButtons + '<input type="checkbox" class="row-checkbox bank-checkbox" data-id="' + processId + '" title="' + titleText + '"' + disabledAttr + ' onchange="onBankProcessCheckboxChange(this)" style="margin-left: 10px;">';
}

function resendBankProcessAccountingDue(processId) {
    const id = parseInt(processId, 10);
    if (id) {
        const proc = processes.find(function (p) { return p.id === id; });
        if (proc) {
            const st = String(proc.status || '').trim().toLowerCase();
            if (st !== 'active' || isBankInactiveLike(proc.status, proc.issue_flag)) {
                showNotification('Resend is only available for Active processes (not Inactive, Official, E-INVOICE, or Block).', 'warning');
                return;
            }
        }
    }
    if (typeof window.showConfirmBankResendModal === 'function') {
        window.showConfirmBankResendModal(processId);
        return;
    }
    if (id) {
        void executeAccountingDueResend(id);
    }
}
window.resendBankProcessAccountingDue = resendBankProcessAccountingDue;

async function executeAccountingDueResend(processId, scheduleOpts) {
    const id = parseInt(processId, 10);
    if (!id) return;
    await persistOpenBankEditBeforeResend(id);
    const procGuard = processes.find(function (p) { return p.id === id; });
    if (procGuard) {
        const st = String(procGuard.status || '').trim().toLowerCase();
        if (st !== 'active' || isBankInactiveLike(procGuard.status, procGuard.issue_flag)) {
            showNotification('Resend is only available for Active processes (not Inactive, Official, E-INVOICE, or Block).', 'warning');
            return;
        }
    }
    const payload = { bank_process_id: id };
    if (scheduleOpts && typeof scheduleOpts === 'object') {
        payload.day_start = scheduleOpts.day_start != null && String(scheduleOpts.day_start).trim() !== ''
            ? String(scheduleOpts.day_start).trim() : '';
        payload.day_end = scheduleOpts.day_end != null && String(scheduleOpts.day_end).trim() !== ''
            ? String(scheduleOpts.day_end).trim() : '';
        payload.day_start_frequency = (scheduleOpts.day_start_frequency === 'monthly') ? 'monthly' : '1st_of_every_month';
        const forbidMsg = bankResendScheduleDayStartForbiddenMessage(payload.day_start, procGuard ? procGuard.day_start : null);
        if (forbidMsg) {
            presentBankResendDayStartValidationError(forbidMsg);
            return;
        }
    }
    try {
        const response = await fetch(buildApiUrl('api/bankprocess_maintenance/resend_accounting_due_api.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.success) {
            const proc = processes.find(function (p) { return p.id === id; });
            if (proc) {
                proc.maintenance_resend_pending = false;
            }
            setPendingResendScheduleForProcess(id, null);
            showNotification(result.message || 'You can post from Accounting Due again', 'success');
            if (typeof loadAccountingInbox === 'function') {
                await loadAccountingInbox();
            }
            if (typeof fetchProcesses === 'function') {
                await fetchProcesses();
            } else {
                const rowB = document.querySelector('#bankTableBody tr[data-id="' + id + '"]');
                if (rowB) {
                    rowB.setAttribute('data-maintenance-resend-pending', '0');
                    const actionCell = rowB.querySelector('.bank-td-action');
                    if (actionCell) {
                        const p = processes.find(function (x) { return x.id === id; });
                        actionCell.innerHTML = buildBankActionCellHtml(
                            id,
                            rowB.getAttribute('data-status') || '',
                            rowB.getAttribute('data-has-transactions') === '1',
                            normalizeBankIssueFlag(p ? p.issue_flag : rowB.getAttribute('data-issue-flag'))
                        );
                    }
                }
            }
        } else {
            const failMsg = result.message || 'Resend failed';
            if (isBankResendDayStartBackendErrorMessage(failMsg) && typeof showNotification === 'function') {
                showNotification(failMsg, 'danger', { durationMs: 14500, prominent: true });
            } else {
                showNotification(failMsg, 'danger');
            }
        }
    } catch (err) {
        console.error('executeAccountingDueResend:', err);
        showNotification('Request failed: ' + (err.message || 'Network error'), 'danger');
    }
}

async function persistOpenBankEditBeforeResend(targetProcessId) {
    const modal = document.getElementById('addBankModal');
    const editIdEl = document.getElementById('bank_edit_id');
    const formEl = document.getElementById('addBankProcessForm');
    if (!modal || !editIdEl || !formEl) return true;
    if (modal.style.display !== 'block') return true;
    const editId = parseInt(editIdEl.value || '', 10);
    if (!editId || editId !== targetProcessId) return true;
    if (bankProcessSubmitInFlight) {
        // Do not block resend while another save is in flight.
        return true;
    }
    if (typeof autoCalculateBankDayEnd === 'function') autoCalculateBankDayEnd();
    // Resend must remain available even when Edit form is incomplete.
    if (typeof markBankRequiredErrors === 'function') markBankRequiredErrors();
    if (typeof clearBankFieldErrors === 'function') clearBankFieldErrors();

    const formData = new FormData(formEl);
    ['country', 'bank', 'type', 'name', 'day_start', 'day_end', 'day_start_frequency'].forEach(function (key) {
        formData.delete(key);
    });
    const cost = document.getElementById('bank_cost')?.value || '0';
    const price = document.getElementById('bank_price')?.value || '0';
    formData.set('profit', MoneyDecimal.formatFixed(MoneyDecimal.sub(price, cost), 8));
    formData.append('permission', 'Bank');
    formData.set('id', String(editId));

    const cardMerchantBtn = document.getElementById('bank_card_merchant');
    const customerBtn = document.getElementById('bank_customer');
    const profitAccountBtn = document.getElementById('bank_profit_account');
    if (cardMerchantBtn && cardMerchantBtn.getAttribute('data-value')) {
        formData.set('card_merchant_id', cardMerchantBtn.getAttribute('data-value'));
    }
    if (customerBtn && customerBtn.getAttribute('data-value')) {
        formData.set('customer_id', customerBtn.getAttribute('data-value'));
    }
    if (profitAccountBtn && profitAccountBtn.getAttribute('data-value')) {
        formData.set('profit_account_id', profitAccountBtn.getAttribute('data-value'));
    }
    try {
        bankProcessSubmitInFlight = true;
        const response = await fetch(buildApiUrl('api/processes/processlist_api.php?action=update_process'), {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (!result.success) {
            // Non-blocking: continue resend even if edit auto-save fails.
            return true;
        }
        return true;
    } catch (error) {
        console.error('persistOpenBankEditBeforeResend failed:', error);
        // Non-blocking: continue resend even if edit auto-save fails.
        return true;
    } finally {
        bankProcessSubmitInFlight = false;
    }
}

function syncBankFilterCheckboxes() {
    const showInactiveCheckbox = document.getElementById('showInactive');
    const showOfficialCheckbox = document.getElementById('showOfficial');
    const showEInvoiceCheckbox = document.getElementById('showEInvoice');
    const showBlockCheckbox = document.getElementById('showBlock');
    const showAllCheckbox = document.getElementById('showAll');
    if (showInactiveCheckbox) showInactiveCheckbox.checked = !!showInactive;
    if (showOfficialCheckbox) showOfficialCheckbox.checked = !!showOfficial;
    if (showEInvoiceCheckbox) showEInvoiceCheckbox.checked = !!showEInvoice;
    if (showBlockCheckbox) showBlockCheckbox.checked = !!showBlock;
    if (showAllCheckbox) showAllCheckbox.checked = !!showAll;
}

function normalizeBankFilterState() {
    if (showAll) {
        showInactive = false;
        showOfficial = false;
        showEInvoice = false;
        showBlock = false;
    }
    syncBankFilterCheckboxes();
}

function normalizeBankIssueFlag(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    if (normalized === 'official' || normalized === 'e_invoice' || normalized === 'block') {
        return normalized;
    }
    return '';
}

function getBankStatusSelectValue(process) {
    if (!process) return 'active';
    const issueFlag = normalizeBankIssueFlag(process.issue_flag);
    if (issueFlag) return issueFlag;
    return String(process.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';
}

function renderBankStatusSelect(processId, process) {
    const currentValue = getBankStatusSelectValue(process);
    const currentOption = BANK_STATUS_SELECT_OPTIONS.find(function (option) {
        return option.value === currentValue;
    }) || BANK_STATUS_SELECT_OPTIONS[0];
    const optionsHtml = BANK_STATUS_SELECT_OPTIONS.map(function (option) {
        const isSelected = option.value === currentValue;
        return '<button type="button" class="bank-status-option' + (isSelected ? ' selected' : '') + '" data-value="' + option.value + '" onclick="selectBankStatusOption(this, ' + processId + '); event.stopPropagation();">' + option.label + '</button>';
    }).join('');

    return '<div class="bank-status-dropdown" data-current-value="' + currentValue + '" data-open="0">' +
        '<button type="button" class="bank-status-button" data-value="' + currentValue + '" onclick="toggleBankStatusDropdown(this, ' + processId + '); event.stopPropagation();">' + currentOption.label + '</button>' +
        '<div class="bank-status-menu" onclick="event.stopPropagation();">' + optionsHtml + '</div>' +
        '</div>';
}

function applyBankStatusSelectAppearance(dropdownEl, rawValue) {
    if (!dropdownEl) return;
    const normalizedFlag = normalizeBankIssueFlag(rawValue);
    const normalized = normalizedFlag || (String(rawValue || '').toLowerCase() === 'inactive' ? 'inactive' : 'active');
    const buttonEl = dropdownEl.querySelector('.bank-status-button');
    const optionEls = dropdownEl.querySelectorAll('.bank-status-option');
    const currentOption = BANK_STATUS_SELECT_OPTIONS.find(function (option) {
        return option.value === normalized;
    }) || BANK_STATUS_SELECT_OPTIONS[0];

    dropdownEl.setAttribute('data-current-value', normalized);
    if (buttonEl) {
        buttonEl.textContent = currentOption.label;
        buttonEl.setAttribute('data-value', normalized);
        buttonEl.classList.remove('is-active', 'is-inactive', 'is-official', 'is-e-invoice', 'is-block');
    }
    if (normalized === 'inactive') {
        if (buttonEl) buttonEl.classList.add('is-inactive');
    } else if (normalized === 'official') {
        if (buttonEl) buttonEl.classList.add('is-official');
    } else if (normalized === 'e_invoice') {
        if (buttonEl) buttonEl.classList.add('is-e-invoice');
    } else if (normalized === 'block') {
        if (buttonEl) buttonEl.classList.add('is-block');
    } else {
        if (buttonEl) buttonEl.classList.add('is-active');
    }

    optionEls.forEach(function (optionEl) {
        optionEl.classList.toggle('selected', String(optionEl.getAttribute('data-value') || '').toLowerCase() === normalized);
    });
}

function refreshBankStatusCell(processId) {
    const process = processes.find(function (item) { return item.id === processId; });
    const row = document.querySelector('#bankTableBody tr[data-id="' + processId + '"]');
    if (!process || !row) return;
    const dropdownEl = row.querySelector('.bank-status-dropdown');
    applyBankStatusSelectAppearance(dropdownEl, getBankStatusSelectValue(process));
}

function closeAllBankStatusDropdowns() {
    document.querySelectorAll('.bank-status-dropdown').forEach(function (dropdownEl) {
        dropdownEl.classList.remove('open');
        dropdownEl.setAttribute('data-open', '0');
        const buttonEl = dropdownEl.querySelector('.bank-status-button');
        if (buttonEl) buttonEl.classList.remove('open');
        restoreBankStatusMenu(dropdownEl);
    });

    // Cleanup orphan floating menus (dropdown rows may be re-rendered/removed)
    document.body.querySelectorAll('.bank-status-menu-floating').forEach(function (menuEl) {
        const owner = menuEl.__ownerDropdown || null;
        if (!owner || !document.body.contains(owner)) {
            menuEl.classList.remove('bank-status-menu-floating');
            menuEl.style.display = 'none';
            try { menuEl.remove(); } catch (e) { /* ignore */ }
        }
    });
}

function moveBankStatusMenuToBody(dropdownEl) {
    if (!dropdownEl) return;
    const menuEl = dropdownEl.querySelector('.bank-status-menu');
    const buttonEl = dropdownEl.querySelector('.bank-status-button');
    if (!menuEl || !buttonEl) return;

    if (!menuEl.__originalParent) {
        menuEl.__originalParent = menuEl.parentNode;
        menuEl.__originalNextSibling = menuEl.nextSibling;
    }
    if (menuEl.parentNode !== document.body) {
        document.body.appendChild(menuEl);
    }

    menuEl.__ownerDropdown = dropdownEl;
    menuEl.classList.add('bank-status-menu-floating');
    menuEl.style.display = 'block';
    menuEl.style.visibility = 'hidden';

    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 112);
    menuEl.style.width = menuWidth + 'px';
    menuEl.style.minWidth = menuWidth + 'px';
    menuEl.style.maxWidth = menuWidth + 'px';

    const menuHeight = menuEl.offsetHeight || 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + menuWidth > viewportWidth - 12) {
        left = Math.max(12, viewportWidth - menuWidth - 12);
    }
    if (top + menuHeight > viewportHeight - 12 && rect.top - menuHeight - 6 > 12) {
        top = rect.top - menuHeight - 6;
    }

    menuEl.style.left = Math.round(left) + 'px';
    menuEl.style.top = Math.round(top) + 'px';
    menuEl.style.visibility = 'visible';
}

function restoreBankStatusMenu(dropdownEl) {
    if (!dropdownEl) return;
    let menuEl = dropdownEl.querySelector('.bank-status-menu');
    if (!menuEl) {
        menuEl = Array.from(document.body.querySelectorAll('.bank-status-menu-floating')).find(function (el) {
            return el.__ownerDropdown === dropdownEl;
        }) || null;
    }
    if (!menuEl) return;

    if (menuEl.__originalParent && menuEl.parentNode === document.body) {
        if (menuEl.__originalNextSibling && menuEl.__originalNextSibling.parentNode === menuEl.__originalParent) {
            menuEl.__originalParent.insertBefore(menuEl, menuEl.__originalNextSibling);
        } else {
            menuEl.__originalParent.appendChild(menuEl);
        }
    }

    menuEl.classList.remove('bank-status-menu-floating');
    menuEl.style.display = '';
    menuEl.style.visibility = '';
    menuEl.style.left = '';
    menuEl.style.top = '';
    menuEl.style.width = '';
    menuEl.style.minWidth = '';
    menuEl.style.maxWidth = '';
}

function toggleBankStatusDropdown(buttonEl) {
    const dropdownEl = buttonEl ? buttonEl.closest('.bank-status-dropdown') : null;
    if (!dropdownEl) return;

    const isOpen = dropdownEl.classList.contains('open');
    closeAllBankStatusDropdowns();
    if (!isOpen) {
        dropdownEl.classList.add('open');
        dropdownEl.setAttribute('data-open', '1');
        buttonEl.classList.add('open');
        moveBankStatusMenuToBody(dropdownEl);
    }
}

async function selectBankStatusOption(optionEl, processId) {
    const menuEl = optionEl ? optionEl.closest('.bank-status-menu') : null;
    const dropdownEl = menuEl && menuEl.__ownerDropdown
        ? menuEl.__ownerDropdown
        : (optionEl ? optionEl.closest('.bank-status-dropdown') : null);
    if (!dropdownEl) return;

    const newValue = String(optionEl.getAttribute('data-value') || '').toLowerCase();
    await handleBankStatusSelectChange(dropdownEl, processId, newValue);
}

if (!window.__bankStatusDropdownBound) {
    window.__bankStatusDropdownBound = true;
    document.addEventListener('click', function () {
        closeAllBankStatusDropdowns();
    });
    window.addEventListener('resize', function () {
        closeAllBankStatusDropdowns();
    });
    window.addEventListener('scroll', function () {
        closeAllBankStatusDropdowns();
    }, true);
}

function matchesCurrentBankFilters(process) {
    if (!process) return false;
    if (!processMatchesSelectedDate(process)) return false;
    if (showAll) return true;
    const status = String(process.status || '').toLowerCase();
    const issueFlag = normalizeBankIssueFlag(process.issue_flag);
    const matches = [];
    const isPlainInactive = status === 'inactive' && issueFlag !== 'official' && issueFlag !== 'e_invoice' && issueFlag !== 'block';
    if (showInactive) matches.push(isPlainInactive);
    if (showOfficial) matches.push(issueFlag === 'official');
    if (showEInvoice) matches.push(issueFlag === 'e_invoice');
    if (showBlock) matches.push(issueFlag === 'block');
    if (matches.length === 0) {
        return status === 'active' && issueFlag !== 'official' && issueFlag !== 'e_invoice' && issueFlag !== 'block';
    }
    return matches.some(Boolean);
}

async function updateBankIssueFlag(processId, newValue, options) {
    const settings = options || {};
    const process = processes.find(function (item) { return item.id === processId; });
    const dropdownEl = settings.dropdownEl || document.querySelector('#bankTableBody tr[data-id="' + processId + '"] .bank-status-dropdown');
    const buttonEl = dropdownEl ? dropdownEl.querySelector('.bank-status-button') : null;
    const previousValue = normalizeBankIssueFlag(process ? process.issue_flag : '');
    const normalizedNewValue = normalizeBankIssueFlag(newValue);

    if (dropdownEl) {
        applyBankStatusSelectAppearance(dropdownEl, normalizedNewValue || (process ? process.status : 'active'));
        closeAllBankStatusDropdowns();
    }
    if (buttonEl) {
        buttonEl.disabled = true;
    }

    try {
        const formData = new FormData();
        formData.append('id', processId);
        formData.append('issue_flag', normalizedNewValue);

        const response = await fetch(buildApiUrl('api/processes/update_bank_issue_flag_api.php'), {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || result.message || 'Status flag update failed');
        }

        if (process) {
            process.issue_flag = normalizedNewValue || null;
        }

        const row = document.querySelector('#bankTableBody tr[data-id="' + processId + '"]');
        if (row) {
            row.setAttribute('data-issue-flag', normalizedNewValue);
            const actionCell = row.querySelector('.bank-td-action');
            if (actionCell) {
                actionCell.innerHTML = buildBankActionCellHtml(processId, process ? process.status : '', row.getAttribute('data-has-transactions') === '1', normalizedNewValue);
            }
        }

        if (process && !matchesCurrentBankFilters(process)) {
            renderTable();
        }

        refreshBankStatusCell(processId);
        updateDeleteButton();
        updateSelectAllProcessesVisibility();
        updatePostToTransactionButton();
        if (selectedPermission === 'Bank' && typeof loadAccountingInbox === 'function') {
            await loadAccountingInbox();
        }
        if (!settings.silent) {
            showNotification('Status option updated', 'success');
        }
    } catch (error) {
        console.error('Status flag update failed:', error);
        if (process) {
            process.issue_flag = previousValue || null;
        }
        refreshBankStatusCell(processId);
        showNotification(error.message || 'Status flag update failed', 'danger');
        throw error;
    } finally {
        const latestButtonEl = document.querySelector('#bankTableBody tr[data-id="' + processId + '"] .bank-status-button');
        if (latestButtonEl) latestButtonEl.disabled = false;
    }
}

async function handleBankStatusSelectChange(dropdownEl, processId, forcedValue) {
    const process = processes.find(function (item) { return item.id === processId; });
    if (!dropdownEl || !process) return;

    const selectedValue = String(forcedValue || dropdownEl.getAttribute('data-current-value') || '').toLowerCase();
    const previousDisplayValue = getBankStatusSelectValue(process);

    if (selectedValue === previousDisplayValue) {
        applyBankStatusSelectAppearance(dropdownEl, previousDisplayValue);
        closeAllBankStatusDropdowns();
        return;
    }

    if (selectedValue === 'official' || selectedValue === 'e_invoice' || selectedValue === 'block') {
        await updateBankIssueFlag(processId, selectedValue, { dropdownEl: dropdownEl });
        return;
    }

    if (selectedValue !== 'active' && selectedValue !== 'inactive') {
        applyBankStatusSelectAppearance(dropdownEl, previousDisplayValue);
        closeAllBankStatusDropdowns();
        return;
    }

    if (String(process.status || '').toLowerCase() === selectedValue) {
        await updateBankIssueFlag(processId, '', { dropdownEl: dropdownEl });
        return;
    }

    pendingBankStatusSelection = {
        processId: processId,
        desiredStatus: selectedValue
    };
    applyBankStatusSelectAppearance(dropdownEl, previousDisplayValue);
    closeAllBankStatusDropdowns();
    showConfirmInactiveModal(processId, selectedValue);
}
function renderBankTable() {
    // When re-rendering table (e.g. filter/pagination), ensure floating status menus are closed & cleaned up
    closeAllBankStatusDropdowns();

    const headRow = document.getElementById('bankTableHeadRow');
    const tbody = document.getElementById('bankTableBody');
    if (!headRow || !tbody) {
        if (typeof updateBankListScrollMode === 'function') updateBankListScrollMode();
        return;
    }

    const thLabels = ['No', 'Supplier', 'Country', 'Bank', 'Types', 'Card Owner', 'Contract', 'Insurance', 'Customer', 'Cost', 'Price', 'Profit', 'Status', 'Date', 'Action'];
    headRow.innerHTML = thLabels.map((label, i) => {
        if (label === 'No') return '<th class="bank-th-no">' + escapeHtml(label) + '</th>';
        if (label === 'Supplier') {
            return '<th class="bank-th-supplier bank-th-sortable" onclick="toggleBankSupplierSort()">' +
                '<span class="bank-th-supplier-text">' + escapeHtml(label) + '</span>' +
                ' <span class="bank-sort-indicator" id="bankSupplierSortIndicator">' +
                (bankSupplierSortDirection === 'asc' ? '▲' : '▼') +
                '</span>' +
                '</th>';
        }
        if (label === 'Country') return '<th class="bank-th-country">' + escapeHtml(label) + '</th>';
        if (label === 'Types') return '<th class="bank-th-types">' + escapeHtml(label) + '</th>';
        if (label === 'Card Owner') return '<th class="bank-th-card-owner">' + escapeHtml(label) + '</th>';
        if (label === 'Status') return '<th class="bank-th-status">' + escapeHtml(label) + '</th>';
        if (label === 'Action') {
            const showActionCheckbox = showInactive || showOfficial || showEInvoice || showBlock;
            return '<th class="bank-th-action">Action' + (showActionCheckbox ? ' <input type="checkbox" id="selectAllBankProcesses" class="header-action-checkbox" title="Select all" style="margin-left: 10px; cursor: pointer;" onchange="toggleSelectAllBankProcesses()">' : '') + '</th>';
        }
        return '<th>' + escapeHtml(label) + '</th>';
    }).join('');

    tbody.innerHTML = '';
    const contractMap = { '1': '1 MONTH', '1 month': '1 MONTH', '2': '2 MONTHS', '2 months': '2 MONTHS', '3': '3 MONTHS', '3 months': '3 MONTHS', '6': '6 MONTHS', '6 months': '6 MONTHS', '1+1': '1+1 MONTH', '1+2': '1+2 MONTHS', '1+3': '1+3 MONTHS' };
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    function getContractStateClass(dayStart, dayEnd) {
        // No day_start set → same as waiting for start date (yellow)
        const hasDayStart = dayStart != null && String(dayStart).trim() !== '';
        if (!hasDayStart) return 'contract-pending';
        if (todayStr < dayStart) return 'contract-pending';
        if (dayEnd && todayStr > dayEnd) return 'contract-expired';
        if (dayStart && dayEnd && todayStr >= dayStart && todayStr <= dayEnd) return 'contract-active';
        if (dayStart && todayStr >= dayStart) return 'contract-active';
        return 'contract-expired';
    }
    let listToShow = Array.isArray(processes)
        ? processes.filter(function (p) { return matchesCurrentBankFilters(p); })
        : [];

    // When Waiting is checked, only show rows where contract is pending (yellow)
    if (waiting) {
        listToShow = listToShow.filter(function (p) { return getContractStateClass(p.day_start || null, p.day_end || null) === 'contract-pending'; });
    }
    // Pagination must use the same row count as the table (filters + date + Waiting), not raw processes.length.
    window.__bankFilteredLength = listToShow.length;

    if (listToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="15" class="bank-empty-cell">No process data found</td></tr>';
        renderPagination();
        updateSelectAllProcessesVisibility();
        if (typeof updateBankListScrollMode === 'function') updateBankListScrollMode();
        return;
    }

    let pageItems, startIndex;
    if (showAll) {
        startIndex = 0;
        pageItems = listToShow;
    } else {
        const totalPagesBank = Math.max(1, Math.ceil(listToShow.length / pageSize));
        if (currentPage > totalPagesBank) currentPage = totalPagesBank;
        startIndex = (currentPage - 1) * pageSize;
        pageItems = listToShow.slice(startIndex, Math.min(startIndex + pageSize, listToShow.length));
    }

    function dashIfEmpty(val) {
        if (val == null) return '-';
        const s = String(val).trim();
        return s === '' ? '-' : val;
    }
    pageItems.forEach((process, idx) => {
        const contract = process.contract ? (contractMap[process.contract] || process.contract) : '';
        const baseContractClass = getContractStateClass(process.day_start || null, process.day_end || null);
        // Special rule: 1 MONTH / 1+1 / 1+2 / 1+3 during active period use gray style
        const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
        const contractClass = (grayContracts.indexOf(contract) !== -1 && baseContractClass === 'contract-active')
            ? 'contract-1month-active'
            : baseContractClass;
        const contractCell = (contract && contractClass)
            ? '<span class="contract-badge ' + contractClass + '">' + escapeHtml(contract) + '</span>'
            : (contract ? escapeHtml(contract) : escapeHtml('-'));
        const cost = dashIfEmpty(process.cost);
        const price = dashIfEmpty(process.price);
        const profit = dashIfEmpty(process.profit);
        const statusSelect = renderBankStatusSelect(process.id, process);
        const actionCell = buildBankActionCellHtml(process.id, process.status, process.has_transactions, process.issue_flag);
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', process.id);
        tr.setAttribute('data-status', process.status || '');
        tr.setAttribute('data-issue-flag', normalizeBankIssueFlag(process.issue_flag));
        tr.setAttribute('data-has-transactions', process.has_transactions ? '1' : '0');
        tr.setAttribute('data-maintenance-resend-pending', process.maintenance_resend_pending ? '1' : '0');
        tr.innerHTML = '<td class="bank-td-no">' + (startIndex + idx + 1) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.card_lower)) + '</td>' +
            '<td class="bank-td-country">' + escapeHtml(dashIfEmpty(process.country)) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.bank)) + '</td>' +
            '<td class="bank-td-types">' + escapeHtml(dashIfEmpty(process.types)) + '</td>' +
            '<td class="bank-td-card-owner">' + escapeHtml(dashIfEmpty(process.supplier)) + '</td>' +
            '<td>' + contractCell + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.insurance)) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.customer)) + '</td>' +
            '<td>' + escapeHtml(String(cost)) + '</td>' +
            '<td>' + escapeHtml(String(price)) + '</td>' +
            '<td>' + escapeHtml(String(profit)) + '</td>' +
            '<td class="bank-td-status">' + statusSelect + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty((process.date === '0000-00-00' || !process.date) ? '' : process.date)) + '</td>' +
            '<td class="bank-td-action">' + actionCell + '</td>';
        tr.setAttribute('data-bp-bank', String(process.bank != null ? process.bank : '').trim());
        tr.setAttribute('data-bp-owner', String(process.supplier != null ? process.supplier : '').trim());
        tbody.appendChild(tr);
        applyBankStatusSelectAppearance(tr.querySelector('.bank-status-dropdown'), getBankStatusSelectValue(process));
    });

    renderPagination();
    updateSelectAllProcessesVisibility();
    updateDeleteButton();
    if (typeof syncBankProcessSelectAllCheckboxState === 'function') {
        syncBankProcessSelectAllCheckboxState();
    }
    if (typeof updateBankListScrollMode === 'function') updateBankListScrollMode();
}

/** 仅调整数据列宽度与 th 一致，th 不改；双 rAF 确保布局完成后再取宽 */
function syncBankTableColumnWidth() {
    if (selectedPermission !== 'Bank') return;
    const tableHeader = document.getElementById('tableHeader');
    const processTableBody = document.getElementById('processTableBody');
    if (!tableHeader || !processTableBody) return;
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            const rect = tableHeader.getBoundingClientRect();
            processTableBody.style.setProperty('--table-header-width', rect.width + 'px');
        });
    });
}

function openAddProcessForSelectedPermission() {
    if (selectedPermission === 'Bank') {
        window.selectedProfitSharingEntries = [];
        document.getElementById('addBankModal').style.display = 'block';
        setBankModalLoadingState(true, 'Add Process');
        ensureAddBankProcessDataLoaded().then(async () => {
            setBankProcessEditLockedFields(false);
            setBankProcessBillingScheduleLocked(false);
            const countryEl = document.getElementById('bank_country');
            if (countryEl) countryEl.value = '';
            applySelectedBanksToDropdown('');
            renderSelectedProfitSharing();
            if (typeof clearBankFieldErrors === 'function') clearBankFieldErrors();
            // Initial frequency sync for Add Process
            if (typeof updateBankFrequencyOptions === 'function') {
                const dayEndEl = document.getElementById('bank_day_end');
                if (dayEndEl) {
                    dayEndEl.value = '';
                    dayEndEl.removeAttribute('min');
                    delete dayEndEl.dataset.bankContractEndHint;
                }
                updateBankFrequencyOptions();
            }
            if (typeof autoCalculateBankDayEnd === 'function') autoCalculateBankDayEnd();
            setBankModalLoadingState(false, 'Add Process');
            updateBankSubmitButtonState();
        }).catch(() => {
            setBankModalLoadingState(false, 'Add Process');
            closeAddBankModal();
        });
    } else {
        loadAddProcessData();
        document.getElementById('addModal').style.display = 'block';
    }
}

let currentBankNoteTarget = 'sop';

function setBankModalLoadingState(isLoading, titleText) {
    const titleEl = document.getElementById('bankModalTitle');
    const submitBtn = document.getElementById('bankSubmitBtn');
    if (titleEl && titleText) titleEl.textContent = titleText;
    if (submitBtn) {
        submitBtn.disabled = !!isLoading;
        submitBtn.textContent = isLoading ? 'Loading...' : (titleText === 'Edit Process' ? 'Update Process' : 'Add Process');
    }
}

function ensureAddBankProcessDataLoaded(forceReload) {
    if (bankAddProcessDataLoaded && !forceReload) {
        return Promise.resolve();
    }
    if (bankAddProcessDataPromise && !forceReload) {
        return bankAddProcessDataPromise;
    }
    bankAddProcessDataPromise = loadAddBankProcessData()
        .then(function () {
            bankAddProcessDataLoaded = true;
        })
        .catch(function (error) {
            bankAddProcessDataLoaded = false;
            throw error;
        })
        .finally(function () {
            bankAddProcessDataPromise = null;
        });
    return bankAddProcessDataPromise;
}

function isBankProcessBillingScheduleLocked() {
    const form = document.getElementById('addBankProcessForm');
    return !!(form && form.getAttribute('data-billing-schedule-locked') === '1');
}

function setBankProcessEditLockedFields(locked) {
    const lockableFieldIds = ['bank_country', 'bank_bank', 'bank_type', 'bank_name'];
    lockableFieldIds.forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        // Edit mode: lock as disabled so user cannot type or open picker.
        el.disabled = !!locked;
        if ('readOnly' in el) el.readOnly = !!locked;
        // Match Profit field visual style (gray but not faded).
        el.style.backgroundColor = locked ? '#f5f5f5' : '';
        el.style.color = locked ? '#495057' : '';
        el.style.opacity = locked ? '1' : '';
        el.style.cursor = locked ? 'not-allowed' : '';
    });
    ['button[onclick="showAddCountryModal()"]', 'button[onclick="showAddBankModal()"]'].forEach(function (selector) {
        const btn = document.querySelector(selector);
        if (!btn) return;
        btn.disabled = !!locked;
        btn.style.opacity = locked ? '0.6' : '';
        btn.style.cursor = locked ? 'not-allowed' : '';
    });
}

function setBankProcessBillingScheduleLocked(locked) {
    const form = document.getElementById('addBankProcessForm');
    if (form) {
        if (locked) {
            form.setAttribute('data-billing-schedule-locked', '1');
        } else {
            form.removeAttribute('data-billing-schedule-locked');
        }
    }
    ['bank_day_start', 'bank_day_end'].forEach(function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.readOnly = !!locked;
        el.style.backgroundColor = locked ? '#f5f5f5' : '';
    });
    const freqEl = document.getElementById('bank_day_start_frequency');
    if (freqEl) {
        freqEl.disabled = !!locked;
        freqEl.style.backgroundColor = locked ? '#f5f5f5' : '';
    }
}

function closeAddBankModal() {
    setBankProcessEditLockedFields(false);
    setBankProcessBillingScheduleLocked(false);
    document.getElementById('addBankModal').style.display = 'none';
    document.getElementById('bank_edit_id').value = '';
    window.selectedProfitSharingEntries = [];
    bankProcessSubmitInFlight = false;
    const titleEl = document.getElementById('bankModalTitle');
    const submitBtn = document.getElementById('bankSubmitBtn');
    if (titleEl) titleEl.textContent = 'Add Process';
    if (submitBtn) {
        submitBtn.textContent = 'Add Process';
        submitBtn.disabled = false;
    }
    document.getElementById('addBankProcessForm').reset();
    document.getElementById('bank_edit_id').value = '';
    const profitInput = document.getElementById('bank_profit');
    if (profitInput) profitInput.value = '';
    const cardMerchantBtn = document.getElementById('bank_card_merchant');
    const customerBtn = document.getElementById('bank_customer');
    if (cardMerchantBtn) {
        cardMerchantBtn.textContent = cardMerchantBtn.getAttribute('data-placeholder') || 'Select Account';
        cardMerchantBtn.removeAttribute('data-value');
    }
    if (customerBtn) {
        customerBtn.textContent = customerBtn.getAttribute('data-placeholder') || 'Select Account';
        customerBtn.removeAttribute('data-value');
    }
    const profitAccountBtn = document.getElementById('bank_profit_account');
    if (profitAccountBtn) {
        profitAccountBtn.textContent = profitAccountBtn.getAttribute('data-placeholder') || 'Select Account';
        profitAccountBtn.removeAttribute('data-value');
    }
    const bankSopEl = document.getElementById('bank_sop');
    const bankRemarkEl = document.getElementById('bank_remark');
    if (bankSopEl) bankSopEl.value = '';
    if (bankRemarkEl) bankRemarkEl.value = '';
    const dayEndClear = document.getElementById('bank_day_end');
    if (dayEndClear) {
        dayEndClear.removeAttribute('min');
        delete dayEndClear.dataset.bankContractEndHint;
    }
}

function openProcessNoteModal(target) {
    const modal = document.getElementById('sopModal');
    const modalTitle = document.getElementById('processNoteModalTitle');
    const sopContent = document.getElementById('sop_content');
    const normalizedTarget = target === 'remark' ? 'remark' : 'sop';
    const sourceField = document.getElementById(normalizedTarget === 'remark' ? 'bank_remark' : 'bank_sop');
    currentBankNoteTarget = normalizedTarget;
    currentQuickRemarkProcessId = null;
    if (modal && sourceField && sopContent) {
        if (modalTitle) {
            modalTitle.textContent = normalizedTarget === 'remark' ? 'Process Remark' : 'Process SOP';
        }
        sopContent.placeholder = normalizedTarget === 'remark'
            ? 'Enter remark for this process...'
            : 'Enter SOP notes for this process...';
        sopContent.value = (sourceField.value || '').trim();
        modal.style.display = 'block';
    }
}
function closeSopModal() {
    const modal = document.getElementById('sopModal');
    if (modal) modal.style.display = 'none';
    currentQuickRemarkProcessId = null;
}
async function saveProcessNoteAndClose() {
    const sopContent = document.getElementById('sop_content');
    if (currentBankNoteTarget === 'quick_remark') {
        const remark = (sopContent && sopContent.value ? sopContent.value : '').trim().toUpperCase();
        if (!currentQuickRemarkProcessId) {
            closeSopModal();
            return;
        }
        try {
            const formData = new FormData();
            formData.append('id', String(currentQuickRemarkProcessId));
            formData.append('remark', remark);
            const response = await fetch(buildApiUrl('api/processes/update_bank_remark_api.php'), {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || result.message || 'Remark update failed');
            }
            const process = processes.find(function (p) { return p.id === currentQuickRemarkProcessId; });
            if (process) {
                process.remark = remark;
            }
            closeSopModal();
            showNotification('Remark updated', 'success');
        } catch (error) {
            console.error('Remark update failed:', error);
            showNotification(error.message || 'Remark update failed', 'danger');
        }
        return;
    }
    const targetField = document.getElementById(currentBankNoteTarget === 'remark' ? 'bank_remark' : 'bank_sop');
    if (targetField && sopContent) {
        targetField.value = (sopContent.value || '').trim().toUpperCase();
    }
    closeSopModal();
}

function openQuickRemarkModal(processId) {
    const modal = document.getElementById('sopModal');
    const modalTitle = document.getElementById('processNoteModalTitle');
    const sopContent = document.getElementById('sop_content');
    const process = processes.find(function (p) { return p.id === processId; });
    if (!modal || !sopContent || !process) return;
    currentBankNoteTarget = 'quick_remark';
    currentQuickRemarkProcessId = processId;
    if (modalTitle) {
        modalTitle.textContent = 'Process Remark';
    }
    sopContent.placeholder = 'Enter remark for this process...';
    sopContent.value = (process.remark || '').trim();
    modal.style.display = 'block';
}
async function openBankEditModal(id) {
    document.getElementById('addBankModal').style.display = 'block';
    setBankModalLoadingState(true, 'Edit Process');
    try {
        const processRequest = fetch(
            buildApiUrl(`api/processes/processlist_api.php?action=get_process&id=${id}&permission=Bank&_=${Date.now()}`),
            { method: 'GET', cache: 'no-store' }
        );
        const bankDataRequest = ensureAddBankProcessDataLoaded();
        const response = await processRequest;
        const result = await response.json();
        if (!result.success || !result.data) {
            showNotification(result.error || 'Failed to load process data', 'danger');
            closeAddBankModal();
            return;
        }
        const process = result.data;
        document.getElementById('bank_edit_id').value = process.id;
        document.getElementById('bankModalTitle').textContent = 'Edit Process';
        document.getElementById('bankSubmitBtn').textContent = 'Update Process';
        document.getElementById('bankSubmitBtn').disabled = true;
        document.getElementById('bank_type').value = process.type || '';
        document.getElementById('bank_name').value = process.name || '';
        document.getElementById('bank_contract').value = process.contract || '';
        document.getElementById('bank_insurance').value = process.insurance != null && process.insurance !== '' ? process.insurance : '';
        const bankSopEl = document.getElementById('bank_sop');
        const bankRemarkEl = document.getElementById('bank_remark');
        if (bankSopEl) bankSopEl.value = (process.sop != null && process.sop !== undefined) ? String(process.sop).toUpperCase() : '';
        if (bankRemarkEl) bankRemarkEl.value = (process.remark != null && process.remark !== undefined) ? String(process.remark).toUpperCase() : '';
        document.getElementById('bank_cost').value = process.cost != null && process.cost !== '' ? process.cost : '';
        document.getElementById('bank_price').value = process.price != null && process.price !== '' ? process.price : '';
        document.getElementById('bank_profit').value = process.profit != null && process.profit !== '' ? process.profit : '';
        const dayStart = process.day_start || '';
        document.getElementById('bank_day_start').value = dayStart ? (dayStart.length === 10 ? dayStart : dayStart.split(' ')[0]) : '';
        const dayEnd = process.day_end || '';
        const dayEndEl = document.getElementById('bank_day_end');
        if (dayEndEl) {
            dayEndEl.value = dayEnd ? (dayEnd.length === 10 ? dayEnd : dayEnd.split(' ')[0]) : '';
        }
        const freqEl = document.getElementById('bank_day_start_frequency');
        if (freqEl) freqEl.value = process.day_start_frequency === 'monthly' ? 'monthly' : '1st_of_every_month';
        if (typeof updateBankFrequencyOptions === 'function') updateBankFrequencyOptions();
        document.getElementById('bank_profit_sharing').value = process.profit_sharing || '';
        window.selectedProfitSharingEntries = [];
        const psStr = (process.profit_sharing || '').trim();
        if (psStr) {
            psStr.split(',').forEach(function (part) {
                const t = part.trim();
                const dash = t.lastIndexOf(' - ');
                if (dash > -1) {
                    window.selectedProfitSharingEntries.push({
                        accountId: '',
                        accountText: t.substring(0, dash).trim(),
                        amount: t.substring(dash + 3).trim()
                    });
                }
            });
        }
        renderSelectedProfitSharing();
        if (typeof updateBankProfitDisplay === 'function') updateBankProfitDisplay();
        if (typeof clearBankFieldErrors === 'function') clearBankFieldErrors();

        const countrySelect = document.getElementById('bank_country');
        const bankSelect = document.getElementById('bank_bank');
        if (process.country && countrySelect && !Array.from(countrySelect.options).some(o => o.value === process.country)) {
            const opt = document.createElement('option');
            opt.value = process.country;
            opt.textContent = process.country;
            countrySelect.appendChild(opt);
        }
        if (countrySelect) {
            countrySelect.value = process.country || '';
        }
        if (process.bank && bankSelect && !Array.from(bankSelect.options).some(o => o.value === process.bank)) {
            const opt = document.createElement('option');
            opt.value = process.bank;
            opt.textContent = process.bank;
            bankSelect.appendChild(opt);
        }
        if (bankSelect) {
            bankSelect.value = process.bank || '';
        }
        const cardMerchantBtnEarly = document.getElementById('bank_card_merchant');
        const customerBtnEarly = document.getElementById('bank_customer');
        const profitAccountBtnEarly = document.getElementById('bank_profit_account');
        if (cardMerchantBtnEarly) {
            cardMerchantBtnEarly.setAttribute('data-value', process.card_merchant_id || '');
            const cmCode = (process.card_merchant_account_id != null && String(process.card_merchant_account_id).trim() !== '') ? String(process.card_merchant_account_id).trim() : '';
            const cmName = (process.card_merchant_name != null && String(process.card_merchant_name).trim() !== '') ? String(process.card_merchant_name).trim() : '';
            cardMerchantBtnEarly.textContent = process.card_merchant_id
                ? (formatBankAccountDisplay(cmCode, cmName, process.card_merchant_id) || 'Select Account')
                : (cardMerchantBtnEarly.getAttribute('data-placeholder') || 'Select Account');
        }
        if (customerBtnEarly) {
            customerBtnEarly.setAttribute('data-value', process.customer_id || '');
            customerBtnEarly.textContent = process.customer_id
                ? (formatBankAccountDisplay(process.customer_account, process.customer_name, process.customer_id) || 'Select Account')
                : (customerBtnEarly.getAttribute('data-placeholder') || 'Select Account');
        }
        if (profitAccountBtnEarly) {
            profitAccountBtnEarly.setAttribute('data-value', process.profit_account_id || '');
            profitAccountBtnEarly.textContent = process.profit_account_id
                ? (formatBankAccountDisplay(process.profit_account_account_id || process.profit_account_name, process.profit_account_name, process.profit_account_id) || 'Select Account')
                : (profitAccountBtnEarly.getAttribute('data-placeholder') || 'Select Account');
        }

        await bankDataRequest;
        if (process.country) {
            if (!Array.from(countrySelect.options).some(o => o.value === process.country)) {
                const opt = document.createElement('option');
                opt.value = process.country;
                opt.textContent = process.country;
                countrySelect.appendChild(opt);
            }
            countrySelect.value = process.country;
            // 编辑时：若当前 process.bank 不在该 Country 的 Selected Banks 中则临时加入，再刷新下拉
            if (process.bank && (process.bank || '').trim()) {
                if (!window.selectedBanksByCountry) window.selectedBanksByCountry = {};
                const arr = window.selectedBanksByCountry[process.country] || [];
                if (arr.indexOf(process.bank) < 0) {
                    window.selectedBanksByCountry[process.country] = arr.concat([process.bank]);
                    persistSelectedBanksByCountryToStorage();
                }
            }
            applySelectedBanksToDropdown(process.country);
        } else {
            countrySelect.value = '';
            applySelectedBanksToDropdown('');
        }
        if (process.bank) {
            bankSelect.value = process.bank;
        } else {
            bankSelect.value = '';
        }
        const cardMerchantBtn = document.getElementById('bank_card_merchant');
        const customerBtn = document.getElementById('bank_customer');
        if (cardMerchantBtn && process.card_merchant_id) {
            cardMerchantBtn.setAttribute('data-value', process.card_merchant_id);
            const cmCode = (process.card_merchant_account_id != null && String(process.card_merchant_account_id).trim() !== '') ? String(process.card_merchant_account_id).trim() : '';
            const cmName = (process.card_merchant_name != null && String(process.card_merchant_name).trim() !== '') ? String(process.card_merchant_name).trim() : '';
            cardMerchantBtn.textContent = formatBankAccountDisplay(cmCode, cmName, process.card_merchant_id) || 'Select Account';
        } else if (cardMerchantBtn) {
            cardMerchantBtn.removeAttribute('data-value');
            cardMerchantBtn.textContent = cardMerchantBtn.getAttribute('data-placeholder') || 'Select Account';
        }
        if (customerBtn && process.customer_id) {
            customerBtn.setAttribute('data-value', process.customer_id);
            customerBtn.textContent = formatBankAccountDisplay(process.customer_account, process.customer_name, process.customer_id) || 'Select Account';
        } else if (customerBtn) {
            customerBtn.removeAttribute('data-value');
            customerBtn.textContent = customerBtn.getAttribute('data-placeholder') || 'Select Account';
        }
        const profitAccountBtn = document.getElementById('bank_profit_account');
        if (profitAccountBtn && process.profit_account_id) {
            profitAccountBtn.setAttribute('data-value', process.profit_account_id);
            profitAccountBtn.textContent = formatBankAccountDisplay(process.profit_account_account_id || process.profit_account_name, process.profit_account_name, process.profit_account_id) || 'Select Account';
        } else if (profitAccountBtn) {
            profitAccountBtn.removeAttribute('data-value');
            profitAccountBtn.textContent = profitAccountBtn.getAttribute('data-placeholder') || 'Select Account';
        }
        updateBankSubmitButtonState();
        document.getElementById('bankSubmitBtn').disabled = false;
        setBankProcessEditLockedFields(true);
        setBankProcessBillingScheduleLocked(false);
    } catch (error) {
        console.error('Error opening bank edit modal:', error);
        closeAddBankModal();
        showNotification('Failed to load process data', 'danger');
    }
}
function toggleSelectAllBankProcesses() {
    const selectAllCheckbox = document.getElementById('selectAllBankProcesses');
    if (!selectAllCheckbox) {
        console.error('selectAllBankProcesses checkbox not found');
        return;
    }

    const allCheckboxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(cb => !cb.disabled);
    console.log('Found bank checkboxes:', allCheckboxes.length, 'Select all checked:', selectAllCheckbox.checked);

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateDeleteButton();
    if (typeof syncBankProcessSelectAllCheckboxState === 'function') {
        syncBankProcessSelectAllCheckboxState();
    }
    updatePostToTransactionButton();
}
function updatePostToTransactionButton() {
    const postBtn = document.getElementById('processPostToTransactionBtn');
    if (!postBtn) return;
    postBtn.style.display = selectedPermission === 'Bank' ? 'inline-block' : 'none';
    if (selectedPermission !== 'Bank') {
        postBtn.disabled = true;
        return;
    }
    const selectedCheckboxes = document.querySelectorAll('.bank-checkbox:checked');
    const activeSelectedIds = Array.from(selectedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        return row && !isBankRowInactiveLike(row) && String(row.getAttribute('data-status') || '').toLowerCase() === 'active';
    }).map(cb => cb.dataset.id);
    postBtn.disabled = activeSelectedIds.length === 0;
    postBtn.textContent = activeSelectedIds.length > 0 ? `Transaction (${activeSelectedIds.length})` : 'Transaction';
}

window.__accountingInboxList = [];
function loadAccountingInbox() {
    const urlStr = buildApiUrl('api/processes/process_accounting_inbox_api.php');
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    const u = new URL(urlStr);
    if (currentCompanyId) u.searchParams.set('company_id', currentCompanyId);
    return fetch(u.toString(), { method: 'GET', cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            const list = (data && data.success && data.data) ? data.data : [];
            window.__accountingInboxList = list;
            renderAccountingInbox(list);
        })
        .catch(err => { console.error('Accounting inbox load failed:', err); renderAccountingInbox([]); });
}
function renderAccountingInbox(items) {
    const tbody = document.getElementById('processAccountingInboxTbody');
    const countEl = document.getElementById('processAccountingInboxCount');
    const countEl2 = document.getElementById('processAccountingInboxCount2');
    const postBtn = document.getElementById('processAccountingInboxPostBtn');
    const selectAllCb = document.getElementById('processAccountingInboxSelectAll');
    if (!tbody || !countEl) return;
    const count = Array.isArray(items) ? items.length : 0;
    const postableCount = Array.isArray(items) ? items.filter(p => !p.already_posted_today).length : 0;
    countEl.textContent = String(postableCount);
    if (countEl2) countEl2.textContent = String(postableCount);
    const countModal = document.getElementById('processAccountingInboxCountModal');
    if (countModal) countModal.textContent = String(postableCount);
    if (selectAllCb) { selectAllCb.checked = postableCount > 0; selectAllCb.disabled = postableCount === 0; }
    if (count === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:10px 8px; color:#6b7280;">No processes due for accounting today.</td></tr>';
        if (postBtn) postBtn.disabled = true;
        const deleteBtn = document.getElementById('processAccountingInboxDeleteBtn');
        if (deleteBtn) deleteBtn.disabled = true;
        const deleteSelectAll = document.getElementById('processAccountingInboxDeleteSelectAll');
        if (deleteSelectAll) { deleteSelectAll.checked = false; deleteSelectAll.disabled = true; }
        return;
    }
    tbody.innerHTML = items.map((row, idx) => {
        const name = (row.name || row.bank || '-');
        const rowClass = row.already_posted_today ? ' class="process-accounting-inbox-row-posted"' : '';
        const cbDisabled = row.already_posted_today ? ' disabled' : '';
        const cbChecked = row.already_posted_today ? '' : ' checked';
        const cbClass = 'process-accounting-inbox-row-cb';
        const periodType = row.is_manual_inactive ? 'manual_inactive' : (row.is_resend_consolidated_range ? 'resend_consolidated_range' : (row.is_partial_first_month ? 'partial_first_month' : (row.is_day_end_tail ? 'day_end_tail' : 'monthly')));
        const cbHtml = '<input type="checkbox" class="' + cbClass + '" data-id="' + row.id + '"' + cbDisabled + cbChecked + ' onchange="updateAccountingInboxPostButton()">';
        const startDate = (row.day_start || row.start_date || '').toString().trim() || '-';
        const contractRaw = (row.contract || '').toString().trim() || '-';
        const contractDisplay = ({ '1+1': '1+1 MONTH', '1+2': '1+2 MONTHS', '1+3': '1+3 MONTHS' })[contractRaw] || contractRaw;
        const bm = (row.monthly_billing_month != null && row.monthly_billing_month !== '') ? String(row.monthly_billing_month).trim() : '';
        const bmAttr = bm ? ' data-billing-month="' + escapeHtml(bm) + '"' : '';
        const deleteCbClass = 'process-accounting-inbox-delete-cb';
        const deleteCbHtml = '<input type="checkbox" class="' + deleteCbClass + '" data-id="' + row.id + '" onchange="updateAccountingInboxDeleteButton()">';
        return '<tr' + rowClass + ' data-id="' + row.id + '" data-period-type="' + periodType + '"' + bmAttr + '><td>' + cbHtml + '</td><td>' + (idx + 1) + '</td><td>' + escapeHtml(startDate) + '</td><td>' + escapeHtml(name) + '</td><td>' + escapeHtml(row.bank || '-') + '</td><td>' + escapeHtml(contractDisplay) + '</td><td>' + deleteCbHtml + '</td></tr>';
    }).join('');
    const deleteSelectAllEl = document.getElementById('processAccountingInboxDeleteSelectAll');
    if (deleteSelectAllEl) { deleteSelectAllEl.checked = false; deleteSelectAllEl.disabled = false; }
    updateAccountingInboxPostButton();
    updateAccountingInboxDeleteButton();
    (function bindSelectAll() {
        const selectAll = document.getElementById('processAccountingInboxSelectAll');
        if (!selectAll || selectAll.onAccountingInboxBound) return;
        selectAll.onAccountingInboxBound = true;
        selectAll.addEventListener('change', function () {
            const checked = this.checked;
            const box = document.getElementById('processAccountingInboxTbody');
            if (box) box.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled])').forEach(cb => { cb.checked = checked; });
            updateAccountingInboxPostButton();
        });
    })();
    (function bindDeleteSelectAll() {
        const deleteSelectAll = document.getElementById('processAccountingInboxDeleteSelectAll');
        if (!deleteSelectAll || deleteSelectAll.onAccountingInboxDeleteBound) return;
        deleteSelectAll.onAccountingInboxDeleteBound = true;
        deleteSelectAll.addEventListener('change', function () {
            const checked = this.checked;
            const box = document.getElementById('processAccountingInboxTbody');
            if (box) box.querySelectorAll('.process-accounting-inbox-delete-cb').forEach(cb => { cb.checked = checked; });
            updateAccountingInboxDeleteButton();
        });
    })();
}
function updateAccountingInboxDeleteButton() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    const deleteBtn = document.getElementById('processAccountingInboxDeleteBtn');
    const deleteSelectAllCb = document.getElementById('processAccountingInboxDeleteSelectAll');
    if (!tbody || !deleteBtn) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-delete-cb:checked');
    const allDelete = tbody.querySelectorAll('.process-accounting-inbox-delete-cb');
    deleteBtn.disabled = checked.length === 0;
    if (deleteSelectAllCb && !deleteSelectAllCb.disabled) {
        deleteSelectAllCb.checked = allDelete.length > 0 && allDelete.length === checked.length;
    }
}
function updateAccountingInboxPostButton() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    const postBtn = document.getElementById('processAccountingInboxPostBtn');
    const selectAllCb = document.getElementById('processAccountingInboxSelectAll');
    if (!tbody || !postBtn) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled]):checked');
    const count = checked.length;
    postBtn.disabled = count === 0;
    if (selectAllCb && !selectAllCb.disabled) {
        const postable = tbody.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled])');
        selectAllCb.checked = postable.length > 0 && postable.length === checked.length;
    }
}
function openAccountingDueModal() {
    const modal = document.getElementById('processAccountingDueModal');
    if (modal) { modal.style.display = 'block'; loadAccountingInbox(); }
}
function closeAccountingDueModal() {
    const modal = document.getElementById('processAccountingDueModal');
    if (modal) modal.style.display = 'none';
}
function openAccountingInbox() {
    openAccountingDueModal();
}
function closeAccountingInbox() {
    closeAccountingDueModal();
}
function updateAccountingInboxVisibility() {
    const wrap = document.getElementById('processAccountingInboxWrap');
    if (!wrap) return;
    if (selectedPermission === 'Bank') {
        wrap.style.display = 'block';
        loadAccountingInbox();
    } else {
        wrap.style.display = 'none';
        closeAccountingInbox();
    }
}

async function postAccountingInboxToTransaction() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    if (!tbody) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-row-cb:not([disabled]):checked');
    const pairs = Array.from(checked).map(cb => {
        const tr = cb.closest('tr');
        const id = parseInt(cb.dataset.id, 10);
        const periodType = (tr && tr.getAttribute('data-period-type')) || 'monthly';
        const billingMonth = (tr && tr.getAttribute('data-billing-month')) || '';
        return { id, periodType, billingMonth };
    }).filter(p => p.id);
    if (pairs.length === 0) {
        showNotification('Please select at least one process to post.', 'warning');
        return;
    }
    try {
        const formData = new FormData();
        pairs.forEach(p => {
            formData.append('ids[]', p.id);
            formData.append('period_types[]', p.periodType);
            formData.append('billing_months[]', p.billingMonth || '');
        });
        const response = await fetch(buildApiUrl('api/processes/process_post_to_transaction_api.php'), { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            notifyTransactionDataChanged('bank_accounting_due_post');
            showNotification(result.message || 'Posted successfully.', 'success');
            closeAccountingInbox();
            loadAccountingInbox();
            fetchProcesses();
        } else {
            showNotification(result.error || result.message || 'Post failed.', 'danger');
        }
    } catch (err) {
        console.error('transaction error:', err);
        showNotification('Request failed: ' + err.message, 'danger');
    }
}

// 从待入账列表移除选中的行（不进行入账、不删 Process，仅让该行从 Accounting Due 消失）
function deleteAccountingInboxSelected() {
    const tbody = document.getElementById('processAccountingInboxTbody');
    if (!tbody) return;
    const checked = tbody.querySelectorAll('.process-accounting-inbox-delete-cb:checked');
    const pairs = Array.from(checked).map(cb => {
        const tr = cb.closest('tr');
        const id = parseInt((tr && tr.getAttribute('data-id')) || cb.dataset.id || '', 10);
        const periodType = (tr && tr.getAttribute('data-period-type')) || 'monthly';
        const billingMonth = (tr && tr.getAttribute('data-billing-month')) || '';
        return { id, periodType, billingMonth };
    }).filter(p => !isNaN(p.id));
    if (pairs.length === 0) {
        showNotification('请在右侧 Delete 列勾选要从 Accounting Due 移除的行', 'warning');
        return;
    }
    showConfirmAccountingDueDeleteModal(pairs);
}

function showConfirmAccountingDueDeleteModal(pairs) {
    pendingDismissPairs = pairs.slice();
    const msgEl = document.getElementById('confirmAccountingDueDeleteMessage');
    if (msgEl) {
        msgEl.textContent = pairs.length === 1
            ? 'This row will be removed from Accounting Due. Process data will not change.'
            : 'These ' + pairs.length + ' rows will be removed from Accounting Due. Process data will not change.';
    }
    const accModal = document.getElementById('confirmAccountingDueDeleteModal');
    if (accModal) accModal.style.display = 'block';
}

function closeConfirmAccountingDueDeleteModal() {
    const accModal = document.getElementById('confirmAccountingDueDeleteModal');
    if (accModal) accModal.style.display = 'none';
    pendingDismissPairs = [];
}

async function confirmAccountingDueDelete() {
    if (pendingDismissPairs.length === 0) {
        closeConfirmAccountingDueDeleteModal();
        return;
    }
    const pairs = pendingDismissPairs.slice();
    closeConfirmAccountingDueDeleteModal();
    const deleteBtn = document.getElementById('processAccountingInboxDeleteBtn');
    const confirmBtn = document.getElementById('confirmAccountingDueDeleteBtn');
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Removing...'; }
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Removing...'; }
    try {
        const formData = new FormData();
        pairs.forEach(p => {
            formData.append('ids[]', p.id);
            formData.append('period_types[]', p.periodType);
            formData.append('billing_months[]', p.billingMonth || '');
        });
        const response = await fetch(buildApiUrl('api/processes/dismiss_accounting_due_api.php'), { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            showNotification(result.message || 'Removed from Accounting Due', 'success');
            loadAccountingInbox();
            if (typeof fetchProcesses === 'function') {
                fetchProcesses();
            }
        } else {
            showNotification(result.message || result.error || 'Remove failed', 'danger');
        }
    } catch (err) {
        console.error('Dismiss error:', err);
        showNotification('Request failed: ' + (err.message || 'Network error'), 'danger');
    } finally {
        if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete'; updateAccountingInboxDeleteButton(); }
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Delete'; }
    }
}

async function postToTransactionSelected() {
    const selectedCheckboxes = document.querySelectorAll('.bank-checkbox:checked');
    const activeSelectedIds = Array.from(selectedCheckboxes).filter(cb => {
        const row = cb.closest('tr');
        return row && !isBankRowInactiveLike(row) && String(row.getAttribute('data-status') || '').toLowerCase() === 'active';
    }).map(cb => cb.dataset.id);
    if (activeSelectedIds.length === 0) {
        showNotification('Please select Process(es) to post (only active processes can be posted)', 'warning');
        return;
    }
    if (!confirm('Confirm posting ' + activeSelectedIds.length + ' selected Process(es)?\n\nBuy Price → Supplier account\nSell Price → Customer account\nProfit → Company account\n\nCorresponding transaction records will be created on the Transaction page.')) {
        return;
    }
    try {
        const formData = new FormData();
        activeSelectedIds.forEach(id => formData.append('ids[]', id));
        const response = await fetch(buildApiUrl('api/processes/process_post_to_transaction_api.php'), {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.success) {
            notifyTransactionDataChanged('bank_list_bulk_post');
            showNotification(result.message || 'Posted successfully', 'success');
            updateDeleteButton();
            fetchProcesses();
        } else {
            showNotification(result.error || result.message || 'Post failed', 'danger');
        }
    } catch (err) {
        console.error('transaction error:', err);
        showNotification('Post request failed: ' + err.message, 'danger');
    }
}

// 执行状态切换（API + 本地更新）
async function performToggleStatus(processId) {
    try {
        const formData = new FormData();
        formData.append('id', processId);

        // Bank list page may rely on body class even before selectedPermission settles
        const isBank = selectedPermission === 'Bank' || document.body.classList.contains('process-page--bank');
        if (isBank) {
            formData.append('permission', 'Bank');
        }

        const response = await fetch(buildApiUrl('api/processes/toggle_process_status_api.php'), {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let msg = 'Status toggle failed';
            try {
                const errJson = await response.json();
                msg = errJson?.error || errJson?.message || msg;
            } catch (_) {
                try {
                    const txt = await response.text();
                    if (txt && txt.trim()) msg = txt.trim();
                } catch (_) { /* ignore */ }
            }
            showNotification(msg, 'danger');
            return;
        }

        let result = null;
        try {
            result = await response.json();
        } catch (parseErr) {
            // Backend updated but response was not valid JSON (e.g. warning output). Treat as success and refresh.
            console.warn('toggle status: invalid JSON response, refreshing list', parseErr);
            await fetchProcesses();
            showNotification('Status updated', 'success');
            return;
        }

        if (!result || result.success !== true) {
            showNotification((result && (result.error || result.message)) || 'Status toggle failed', 'danger');
            return;
        }

        const newStatus = (result.data && result.data.newStatus !== undefined) ? result.data.newStatus : result.newStatus;
        const newDayEnd = (result.data && result.data.newDayEnd !== undefined) ? result.data.newDayEnd : result.newDayEnd;
        const process = processes.find(p => String(p.id) === String(processId));
        if (process) {
            process.status = newStatus;
            if (newDayEnd) process.day_end = newDayEnd;
        }

        const shouldShow = selectedPermission === 'Bank'
            ? matchesCurrentBankFilters(process)
            : (showAll ? true : (showInactive ? newStatus === 'inactive' : newStatus === 'active'));

        if (!shouldShow) {
            const processIndex = processes.findIndex(p => String(p.id) === String(processId));
            if (processIndex > -1) processes.splice(processIndex, 1);
            renderTable();
        } else if (newDayEnd) {
            renderTable();
        } else {
            const process = processes.find(p => String(p.id) === String(processId));
            const statusSelect = renderBankStatusSelect(processId, process);

            if (selectedPermission === 'Bank') {
                const row = document.querySelector('#bankTableBody tr[data-id="' + processId + '"]');
                const hasTx = row ? row.getAttribute('data-has-transactions') === '1' : false;
                const bankActionCellHtml = buildBankActionCellHtml(processId, newStatus, hasTx, process ? process.issue_flag : '');
                if (row) {
                    row.setAttribute('data-status', newStatus || '');
                    row.setAttribute('data-issue-flag', normalizeBankIssueFlag(process ? process.issue_flag : ''));
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 15) {
                        // Contract cell (index 6): apply gray rule for 1 MONTH / 1+1 / 1+2 / 1+3 during active period
                        const contractRaw = process && process.contract ? (contractMap[process.contract] || process.contract) : '';
                        const baseContractClass = getContractStateClass(process.day_start || null, process.day_end || null);
                        const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
                        const contractClass = (grayContracts.indexOf(contractRaw) !== -1 && baseContractClass === 'contract-active')
                            ? 'contract-1month-active'
                            : baseContractClass;
                        const contractCellHtml = (contractRaw && contractClass)
                            ? '<span class="contract-badge ' + contractClass + '">' + escapeHtml(contractRaw) + '</span>'
                            : (contractRaw ? escapeHtml(contractRaw) : escapeHtml('-'));
                        cells[6].innerHTML = contractCellHtml;

                        // Status & action cells
                        cells[12].innerHTML = statusSelect;
                        cells[14].innerHTML = bankActionCellHtml;
                        applyBankStatusSelectAppearance(cells[12].querySelector('.bank-status-dropdown'), getBankStatusSelectValue(process));
                    }
                }
            } else {
                const statusClass = newStatus === 'active' ? 'status-active' : (newStatus === 'waiting' ? 'status-waiting' : 'status-inactive');
                const statusBadge = `<span class="role-badge ${statusClass} status-clickable" onclick="toggleProcessStatus(${processId}, '${newStatus}')" title="Click to toggle status" style="cursor: pointer;">${escapeHtml((newStatus || '').toUpperCase())}</span>`;
                const card = document.querySelector(`.process-card[data-id="${processId}"]`);
                if (card) {
                    const items = card.querySelectorAll('.card-item');
                    if (items.length > 3) {
                        items[3].innerHTML = statusBadge;
                        const actionCell = items[6];
                        if (actionCell) {
                            const existingCheckbox = actionCell.querySelector('.row-checkbox');
                            const existingMuted = actionCell.querySelector('.text-muted');
                            if (newStatus === 'active') {
                                if (existingCheckbox) existingCheckbox.remove();
                                if (existingMuted) existingMuted.remove();
                            } else {
                                const proc = processes.find(function (p) { return String(p.id) === String(processId); });
                                if (!existingCheckbox && !existingMuted && (!proc || !proc.has_transactions)) {
                                    const checkbox = document.createElement('input');
                                    checkbox.type = 'checkbox';
                                    checkbox.className = 'row-checkbox';
                                    checkbox.dataset.id = String(processId);
                                    checkbox.title = 'Select for deletion';
                                    checkbox.style.marginLeft = '10px';
                                    checkbox.onchange = updateDeleteButton;
                                    actionCell.appendChild(checkbox);
                                }
                            }
                        }
                    }
                }
            }
        }

        updateDeleteButton();
        updateSelectAllProcessesVisibility();

        if (selectedPermission === 'Bank' && newStatus === 'inactive' && typeof loadAccountingInbox === 'function') {
            try {
                await loadAccountingInbox();
            } catch (inboxErr) {
                // 状态切换已成功；inbox 刷新失败不应回滚为 toggle failed
                console.warn('loadAccountingInbox failed after status toggle:', inboxErr);
            }
        }

        const statusText = newStatus === 'active' ? 'activated' : 'deactivated';
        showNotification(`Process status changed to ${statusText}`, 'success');
    } catch (e) {
        console.error('performToggleStatus error:', e);
        showNotification('Status toggle failed', 'danger');
    }
}

// 切换流程状态
async function toggleProcessStatus(processId, currentStatus) {
    try {
        if (selectedPermission === 'Bank') {
            const statusLower = (currentStatus || '').toLowerCase();
            const targetStatus = statusLower === 'active' ? 'inactive' : 'active';
            // Bank：无论 active→inactive 还是 inactive→active，都使用同一个自定义确认弹窗
            showConfirmInactiveModal(processId, targetStatus);
            return;
        }
        await performToggleStatus(processId);
    } catch (error) {
        console.error('Error:', error);
        showNotification('Status toggle failed', 'danger');
    }
}

function showConfirmInactiveModal(processId, targetStatus) {
    pendingToggleProcessId = processId;
    pendingToggleNewStatus = (targetStatus || '').toLowerCase();

    const modal = document.getElementById('confirmInactiveModal');
    const titleEl = modal ? modal.querySelector('.process-confirm-title') : null;
    const messageEl = document.getElementById('confirmInactiveMessage');
    const confirmBtn = document.getElementById('confirmInactiveBtn');

    if (pendingToggleNewStatus === 'inactive') {
        if (titleEl) titleEl.textContent = 'Switch to Inactive';
        if (messageEl) messageEl.textContent = 'Confirm switching this Bank Process to Inactive?';
        if (confirmBtn) confirmBtn.textContent = 'Inactive';
    } else {
        if (titleEl) titleEl.textContent = 'Switch to Active';
        if (messageEl) messageEl.textContent = 'Confirm switching this Bank Process to Active?';
        if (confirmBtn) confirmBtn.textContent = 'Active';
    }

    if (modal) modal.style.display = 'block';
}

function closeConfirmInactiveModal() {
    const modal = document.getElementById('confirmInactiveModal');
    if (modal) modal.style.display = 'none';
    pendingToggleProcessId = null;
    pendingToggleNewStatus = null;
    pendingBankStatusSelection = null;
}

async function confirmInactive() {
    if (!pendingToggleProcessId) {
        closeConfirmInactiveModal();
        return;
    }
    const processId = pendingToggleProcessId;
    const pendingStatusSelection = pendingBankStatusSelection ? {
        processId: pendingBankStatusSelection.processId,
        desiredStatus: pendingBankStatusSelection.desiredStatus
    } : null;
    closeConfirmInactiveModal();
    try {
        // 无论目标是 Active 还是 Inactive，都交给同一个切换函数处理
        await performToggleStatus(processId);
        if (pendingStatusSelection && pendingStatusSelection.processId === processId) {
            try {
                await updateBankIssueFlag(processId, '', { silent: true });
            } catch (flagError) {
                // 状态切换已成功时，不因清空 issue_flag 失败而提示整体失败，避免误报
                console.warn('Status changed but clearing issue_flag failed:', flagError);
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Status toggle failed', 'danger');
    }
}
// Bank Add Process 必填项未填时显示红框
var bankRequiredFieldIds = ['bank_country', 'bank_bank', 'bank_type', 'bank_name', 'bank_cost', 'bank_price', 'bank_contract', 'bank_card_merchant', 'bank_customer', 'bank_profit_account'];
function clearBankFieldErrors() {
    bankRequiredFieldIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('bank-field-error');
    });
}
function markBankRequiredErrors() {
    clearBankFieldErrors();
    var country = (document.getElementById('bank_country') && document.getElementById('bank_country').value || '').trim();
    var bank = (document.getElementById('bank_bank') && document.getElementById('bank_bank').value || '').trim();
    var type = (document.getElementById('bank_type') && document.getElementById('bank_type').value || '').trim();
    var name = (document.getElementById('bank_name') && document.getElementById('bank_name').value || '').trim();
    var cost = (document.getElementById('bank_cost') && document.getElementById('bank_cost').value || '').trim();
    var price = (document.getElementById('bank_price') && document.getElementById('bank_price').value || '').trim();
    var contract = (document.getElementById('bank_contract') && document.getElementById('bank_contract').value || '').trim();
    var cardMerchantBtn = document.getElementById('bank_card_merchant');
    var customerBtn = document.getElementById('bank_customer');
    var profitAccountBtn = document.getElementById('bank_profit_account');
    var cardMerchant = cardMerchantBtn && cardMerchantBtn.getAttribute('data-value');
    var customer = customerBtn && customerBtn.getAttribute('data-value');
    var profitAccount = profitAccountBtn && profitAccountBtn.getAttribute('data-value');
    var hasError = false;
    if (!country) { var el = document.getElementById('bank_country'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!bank) { var el = document.getElementById('bank_bank'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!type) { var el = document.getElementById('bank_type'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!name) { var el = document.getElementById('bank_name'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!cost) { var el = document.getElementById('bank_cost'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!price) { var el = document.getElementById('bank_price'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!contract) { var el = document.getElementById('bank_contract'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
    if (!cardMerchant && cardMerchantBtn) { cardMerchantBtn.classList.add('bank-field-error'); hasError = true; }
    if (!customer && customerBtn) { customerBtn.classList.add('bank-field-error'); hasError = true; }
    if (!profitAccount && profitAccountBtn) { profitAccountBtn.classList.add('bank-field-error'); hasError = true; }
    return hasError;
}
function bindBankFieldErrorClear() {
    bankRequiredFieldIds.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el._bankErrorBound) return;
        el._bankErrorBound = true;
        el.addEventListener('input', function () { this.classList.remove('bank-field-error'); });
        el.addEventListener('change', function () { this.classList.remove('bank-field-error'); });
    });

    // Add frequency sync and auto-calc listeners
    const dayStartEl = document.getElementById('bank_day_start');
    const contractEl = document.getElementById('bank_contract');
    const dayEndEl = document.getElementById('bank_day_end');

    function syncBankDayEndContractMin() {
        autoCalculateBankDayEnd();
    }
    if (dayStartEl && !dayStartEl._freqBound) {
        dayStartEl._freqBound = true;
        dayStartEl.addEventListener('change', syncBankDayEndContractMin);
        dayStartEl.addEventListener('input', syncBankDayEndContractMin);
    }
    if (contractEl && !contractEl._freqBound) {
        contractEl._freqBound = true;
        contractEl.addEventListener('change', syncBankDayEndContractMin);
    }
    if (dayEndEl && !dayEndEl._freqBound) {
        dayEndEl._freqBound = true;
        dayEndEl.addEventListener('input', updateBankFrequencyOptions);
        dayEndEl.addEventListener('change', updateBankFrequencyOptions);
    }
    const freqSelectEl = document.getElementById('bank_day_start_frequency');
    if (freqSelectEl && !freqSelectEl._bankDayEndMinBound) {
        freqSelectEl._bankDayEndMinBound = true;
        freqSelectEl.addEventListener('change', syncBankDayEndContractMin);
    }
}

// 处理 Bank Add/Edit Process 表单提交（Edit 时走 update_process）
const addBankProcessForm = document.getElementById('addBankProcessForm');
if (addBankProcessForm && !window.__bankAddProcessSubmitBound) {
    window.__bankAddProcessSubmitBound = true;
    bindBankFieldErrorClear();
    addBankProcessForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (typeof autoCalculateBankDayEnd === 'function') autoCalculateBankDayEnd();
        if (bankProcessSubmitInFlight) {
            return;
        }
        if (markBankRequiredErrors()) {
            showNotification('Please fill in all required fields. Only Insurance and Profit Sharing are optional.', 'danger');
            return;
        }
        clearBankFieldErrors();
        const country = (document.getElementById('bank_country') && document.getElementById('bank_country').value || '').trim();
        const bank = (document.getElementById('bank_bank') && document.getElementById('bank_bank').value || '').trim();
        const type = (document.getElementById('bank_type') && document.getElementById('bank_type').value || '').trim();
        const name = (document.getElementById('bank_name') && document.getElementById('bank_name').value || '').trim();
        const cost = (document.getElementById('bank_cost') && document.getElementById('bank_cost').value || '').trim();
        const price = (document.getElementById('bank_price') && document.getElementById('bank_price').value || '').trim();
        const contract = (document.getElementById('bank_contract') && document.getElementById('bank_contract').value || '').trim();
        const cardMerchantBtn = document.getElementById('bank_card_merchant');
        const customerBtn = document.getElementById('bank_customer');
        const profitAccountBtn = document.getElementById('bank_profit_account');
        const cardMerchant = cardMerchantBtn && cardMerchantBtn.getAttribute('data-value');
        const customer = customerBtn && customerBtn.getAttribute('data-value');
        const profitAccount = profitAccountBtn && profitAccountBtn.getAttribute('data-value');
        if (!country || !bank || !type || !name || !cost || !price || !contract || !cardMerchant || !customer || !profitAccount) {
            return;
        }
        const editId = document.getElementById('bank_edit_id').value;
        bankProcessSubmitInFlight = true;
        const submitBtn = document.getElementById('bankSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = editId ? 'Updating...' : 'Saving...';
        }
        const formData = new FormData(this);
        if (editId) {
            ['country', 'bank', 'type', 'name'].forEach(function (key) {
                formData.delete(key);
            });
        }
        // Profit 栏显示的是扣除 Profit Sharing 后的数额；提交时传 gross（Sell Price - Buy Price）供后端存储
        const grossProfit = MoneyDecimal.sub(document.getElementById('bank_price').value || '0', document.getElementById('bank_cost').value || '0');
        formData.set('profit', MoneyDecimal.formatFixed(grossProfit, 8));
        formData.append('permission', 'Bank');
        if (cardMerchantBtn && cardMerchantBtn.getAttribute('data-value')) {
            formData.append('card_merchant_id', cardMerchantBtn.getAttribute('data-value'));
        }
        if (customerBtn && customerBtn.getAttribute('data-value')) {
            formData.append('customer_id', customerBtn.getAttribute('data-value'));
        }
        if (profitAccountBtn && profitAccountBtn.getAttribute('data-value')) {
            formData.append('profit_account_id', profitAccountBtn.getAttribute('data-value'));
        }
        const freqEl = document.getElementById('bank_day_start_frequency');
        formData.append('day_start_frequency', (freqEl && freqEl.value) ? freqEl.value : '1st_of_every_month');
        try {
            if (editId) {
                formData.append('id', editId);
                const response = await fetch(buildApiUrl('api/processes/processlist_api.php?action=update_process'), {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                if (result.success) {
                    showNotification(result.message || 'Process updated successfully!', 'success');
                    closeAddBankModal();
                    fetchProcesses();
                    if (selectedPermission === 'Bank') loadAccountingInbox();
                } else {
                    showNotification(result.error || 'Update failed', 'danger');
                }
                return;
            }
            const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.success) {
                const cardMerchantId = cardMerchantBtn && cardMerchantBtn.getAttribute('data-value') ? cardMerchantBtn.getAttribute('data-value') : null;
                const customerId = customerBtn && customerBtn.getAttribute('data-value') ? customerBtn.getAttribute('data-value') : null;
                if (cardMerchantId) await ensureAccountHasCountryCurrency(cardMerchantId);
                if (customerId) await ensureAccountHasCountryCurrency(customerId);
                showNotification('Bank process added successfully!', 'success');
                closeAddBankModal();
                fetchProcesses();
                if (selectedPermission === 'Bank') loadAccountingInbox();
            } else {
                showNotification(result.error || 'Unknown error occurred', 'danger');
            }
        } catch (error) {
            console.error('Error saving bank process:', error);
            showNotification('Failed to save bank process', 'danger');
        } finally {
            bankProcessSubmitInFlight = false;
            const modal = document.getElementById('addBankModal');
            const activeSubmitBtn = document.getElementById('bankSubmitBtn');
            if (modal && modal.style.display === 'block' && activeSubmitBtn) {
                activeSubmitBtn.disabled = false;
                activeSubmitBtn.textContent = editId ? 'Update Process' : 'Add Process';
            }
        }
    });
}

// Insurance、Buy Price、Sell Price 只允许数字、逗号、句号
function allowOnlyNumberCommaPeriod(el) {
    if (!el) return;
    el.addEventListener('input', function () {
        this.value = this.value.replace(/[^\d.,]/g, '');
    });
}
allowOnlyNumberCommaPeriod(document.getElementById('bank_insurance'));
allowOnlyNumberCommaPeriod(document.getElementById('bank_cost'));
allowOnlyNumberCommaPeriod(document.getElementById('bank_price'));

// Sync Frequency based on Day End
function updateBankFrequencyOptions() {
    if (isBankProcessBillingScheduleLocked()) return;
    const dayEndEl = document.getElementById('bank_day_end');
    const freqEl = document.getElementById('bank_day_start_frequency');
    if (!dayEndEl || !freqEl) return;

    if (dayEndEl.min && dayEndEl.value && dayEndEl.value < dayEndEl.min) {
        dayEndEl.value = dayEndEl.min;
    }

    const hasDayEnd = !!dayEndEl.value;
    const monthlyOption = freqEl.querySelector('option[value="monthly"]');

    if (hasDayEnd) {
        // If day end is set, force to 1st of every month
        freqEl.value = '1st_of_every_month';
        if (monthlyOption) {
            monthlyOption.disabled = true;
        }
    } else {
        // If no day end, allow monthly selection
        if (monthlyOption) {
            monthlyOption.disabled = false;
        }
    }
}

/** 与 api/processes/billing_schedule.php getBillingTermMonthsFromContract 一致 */
function parseBankContractTermMonths(contract) {
    if (contract == null || String(contract).trim() === '') {
        return null;
    }
    const c = String(contract).trim();
    let m = c.match(/^1\+(\d+)$/i);
    if (m) {
        return 1 + parseInt(m[1], 10);
    }
    m = c.match(/^(\d+)\s*MONTHS?$/i);
    if (m) {
        return Math.max(1, parseInt(m[1], 10));
    }
    return null;
}

function addCalendarMonthsToYmd(ymd, months) {
    if (!ymd || months == null || months < 1) {
        return null;
    }
    const p = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!p) {
        return null;
    }
    const d = new Date(parseInt(p[1], 10), parseInt(p[2], 10) - 1, parseInt(p[3], 10));
    if (isNaN(d.getTime())) {
        return null;
    }
    d.setMonth(d.getMonth() + months);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + day;
}

/** 与 api/processes/billing_schedule.php billingContractExclusiveEndYmdFirstOfMonth 一致（每月1号结算锚点） */
function billingContractExclusiveEndYmdFirstOfMonthJs(startYmd, termMonths) {
    if (!startYmd || termMonths < 1) {
        return null;
    }
    const p = String(startYmd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!p) {
        return null;
    }
    const y = parseInt(p[1], 10);
    const mo = parseInt(p[2], 10);
    const day = parseInt(p[3], 10);
    const start = new Date(y, mo - 1, day);
    if (isNaN(start.getTime())) {
        return null;
    }
    if (day === 1) {
        start.setMonth(start.getMonth() + termMonths);
    } else {
        const firstAnchor = new Date(y, mo, 1);
        firstAnchor.setMonth(firstAnchor.getMonth() + (termMonths - 1));
        return firstAnchor.getFullYear() + '-' + String(firstAnchor.getMonth() + 1).padStart(2, '0') + '-' + String(firstAnchor.getDate()).padStart(2, '0');
    }
    return start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
}

/** 与 contractExclusiveEndYmdForFrequency：monthly = 起始日+N月；否则 = 1st 锚点规则 */
function contractBillingEndYmdForBankForm(startYmd, termMonths, frequency) {
    if (!startYmd || termMonths == null || termMonths < 1) {
        return null;
    }
    if (frequency === 'monthly') {
        return addCalendarMonthsToYmd(startYmd, termMonths);
    }
    return billingContractExclusiveEndYmdFirstOfMonthJs(startYmd, termMonths);
}

/**
 * 不自动填写空的 Day end。设置合约对应的 min；早于 min 则上调。
 * 合同月数缩短（或起始日变化导致合约结束提前）时：若当前 Day end 仍落在「旧合约结束日及之前」且晚于新结束日，则随新合同收到新结束日。
 * 明显高于旧合约结束日的日期视为尾段延长，不因缩短月数被自动改掉。
 */
function autoCalculateBankDayEnd() {
    if (isBankProcessBillingScheduleLocked()) return;
    const dayStartEl = document.getElementById('bank_day_start');
    const dayEndEl = document.getElementById('bank_day_end');
    const contractEl = document.getElementById('bank_contract');
    if (!dayEndEl) {
        return;
    }
    const start = (dayStartEl && dayStartEl.value || '').trim();
    const contract = (contractEl && contractEl.value || '').trim();
    const prevContractEnd = (dayEndEl.dataset.bankContractEndHint || '').trim();
    const freqEl = document.getElementById('bank_day_start_frequency');
    const frequency = (freqEl && freqEl.value === 'monthly') ? 'monthly' : '1st_of_every_month';
    if (!start) {
        dayEndEl.removeAttribute('min');
        delete dayEndEl.dataset.bankContractEndHint;
        updateBankFrequencyOptions();
        return;
    }
    const term = parseBankContractTermMonths(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(start, term, frequency) : null;
    if (!calculated) {
        dayEndEl.min = start;
        delete dayEndEl.dataset.bankContractEndHint;
        if (dayEndEl.value && dayEndEl.value < start) {
            dayEndEl.value = start;
        }
        updateBankFrequencyOptions();
        return;
    }
    dayEndEl.min = calculated;
    const cur = (dayEndEl.value || '').trim();
    if (cur && cur < calculated) {
        dayEndEl.value = calculated;
    } else if (prevContractEnd && cur && calculated < prevContractEnd && cur <= prevContractEnd && cur > calculated) {
        dayEndEl.value = calculated;
    }
    dayEndEl.dataset.bankContractEndHint = calculated;
    updateBankFrequencyOptions();
}


/** Bank Add/Edit 表单：按钮始终可点，提交时校验必填并显示红框（不再因未填而禁用） */
function updateBankSubmitButtonState() {
    const modal = document.getElementById('addBankModal');
    const btn = document.getElementById('bankSubmitBtn');
    if (!modal || modal.style.display !== 'block' || !btn) return;
    btn.disabled = false;
}

// 处理编辑表单提交
const editProcessForm = document.getElementById('editProcessForm');
if (editProcessForm) {
    editProcessForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const formData = new FormData(this);

        if (selectedPermission === 'Bank') {
            formData.append('permission', 'Bank');
        }

        // Add selected descriptions
        if (window.selectedDescriptions && window.selectedDescriptions.length > 0) {
            formData.append('selected_descriptions', JSON.stringify(window.selectedDescriptions));
        }

        // Add selected day use checkboxes
        const selectedDays = [];
        document.querySelectorAll('#edit_day_checkboxes input[name="edit_day_use[]"]:checked').forEach(checkbox => {
            selectedDays.push(checkbox.value);
        });
        formData.append('day_use', selectedDays.join(','));

        try {
            const response = await fetch(buildApiUrl('api/processes/processlist_api.php?action=update_process'), {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                const message = result.message || 'Process updated successfully!';
                showNotification(message, 'success');
                document.getElementById('editModal').style.display = 'none';
                document.getElementById('edit_all_day').checked = false;
                if (window.selectedDescriptions) window.selectedDescriptions = [];
                document.getElementById('edit_selected_descriptions_display').style.display = 'none';
                document.getElementById('edit_description').value = '';
                fetchProcesses(); // Refresh the list
            } else {
                let errorMessage = result.error || 'Unknown error occurred';
                showNotification(errorMessage, 'danger');
            }
        } catch (error) {
            console.error('Error updating process:', error);
            showNotification('Failed to update process', 'danger');
        }
    });
}

// 处理添加新描述表单提交
const addDescriptionForm = document.getElementById('addDescriptionForm');
if (addDescriptionForm) {
    addDescriptionForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const descriptionName = document.getElementById('new_description_name').value.trim();
        if (!descriptionName) {
            showNotification('Please enter description name', 'danger');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('action', 'add_description');
            formData.append('description_name', descriptionName);

            const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                showNotification('Description added successfully!', 'success');
                document.getElementById('new_description_name').value = ''; // Clear input field

                // 重新加载描述列表
                await loadExistingDescriptions();

                // 如果有新添加的描述ID，自动选中它
                if (result.description_id) {
                    const newCheckbox = document.getElementById(`desc_${result.description_id}`);
                    if (newCheckbox) {
                        newCheckbox.checked = true;
                        moveDescriptionToSelected(newCheckbox);
                    }
                }
            } else {
                // 如果是重复的 description，显示英文提示
                if (result.duplicate || (result.error && result.error.includes('already exists'))) {
                    showNotification('Description name already exists', 'danger');
                } else {
                    showNotification('Failed to add description: ' + (result.error || 'Unknown error'), 'danger');
                }
            }
        } catch (error) {
            console.error('Error adding description:', error);
            showNotification('Failed to add description', 'danger');
        }
    });
}

// Add Country form submit (in modal: save to DB via API, then add to Available; user selects to move to Selected)
const addCountryForm = document.getElementById('addCountryForm');
if (addCountryForm && !window.__processlistModalAddCountryFormBound) {
    window.__processlistModalAddCountryFormBound = true;
    addCountryForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const nameInput = document.getElementById('new_country_name');
        const countryName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        if (!countryName) {
            showNotification('Please enter a country name', 'danger');
            return;
        }
        try {
            const formData = new FormData();
            formData.append('country', countryName);
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            if (companyId) formData.append('company_id', companyId);
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=add_country'), { method: 'POST', body: formData });
            const result = await res.json();
            if (!result.success) {
                showNotification(result.error || 'Failed to save country', 'danger');
                return;
            }
        } catch (err) {
            console.error(err);
            showNotification('Failed to save country', 'danger');
            return;
        }
        if (!availableCountriesList.includes(countryName)) {
            availableCountriesList.push(countryName);
            availableCountriesList.sort((a, b) => a.localeCompare(b));
        }
        loadExistingCountries();
        if (nameInput) nameInput.value = '';
        showNotification('Country added to available list', 'success');
    });
}

// Add Bank form submit (in modal: add new bank to Available only; user selects it to move to Selected)
const addBankFormEl = document.getElementById('addBankForm');
if (addBankFormEl && !window.__processlistModalAddBankFormBound) {
    window.__processlistModalAddBankFormBound = true;
    addBankFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        const nameInput = document.getElementById('new_bank_name');
        const bankName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        if (!bankName) {
            showNotification('Please enter a bank name', 'danger');
            return;
        }
        if (!availableBanksList.includes(bankName)) {
            availableBanksList.push(bankName);
            availableBanksList.sort((a, b) => a.localeCompare(b));
        }
        setAvailableBanksForCountry(currentBankModalCountry, availableBanksList);
        loadExistingBanks(currentBankModalCountry);
        if (nameInput) nameInput.value = '';
        showNotification('Bank added to available list', 'success');
    });
}

// Add Account modal state (same as datacapturesummary)
let selectedCurrencyIdsForAdd = [];
let selectedCompanyIdsForAdd = (typeof window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD !== 'undefined' ? window.PROCESSLIST_SELECTED_COMPANY_IDS_FOR_ADD : []);
let deletedCurrencyIds = [];
let bankAccountCurrencies = [];
// Edit Account modal state (for + button when account selected)
let selectedCompanyIdsForEdit = [];
let currentEditAccountIdForBank = null;
/** 从 Supplier 或 Customer 的 + 打开 Add Account 时记录，添加成功后自动选中新账户；Company 不自动选 */
let bankAddAccountTriggerFieldId = null;
// For Profit Sharing rows: remember which hidden input should receive the new account id
let bankAddAccountTriggerHiddenInputId = null;

let bankAccountRoles = [];
/** 与 js/account-list.js 中 ROLE_PRIORITY 保持完全一致 */
const BANK_ROLE_PRIORITY = ['CAPITAL', 'BANK', 'CASH', 'PROFIT', 'EXPENSES', 'COMPANY', 'PARTNER', 'STAFF', 'SUPPLIER', 'AGENT', 'MEMBER', 'DEBTOR'];

function getOrderedRolesBank(roles, includeStaff = true) {
    const normalizedMap = new Map();
    (roles || []).forEach(role => {
        const trimmed = (role || '').trim();
        if (!trimmed) return;
        const upper = trimmed.toUpperCase();
        if (!normalizedMap.has(upper)) {
            normalizedMap.set(upper, trimmed);
        }
    });

    if (includeStaff) {
        normalizedMap.set('STAFF', 'STAFF');
    }

    if (!normalizedMap.has('PARTNER')) {
        normalizedMap.set('PARTNER', 'PARTNER');
    }

    if (!normalizedMap.has('DEBTOR')) {
        normalizedMap.set('DEBTOR', 'DEBTOR');
    }

    const orderedRoles = [];
    BANK_ROLE_PRIORITY.forEach(role => {
        if (normalizedMap.has(role)) {
            orderedRoles.push(normalizedMap.get(role));
            normalizedMap.delete(role);
        } else if (role === 'SUPPLIER' && normalizedMap.has('UPLINE')) {
            orderedRoles.push(normalizedMap.get('UPLINE'));
            normalizedMap.delete('UPLINE');
        }
    });

    const remaining = Array.from(normalizedMap.values()).sort((a, b) => a.localeCompare(b));
    return orderedRoles.concat(remaining);
}

function populateRoleSelectBank(selectElement, roles, selectedRole = '', includeStaff = true) {
    if (!selectElement) return;
    const orderedRoles = getOrderedRolesBank(roles, includeStaff);
    const selectedUpper = (selectedRole || '').toUpperCase();
    selectElement.innerHTML = '<option value="">Select Role</option>';
    orderedRoles.forEach(role => {
        const opt = document.createElement('option');
        opt.value = role;
        opt.textContent = (role.toUpperCase() === 'UPLINE') ? 'SUPPLIER' : role;
        if (selectedUpper && role.toUpperCase() === selectedUpper) opt.selected = true;
        selectElement.appendChild(opt);
    });
    if (selectedUpper && !orderedRoles.some(r => r.toUpperCase() === selectedUpper)) {
        const fallback = document.createElement('option');
        fallback.value = selectedRole;
        fallback.textContent = (selectedRole.toUpperCase() === 'UPLINE') ? 'SUPPLIER' : selectedRole;
        fallback.selected = true;
        selectElement.appendChild(fallback);
    }
}

async function loadEditDataBank() {
    try {
        const res = await fetch(buildApiUrl('api/editdata/editdata_api.php'));
        const result = await res.json();
        if (!result.success) return;
        const data = result.data || result;
        bankAccountCurrencies = data.currencies || [];
        bankAccountRoles = data.roles || [];
        const addRoleSelect = document.getElementById('add_role');
        if (addRoleSelect) {
            populateRoleSelectBank(addRoleSelect, bankAccountRoles);
        }
    } catch (e) {
        console.error('loadEditDataBank', e);
        const addRoleSelect = document.getElementById('add_role');
        if (addRoleSelect) {
            populateRoleSelectBank(addRoleSelect, bankAccountRoles);
        }
    }
}

function toggleAlertFieldsBank(type) {
    const isAdd = type === 'add';
    const paymentAlert = document.querySelector(isAdd ? 'input[name="add_payment_alert"]:checked' : 'input[name="payment_alert"]:checked');
    const alertFields = document.getElementById(isAdd ? 'add_alert_fields' : 'edit_alert_fields');
    const alertAmountRow = document.getElementById(isAdd ? 'add_alert_amount_row' : 'edit_alert_amount_row');
    if (paymentAlert && paymentAlert.value === '1') {
        if (alertFields) alertFields.style.display = 'flex';
        if (alertAmountRow) alertAmountRow.style.display = 'block';
    } else {
        if (alertFields) alertFields.style.display = 'none';
        if (alertAmountRow) alertAmountRow.style.display = 'none';
    }
}

function validatePaymentAlertForAddBank() {
    const paymentAlert = document.querySelector('input[name="add_payment_alert"]:checked');
    const alertType = document.getElementById('add_alert_type');
    const alertStartDate = document.getElementById('add_alert_start_date');
    const alertAmount = document.getElementById('add_alert_amount');
    if (paymentAlert && paymentAlert.value === '1') {
        if (!alertType || !alertType.value || !alertStartDate || !alertStartDate.value) {
            showNotification('When Payment Alert is Yes, both Alert Type and Start Date must be filled.', 'danger');
            return false;
        }
        if (alertAmount && alertAmount.value && (!isValidBankMoneyInput(alertAmount.value) || MoneyDecimal.cmp(alertAmount.value, '0') >= 0)) {
            showNotification('Alert Amount must be a negative number.', 'danger');
            return false;
        }
    }
    return true;
}

function validatePaymentAlertForEditBank() {
    const paymentAlert = document.querySelector('input[name="payment_alert"]:checked');
    const alertType = document.getElementById('edit_alert_type');
    const alertStartDate = document.getElementById('edit_alert_start_date');
    const alertAmount = document.getElementById('edit_alert_amount');
    if (paymentAlert && paymentAlert.value === '1') {
        if (!alertType || !alertType.value || !alertStartDate || !alertStartDate.value) {
            showNotification('When Payment Alert is Yes, both Alert Type and Start Date must be filled.', 'danger');
            return false;
        }
        if (alertAmount && alertAmount.value && (!isValidBankMoneyInput(alertAmount.value) || MoneyDecimal.cmp(alertAmount.value, '0') >= 0)) {
            showNotification('Alert Amount must be a negative number.', 'danger');
            return false;
        }
    }
    return true;
}

async function loadAccountCurrenciesBank(accountId, type) {
    const listId = type === 'add' ? 'addCurrencyList' : 'editCurrencyList';
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    listElement.innerHTML = '';
    if (type === 'add' && !accountId) deletedCurrencyIds = [];
    try {
        const url = accountId
            ? buildApiUrl('api/accounts/account_currency_api.php?action=get_available_currencies&account_id=' + accountId)
            : buildApiUrl('api/accounts/account_currency_api.php?action=get_available_currencies');
        const response = await fetch(url);
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">No currencies available.</div>';
            return;
        }
        const isAddMode = type === 'add' && !accountId;
        let currencyToAutoSelect = null;
        if (isAddMode && selectedCurrencyIdsForAdd.length === 0) {
            const myr = result.data.find(c => String(c.code || '').toUpperCase() === 'MYR');
            currencyToAutoSelect = myr || (result.data.length ? result.data.sort((a, b) => a.id - b.id)[0] : null);
        }
        result.data.forEach(currency => {
            if (deletedCurrencyIds.includes(currency.id)) return;
            const code = String(currency.code || '').toUpperCase();
            const item = document.createElement('div');
            item.className = 'account-currency-item currency-toggle-item';
            item.setAttribute('data-currency-id', currency.id);
            const codeSpan = document.createElement('span');
            codeSpan.className = 'currency-code-text';
            codeSpan.textContent = code;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'currency-delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.setAttribute('type', 'button');
            deleteBtn.setAttribute('title', 'Delete currency permanently');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteCurrencyPermanentlyBank(currency.id, code, item);
            });
            item.appendChild(codeSpan);
            item.appendChild(deleteBtn);
            if (currency.is_linked) item.classList.add('selected');
            else if (isAddMode && selectedCurrencyIdsForAdd.includes(currency.id)) item.classList.add('selected');
            else if (isAddMode && currencyToAutoSelect && currency.id === currencyToAutoSelect.id) {
                item.classList.add('selected');
                if (!selectedCurrencyIdsForAdd.includes(currency.id)) selectedCurrencyIdsForAdd.push(currency.id);
            }
            if (isAddMode) {
                codeSpan.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    if (shouldSelect) {
                        item.classList.add('selected');
                        if (!selectedCurrencyIdsForAdd.includes(currency.id)) selectedCurrencyIdsForAdd.push(currency.id);
                    } else {
                        item.classList.remove('selected');
                        selectedCurrencyIdsForAdd = selectedCurrencyIdsForAdd.filter(id => id !== currency.id);
                    }
                });
            } else if (type === 'edit' && accountId) {
                codeSpan.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    toggleAccountCurrencyBank(accountId, currency.id, code, shouldSelect, item);
                });
            }
            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account currencies:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">Failed to load currencies.</div>';
    }
}

async function toggleAccountCurrencyBank(accountId, currencyId, code, shouldSelect, itemElement) {
    const previousState = itemElement.classList.contains('selected');
    if (shouldSelect) itemElement.classList.add('selected');
    else itemElement.classList.remove('selected');
    try {
        const action = shouldSelect ? 'add_currency' : 'remove_currency';
        const res = await fetch(buildApiUrl('api/accounts/account_currency_api.php?action=' + action), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, currency_id: currencyId })
        });
        const result = await res.json();
        if (result.success) {
            showNotification(shouldSelect ? 'Currency ' + code + ' added to account' : 'Currency ' + code + ' removed from account', 'success');
        } else {
            if (previousState) itemElement.classList.add('selected');
            else itemElement.classList.remove('selected');
            showNotification(result.error || 'Currency update failed', 'danger');
        }
    } catch (e) {
        if (previousState) itemElement.classList.add('selected');
        else itemElement.classList.remove('selected');
        showNotification('Currency update failed', 'danger');
    }
}

async function deleteCurrencyPermanentlyBank(currencyId, currencyCode, itemElement) {
    if (!confirm('Are you sure you want to permanently delete currency ' + currencyCode + '? This action cannot be undone.')) return;
    try {
        const res = await fetch(buildApiUrl('api/accounts/delete_currency_api.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currencyId })
        });
        const data = await res.json();
        if (data.success) {
            if (itemElement && itemElement.parentNode) itemElement.remove();
            if (!deletedCurrencyIds.includes(currencyId)) deletedCurrencyIds.push(currencyId);
            showNotification('Currency ' + currencyCode + ' deleted successfully!', 'success');
        } else {
            showNotification(data.error || 'Failed to delete currency', 'danger');
        }
    } catch (e) {
        showNotification('Failed to delete currency', 'danger');
    }
}

async function loadAccountCompaniesBank(accountId, type) {
    const listId = type === 'add' ? 'addCompanyList' : 'editCompanyList';
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    listElement.innerHTML = '';
    if (type === 'add' && !accountId) {
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (currentCompanyId && !selectedCompanyIdsForAdd.includes(currentCompanyId))
            selectedCompanyIdsForAdd.push(currentCompanyId);
    }
    try {
        const url = accountId
            ? buildApiUrl('api/accounts/account_company_api.php?action=get_available_companies&account_id=' + accountId)
            : buildApiUrl('api/accounts/account_company_api.php?action=get_available_companies');
        const response = await fetch(url);
        const result = await response.json();
        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">No companies available.</div>';
            return;
        }
        const isAddMode = type === 'add' && !accountId;
        const isEditMode = type === 'edit' && accountId;
        if (isEditMode) selectedCompanyIdsForEdit = [];
        result.data.forEach(company => {
            const code = String(company.company_code || '').toUpperCase();
            const item = document.createElement('div');
            item.className = 'account-currency-item currency-toggle-item';
            item.setAttribute('data-company-id', company.id);
            item.textContent = code;
            if (company.is_linked) {
                item.classList.add('selected');
                if (isEditMode) selectedCompanyIdsForEdit.push(company.id);
            } else if (isAddMode && selectedCompanyIdsForAdd.includes(company.id)) item.classList.add('selected');
            if (isAddMode) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    if (shouldSelect) {
                        item.classList.add('selected');
                        if (!selectedCompanyIdsForAdd.includes(company.id)) selectedCompanyIdsForAdd.push(company.id);
                    } else {
                        item.classList.remove('selected');
                        selectedCompanyIdsForAdd = selectedCompanyIdsForAdd.filter(id => id !== company.id);
                    }
                });
            } else if (isEditMode) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    if (shouldSelect) {
                        item.classList.add('selected');
                        if (!selectedCompanyIdsForEdit.includes(company.id)) selectedCompanyIdsForEdit.push(company.id);
                    } else {
                        item.classList.remove('selected');
                        selectedCompanyIdsForEdit = selectedCompanyIdsForEdit.filter(id => id !== company.id);
                    }
                });
            }
            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account companies:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">Failed to load companies.</div>';
    }
}

async function addCurrencyFromInputBank(type) {
    const isEdit = type === 'edit';
    const input = document.getElementById(isEdit ? 'editCurrencyInput' : 'addCurrencyInput');
    const currencyCode = (input && input.value.trim() || '').toUpperCase();
    if (!currencyCode) {
        showNotification('Please enter currency code', 'danger');
        if (input) input.focus();
        return false;
    }
    const existing = bankAccountCurrencies.find(c => (c.code || '').toUpperCase() === currencyCode);
    if (existing) {
        showNotification('Currency ' + currencyCode + ' already exists', 'info');
        if (input) input.value = '';
        return;
    }
    try {
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        const res = await fetch(buildApiUrl('api/accounts/addcurrencyapi.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: currencyCode, company_id: currentCompanyId })
        });
        const result = await res.json();
        if (result.success && result.data) {
            const newCurrencyId = result.data.id;
            bankAccountCurrencies.push({ id: newCurrencyId, code: result.data.code });
            if (isEdit && currentEditAccountIdForBank) {
                await loadAccountCurrenciesBank(currentEditAccountIdForBank, 'edit');
                const linkRes = await fetch(buildApiUrl('api/accounts/account_currency_api.php?action=add_currency'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_id: currentEditAccountIdForBank, currency_id: newCurrencyId })
                });
                const linkResult = await linkRes.json();
                if (linkResult.success) {
                    await loadAccountCurrenciesBank(currentEditAccountIdForBank, 'edit');
                    showNotification('Currency ' + currencyCode + ' created and linked to account', 'success');
                } else {
                    showNotification('Currency ' + currencyCode + ' created, link failed', 'warning');
                }
            } else {
                await loadAccountCurrenciesBank(null, 'add');
                showNotification('Currency ' + currencyCode + ' created successfully', 'success');
            }
            if (input) input.value = '';
        } else {
            showNotification(result.error || 'Failed to create currency', 'danger');
        }
    } catch (e) {
        showNotification('Failed to create currency', 'danger');
    }
    return false;
}

// Add Account form submit (same as datacapturesummary - addaccountapi.php + link currencies/companies)
const addAccountFormEl = document.getElementById('addAccountForm');
if (addAccountFormEl && !window.__globalAddAccountSubmitHandlerBound) {
    window.__globalAddAccountSubmitHandlerBound = true;
    addAccountFormEl.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (window.__globalAddAccountSubmitInFlight) return;
        // Guard against double-submit (double click / Enter key repeat / duplicated trigger)
        if (this.dataset.submitting === '1') return;
        window.__globalAddAccountSubmitInFlight = true;
        this.dataset.submitting = '1';
        const submitBtn = this.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        if (!validatePaymentAlertForAddBank()) {
            this.dataset.submitting = '0';
            if (submitBtn) submitBtn.disabled = false;
            window.__globalAddAccountSubmitInFlight = false;
            return;
        }
        const formData = new FormData(this);
        const paymentAlert = document.querySelector('input[name="add_payment_alert"]:checked');
        if (paymentAlert) {
            formData.set('payment_alert', paymentAlert.value);
            if (paymentAlert.value === '0' || paymentAlert.value === 0) {
                formData.set('alert_type', '');
                formData.set('alert_start_date', '');
                formData.set('alert_amount', '');
            }
        }
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (currentCompanyId) formData.set('company_id', currentCompanyId);
        if (selectedCurrencyIdsForAdd.length > 0) formData.set('currency_ids', JSON.stringify(selectedCurrencyIdsForAdd));
        if (selectedCompanyIdsForAdd.length > 0) formData.set('company_ids', JSON.stringify(selectedCompanyIdsForAdd));
        
        // 调试：打印表单数据
        console.log('Form data being submitted:');
        for (let [key, value] of formData.entries()) {
            console.log(key, ':', value);
        }
        
        try {
            const response = await fetch(buildApiUrl('api/accounts/addaccountapi.php'), { method: 'POST', body: formData });
            const result = await response.json();
            console.log('Add account response:', result);
            if (result.success) {
                const newAccountId = result.data && result.data.id;
                let hasErrors = false;
                if (selectedCurrencyIdsForAdd.length > 0 && newAccountId) {
                    try {
                        const currencyPromises = selectedCurrencyIdsForAdd.map(currencyId =>
                            fetch(buildApiUrl('api/accounts/account_currency_api.php?action=add_currency'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ account_id: newAccountId, currency_id: currencyId })
                            }).then(r => r.json())
                        );
                        const currencyResults = await Promise.all(currencyPromises);
                        if (currencyResults.some(r => !r.success)) hasErrors = true;
                    } catch (err) { hasErrors = true; }
                }
                if (selectedCompanyIdsForAdd.length > 0 && newAccountId) {
                    try {
                        const companyPromises = selectedCompanyIdsForAdd.map(companyId =>
                            fetch(buildApiUrl('api/accounts/account_company_api.php?action=add_company'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ account_id: newAccountId, company_id: companyId })
                            }).then(r => r.json())
                        );
                        const companyResults = await Promise.all(companyPromises);
                        if (companyResults.some(r => !r.success)) hasErrors = true;
                    } catch (err) { hasErrors = true; }
                }
                if (hasErrors) showNotification('Account created successfully, but some associations failed.', 'warning');
                else if (selectedCurrencyIdsForAdd.length > 0 || selectedCompanyIdsForAdd.length > 0) showNotification('Account added successfully with currencies and companies!', 'success');
                else showNotification('Account added successfully!', 'success');
                selectedCurrencyIdsForAdd = [];
                selectedCompanyIdsForAdd = currentCompanyId ? [currentCompanyId] : [];
                var triggerFieldId = bankAddAccountTriggerFieldId;
                var triggerHiddenId = bankAddAccountTriggerHiddenInputId;
                closeAddAccountModal();
                await loadBankAccounts();
                refreshBankAccountDropdowns();
                if (newAccountId && triggerFieldId) {
                    const targetBtn = document.getElementById(triggerFieldId);
                    if (targetBtn) {
                        const displayText = result.data.account_id || result.data.name || String(newAccountId);
                        targetBtn.textContent = displayText;
                        targetBtn.setAttribute('data-value', newAccountId);
                        targetBtn.classList.remove('bank-field-error');
                    }
                    if (triggerHiddenId) {
                        const hiddenInput = document.getElementById(triggerHiddenId);
                        if (hiddenInput) {
                            hiddenInput.value = newAccountId;
                        }
                    }
                }
            } else {
                showNotification(result.error || 'Failed to add account', 'danger');
            }
        } catch (err) {
            console.error('Add account error', err);
            showNotification('Failed to add account', 'danger');
        } finally {
            this.dataset.submitting = '0';
            if (submitBtn) submitBtn.disabled = false;
            window.__globalAddAccountSubmitInFlight = false;
        }
    });
}

const editAccountFormEl = document.getElementById('editAccountForm');
if (editAccountFormEl) {
    editAccountFormEl.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!validatePaymentAlertForEditBank()) return;
        const formData = new FormData(this);
        const paymentAlert = formData.get('payment_alert');
        if (paymentAlert === '0' || paymentAlert === 0) {
            formData.set('alert_type', '');
            formData.set('alert_start_date', '');
            formData.set('alert_amount', '');
        }
        if (Array.isArray(selectedCompanyIdsForEdit) && selectedCompanyIdsForEdit.length > 0) {
            formData.set('company_ids', JSON.stringify(selectedCompanyIdsForEdit));
        }
        try {
            const response = await fetch(buildApiUrl('api/accounts/update_api.php'), { method: 'POST', body: formData });
            const result = await response.json();
            if (result.success) {
                showNotification('Account updated successfully!', 'success');
                closeEditAccountModalFromBank();
                await loadBankAccounts();
                refreshBankAccountDropdowns();
            } else {
                showNotification(result.error || 'Account update failed', 'danger');
            }
        } catch (err) {
            console.error('Edit account error', err);
            showNotification('Update failed', 'danger');
        }
    });
}

const profitSharingFormEl = document.getElementById('profitSharingForm');
if (profitSharingFormEl) {
    profitSharingFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        const rows = document.querySelectorAll('#profitSharingRowsContainer .profit-sharing-row');
        if (!window.selectedProfitSharingEntries) window.selectedProfitSharingEntries = [];
        let added = 0;
        rows.forEach(function (row) {
            const accountHidden = row.querySelector('.profit-sharing-account-id');
            const accountBtn = row.querySelector('.profit-sharing-account-btn');
            const amountInput = row.querySelector('.profit-sharing-amount');
            if (!amountInput) return;
            const accountId = (accountHidden && accountHidden.value) ? (accountHidden.value || '').trim() : '';
            const rawAmount = (amountInput.value || '').trim();
            if (!accountId || rawAmount === '') return;
            const accountText = (accountBtn && accountBtn.textContent) ? accountBtn.textContent.trim() : '';
            const amount = isValidBankMoneyInput(rawAmount) ? MoneyDecimal.formatDisplay(rawAmount, 8) : rawAmount;
            window.selectedProfitSharingEntries.push({ accountId: accountId, accountText: accountText, amount: amount });
            added++;
        });
        if (added === 0) {
            showNotification('Please select at least one Account and enter Amount.', 'warning');
            return;
        }
        renderSelectedProfitSharing();
        closeProfitSharingModal();
    });
}

const profitSharingAddRowBtn = document.getElementById('profitSharingAddRowBtn');
if (profitSharingAddRowBtn) {
    profitSharingAddRowBtn.addEventListener('click', function () {
        addProfitSharingRow();
    });
}

// 页面加载完成后执行
// Profit calculation flag to prevent duplicate listeners
let bankProfitCalculatorsInitialized = false;

// 获取公司货币代码列表（与 Account 的 currency 同步，account 有什么 currency，Country 就有什么）
async function fetchCompanyCurrencyCodes() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    let url = buildApiUrl('api/accounts/account_currency_api.php?action=get_available_currencies');
    if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
    const res = await fetch(url);
    const result = await res.json();
    const data = (result.success && result.data && Array.isArray(result.data)) ? result.data : [];
    return data.map(function (c) { return (c.code || '').toString().trim(); }).filter(Boolean);
}

// Load countries from server：下拉只显示已选 Country（get_selected_countries），与 account 同步的是「可选来源」在弹窗里用公司货币
async function loadCountriesFromServer() {
    const select = document.getElementById('bank_country');
    if (!select) return;
    const currentVal = (select.value || '').trim();
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    try {
        let list = [];
        if (companyId) {
            const selUrl = buildApiUrl('api/processes/processlist_api.php?action=get_selected_countries&company_id=' + encodeURIComponent(companyId));
            const selRes = await fetch(selUrl);
            const selResult = await selRes.json();
            list = (selResult.success && selResult.data && Array.isArray(selResult.data)) ? selResult.data : [];
        }
        if (list.length === 0) {
            let url = buildApiUrl('api/processes/processlist_api.php?action=get_countries');
            if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
            const res = await fetch(url);
            const result = await res.json();
            list = (result.success && result.data) ? result.data : [];
        }
        select.innerHTML = '';
        const opt0 = document.createElement('option');
        opt0.value = '';
        opt0.textContent = 'Select Country';
        select.appendChild(opt0);
        list.forEach(function (c) {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            select.appendChild(opt);
        });
        if (currentVal && list.indexOf(currentVal) >= 0) select.value = currentVal;
        else select.value = '';
    } catch (e) {
        console.warn('loadCountriesFromServer', e);
    }
}

// Load Bank Add Process Data（Country 从服务端已选列表加载，Bank 从 country_bank 加载，登出/隔几小时后仍保持）
async function loadAddBankProcessData() {
    try {
        await loadCountriesFromServer();
        await restoreSelectedBanksByCountryFromStorage();
        if (!window.selectedBanksByCountry || typeof window.selectedBanksByCountry !== 'object') window.selectedBanksByCountry = {};
        const countrySelect = document.getElementById('bank_country');
        const firstCountry = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
        if (firstCountry) await loadBanksByCountry(firstCountry);
        await loadBankAccounts();
        initBankAccountSelect('bank_card_merchant', 'bank_card_merchant_dropdown');  // Supplier: show account_id like Customer/Company
        initBankAccountSelect('bank_customer', 'bank_customer_dropdown');
        initBankAccountSelect('bank_profit_account', 'bank_profit_account_dropdown');
        updateBankAddButtonTitles();

        // 设置 Profit 自动计算（只初始化一次）；有 Profit Sharing 时显示扣除后的数额
        if (!bankProfitCalculatorsInitialized) {
            const costInput = document.getElementById('bank_cost');
            const priceInput = document.getElementById('bank_price');
            const profitInput = document.getElementById('bank_profit');
            if (costInput && priceInput && profitInput) {
                costInput.addEventListener('input', updateBankProfitDisplay);
                priceInput.addEventListener('input', updateBankProfitDisplay);
                bankProfitCalculatorsInitialized = true;
            }
        }
    } catch (error) {
        console.error('Error loading bank process data:', error);
    }
}

// 按 Country 加载 Bank 下拉选项（Country-Bank 联动）
async function loadBanksByCountry(country) {
    const select = document.getElementById('bank_bank');
    if (!select) return;
    const currentBank = (select.value || '').trim();
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Select Bank';
    select.appendChild(opt0);
    if (!country || (country = String(country).trim()) === '') {
        if (currentBank) select.value = '';
        return;
    }
    try {
        const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        let url = buildApiUrl('api/processes/processlist_api.php?action=get_banks_by_country&country=' + encodeURIComponent(country));
        if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
        const res = await fetch(url);
        const result = await res.json();
        const banks = (result.success && result.data) ? result.data : [];
        banks.forEach(function (b) {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            select.appendChild(opt);
        });
        if (currentBank && banks.indexOf(currentBank) >= 0) select.value = currentBank;
        else select.value = '';
    } catch (e) {
        console.warn('loadBanksByCountry', e);
        if (currentBank) select.value = '';
    }
}

// Country 变更时：Bank 下拉只显示当前 Country 的 Selected Banks（不调用接口）
(function () {
    const countrySelect = document.getElementById('bank_country');
    if (countrySelect) {
        countrySelect.addEventListener('change', function () {
            applySelectedBanksToDropdown(this.value);
        });
    }
})();

// Country field: user may enter country name (Malaysia -> MYR) or currency code directly (MYR, SGD)
const COUNTRY_TO_CURRENCY = { 'Malaysia': 'MYR', 'Singapore': 'SGD' };

function resolveCurrencyCodeFromCountryField(value) {
    if (!value || (value = String(value).trim()) === '') return null;
    if (COUNTRY_TO_CURRENCY[value]) return COUNTRY_TO_CURRENCY[value];
    if (value.length >= 2 && value.length <= 5) return value.toUpperCase();
    return null;
}

async function ensureAccountHasCountryCurrency(accountId) {
    if (!accountId) return;
    const countrySelect = document.getElementById('bank_country');
    const countryOrCurrency = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
    const currencyCode = resolveCurrencyCodeFromCountryField(countryOrCurrency);
    if (!currencyCode) return;
    try {
        const apiUrl = buildApiUrl('api/processes/addprocess_api.php');
        const res = await fetch(apiUrl);
        const result = await res.json();
        if (!result.success) return;
        const currencies = result.currencies || [];
        let currency = currencies.find(c => (c.code || '').toUpperCase() === currencyCode);
        if (!currency || !currency.id) {
            const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            const createRes = await fetch(buildApiUrl('api/accounts/addcurrencyapi.php'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: currencyCode, company_id: currentCompanyId || undefined })
            });
            const createResult = await createRes.json();
            if (createResult.success && createResult.data) {
                currency = { id: createResult.data.id, code: createResult.data.code || currencyCode };
            } else if (createResult.error && (createResult.error + '').toLowerCase().includes('already exists')) {
                const refetch = await fetch(apiUrl);
                const refetchResult = await refetch.json();
                if (refetchResult.success && Array.isArray(refetchResult.currencies)) {
                    currency = refetchResult.currencies.find(c => (c.code || '').toUpperCase() === currencyCode);
                }
            }
            if (!currency || !currency.id) {
                console.warn('ensureAccountHasCountryCurrency: could not get or create currency', currencyCode);
                return;
            }
        }
        const getCurrUrl = buildApiUrl('api/accounts/account_currency_api.php?action=get_account_currencies&account_id=' + accountId);
        const getCurrRes = await fetch(getCurrUrl);
        const getCurrResult = await getCurrRes.json();
        if (getCurrResult.success && Array.isArray(getCurrResult.data)) {
            const alreadyHas = getCurrResult.data.some(c => (c.currency_id || c.id) === currency.id || (c.currency_code || '').toUpperCase() === currencyCode);
            if (alreadyHas) return;
        }
        const addUrl = buildApiUrl('api/accounts/account_currency_api.php?action=add_currency');
        const addRes = await fetch(addUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, currency_id: currency.id })
        });
        const addResult = await addRes.json();
        if (addResult.success) {
            showNotification(currencyCode + ' added to account', 'success');
        }
    } catch (e) {
        console.warn('ensureAccountHasCountryCurrency', e);
    }
}

// Load accounts for Bank form（仅显示允许的 role 账户）
async function loadBankAccounts() {
    try {
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        const url = new URL(buildApiUrl('api/accounts/accountlistapi.php'));
        if (currentCompanyId) {
            url.searchParams.set('company_id', currentCompanyId);
        }
        url.searchParams.set('roles', BANK_ALLOWED_ACCOUNT_ROLES.join(','));

        const response = await fetch(url.toString());
        const result = await response.json();

        if (result.success && result.data != null) {
            const rawAccounts = (result.data.accounts && Array.isArray(result.data.accounts)) ? result.data.accounts : [];
            window.bankAccounts = rawAccounts.filter(account => isAllowedBankAccountRole(account.role));
        } else {
            window.bankAccounts = [];
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        window.bankAccounts = [];
    }
}

// Initialize Bank Account Select (custom dropdown with search, like datacapturesummary Account)
function initBankAccountSelect(buttonId, dropdownId) {
    const accountButton = document.getElementById(buttonId);
    const accountDropdown = document.getElementById(dropdownId);
    const searchInput = accountDropdown?.querySelector('.custom-select-search input');
    const optionsContainer = accountDropdown?.querySelector('.custom-select-options');

    if (!accountButton || !accountDropdown || !searchInput || !optionsContainer) return;

    let isOpen = false;
    let dropdownOriginalParent = null;
    let dropdownOriginalNextSibling = null;
    const isInBankModal = accountDropdown.closest('#addBankModal');

    function moveDropdownToBody() {
        if (!isInBankModal) return;
        const rect = accountButton.getBoundingClientRect();
        dropdownOriginalParent = accountDropdown.parentNode;
        dropdownOriginalNextSibling = accountDropdown.nextSibling;
        document.body.appendChild(accountDropdown);
        accountDropdown.style.position = 'fixed';
        accountDropdown.style.left = rect.left + 'px';
        accountDropdown.style.top = (rect.bottom + 2) + 'px';
        accountDropdown.style.width = Math.max(rect.width, 220) + 'px';
        accountDropdown.style.minWidth = Math.max(rect.width, 220) + 'px';
        accountDropdown.style.zIndex = '10001';
    }
    function restoreDropdownToModal() {
        if (!isInBankModal || !dropdownOriginalParent) return;
        if (dropdownOriginalNextSibling) {
            dropdownOriginalParent.insertBefore(accountDropdown, dropdownOriginalNextSibling);
        } else {
            dropdownOriginalParent.appendChild(accountDropdown);
        }
        accountDropdown.style.position = '';
        accountDropdown.style.left = '';
        accountDropdown.style.top = '';
        accountDropdown.style.width = '';
        accountDropdown.style.minWidth = '';
        accountDropdown.style.zIndex = '';
        dropdownOriginalParent = null;
        dropdownOriginalNextSibling = null;
    }
    function closeThisDropdown() {
        restoreDropdownToModal();
        accountDropdown.style.display = 'none';
        accountDropdown.classList.remove('custom-select-dropdown-above');
        isOpen = false;
    }
    accountDropdown._bankAccountClose = closeThisDropdown;

    // Load accounts into dropdown（API 返回该公司下全部账户，四类下拉共用同一列表）
    const placeholderText = accountButton.getAttribute('data-placeholder') || 'Select Account';
    function loadAccounts() {
        optionsContainer.innerHTML = '';
        // Always read filter from this dropdown's search input so search matches what user sees
        const filterLower = (searchInput.value || '').toLowerCase().trim();
        let accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];

        // Always add "Select Account" as first option so user can clear selection
        {
            const selectOpt = document.createElement('div');
            selectOpt.className = 'custom-select-option';
            selectOpt.setAttribute('data-value', '');
            selectOpt.textContent = 'Select Account';
            selectOpt.addEventListener('click', () => {
                accountButton.textContent = placeholderText;
                accountButton.setAttribute('data-value', '');
                closeThisDropdown();
                updateBankAddButtonTitles();
                if (typeof updateBankSubmitButtonState === 'function') updateBankSubmitButtonState();
            });
            optionsContainer.appendChild(selectOpt);
        }

        // Display as "account_id[name]" to show both code and name
        function getDisplayText(account) {
            return formatBankAccountDisplay(account.account_id, account.name, account.id);
        }
        let filteredAccounts = accounts.filter(account => {
            const displayText = getDisplayText(account).toLowerCase();
            return !filterLower || displayText.includes(filterLower);
        });
        // Sort alphabetically by display text
        filteredAccounts = filteredAccounts.slice().sort((a, b) => {
            const ta = getDisplayText(a).toLowerCase();
            const tb = getDisplayText(b).toLowerCase();
            return ta.localeCompare(tb);
        });

        if (filteredAccounts.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'custom-select-no-results';
            noResults.textContent = 'No accounts found';
            optionsContainer.appendChild(noResults);
        } else {
            filteredAccounts.forEach(account => {
                const option = document.createElement('div');
                option.className = 'custom-select-option';
                option.setAttribute('data-value', account.id);
                option.textContent = getDisplayText(account);
                option.addEventListener('click', () => {
                    accountButton.textContent = getDisplayText(account);
                    accountButton.setAttribute('data-value', account.id);
                    accountButton.classList.remove('bank-field-error');
                    closeThisDropdown();
                    updateBankAddButtonTitles();
                    if (typeof updateBankSubmitButtonState === 'function') updateBankSubmitButtonState();
                });
                optionsContainer.appendChild(option);
            });
        }
    }

    // Initial load
    loadAccounts();

    // Search input handler: loadAccounts() reads filter from searchInput.value
    searchInput.addEventListener('input', () => {
        loadAccounts();
    });

    // Toggle dropdown: clear search so filter is fresh, then load
    accountButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeThisDropdown();
        } else {
            // 打开当前前先收起其他两个账户下拉（Supplier/Customer/Company 互斥）
            const allBankDropdownIds = ['bank_card_merchant_dropdown', 'bank_customer_dropdown', 'bank_profit_account_dropdown'];
            allBankDropdownIds.forEach(function (id) {
                if (id === dropdownId) return;
                const other = document.getElementById(id);
                if (other && other._bankAccountClose) other._bankAccountClose();
            });
            accountDropdown.style.display = 'block';
            isOpen = true;
            searchInput.value = '';
            loadAccounts();
            searchInput.focus();
            // 在 Bank 弹窗内时挂到 body 用 fixed 定位，完整溢出弹窗显示
            moveDropdownToBody();
            const rect = accountButton.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 24;
            const spaceAbove = rect.top - 24;
            const searchHeight = 50;
            const useAbove = !isInBankModal && spaceBelow < 280 && spaceAbove > spaceBelow;
            if (useAbove) {
                accountDropdown.classList.add('custom-select-dropdown-above');
                const maxOpt = Math.max(200, Math.min(320, spaceAbove - searchHeight));
                if (optionsContainer) optionsContainer.style.maxHeight = maxOpt + 'px';
                accountDropdown.style.maxHeight = (maxOpt + searchHeight + 16) + 'px';
            } else {
                accountDropdown.classList.remove('custom-select-dropdown-above');
                const maxOpt = Math.max(200, Math.min(320, spaceBelow - searchHeight));
                if (optionsContainer) optionsContainer.style.maxHeight = maxOpt + 'px';
                accountDropdown.style.maxHeight = (maxOpt + searchHeight + 16) + 'px';
            }
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!accountButton.contains(e.target) && !accountDropdown.contains(e.target)) {
            closeThisDropdown();
        }
    });
}

// Profit Sharing Account select: custom dropdown with search (same as Supplier)
let profitSharingFirstRowInited = false;
function initProfitSharingAccountSelect(buttonId, dropdownId, hiddenInputId) {
    const accountButton = document.getElementById(buttonId);
    const accountDropdown = document.getElementById(dropdownId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const searchInput = accountDropdown?.querySelector('.custom-select-search input');
    const optionsContainer = accountDropdown?.querySelector('.custom-select-options');
    if (!accountButton || !accountDropdown || !hiddenInput || !searchInput || !optionsContainer) return;
    let isOpen = false;
    const placeholderText = accountButton.getAttribute('data-placeholder') || 'Select Account';
    const isInProfitSharingModal = accountDropdown.closest('#profitSharingModal');
    let dropdownOriginalParent = null;
    let dropdownOriginalNextSibling = null;

    function positionDropdownToBody() {
        if (!isInProfitSharingModal) return;
        const rect = accountButton.getBoundingClientRect();
        dropdownOriginalParent = accountDropdown.parentNode;
        dropdownOriginalNextSibling = accountDropdown.nextSibling;
        document.body.appendChild(accountDropdown);
        accountDropdown.style.position = 'fixed';
        accountDropdown.style.left = rect.left + 'px';
        accountDropdown.style.top = (rect.bottom + 2) + 'px';
        accountDropdown.style.width = Math.max(rect.width, 200) + 'px';
        accountDropdown.style.minWidth = Math.max(rect.width, 200) + 'px';
        accountDropdown.style.zIndex = '10001';
    }
    function restoreDropdownToModal() {
        if (!isInProfitSharingModal || !dropdownOriginalParent) return;
        dropdownOriginalParent.insertBefore(accountDropdown, dropdownOriginalNextSibling);
        accountDropdown.style.position = '';
        accountDropdown.style.left = '';
        accountDropdown.style.top = '';
        accountDropdown.style.width = '';
        accountDropdown.style.minWidth = '';
        accountDropdown.style.zIndex = '';
        dropdownOriginalParent = null;
        dropdownOriginalNextSibling = null;
    }

    function loadAccounts() {
        optionsContainer.innerHTML = '';
        const filterLower = (searchInput.value || '').toLowerCase().trim();
        let accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];
        const selectOpt = document.createElement('div');
        selectOpt.className = 'custom-select-option';
        selectOpt.setAttribute('data-value', '');
        selectOpt.textContent = 'Select Account';
        selectOpt.addEventListener('click', () => {
            accountButton.textContent = placeholderText;
            accountButton.setAttribute('data-value', '');
            hiddenInput.value = '';
            restoreDropdownToModal();
            accountDropdown.style.display = 'none';
            isOpen = false;
        });
        optionsContainer.appendChild(selectOpt);
        function getDisplayText(account) {
            return String(account.account_id ?? account.name ?? '').trim();
        }
        let filtered = accounts.filter(acc => {
            const t = getDisplayText(acc).toLowerCase();
            return !filterLower || t.includes(filterLower);
        });
        filtered = filtered.slice().sort((a, b) => getDisplayText(a).toLowerCase().localeCompare(getDisplayText(b).toLowerCase()));
        if (filtered.length === 0) {
            const noResults = document.createElement('div');
            noResults.className = 'custom-select-no-results';
            noResults.textContent = 'No accounts found';
            optionsContainer.appendChild(noResults);
        } else {
            filtered.forEach(account => {
                const opt = document.createElement('div');
                opt.className = 'custom-select-option';
                opt.setAttribute('data-value', account.id);
                opt.textContent = getDisplayText(account);
                opt.addEventListener('click', () => {
                    accountButton.textContent = getDisplayText(account);
                    accountButton.setAttribute('data-value', account.id);
                    hiddenInput.value = String(account.id);
                    restoreDropdownToModal();
                    accountDropdown.style.display = 'none';
                    isOpen = false;
                });
                optionsContainer.appendChild(opt);
            });
        }
    }
    loadAccounts();
    searchInput.addEventListener('input', loadAccounts);
    accountButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            restoreDropdownToModal();
            accountDropdown.style.display = 'none';
            isOpen = false;
        } else {
            if (isInProfitSharingModal) positionDropdownToBody();
            accountDropdown.style.display = 'block';
            isOpen = true;
            searchInput.value = '';
            loadAccounts();
            searchInput.focus();
        }
    });
    document.addEventListener('click', (e) => {
        if (!accountButton.contains(e.target) && !accountDropdown.contains(e.target)) {
            restoreDropdownToModal();
            accountDropdown.style.display = 'none';
            isOpen = false;
        }
    });
}

// Country Selection Modal（按 company 区分存储，与 account-list 的 currency 一致）
const DEFAULT_COUNTRIES = [];
let availableCountriesList = [];

function getSelectedCountriesStorageKey() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    return 'processlist_selected_countries' + (companyId ? '_' + companyId : '');
}

function restoreSelectedCountriesFromStorage() {
    try {
        const raw = localStorage.getItem(getSelectedCountriesStorageKey());
        if (!raw) return;
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) return;
        const list = arr.filter(function (x) { return typeof x === 'string' && (x || '').trim(); }).map(function (x) { return (x || '').trim(); });
        if (list.length === 0) return;
        window.selectedCountries = list;
        const select = document.getElementById('bank_country');
        if (select && list.length > 0) {
            select.innerHTML = '';
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = 'Select Country';
            select.appendChild(opt0);
            list.forEach(function (name) {
                const n = (name || '').trim();
                if (!n) return;
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                select.appendChild(opt);
            });
        }
    } catch (e) { /* ignore */ }
}

function persistSelectedCountriesToStorage() {
    try {
        const key = getSelectedCountriesStorageKey();
        if (window.selectedCountries && Array.isArray(window.selectedCountries) && window.selectedCountries.length > 0) {
            localStorage.setItem(key, JSON.stringify(window.selectedCountries));
        } else {
            localStorage.removeItem(key);
        }
    } catch (e) { /* ignore */ }
}

async function showAddCountryModal() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId) {
        try {
            const selUrl = buildApiUrl('api/processes/processlist_api.php?action=get_selected_countries&company_id=' + encodeURIComponent(companyId));
            const selRes = await fetch(selUrl);
            const selResult = await selRes.json();
            const serverList = (selResult.success && selResult.data && Array.isArray(selResult.data)) ? selResult.data : [];
            if (serverList.length > 0) {
                window.selectedCountries = serverList.slice();
            }
        } catch (e) { console.warn('get_selected_countries', e); }
    }
    if (!window.selectedCountries || !Array.isArray(window.selectedCountries)) window.selectedCountries = [];
    if (window.selectedCountries.length === 0) {
        restoreSelectedCountriesFromStorage();
        if (window.selectedCountries.length === 0) {
            const select = document.getElementById('bank_country');
            if (select && select.options) {
                for (let i = 0; i < select.options.length; i++) {
                    const v = (select.options[i].value || '').trim();
                    if (v && !window.selectedCountries.includes(v)) window.selectedCountries.push(v);
                }
            }
        }
    }
    let allCountries = [];
    try {
        const currencyCodes = await fetchCompanyCurrencyCodes();
        let fromListApi = [];
        const cid = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        try {
            let url = buildApiUrl('api/processes/processlist_api.php?action=get_countries');
            if (cid) url += '&company_id=' + encodeURIComponent(cid);
            const res = await fetch(url);
            const result = await res.json();
            if (result.success && Array.isArray(result.data)) fromListApi = result.data;
        } catch (e2) { console.warn('get_countries', e2); }
        allCountries = [...new Set(
            [...(currencyCodes || []), ...fromListApi]
                .map(function (x) { return String(x || '').trim(); })
                .filter(Boolean)
        )].sort(function (a, b) { return a.localeCompare(b); });
    } catch (e) { console.warn('country list', e); }
    loadExistingCountries(allCountries);
    updateSelectedCountriesInModal();
    const modal = document.getElementById('countrySelectionModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
}

function loadExistingCountries(allFromServer) {
    const select = document.getElementById('bank_country');
    const existingOptions = [];
    if (select && select.options) {
        for (let i = 0; i < select.options.length; i++) {
            const v = (select.options[i].value || '').trim();
            if (v) existingOptions.push(v);
        }
    }
    const all = allFromServer && allFromServer.length > 0
        ? [...new Set([...DEFAULT_COUNTRIES, ...allFromServer, ...(availableCountriesList || [])])].sort((a, b) => a.localeCompare(b))
        : [...new Set([...DEFAULT_COUNTRIES, ...existingOptions, ...(availableCountriesList || [])])].sort((a, b) => a.localeCompare(b));
    const selectedSet = new Set(window.selectedCountries || []);
    const combined = all.filter(name => !selectedSet.has(name));
    availableCountriesList = combined;

    const listEl = document.getElementById('existingCountries');
    if (!listEl) return;
    listEl.innerHTML = '';
    combined.forEach((name, index) => {
        const id = 'country_' + (Date.now() + index);
        const item = document.createElement('div');
        item.className = 'country-item';
        const left = document.createElement('div');
        left.className = 'country-item-left';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'available_countries';
        checkbox.value = name;
        checkbox.id = id;
        checkbox.dataset.countryId = id;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = name;
        left.appendChild(checkbox);
        left.appendChild(label);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'country-delete-btn';
        deleteBtn.title = 'Remove from list';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            void removeCountryFromAvailable(name, item);
        });
        item.appendChild(left);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
        checkbox.addEventListener('change', function () {
            if (this.checked) moveCountryToSelected(this);
            else moveCountryToAvailable(this);
        });
    });
}

function updateSelectedCountriesInModal() {
    const selectedList = document.getElementById('selectedCountriesInModal');
    if (!selectedList) return;
    selectedList.innerHTML = '';
    if (!window.selectedCountries) window.selectedCountries = [];
    const current = (document.getElementById('bank_country')?.value || '').trim();
    if (current && !window.selectedCountries.includes(current)) {
        window.selectedCountries.push(current);
    }
    if (window.selectedCountries.length > 0) {
        window.selectedCountries.forEach((name, idx) => {
            const div = document.createElement('div');
            div.className = 'selected-country-modal-item';
            const safeName = (name || '').replace(/'/g, "\\'");
            div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-country-modal" onclick="moveCountryBackToAvailable(\'' + safeName + '\', \'cid' + idx + '\')">&times;</button>';
            selectedList.appendChild(div);
        });
    } else {
        selectedList.innerHTML = '<div class="no-countries">No countries selected</div>';
    }
}

function filterCountries() {
    const term = (document.getElementById('countrySearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#existingCountries .country-item');
    items.forEach(item => {
        const text = item.querySelector('label')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

function moveCountryToSelected(checkbox) {
    const name = checkbox.value;
    const id = checkbox.dataset.countryId;
    const item = checkbox.closest('.country-item');
    if (!window.selectedCountries) window.selectedCountries = [];
    if (!window.selectedCountries.includes(name)) window.selectedCountries.push(name);
    persistSelectedCountriesToStorage();
    const selectedList = document.getElementById('selectedCountriesInModal');
    const placeholder = selectedList.querySelector('.no-countries');
    if (placeholder) placeholder.remove();
    const div = document.createElement('div');
    div.className = 'selected-country-modal-item';
    const safeName = (name || '').replace(/'/g, "\\'");
    div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-country-modal" onclick="moveCountryBackToAvailable(\'' + safeName + '\', \'' + id + '\')">&times;</button>';
    selectedList.appendChild(div);
    if (item) item.remove();
}

function moveCountryBackToAvailable(countryName, countryId) {
    if (window.selectedCountries) {
        const idx = window.selectedCountries.indexOf(countryName);
        if (idx > -1) window.selectedCountries.splice(idx, 1);
    }
    persistSelectedCountriesToStorage();
    const selectedList = document.getElementById('selectedCountriesInModal');
    selectedList.querySelectorAll('.selected-country-modal-item').forEach(item => {
        if (item.querySelector('span')?.textContent === countryName) item.remove();
    });
    if (!selectedList.querySelector('.selected-country-modal-item')) {
        selectedList.innerHTML = '<div class="no-countries">No countries selected</div>';
    }
    const listEl = document.getElementById('existingCountries');
    if (!listEl) return;
    const id = 'country_' + (countryId || Date.now());
    const newItem = document.createElement('div');
    newItem.className = 'country-item';
    const left = document.createElement('div');
    left.className = 'country-item-left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'available_countries';
    cb.value = countryName;
    cb.id = id;
    cb.dataset.countryId = id;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = countryName;
    left.appendChild(cb);
    left.appendChild(label);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'country-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        void removeCountryFromAvailable(countryName, newItem);
    });
    newItem.appendChild(left);
    newItem.appendChild(delBtn);
    listEl.appendChild(newItem);
    cb.addEventListener('change', function () {
        if (this.checked) moveCountryToSelected(this);
        else moveCountryToAvailable(this);
    });
}

function moveCountryToAvailable(checkbox) {
    const name = checkbox.value;
    const item = checkbox.closest('.country-item');
    if (window.selectedCountries) {
        const idx = window.selectedCountries.indexOf(name);
        if (idx > -1) window.selectedCountries.splice(idx, 1);
    }
    persistSelectedCountriesToStorage();
    document.getElementById('selectedCountriesInModal').querySelectorAll('.selected-country-modal-item').forEach(el => {
        if (el.querySelector('span')?.textContent === name) el.remove();
    });
    const selectedList = document.getElementById('selectedCountriesInModal');
    if (!selectedList.querySelector('.selected-country-modal-item')) {
        selectedList.innerHTML = '<div class="no-countries">No countries selected</div>';
    }
}

async function removeCountryFromAvailable(countryName, itemEl) {
    const name = (countryName || '').trim();
    if (!name) {
        if (itemEl && itemEl.parentNode) itemEl.remove();
        return;
    }
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId) {
        try {
            const formData = new FormData();
            formData.append('company_id', String(companyId));
            formData.append('country', name);
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=remove_country'), { method: 'POST', body: formData });
            let result = { success: false, error: 'Invalid response' };
            try {
                result = await res.json();
            } catch (parseErr) { /* use default */ }
            if (!result.success) {
                showNotification(result.error || result.message || 'Failed to remove country', 'danger');
                return;
            }
        } catch (err) {
            console.warn('remove_country', err);
            showNotification('Failed to remove country', 'danger');
            return;
        }
    }
    if (Array.isArray(availableCountriesList)) {
        const idx = availableCountriesList.indexOf(name);
        if (idx > -1) availableCountriesList.splice(idx, 1);
    }
    if (itemEl && itemEl.parentNode) itemEl.remove();
}

function closeCountrySelectionModal() {
    const modal = document.getElementById('countrySelectionModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    const form = document.getElementById('addCountryForm');
    if (form) form.reset();
    const search = document.getElementById('countrySearch');
    if (search) search.value = '';
    document.querySelectorAll('input[name="available_countries"]').forEach(cb => cb.checked = false);
}

async function confirmCountries() {
    const select = document.getElementById('bank_country');
    if (!select) { closeCountrySelectionModal(); return; }
    const list = (window.selectedCountries || []).filter(function (name) { return (name || '').trim(); }).map(function (name) { return (name || '').trim(); });
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Select Country';
    select.appendChild(opt0);
    list.forEach(function (name) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (list.length > 0) select.value = list[0];
    persistSelectedCountriesToStorage();
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId && list.length >= 0) {
        try {
            const fd = new FormData();
            fd.append('company_id', companyId);
            list.forEach(function (c) { fd.append('countries[]', c); });
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=save_selected_countries'), { method: 'POST', body: fd });
            const result = await res.json();
            if (!result.success) console.warn('save_selected_countries', result.error);
        } catch (e) { console.warn('save_selected_countries', e); }
    }
    closeCountrySelectionModal();
}

// Bank Selection Modal（Bank 下拉只显示当前 Country 的 Selected Banks，按 company + Country 分别存储）
const DEFAULT_BANKS = [];
let currentBankModalCountry = '';
let availableBanksList = [];
let availableBanksByCountry = {};

function normalizeBankCountryKey(country) {
    return String(country || '').trim();
}

function getAvailableBanksForCountry(country) {
    const key = normalizeBankCountryKey(country);
    if (!key) return [];
    if (!availableBanksByCountry[key] || !Array.isArray(availableBanksByCountry[key])) {
        availableBanksByCountry[key] = [];
    }
    return availableBanksByCountry[key];
}

function setAvailableBanksForCountry(country, list) {
    const key = normalizeBankCountryKey(country);
    if (!key) return;
    const normalized = Array.isArray(list)
        ? [...new Set(list.map(function (n) { return (n || '').trim(); }).filter(Boolean))].sort((a, b) => a.localeCompare(b))
        : [];
    availableBanksByCountry[key] = normalized;
}

function getSelectedBanksByCountryStorageKey() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    return 'processlist_selected_banks_by_country' + (companyId ? '_' + companyId : '');
}

async function restoreSelectedBanksByCountryFromStorage() {
    const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    if (companyId) {
        try {
            const url = buildApiUrl('api/processes/processlist_api.php?action=get_selected_banks&company_id=' + encodeURIComponent(companyId));
            const res = await fetch(url);
            const result = await res.json();
            if (result.success && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
                window.selectedBanksByCountry = result.data;
                return;
            }
        } catch (e) { /* ignore */ }
    }
    try {
        const raw = localStorage.getItem(getSelectedBanksByCountryStorageKey());
        if (!raw) return;
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            window.selectedBanksByCountry = obj;
        }
    } catch (e) { /* ignore */ }
}

function persistSelectedBanksByCountryToStorage() {
    try {
        const key = getSelectedBanksByCountryStorageKey();
        if (window.selectedBanksByCountry && typeof window.selectedBanksByCountry === 'object') {
            localStorage.setItem(key, JSON.stringify(window.selectedBanksByCountry));
        } else {
            localStorage.removeItem(key);
        }
    } catch (e) { /* ignore */ }
}

/** 仅用当前 Country 的 Selected Banks 填充 Bank 下拉，不调用接口 */
function applySelectedBanksToDropdown(country) {
    const select = document.getElementById('bank_bank');
    if (!select) return;
    const currentBank = (select.value || '').trim();
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Select Bank';
    select.appendChild(opt0);
    const c = (country || '').trim();
    const list = (window.selectedBanksByCountry && window.selectedBanksByCountry[c]) ? window.selectedBanksByCountry[c] : [];
    if (Array.isArray(list) && list.length > 0) {
        list.forEach(function (b) {
            const n = (b || '').trim();
            if (!n) return;
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            select.appendChild(opt);
        });
        if (currentBank && list.indexOf(currentBank) >= 0) select.value = currentBank;
        else select.value = '';
    } else {
        select.value = '';
    }
}

async function showAddBankModal() {
    const countrySelect = document.getElementById('bank_country');
    const country = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
    if (!country) {
        showNotification('Please select Country first', 'danger');
        return;
    }
    currentBankModalCountry = country;
    availableBanksList = getAvailableBanksForCountry(country).slice();
    // Selected Banks 从当前 Country 的已选列表恢复；Available 由 loadExistingBanks 按接口拉取
    window.selectedBanks = (window.selectedBanksByCountry && window.selectedBanksByCountry[country]) ? window.selectedBanksByCountry[country].slice() : [];
    await loadExistingBanks(country);
    updateSelectedBanksInModal();
    const modal = document.getElementById('bankSelectionModal');
    if (modal) {
        modal.classList.add('show');
        modal.style.display = 'block';
    }
}

async function loadExistingBanks(countryForApi) {
    const country = normalizeBankCountryKey(countryForApi || currentBankModalCountry || ((document.getElementById('bank_country') && document.getElementById('bank_country').value) ? document.getElementById('bank_country').value : ''));
    const countryAvailable = getAvailableBanksForCountry(country);
    let all = [];
    if (country) {
        try {
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            let url = buildApiUrl('api/processes/processlist_api.php?action=get_banks_by_country&country=' + encodeURIComponent(country));
            if (companyId) url += '&company_id=' + encodeURIComponent(companyId);
            const res = await fetch(url);
            const result = await res.json();
            all = (result.success && result.data) ? result.data : [];
            all = [...new Set([...all, ...countryAvailable])].sort((a, b) => a.localeCompare(b));
        } catch (e) {
            all = [...countryAvailable].sort((a, b) => a.localeCompare(b));
        }
    } else {
        const select = document.getElementById('bank_bank');
        const existingOptions = [];
        if (select && select.options) {
            for (let i = 0; i < select.options.length; i++) {
                const v = (select.options[i].value || '').trim();
                if (v) existingOptions.push(v);
            }
        }
        all = [...new Set([...DEFAULT_BANKS, ...existingOptions, ...countryAvailable])].sort((a, b) => a.localeCompare(b));
    }
    const selectedSet = new Set(window.selectedBanks || []);
    const combined = all.filter(name => !selectedSet.has(name));
    availableBanksList = combined.slice();
    setAvailableBanksForCountry(country, combined);

    const listEl = document.getElementById('existingBanks');
    if (!listEl) return;
    listEl.innerHTML = '';
    combined.forEach((name, index) => {
        const id = 'bank_' + (Date.now() + index);
        const item = document.createElement('div');
        item.className = 'bank-item';
        const left = document.createElement('div');
        left.className = 'bank-item-left';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'available_banks';
        checkbox.value = name;
        checkbox.id = id;
        checkbox.dataset.bankId = id;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = name;
        left.appendChild(checkbox);
        left.appendChild(label);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'bank-delete-btn';
        deleteBtn.title = 'Remove from list';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            removeBankFromAvailable(name, item);
        });
        item.appendChild(left);
        item.appendChild(deleteBtn);
        listEl.appendChild(item);
        checkbox.addEventListener('change', function () {
            if (this.checked) moveBankToSelected(this);
            else moveBankToAvailable(this);
        });
    });
}

function updateSelectedBanksInModal() {
    const selectedList = document.getElementById('selectedBanksInModal');
    if (!selectedList) return;
    selectedList.innerHTML = '';
    const current = (document.getElementById('bank_bank')?.value || '').trim();
    if (!window.selectedBanks) window.selectedBanks = [];
    if (current && !window.selectedBanks.includes(current)) {
        window.selectedBanks = [current];
    }
    if (window.selectedBanks.length > 0) {
        window.selectedBanks.forEach((name, idx) => {
            const div = document.createElement('div');
            div.className = 'selected-bank-modal-item';
            const safeName = (name || '').replace(/'/g, "\\'");
            div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-bank-modal" onclick="moveBankBackToAvailable(\'' + safeName + '\', \'bid' + idx + '\')">&times;</button>';
            selectedList.appendChild(div);
        });
    } else {
        selectedList.innerHTML = '<div class="no-banks">No banks selected</div>';
    }
}

function filterBanks() {
    const term = (document.getElementById('bankSearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#existingBanks .bank-item');
    items.forEach(item => {
        const text = item.querySelector('label')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

function moveBankToSelected(checkbox) {
    const name = checkbox.value;
    const id = checkbox.dataset.bankId;
    const item = checkbox.closest('.bank-item');
    if (!window.selectedBanks) window.selectedBanks = [];
    if (!window.selectedBanks.includes(name)) window.selectedBanks.push(name);
    const selectedList = document.getElementById('selectedBanksInModal');
    const placeholder = selectedList.querySelector('.no-banks');
    if (placeholder) placeholder.remove();
    const div = document.createElement('div');
    div.className = 'selected-bank-modal-item';
    const safeName = (name || '').replace(/'/g, "\\'");
    div.innerHTML = '<span>' + escapeHtml(name) + '</span><button type="button" class="remove-bank-modal" onclick="moveBankBackToAvailable(\'' + safeName + '\', \'' + id + '\')">&times;</button>';
    selectedList.appendChild(div);
    if (item) item.remove();
}

function moveBankBackToAvailable(bankName, bankId) {
    if (window.selectedBanks) {
        const idx = window.selectedBanks.indexOf(bankName);
        if (idx > -1) window.selectedBanks.splice(idx, 1);
    }
    const selectedList = document.getElementById('selectedBanksInModal');
    selectedList.querySelectorAll('.selected-bank-modal-item').forEach(item => {
        if (item.querySelector('span')?.textContent === bankName) item.remove();
    });
    if (!selectedList.querySelector('.selected-bank-modal-item')) {
        selectedList.innerHTML = '<div class="no-banks">No banks selected</div>';
    }
    const listEl = document.getElementById('existingBanks');
    if (!listEl) return;
    const id = 'bank_' + (bankId || Date.now());
    const newItem = document.createElement('div');
    newItem.className = 'bank-item';
    const left = document.createElement('div');
    left.className = 'bank-item-left';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'available_banks';
    cb.value = bankName;
    cb.id = id;
    cb.dataset.bankId = id;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = bankName;
    left.appendChild(cb);
    left.appendChild(label);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'bank-delete-btn';
    delBtn.innerHTML = '&times;';
    delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        removeBankFromAvailable(bankName, newItem);
    });
    newItem.appendChild(left);
    newItem.appendChild(delBtn);
    listEl.appendChild(newItem);
    cb.addEventListener('change', function () {
        if (this.checked) moveBankToSelected(this);
        else moveBankToAvailable(this);
    });
}

function moveBankToAvailable(checkbox) {
    const name = checkbox.value;
    const item = checkbox.closest('.bank-item');
    if (window.selectedBanks) {
        const idx = window.selectedBanks.indexOf(name);
        if (idx > -1) window.selectedBanks.splice(idx, 1);
    }
    document.getElementById('selectedBanksInModal').querySelectorAll('.selected-bank-modal-item').forEach(el => {
        if (el.querySelector('span')?.textContent === name) el.remove();
    });
    const selectedList = document.getElementById('selectedBanksInModal');
    if (!selectedList.querySelector('.selected-bank-modal-item')) {
        selectedList.innerHTML = '<div class="no-banks">No banks selected</div>';
    }
}

function removeBankFromAvailable(bankName, itemEl) {
    if (availableBanksList && bankName != null && bankName !== '') {
        const n = String(bankName).trim();
        const idx = availableBanksList.indexOf(n);
        if (idx > -1) availableBanksList.splice(idx, 1);
        setAvailableBanksForCountry(currentBankModalCountry, availableBanksList);
    }
    if (itemEl && itemEl.parentNode) itemEl.remove();
}

function closeBankSelectionModal() {
    const modal = document.getElementById('bankSelectionModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    const form = document.getElementById('addBankForm');
    if (form) form.reset();
    const search = document.getElementById('bankSearch');
    if (search) search.value = '';
    document.querySelectorAll('input[name="available_banks"]').forEach(cb => cb.checked = false);
    currentBankModalCountry = '';
}

async function confirmBanks() {
    const countrySelect = document.getElementById('bank_country');
    const country = (countrySelect && countrySelect.value) ? String(countrySelect.value).trim() : '';
    const selectedList = (window.selectedBanks || []).map(function (n) { return (n || '').trim(); }).filter(Boolean);
    const banksToSave = [].concat(selectedList, availableBanksList || []);
    const uniqueBanks = [...new Set(banksToSave.map(function (n) { return (n || '').trim(); }).filter(Boolean))];
    if (country && uniqueBanks.length > 0) {
        try {
            const fd = new FormData();
            fd.append('country', country);
            const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
            if (companyId) fd.append('company_id', companyId);
            uniqueBanks.forEach(function (b) { fd.append('banks[]', b); });
            const res = await fetch(buildApiUrl('api/processes/processlist_api.php?action=save_country_banks'), { method: 'POST', body: fd });
            const result = await res.json();
            if (!result.success) console.warn('save_country_banks', result.error);
        } catch (e) { console.warn('save_country_banks', e); }
    }
    // 按 Country 保存 Selected Banks 到内存、localStorage 和服务端（登出/隔几小时后仍保持）
    if (country) {
        if (!window.selectedBanksByCountry) window.selectedBanksByCountry = {};
        window.selectedBanksByCountry[country] = selectedList.slice();
        persistSelectedBanksByCountryToStorage();
        const companyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (companyId) {
            try {
                const fd = new FormData();
                fd.append('company_id', companyId);
                fd.append('selected', JSON.stringify(window.selectedBanksByCountry));
                const saveRes = await fetch(buildApiUrl('api/processes/processlist_api.php?action=save_selected_banks'), { method: 'POST', body: fd });
                const saveResult = await saveRes.json();
                if (!saveResult.success) console.warn('save_selected_banks', saveResult.error);
            } catch (e) { console.warn('save_selected_banks', e); }
        }
    }
    const select = document.getElementById('bank_bank');
    if (!select) { closeBankSelectionModal(); return; }
    applySelectedBanksToDropdown(country);
    if (window.selectedBanks && window.selectedBanks.length > 0) {
        select.value = window.selectedBanks[0] || '';
    }
    closeBankSelectionModal();
}

// Placeholder functions for add modals

async function showAddAccountModal() {
    const modal = document.getElementById('addAccountModal');
    if (!modal) return;
    modal.style.display = 'block';
    modal.classList.add('show');
    await loadEditDataBank();
    await loadAccountCurrenciesBank(null, 'add');
    await loadAccountCompaniesBank(null, 'add');
}

function closeAddAccountModal() {
    bankAddAccountTriggerFieldId = null;
    bankAddAccountTriggerHiddenInputId = null;
    const modal = document.getElementById('addAccountModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    const form = document.getElementById('addAccountForm');
    if (form) form.reset();
    selectedCurrencyIdsForAdd = [];
    deletedCurrencyIds = [];
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    selectedCompanyIdsForAdd = currentCompanyId ? [currentCompanyId] : [];
}

function updateBankAddButtonTitles() {
    ['bank_card_merchant', 'bank_customer', 'bank_profit_account'].forEach(fieldId => {
        const btn = document.getElementById(fieldId);
        const addBtn = btn && btn.closest('.account-select-with-buttons') && btn.closest('.account-select-with-buttons').querySelector('.bank-add-btn');
        if (addBtn) addBtn.title = (btn.getAttribute('data-value') ? 'Edit Account' : 'Add New Account');
    });
}

function bankAccountPlusClick(fieldId) {
    const btn = document.getElementById(fieldId);
    const accountId = btn && btn.getAttribute('data-value');
    if (accountId) {
        bankAddAccountTriggerFieldId = null;
        bankAddAccountTriggerHiddenInputId = null;
        openEditAccountModalFromBank(parseInt(accountId, 10));
    } else {
        // Supplier, Customer, Company: remember which select bar should auto-select the new account
        bankAddAccountTriggerFieldId = fieldId;
        bankAddAccountTriggerHiddenInputId = null;
        showAddAccountModal();
    }
}

async function openEditAccountModalFromBank(accountId) {
    currentEditAccountIdForBank = accountId;
    selectedCompanyIdsForEdit = [];
    deletedCurrencyIds = [];
    try {
        const res = await fetch(buildApiUrl('getaccountapi.php?id=' + accountId));
        const result = await res.json();
        if (!result.success || !result.data) {
            showNotification(result.error || 'Failed to load account', 'danger');
            return;
        }
        const account = result.data;
        document.getElementById('edit_account_id').value = account.id;
        document.getElementById('edit_account_id_field').value = (account.account_id || '').toUpperCase();
        document.getElementById('edit_name').value = (account.name || '').toUpperCase();
        document.getElementById('edit_password').value = account.password || '';
        let alertType = account.alert_type || (account.alert_day ? String(account.alert_day).toLowerCase() : '');
        if (account.alert_day && parseInt(account.alert_day) >= 1 && parseInt(account.alert_day) <= 31) alertType = account.alert_day;
        document.getElementById('edit_alert_type').value = alertType;
        document.getElementById('edit_alert_start_date').value = account.alert_start_date || account.alert_specific_date || '';
        document.getElementById('edit_alert_amount').value = account.alert_amount || '';
        document.getElementById('edit_remark').value = (account.remark || '').toUpperCase();
        const paymentAlert = account.payment_alert == 1 ? '1' : '0';
        const radio = document.querySelector('input[name="payment_alert"][value="' + paymentAlert + '"]');
        if (radio) radio.checked = true;
        toggleAlertFieldsBank('edit');
        await loadEditDataBank();
        const roleSelect = document.getElementById('edit_role');
        if (roleSelect) {
            populateRoleSelectBank(roleSelect, bankAccountRoles, account.role || '');
        }
        await loadAccountCurrenciesBank(accountId, 'edit');
        await loadAccountCompaniesBank(accountId, 'edit');
        document.getElementById('editAccountModal').style.display = 'block';
        document.getElementById('editAccountModal').classList.add('show');
    } catch (e) {
        console.error('openEditAccountModalFromBank', e);
        showNotification('Failed to load account', 'danger');
    }
}

function closeEditAccountModalFromBank() {
    const modal = document.getElementById('editAccountModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    const form = document.getElementById('editAccountForm');
    if (form) form.reset();
    selectedCompanyIdsForEdit = [];
    deletedCurrencyIds = [];
    currentEditAccountIdForBank = null;
}

function refreshBankAccountDropdowns() {
    const accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];
    ['bank_card_merchant', 'bank_customer'].forEach(buttonId => {
        const btn = document.getElementById(buttonId);
        const dropdown = document.getElementById(buttonId + '_dropdown');
        const optionsContainer = dropdown?.querySelector('.custom-select-options');
        if (!optionsContainer) return;
        optionsContainer.innerHTML = '';
        accounts.forEach(account => {
            const option = document.createElement('div');
            option.className = 'custom-select-option';
            option.setAttribute('data-value', account.id);
            option.textContent = account.account_id || account.name || '';
            option.addEventListener('click', () => {
                if (btn) {
                    btn.textContent = account.account_id || account.name || '';
                    btn.setAttribute('data-value', account.id);
                }
                if (dropdown) dropdown.style.display = 'none';
            });
            optionsContainer.appendChild(option);
        });
    });
}

function addProfitSharingRow() {
    const container = document.getElementById('profitSharingRowsContainer');
    if (!container) return;
    const ts = Date.now();
    const btnId = 'profit_sharing_account_btn_' + ts;
    const dropdownId = 'profit_sharing_account_dropdown_' + ts;
    const hiddenId = 'profit_sharing_account_id_' + ts;
    const amountId = 'profit_sharing_amount_' + ts;
    const row = document.createElement('div');
    row.className = 'form-row bank-row-two-cols profit-sharing-row';
    row.innerHTML = '<div class="form-group"><label for="' + btnId + '">Account</label><input type="hidden" id="' + hiddenId + '" class="profit-sharing-account-id" name="account_id" value=""><div class="account-select-with-buttons"><div class="custom-select-wrapper"><button type="button" class="custom-select-button profit-sharing-account-btn" id="' + btnId + '" data-placeholder="Select Account">Select Account</button><div class="custom-select-dropdown" id="' + dropdownId + '"><div class="custom-select-search"><input type="text" placeholder="Search account..." autocomplete="off"></div><div class="custom-select-options"></div></div></div><button type="button" class="bank-add-btn" onclick="profitSharingAccountPlusClick(\'' + btnId + '\', \'' + hiddenId + '\')" title="Add New Account">+</button></div></div><div class="form-group"><label for="' + amountId + '">Amount</label><input type="number" id="' + amountId + '" name="amount" class="bank-input profit-sharing-amount" placeholder="Enter amount" step="0.01" min="0"></div><div class="form-group profit-sharing-delete-cell"><label class="profit-sharing-delete-label">&nbsp;</label><button type="button" class="profit-sharing-delete-row-btn" onclick="removeProfitSharingModalRow(this)" title="Delete row">−</button></div>';
    container.appendChild(row);
    if (typeof initProfitSharingAccountSelect === 'function') {
        initProfitSharingAccountSelect(btnId, dropdownId, hiddenId);
    }
}

function removeProfitSharingModalRow(buttonEl) {
    const row = buttonEl && buttonEl.closest('.profit-sharing-row');
    const container = document.getElementById('profitSharingRowsContainer');
    if (!row || !container) return;
    const rows = container.querySelectorAll('.profit-sharing-row');
    if (rows.length <= 1) return;
    row.remove();
    if (container.querySelectorAll('.profit-sharing-row').length === 0 && typeof addProfitSharingRow === 'function') {
        addProfitSharingRow();
    }
}

function profitSharingAccountPlusClick(buttonId, hiddenInputId) {
    const btn = document.getElementById(buttonId);
    const accountId = btn && btn.getAttribute('data-value');
    if (accountId) {
        bankAddAccountTriggerFieldId = null;
        bankAddAccountTriggerHiddenInputId = null;
        openEditAccountModalFromBank(parseInt(accountId, 10));
    } else {
        bankAddAccountTriggerFieldId = buttonId;
        bankAddAccountTriggerHiddenInputId = hiddenInputId;
        showAddAccountModal();
    }
}

async function showAddProfitSharingModal() {
    if (!Array.isArray(window.bankAccounts) || window.bankAccounts.length === 0) {
        await loadBankAccounts();
    }
    const container = document.getElementById('profitSharingRowsContainer');
    if (container) {
        const rows = container.querySelectorAll('.profit-sharing-row');
        for (let i = 1; i < rows.length; i++) rows[i].remove();
    }
    const accountBtn = document.getElementById('profit_sharing_account_btn');
    const accountHidden = document.getElementById('profit_sharing_account_id');
    if (accountBtn) {
        accountBtn.textContent = accountBtn.getAttribute('data-placeholder') || 'Select Account';
        accountBtn.setAttribute('data-value', '');
    }
    if (accountHidden) accountHidden.value = '';
    if (!profitSharingFirstRowInited && typeof initProfitSharingAccountSelect === 'function') {
        profitSharingFirstRowInited = true;
        initProfitSharingAccountSelect('profit_sharing_account_btn', 'profit_sharing_account_dropdown', 'profit_sharing_account_id');
    }
    const amountEl = document.getElementById('profit_sharing_amount');
    if (amountEl) amountEl.value = '';
    const modal = document.getElementById('profitSharingModal');
    if (modal) {
        modal.style.display = 'block';
        modal.classList.add('show');
    }
}

function closeProfitSharingModal() {
    const modal = document.getElementById('profitSharingModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    const container = document.getElementById('profitSharingRowsContainer');
    if (container) {
        const rows = container.querySelectorAll('.profit-sharing-row');
        for (let i = 1; i < rows.length; i++) rows[i].remove();
    }
    const form = document.getElementById('profitSharingForm');
    if (form) form.reset();
}

// Selected Profit Sharing list (array of { accountId, accountText, amount })
window.selectedProfitSharingEntries = [];

function isValidBankMoneyInput(value) {
    try {
        MoneyDecimal.toDecimal(value);
        return true;
    } catch (e) {
        return false;
    }
}

/** Profit 显示为扣除 Profit Sharing 后的数额（Sell Price - Buy Price - sum(PS)） */
function updateBankProfitDisplay() {
    const costInput = document.getElementById('bank_cost');
    const priceInput = document.getElementById('bank_price');
    const profitInput = document.getElementById('bank_profit');
    if (!costInput || !priceInput || !profitInput) return;
    const gross = MoneyDecimal.sub(priceInput.value || '0', costInput.value || '0');
    const entries = window.selectedProfitSharingEntries || [];
    let sumPs = MoneyDecimal.toDecimal('0');
    entries.forEach(function (e) {
        if (isValidBankMoneyInput(e.amount)) sumPs = sumPs.plus(MoneyDecimal.toDecimal(e.amount, 0));
    });
    const net = MoneyDecimal.max(MoneyDecimal.sub(gross, sumPs), '0');
    profitInput.value = MoneyDecimal.formatDisplay(net, 8);
}

function renderSelectedProfitSharing() {
    const container = document.getElementById('selectedProfitSharingList');
    const mainInput = document.getElementById('bank_profit_sharing');
    if (!container) return;
    const entries = window.selectedProfitSharingEntries || [];
    if (entries.length === 0) {
        container.innerHTML = '<div class="no-countries">No profit sharing selected</div>';
        if (mainInput) mainInput.value = '';
        return;
    }
    const parts = [];
    container.innerHTML = '';
    entries.forEach(function (entry, index) {
        const amt = entry.amount;
        const displayAmount = (amt !== '' && amt != null && isValidBankMoneyInput(amt)) ? MoneyDecimal.formatDisplay(amt, 8) : (amt || '');
        const text = (entry.accountText || '') + ' - ' + displayAmount;
        parts.push(text);
        const div = document.createElement('div');
        div.className = 'selected-country-modal-item';
        div.dataset.index = String(index);
        div.innerHTML = '<span>' + (typeof escapeHtml === 'function' ? escapeHtml(text) : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '</span><button type="button" class="remove-country-modal" onclick="removeProfitSharingEntry(' + index + ')">&times;</button>';
        container.appendChild(div);
    });
    if (mainInput) mainInput.value = parts.join(', ');
    if (typeof updateBankSubmitButtonState === 'function') updateBankSubmitButtonState();
    if (typeof updateBankProfitDisplay === 'function') updateBankProfitDisplay();
}

function removeProfitSharingEntry(index) {
    if (!window.selectedProfitSharingEntries || index < 0 || index >= window.selectedProfitSharingEntries.length) return;
    window.selectedProfitSharingEntries.splice(index, 1);
    renderSelectedProfitSharing();
}
function initBankProcessModule() {
    restoreSelectedCountriesFromStorage();
    document.querySelectorAll("input[name='add_payment_alert']").forEach(function (radio) {
        radio.addEventListener('change', function () { toggleAlertFieldsBank('add'); });
    });
    document.querySelectorAll("input[name='payment_alert']").forEach(function (radio) {
        radio.addEventListener('change', function () { toggleAlertFieldsBank('edit'); });
    });
    ['edit_name', 'edit_remark', 'editCurrencyInput'].forEach(function (inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', function () { forceUppercase(this); });
            input.addEventListener('paste', function () { setTimeout(() => forceUppercase(this), 0); });
        }
    });
    const editCurrencyInput = document.getElementById('editCurrencyInput');
    if (editCurrencyInput) {
        editCurrencyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); addCurrencyFromInputBank('edit'); }
        });
    }
    ['add_account_id', 'add_name', 'add_remark', 'addCurrencyInput'].forEach(function (inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', function () { forceUppercase(this); });
            input.addEventListener('paste', function () { setTimeout(() => forceUppercase(this), 0); });
        }
    });
    const addCurrencyInput = document.getElementById('addCurrencyInput');
    if (addCurrencyInput) {
        addCurrencyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); addCurrencyFromInputBank('add'); }
        });
    }
    ['bank_country', 'bank_bank', 'bank_type', 'bank_name', 'bank_day_start', 'bank_cost', 'bank_price', 'bank_contract'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateBankSubmitButtonState);
            el.addEventListener('change', updateBankSubmitButtonState);
        }
    });
    const accountingInboxBtn = document.getElementById('processAccountingInboxBtn');
    if (accountingInboxBtn) {
        accountingInboxBtn.addEventListener('click', function () {
            const modal = document.getElementById('processAccountingDueModal');
            if (modal && modal.style.display === 'block') {
                closeAccountingDueModal();
            } else {
                openAccountingDueModal();
            }
        });
    }
    const accountingInboxRefresh = document.getElementById('processAccountingInboxRefreshBtn');
    if (accountingInboxRefresh) accountingInboxRefresh.addEventListener('click', function () { loadAccountingInbox(); });
    const accountingInboxPost = document.getElementById('processAccountingInboxPostBtn');
    if (accountingInboxPost) accountingInboxPost.addEventListener('click', function () { postAccountingInboxToTransaction(); });
}
return {
    init: initBankProcessModule,
    toggleBankSupplierSort: toggleBankSupplierSort,
    renderBankTable: renderBankTable,
    syncBankTableColumnWidth: syncBankTableColumnWidth,
    openAddProcess: openAddProcessForSelectedPermission,
    openBankEditModal: openBankEditModal,
    updatePostToTransactionButton: updatePostToTransactionButton,
    loadAccountingInbox: loadAccountingInbox,
    updateAccountingInboxVisibility: updateAccountingInboxVisibility,
    postToTransactionSelected: postToTransactionSelected,
    toggleProcessStatus: toggleProcessStatus,
    refreshAfterFetch: function () { sortBankProcessesBySupplier(); },
    renderAfterStatusChange: function () { renderTable(); },
    isRealBankInactive: isRealBankInactive,
    executeAccountingDueResend: executeAccountingDueResend,
    getPendingResendScheduleForProcess: getPendingResendScheduleForProcess,
    setPendingResendScheduleForProcess: setPendingResendScheduleForProcess,
    bankResendScheduleDayStartForbiddenMessage: bankResendScheduleDayStartForbiddenMessage,
    presentBankResendDayStartValidationError: presentBankResendDayStartValidationError,
    clearBankResendDayStartInlineError: clearBankResendDayStartInlineError
};
})();