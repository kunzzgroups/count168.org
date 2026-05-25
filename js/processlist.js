// 全局变量
let processes = [];
let showInactive = (typeof window.PROCESSLIST_SHOW_INACTIVE !== 'undefined' ? window.PROCESSLIST_SHOW_INACTIVE : false);
let showOfficial = (typeof window.PROCESSLIST_SHOW_OFFICIAL !== 'undefined' ? window.PROCESSLIST_SHOW_OFFICIAL : false);
let showEInvoice = (typeof window.PROCESSLIST_SHOW_E_INVOICE !== 'undefined' ? window.PROCESSLIST_SHOW_E_INVOICE : false);
let showBlock = (typeof window.PROCESSLIST_SHOW_BLOCK !== 'undefined' ? window.PROCESSLIST_SHOW_BLOCK : false);
let showAll = (typeof window.PROCESSLIST_SHOW_ALL !== 'undefined' ? window.PROCESSLIST_SHOW_ALL : false);
let waiting = false;
let currentPage = 1;
const pageSize = 20;
let selectedPermission = null;
const currentProcessListPage = (typeof window.PROCESSLIST_PAGE_FILE === 'string' ? window.PROCESSLIST_PAGE_FILE.trim() : '');
const forcedPermission = (typeof window.PROCESSLIST_FORCED_PERMISSION === 'string' ? window.PROCESSLIST_FORCED_PERMISSION.trim() : '');
// ★★★ SINGLE_CATEGORY_MODE ★★★
// 设为 true 时：Process List 页面隐藏 Category 筛选按钮（Games/Bank/…）。
// 恢复原状只需将此值改为 false。
const SINGLE_CATEGORY_MODE = true;
const hidePermissionFilter = SINGLE_CATEGORY_MODE || !!window.PROCESSLIST_HIDE_PERMISSION_FILTER;
function getBankProcessModule() {
    return (typeof window !== 'undefined' && window.BankProcessList) ? window.BankProcessList : null;
}
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
    if (code) {
        const safeName = name || code;
        return code + '[' + safeName + ']';
    }
    if (name) return name;
    return fallback;
}

/** Add/Edit Bank 弹窗：账户列表刷新后，按 data-value 把 Supplier/Customer/Company 及 Profit Sharing 行按钮文案与 bankAccounts 对齐 */
function syncBankFormAccountButtonLabelsFromAccounts() {
    const accounts = Array.isArray(window.bankAccounts) ? window.bankAccounts : [];
    function accountById(id) {
        const sid = String(id).trim();
        if (!sid) return null;
        return accounts.find(function (a) { return String(a.id) === sid; }) || null;
    }
    function syncButton(btn) {
        if (!btn) return;
        const val = btn.getAttribute('data-value');
        if (val == null || String(val).trim() === '') return;
        const acc = accountById(val);
        if (acc) {
            btn.textContent = formatBankAccountDisplay(acc.account_id, acc.name, acc.id);
        }
    }
    ['bank_card_merchant', 'bank_customer', 'bank_profit_account'].forEach(function (buttonId) {
        syncButton(document.getElementById(buttonId));
    });
    document.querySelectorAll('.profit-sharing-account-btn').forEach(syncButton);
}

function formatAccountIdForDisplay(rawAccountId) {
    const value = String(rawAccountId || '').trim();
    if (!value) return '';
    const match = value.match(/^[^_]+_([0-9]+)(?:_[0-9]+)?$/);
    return match ? match[1] : value;
}

function notifyTransactionDataChanged(sourceTag) {
    const ts = String(Date.now());
    try {
        localStorage.setItem('count168_tx_invalidate_ts', ts);
    } catch (eInv) { /* ignore */ }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('tx-data-changed', { detail: { ts: ts, source: sourceTag || 'processlist' } }));
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
    const bankModule = getBankProcessModule();
    if (bankModule && typeof bankModule.toggleBankSupplierSort === 'function') {
        bankModule.toggleBankSupplierSort();
    }
}

function buildBankRemarkActionButton(processId) {
    return '<button class="edit-btn remark-action-btn" onclick="openQuickRemarkModal(' + processId + ')" aria-label="Remark" title="Remark">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h8M8 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
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
    window._isRedirecting = true;
    window.location.href = url.toString();
    return true;
}

function isBankInactiveLike(status, issueFlag) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedIssueFlag = normalizeBankIssueFlag(issueFlag);
    return normalizedStatus === 'inactive' || normalizedIssueFlag === 'official' || normalizedIssueFlag === 'e_invoice' || normalizedIssueFlag === 'block';
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

function bankFormDayEndMinYmdAttr(el) {
    if (!el) return '';
    return (el.getAttribute('min') || '').trim();
}

/** 與 dashboard date range 相同：dd/mm/yyyy 顯示；hidden 欄位存 Y-m-d */
function bankFormSetDayYmdAndDisplay(inputId, displayId, ymd) {
    const inp = document.getElementById(inputId);
    const disp = document.getElementById(displayId);
    if (!inp) return;
    const raw = ymd == null ? '' : String(ymd).trim();
    const iso = (raw.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(raw)) ? raw.substring(0, 10) : '';
    inp.value = iso;
    if (disp) {
        if (!iso) {
            disp.textContent = 'dd/mm/yyyy';
            disp.classList.add('bank-day-display--placeholder');
        } else {
            const p = iso.split('-');
            disp.textContent = p[2].padStart(2, '0') + '/' + p[1].padStart(2, '0') + '/' + p[0];
            disp.classList.remove('bank-day-display--placeholder');
        }
    }
    inp.dispatchEvent(new Event('change', { bubbles: true }));
}

function setBankFormDayInputYmd(el, ymd) {
    if (!el || !el.id) return;
    const disp = el.id === 'bank_day_start' ? 'bank_day_start_display' : (el.id === 'bank_day_end' ? 'bank_day_end_display' : null);
    if (!disp) return;
    bankFormSetDayYmdAndDisplay(el.id, disp, ymd);
}

function clearBankFormDayPickers() {
    bankFormSetDayYmdAndDisplay('bank_day_start', 'bank_day_start_display', '');
    bankFormSetDayYmdAndDisplay('bank_day_end', 'bank_day_end_display', '');
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

function updateBankOnlyFiltersVisibility() {
    const bankOnlyFilters = document.getElementById('process-list-bank-only-filters');
    if (!bankOnlyFilters) return;
    // Bank-only checkboxes: Show Official / Show E-Invoice
    bankOnlyFilters.style.display = selectedPermission === 'Bank' ? 'flex' : 'none';
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
    const actionButtons = '<button class="edit-btn" onclick="editProcess(' + processId + ')" aria-label="Edit" title="Edit"><img src="images/edit.svg" alt="Edit" /></button>' +
        buildBankRemarkActionButton(processId);
    const showDeleteCheckbox = isRealBankInactive(status);
    if (!showDeleteCheckbox) {
        return actionButtons;
    }
    const disabledAttr = hasTransactions ? ' disabled' : '';
    const titleText = hasTransactions ? 'Cannot delete: process has transactions' : 'Select for deletion';
    return actionButtons + '<input type="checkbox" class="row-checkbox bank-checkbox" data-id="' + processId + '" title="' + titleText + '"' + disabledAttr + ' onchange="onBankProcessCheckboxChange(this)" style="margin-left: 10px;">';
}

function syncBankProcessSelectAllCheckboxState() {
    const header = document.getElementById('selectAllBankProcesses');
    if (!header) return;
    const boxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(function (cb) { return !cb.disabled; });
    if (boxes.length === 0) {
        header.checked = false;
        header.indeterminate = false;
        return;
    }
    const nChecked = boxes.filter(function (b) { return b.checked; }).length;
    header.checked = nChecked === boxes.length;
    header.indeterminate = nChecked > 0 && nChecked < boxes.length;
}

function onBankProcessCheckboxChange(cb) {
    if (!cb || typeof cb.closest !== 'function') return;
    const tr = cb.closest('tr');
    if (!tr || !tr.hasAttribute('data-bp-bank')) return;
    const bankVal = tr.getAttribute('data-bp-bank');
    const ownerVal = tr.getAttribute('data-bp-owner');
    const checked = cb.checked;
    document.querySelectorAll('#bankTableBody tr[data-bp-bank][data-bp-owner]').forEach(function (row) {
        if (row.getAttribute('data-bp-bank') !== bankVal) return;
        if (row.getAttribute('data-bp-owner') !== ownerVal) return;
        const other = row.querySelector('.bank-checkbox:not([disabled])');
        if (other) other.checked = checked;
    });
    syncBankProcessSelectAllCheckboxState();
    updateDeleteButton();
    if (typeof updatePostToTransactionButton === 'function') {
        updatePostToTransactionButton();
    }
}
window.onBankProcessCheckboxChange = onBankProcessCheckboxChange;

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
    /* updateBankListScrollMode 在 renderTable() 末尾调用，避免 Games 取消 Show All 时
       先去掉 body 类而 DOM 仍为全部行，导致分页样式下瞬间压扁重叠 */
}

/** Show All：允许页面纵向滚动（Games 和 Bank 统一行为）；否则保持原样 */
function updateBankListScrollMode() {
    if (!document.body) return;
    const onBank = selectedPermission === 'Bank' || document.body.classList.contains('process-page--bank');
    if (onBank && showAll) {
        document.body.classList.add('process-page--bank-show-all');
    } else {
        document.body.classList.remove('process-page--bank-show-all');
    }
    // Games Show All：允许页面纵向滚动
    if (!onBank && showAll) {
        document.body.classList.add('process-page--show-all');
    } else {
        document.body.classList.remove('process-page--show-all');
    }
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

// 构造 API 绝对 URL（始终基于站点根目录，避免相对路径解析错误）
function buildApiUrl(fileName) {
    const pathname = window.location.pathname || '/';
    const basePath = pathname.replace(/[^/]*$/, '') || '/';
    const base = window.location.origin + basePath;
    const url = new URL(fileName, base);
    return url.href;
}

// 从API获取数据
async function fetchProcesses() {
    console.log('fetchProcesses called');
    try {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) {
            console.error('searchInput element not found');
            return;
        }
        const searchTerm = searchInput.value;
        const url = new URL(buildApiUrl('api/processes/processlist_api.php'));

        // 添加当前选择的 company_id
        const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
        if (currentCompanyId) {
            url.searchParams.set('company_id', currentCompanyId);
        }

        // 添加权限过滤
        if (selectedPermission) {
            url.searchParams.set('permission', selectedPermission);
        }

        if (searchTerm.trim()) {
            url.searchParams.set('search', searchTerm);
        }
        if (selectedPermission === 'Bank') {
            // Bank 列表统一先取完整数据，再由前端做 Status / Official / E-Invoice 过滤，
            // 避免旧数据分散在 flag / issue_flag 时出现筛选不一致。
            url.searchParams.set('showAll', '1');
        } else {
            if (showInactive) {
                url.searchParams.set('showInactive', '1');
            }
            if (showAll) {
                url.searchParams.set('showAll', '1');
            }
        }
        if (waiting) {
            url.searchParams.set('waiting', '1');
        }

        console.log('fetchProcesses ->', url.toString());
        const response = await fetch(url.toString());

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('API Response:', result);

        if (result.success) {
            processes = result.data;
            // 根据类别进行不同的排序
            if (selectedPermission === 'Bank') {
                const bankModule = getBankProcessModule();
                if (bankModule && typeof bankModule.refreshAfterFetch === 'function') {
                    bankModule.refreshAfterFetch();
                } else {
                    sortBankProcessesBySupplier();
                }
            } else {
                // Games 类别的排序逻辑（原有逻辑）
                processes.sort((a, b) => {
                    const aKey = String(a.process_name || '').toLowerCase();
                    const bKey = String(b.process_name || '').toLowerCase();
                    if (aKey < bKey) return -1;
                    if (aKey > bKey) return 1;
                    const aDesc = String(a.description || a.description_name || '').toLowerCase();
                    const bDesc = String(b.description || b.description_name || '').toLowerCase();
                    if (aDesc < bDesc) return -1;
                    if (aDesc > bDesc) return 1;
                    return 0;
                });
            }
            const totalPages = Math.max(1, Math.ceil(processes.length / pageSize));
            if (currentPage > totalPages) currentPage = totalPages;
            renderTable();
            if (selectedPermission === 'Bank') {
                const bankModule = getBankProcessModule();
                if (bankModule && typeof bankModule.loadAccountingInbox === 'function') {
                    bankModule.loadAccountingInbox();
                }
            }
        } else {
            console.error('API error:', result.error);
            showNotification('Failed to get data: ' + result.error, 'danger');
            showError('API error: ' + result.error);
        }
    } catch (error) {
        console.error('Network error:', error);
        showNotification('Network connection failed: ' + error.message, 'danger');
        showError('Network connection failed: ' + error.message);
    }
}

function renderTable() {
    if (selectedPermission === 'Bank') {
        const bankModule = getBankProcessModule();
        if (bankModule && typeof bankModule.renderBankTable === 'function') {
            bankModule.renderBankTable();
        } else {
            renderBankTable();
        }
        return;
    }
    window.__bankFilteredLength = null;
    const container = document.getElementById('processTableBody');
    container.innerHTML = '';

    if (processes.length === 0) {
        const emptyCard = document.createElement('div');
        emptyCard.className = 'process-card';
        emptyCard.innerHTML = `<div class="card-item" style="text-align: left; padding: 20px; grid-column: 1 / -1;">No process data found</div>`;
        container.appendChild(emptyCard);
        renderPagination();
        updateSelectAllProcessesVisibility();
        updateBankListScrollMode();
        return;
    }

    let pageItems, startIndex;
    // showAll 模式：只显示 active 的 process，一页展示所有数据
    let displayProcesses = processes;
    if (showAll) {
        displayProcesses = processes.filter(p => p.status === 'active');
        startIndex = 0;
        pageItems = displayProcesses;
    } else {
        const totalPagesGames = Math.max(1, Math.ceil(displayProcesses.length / pageSize));
        if (currentPage > totalPagesGames) currentPage = totalPagesGames;
        startIndex = (currentPage - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, displayProcesses.length);
        pageItems = displayProcesses.slice(startIndex, endIndex);
    }

    // Games 类别的表格
    {
        // Games 类别的表格（原有逻辑）
        pageItems.forEach((process, idx) => {
            const card = document.createElement('div');
            card.className = 'process-card';
            card.setAttribute('data-id', process.id);
            // 恢复 Games 表格的列数（7列）并加宽 Status (0.35fr)，并统一前后数值保证严格对齐
            card.style.gridTemplateColumns = '0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr 0.2fr';

            const statusClass = process.status === 'active' ? 'status-active' : 'status-inactive';

            card.innerHTML = `
                        <div class="card-item">${startIndex + idx + 1}</div>
                        <div class="card-item">${escapeHtml((process.process_name || '').toUpperCase())}</div>
                        <div class="card-item">${escapeHtml((process.description || '').toUpperCase())}</div>
                        <div class="card-item">
                            <span class="role-badge ${statusClass} status-clickable" onclick="toggleProcessStatus(${process.id}, '${process.status}')" title="Click to toggle status" style="cursor: pointer;">
                                ${escapeHtml((process.status || '').toUpperCase())}
                            </span>
                        </div>
                        <div class="card-item">${escapeHtml(process.currency || '')}</div>
                        <div class="card-item">${escapeHtml(process.day_use || process.day_name || '')}</div>
                        <div class="card-item">
                            <button class="edit-btn" onclick="editProcess(${process.id})" aria-label="Edit" title="Edit">
                                <img src="images/edit.svg" alt="Edit" />
                            </button>
                            ${process.status === 'active' ? '' : (process.has_transactions ? '' : `<input type="checkbox" class="row-checkbox" data-id="${process.id}" title="Select for deletion" onchange="updateDeleteButton()" style="margin-left: 10px;">`)}
                        </div>
                    `;
            container.appendChild(card);
        });
    }
    renderPagination();
    updateSelectAllProcessesVisibility();
    updateBankListScrollMode();
}

/** Bank 用真实 table 渲染，th/td 列由浏览器对齐 */
function renderBankTable() {
    // When re-rendering table (e.g. filter/pagination), ensure floating status menus are closed & cleaned up
    closeAllBankStatusDropdowns();

    const headRow = document.getElementById('bankTableHeadRow');
    const tbody = document.getElementById('bankTableBody');
    if (!headRow || !tbody) {
        updateBankListScrollMode();
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
        updateBankListScrollMode();
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
        const isOnceRow = String(process.day_start_frequency || '') === 'once';
        let contract = '';
        let contractCell = '';
        const baseContractClass = getContractStateClass(process.day_start || null, process.day_end || null);
        const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
        if (isOnceRow) {
            const onceContractClass = baseContractClass === 'contract-active' ? 'contract-1month-active' : baseContractClass;
            contractCell = '<span class="contract-badge ' + onceContractClass + '">' + escapeHtml('ONCE') + '</span>';
        } else {
            contract = process.contract ? (contractMap[process.contract] || process.contract) : '';
            const contractClass = (grayContracts.indexOf(contract) !== -1 && baseContractClass === 'contract-active')
                ? 'contract-1month-active'
                : baseContractClass;
            contractCell = (contract && contractClass)
                ? '<span class="contract-badge ' + contractClass + '">' + escapeHtml(contract) + '</span>'
                : (contract ? escapeHtml(contract) : escapeHtml('-'));
        }
        const insuranceCell = isOnceRow ? escapeHtml(' - ') : escapeHtml(dashIfEmpty(process.insurance));
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
        tr.innerHTML = '<td class="bank-td-no">' + (startIndex + idx + 1) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.card_lower)) + '</td>' +
            '<td class="bank-td-country">' + escapeHtml(dashIfEmpty(process.country)) + '</td>' +
            '<td>' + escapeHtml(dashIfEmpty(process.bank)) + '</td>' +
            '<td class="bank-td-types">' + escapeHtml(dashIfEmpty(process.types)) + '</td>' +
            '<td class="bank-td-card-owner">' + escapeHtml(dashIfEmpty(process.supplier)) + '</td>' +
            '<td>' + contractCell + '</td>' +
            '<td>' + insuranceCell + '</td>' +
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
    syncBankProcessSelectAllCheckboxState();
    updateBankListScrollMode();
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

function renderPagination() {
    const paginationContainer = document.getElementById('paginationContainer');
    if (!paginationContainer) return;

    // Show All 时不分页且隐藏分页控件（Games 和 Bank 统一行为）
    if (showAll) {
        paginationContainer.style.display = 'none';
        return;
    }

    const totalCount = (selectedPermission === 'Bank' && window.__bankFilteredLength != null) ? window.__bankFilteredLength : processes.length;
    if (totalCount === 0) {
        paginationContainer.style.display = 'none';
        return;
    }
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // 更新分页控件信息
    document.getElementById('paginationInfo').textContent = `${currentPage} of ${totalPages}`;

    // 更新按钮状态
    const isPrevDisabled = currentPage <= 1;
    const isNextDisabled = currentPage >= totalPages;

    document.getElementById('prevBtn').disabled = isPrevDisabled;
    document.getElementById('nextBtn').disabled = isNextDisabled;

    // 始终显示分页控件
    paginationContainer.style.display = 'flex';
}

function goToPage(page) {
    if (showAll) return;
    const totalCount = (selectedPermission === 'Bank' && window.__bankFilteredLength != null) ? window.__bankFilteredLength : processes.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const newPage = Math.min(Math.max(1, page), totalPages);
    if (newPage !== currentPage) {
        currentPage = newPage;
        renderTable();
        renderPagination();
    }
}

function prevPage() { goToPage(currentPage - 1); }
function nextPage() { goToPage(currentPage + 1); }

function showError(message) {
    const container = document.getElementById('processTableBody');
    container.innerHTML = `
                <div class="process-card">
                    <div class="card-item" style="text-align: center; padding: 20px; color: red; grid-column: 1 / -1;">
                        ${escapeHtml(message)}
                    </div>
                </div>
            `;
    showNotification(message, 'danger');
    updateBankListScrollMode();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

// Notification functions
/** @param {{ durationMs?: number, prominent?: boolean }} [options] — prominent 仅用于 Resend / Day start 校验等需强提示的场景 */
function showNotification(message, type = 'success', options = null) {
    const container = document.getElementById('processNotificationContainer');
    if (!container) return;

    const durationMs = options && options.durationMs != null ? Math.max(800, options.durationMs) : 1500;
    const prominent = !!(options && options.prominent);

    // 检查现有通知数量，最多保留2个
    const existingNotifications = container.querySelectorAll('.process-notification');
    if (existingNotifications.length >= 2) {
        // 移除最旧的通知
        const oldestNotification = existingNotifications[0];
        oldestNotification.classList.remove('show');
        setTimeout(() => {
            if (oldestNotification.parentNode) {
                oldestNotification.remove();
            }
        }, 300);
    }

    // 创建新通知
    const notification = document.createElement('div');
    const extra = prominent ? ' process-notification--bank-resend-day-start' : '';
    notification.className = ('process-notification process-notification-' + type + extra).trim();
    notification.textContent = message;

    // 添加到容器
    container.appendChild(notification);

    // 触发显示动画
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, durationMs);
}

function updateProcessListPageTitle(permission) {
    const normalizedPermission = String(permission || '').trim().toLowerCase();
    const pageTitle = normalizedPermission === 'bank' ? 'Bank Process List' : 'Process List';
    const headingEl = document.querySelector('.page-title');
    if (headingEl) {
        headingEl.textContent = pageTitle;
    }
    document.title = pageTitle;
}

// 其他必要的函数
function addProcess() {
    // 如果权限还没加载出来，先加载权限，再根据结果打开对应的 Add 弹窗
    if (!selectedPermission && typeof loadPermissionButtons === 'function') {
        loadPermissionButtons().then(() => {
            if (selectedPermission) {
                openAddProcessForSelectedPermission();
            }
        });
        return;
    }
    openAddProcessForSelectedPermission();
}

function openAddProcessForSelectedPermission() {
    if (selectedPermission === 'Bank') {
        const bankModule = getBankProcessModule();
        if (bankModule && typeof bankModule.openAddProcess === 'function') {
            bankModule.openAddProcess();
            return;
        }
        window.selectedProfitSharingEntries = [];
        document.getElementById('addBankModal').style.display = 'block';
        setBankModalLoadingState(true, 'Add Process');
        ensureAddBankProcessDataLoaded().then(async () => {
            const countryEl = document.getElementById('bank_country');
            if (countryEl) countryEl.value = '';
            applySelectedBanksToDropdown('');
            renderSelectedProfitSharing();
            if (typeof clearBankFieldErrors === 'function') clearBankFieldErrors();
            if (typeof updateBankFrequencyOptions === 'function') {
                const dayEndEl = document.getElementById('bank_day_end');
                if (dayEndEl) {
                    setBankFormDayInputYmd(dayEndEl, '');
                    dayEndEl.removeAttribute('min');
                    delete dayEndEl.dataset.bankContractEndHint;
                }
                const dayStartEl = document.getElementById('bank_day_start');
                if (dayStartEl) {
                    setBankFormDayInputYmd(dayStartEl, '');
                }
                const freqEl = document.getElementById('bank_day_start_frequency');
                if (freqEl) freqEl.value = '1st_of_every_month';
                updateBankFrequencyOptions();
            }
            if (typeof autoCalculateBankDayEnd === 'function') autoCalculateBankDayEnd();
            if (typeof syncBankOnceFrequencyUi === 'function') syncBankOnceFrequencyUi();
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

function closeAddBankModal() {
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
    clearBankFormDayPickers();
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

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('addProcessForm').reset();
    const copyFromBtn = document.getElementById('add_copy_from_btn');
    if (copyFromBtn) copyFromBtn.textContent = copyFromBtn.getAttribute('data-placeholder') || 'Select Process to Copy From';

    // 重置 multi-use 状态
    const multiUseCheckbox = document.getElementById('add_multi_use');
    const multiUsePanel = document.getElementById('multi_use_processes');
    const selectedProcessesDisplay = document.getElementById('selected_processes_display');
    const processInput = document.getElementById('add_process_id');

    if (multiUseCheckbox) {
        multiUseCheckbox.checked = false;
    }
    if (multiUsePanel) {
        multiUsePanel.style.display = 'none';
    }
    if (selectedProcessesDisplay) {
        selectedProcessesDisplay.style.display = 'none';
    }
    if (processInput) {
        processInput.disabled = false;
        processInput.style.backgroundColor = 'white';
        processInput.style.cursor = 'default';
        processInput.setAttribute('required', 'required');
    }

    // 清除所有 process 复选框
    const processCheckboxes = document.querySelectorAll('#process_checkboxes input[type="checkbox"]');
    processCheckboxes.forEach(cb => cb.checked = false);

    // 清除选中的 processes
    if (window.selectedProcesses) {
        window.selectedProcesses = [];
    }
    const selectedProcessesList = document.getElementById('selected_processes_list');
    if (selectedProcessesList) {
        selectedProcessesList.innerHTML = '';
    }

    // 清除选中的描述
    if (window.selectedDescriptions) {
        window.selectedDescriptions = [];
    }
    document.getElementById('selected_descriptions_display').style.display = 'none';
    document.getElementById('add_description').value = '';

    // 清除 All Day 复选框
    const allDayCheckbox = document.getElementById('add_all_day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editProcessForm').reset();

    // 清除 All Day 复选框
    const allDayCheckbox = document.getElementById('edit_all_day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
    }

    // 清除选中的描述
    if (window.selectedDescriptions) {
        window.selectedDescriptions = [];
    }
    document.getElementById('edit_selected_descriptions_display').style.display = 'none';
    document.getElementById('edit_description').value = '';
}

async function editProcess(id) {
    try {
        if (selectedPermission === 'Bank') {
            const bankModule = getBankProcessModule();
            if (bankModule && typeof bankModule.openBankEditModal === 'function') {
                await bankModule.openBankEditModal(id);
            } else {
                showNotification('Bank edit is unavailable. Please refresh the page.', 'danger');
            }
            return;
        }
        await loadEditProcessData();
        let getProcessUrl = `api/processes/processlist_api.php?action=get_process&id=${id}`;
        const response = await fetch(buildApiUrl(getProcessUrl));
        const result = await response.json();
        if (result.success && result.data) {
            const process = result.data;
            document.getElementById('edit_process_id').value = process.id;
            document.getElementById('edit_description_id').value = process.description_id || '';
            document.getElementById('edit_process_name').value = process.process_name || '';
            document.getElementById('edit_status').value = process.status || 'active';

            // Set currency - ensure type matching like account-list.php
            const currencySelect = document.getElementById('edit_currency');
            if (process.currency_id) {
                const currencyIdStr = String(process.currency_id);
                // Check if the option exists in the dropdown
                const optionExists = Array.from(currencySelect.options).some(opt => opt.value === currencyIdStr);
                if (optionExists) {
                    currencySelect.value = currencyIdStr;
                } else {
                    console.warn('Currency ID not found in dropdown:', currencyIdStr, 'Available options:', Array.from(currencySelect.options).map(opt => opt.value));
                    if (process.currency_warning) {
                        showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
                    }
                }
            } else if (process.currency_warning) {
                // 如果 currency_id 为空但有警告，说明原货币不属于当前公司
                // 尝试根据货币代码自动匹配当前公司的相同货币
                if (process.currency_code) {
                    const currencyCode = process.currency_code.toUpperCase();
                    const matchingOption = Array.from(currencySelect.options).find(opt =>
                        opt.textContent.toUpperCase() === currencyCode
                    );
                    if (matchingOption) {
                        currencySelect.value = matchingOption.value;
                        console.log('Auto-matched currency by code:', currencyCode, '-> ID:', matchingOption.value);
                    } else {
                        showNotification('Warning: The original currency (' + currencyCode + ') does not belong to your company. Please select a currency manually.', 'danger');
                    }
                } else {
                    showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
                }
            }

            document.getElementById('edit_remove_words').value = process.remove_word || '';

            // Handle replace word fields
            if (process.replace_word) {
                const parts = process.replace_word.split(' == ');
                document.getElementById('edit_replace_word_from').value = parts[0] || '';
                document.getElementById('edit_replace_word_to').value = parts[1] || '';
            } else {
                document.getElementById('edit_replace_word_from').value = '';
                document.getElementById('edit_replace_word_to').value = '';
            }

            // Handle remarks
            const editRemarksEl = document.getElementById('edit_remarks');
            if (editRemarksEl) {
                if (process.remarks) {
                    try {
                        const meta = JSON.parse(process.remarks);
                        editRemarksEl.value = (meta.user_remarks != null && meta.user_remarks !== '') ? meta.user_remarks : (process.remarks || '');
                    } catch (e) {
                        editRemarksEl.value = process.remarks;
                    }
                } else {
                    editRemarksEl.value = '';
                }
            }

            // Handle day use checkboxes
            if (process.day_use) {
                const dayIdsArray = process.day_use.split(',');
                dayIdsArray.forEach(dayId => {
                    const checkbox = document.querySelector(`#edit_day_checkboxes input[name="edit_day_use[]"][value="${dayId.trim()}"]`);
                    if (checkbox) checkbox.checked = true;
                });
                // 更新 All Day 复选框状态
                updateAllDayCheckbox('edit');
            }

            // Handle description - initialize selected descriptions
            const descInput = document.getElementById('edit_description');
            let descriptionNames = [];

            if (process.description_names && Array.isArray(process.description_names) && process.description_names.length > 0) {
                descriptionNames = process.description_names;
            } else if (process.description_names && typeof process.description_names === 'string') {
                // 如果是逗号分隔的字符串，分割它
                descriptionNames = process.description_names.split(',').map(d => d.trim()).filter(d => d);
            } else if (process.description_name) {
                descriptionNames = [process.description_name];
            }

            // 初始化选中的描述
            window.selectedDescriptions = descriptionNames;

            if (descInput) {
                if (descriptionNames.length > 0) {
                    descInput.value = `${descriptionNames.length} description(s) selected`;
                    // 显示选中的描述列表
                    displayEditSelectedDescriptions(descriptionNames);
                } else {
                    descInput.value = '';
                }
            }

            // Populate read-only information fields (date on left, user on right)
            const dtsModified = process.dts_modified || '';
            const modifiedBy = process.modified_by || '';
            const dtsCreated = process.dts_created || '';
            const createdBy = process.created_by || '';

            // DTS Modified 只有在真正修改过时才显示（不为空且不等于创建时间）
            // 如果为空或等于创建时间，表示从未修改过，显示为空
            let displayModifiedDate = '';
            let displayModifiedBy = '';
            if (dtsModified && dtsModified !== dtsCreated) {
                displayModifiedDate = dtsModified;
                displayModifiedBy = modifiedBy || '';
            }

            document.getElementById('edit_dts_modified_date').textContent = displayModifiedDate;
            document.getElementById('edit_dts_modified_user').textContent = displayModifiedBy;
            document.getElementById('edit_dts_created_date').textContent = dtsCreated || '';
            document.getElementById('edit_dts_created_user').textContent = createdBy || '';

            // Show modal
            document.getElementById('editModal').style.display = 'block';
        } else {
            showNotification('Failed to load process data: ' + (result.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error loading process data:', error);
        showNotification('Failed to load process data', 'danger');
    }
}

// 存储待删除的 ID 列表
let pendingDeleteIds = [];
// Bank 状态切换确认弹窗相关
let pendingToggleProcessId = null;
let pendingToggleNewStatus = null;
let pendingDismissPairs = [];
let pendingBankResendProcessId = null;
let bankResendLockCheckSeq = 0;

function deleteSelected() {
    const selectedCheckboxes = document.querySelectorAll('.row-checkbox:checked:not([disabled])');

    if (selectedCheckboxes.length === 0) {
        showNotification('Please select processes to delete', 'danger');
        return;
    }

    // 收集选中的 ID
    pendingDeleteIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.id);

    // 显示确认对话框
    const message = `Are you sure you want to delete ${pendingDeleteIds.length} process(es)? This action cannot be undone.`;
    document.getElementById('confirmDeleteMessage').textContent = message;
    document.getElementById('confirmDeleteModal').style.display = 'block';
}

// 全选/取消全选所有流程
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
    syncBankProcessSelectAllCheckboxState();
    if (typeof updatePostToTransactionButton === 'function') {
        updatePostToTransactionButton();
    }
}

function toggleSelectAllProcesses() {
    const selectAllCheckbox = document.getElementById('selectAllProcesses');
    if (!selectAllCheckbox) {
        console.error('selectAllProcesses checkbox not found');
        return;
    }

    // 根据类别选择不同的复选框
    let allCheckboxes;
    if (selectedPermission === 'Bank') {
        allCheckboxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(cb => !cb.disabled);
    } else {
        allCheckboxes = Array.from(document.querySelectorAll('.row-checkbox:not(.bank-checkbox)')).filter(cb => !cb.disabled);
    }

    console.log('Found checkboxes:', allCheckboxes.length, 'Select all checked:', selectAllCheckbox.checked);

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateDeleteButton();
}

// 根据当前页面是否有可删除项，显示/隐藏全选框（Bank 用 visibility 保留表头空间，避免错位）
function updateSelectAllProcessesVisibility() {
    if (selectedPermission === 'Bank') {
        const selectAllBankCheckbox = document.getElementById('selectAllBankProcesses');
        if (!selectAllBankCheckbox) return;

        const anyBankCheckbox = document.querySelectorAll('.bank-checkbox').length > 0;
        selectAllBankCheckbox.style.visibility = anyBankCheckbox ? 'visible' : 'hidden';
        selectAllBankCheckbox.style.display = 'inline-block';
        selectAllBankCheckbox.disabled = !anyBankCheckbox;
        if (!anyBankCheckbox) {
            selectAllBankCheckbox.checked = false;
        }
    } else {
        const selectAllCheckbox = document.getElementById('selectAllProcesses');
        if (!selectAllCheckbox) return;

        const anyRowCheckbox = document.querySelectorAll('.row-checkbox:not(.bank-checkbox)').length > 0;
        selectAllCheckbox.style.display = anyRowCheckbox ? 'inline-block' : 'none';
        if (!anyRowCheckbox) {
            selectAllCheckbox.checked = false;
        }
    }
}

function updateDeleteButton() {
    // 根据类别选择不同的复选框
    let selectedCheckboxes;
    let allCheckboxes;
    let selectAllCheckbox;

    if (selectedPermission === 'Bank') {
        selectedCheckboxes = document.querySelectorAll('.bank-checkbox:checked');
        allCheckboxes = Array.from(document.querySelectorAll('.bank-checkbox')).filter(cb => !cb.disabled);
        selectAllCheckbox = document.getElementById('selectAllBankProcesses');
    } else {
        selectedCheckboxes = document.querySelectorAll('.row-checkbox:not(.bank-checkbox):checked');
        allCheckboxes = Array.from(document.querySelectorAll('.row-checkbox:not(.bank-checkbox)')).filter(cb => !cb.disabled);
        selectAllCheckbox = document.getElementById('selectAllProcesses');
    }

    const deleteBtn = document.getElementById('processDeleteSelectedBtn');

    // 更新全选 checkbox 状态
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        const allSelected = allCheckboxes.length > 0 &&
            allCheckboxes.every(cb => cb.checked);
        selectAllCheckbox.checked = allSelected;
    }

    let deleteEnabled = false;
    if (selectedPermission === 'Bank' && selectedCheckboxes.length > 0) {
        const hasInactive = Array.from(selectedCheckboxes).some(cb => {
            const row = cb.closest('tr');
            return row && isRealBankInactive(row.getAttribute('data-status'));
        });
        deleteEnabled = hasInactive;
    } else if (selectedCheckboxes.length > 0) {
        deleteEnabled = true;
    }

    if (selectedCheckboxes.length > 0) {
        deleteBtn.textContent = `Delete (${selectedCheckboxes.length})`;
        deleteBtn.disabled = !deleteEnabled;
    } else {
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = true;
    }

    updatePostToTransactionButton();
}

function updatePostToTransactionButton() {
    if (selectedPermission === 'Bank') {
        const bankModule = getBankProcessModule();
        if (bankModule && typeof bankModule.updatePostToTransactionButton === 'function') {
            bankModule.updatePostToTransactionButton();
            return;
        }
    }
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
let __accountingInboxLoadSeq = 0;
function loadAccountingInbox() {
    const seq = ++__accountingInboxLoadSeq;
    const urlStr = buildApiUrl('api/processes/process_accounting_inbox_api.php');
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    const u = new URL(urlStr);
    if (currentCompanyId) u.searchParams.set('company_id', currentCompanyId);
    u.searchParams.set('_t', String(Date.now()));
    return fetch(u.toString(), { method: 'GET', cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            if (seq !== __accountingInboxLoadSeq) return;
            const list = (data && data.success && data.data) ? data.data : [];
            window.__accountingInboxList = list;
            renderAccountingInbox(list);
        })
        .catch(err => {
            if (seq !== __accountingInboxLoadSeq) return;
            console.error('Accounting inbox load failed:', err);
            renderAccountingInbox([]);
        });
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
        const periodType = row.is_once_one_off ? 'once_one_off' : (row.is_manual_inactive ? 'manual_inactive' : (row.is_resend_consolidated_range ? 'resend_consolidated_range' : (row.is_partial_first_month ? 'partial_first_month' : (row.is_day_end_tail ? 'day_end_tail' : 'monthly'))));
        const cbHtml = '<input type="checkbox" class="' + cbClass + '" data-id="' + row.id + '"' + cbDisabled + cbChecked + ' onchange="updateAccountingInboxPostButton()">';
        const startDate = (row.day_start || row.start_date || '').toString().trim() || '-';
        const contractRaw = (row.contract || '').toString().trim() || '-';
        const contractDisplay = row.is_once_one_off ? 'ONCE' : (({ '1+1': '1+1 MONTH', '1+2': '1+2 MONTHS', '1+3': '1+3 MONTHS' })[contractRaw] || contractRaw);
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
    const bankModule = getBankProcessModule();
    if (bankModule && typeof bankModule.updateAccountingInboxVisibility === 'function') {
        bankModule.updateAccountingInboxVisibility();
        return;
    }
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
        // Testing toggle: allow posting monthly rows before due date from Accounting Due flow.
        formData.append('allow_future_monthly', '1');
        const response = await fetch(buildApiUrl('api/processes/process_post_to_transaction_api.php'), { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            notifyTransactionDataChanged('processlist_accounting_due_post');
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
    document.getElementById('confirmAccountingDueDeleteModal').style.display = 'block';
}

function closeConfirmAccountingDueDeleteModal() {
    document.getElementById('confirmAccountingDueDeleteModal').style.display = 'none';
    pendingDismissPairs = [];
}

function syncBankResendModalOnceDayEndUi() {
    const dayEnd = document.getElementById('bank_resend_day_end');
    const freq = document.getElementById('bank_resend_frequency');
    if (!dayEnd || !freq) return;
    const isOnce = freq.value === 'once';
    if (isOnce) {
        dayEnd.value = '';
        dayEnd.disabled = true;
        dayEnd.style.opacity = '0.55';
        dayEnd.title = 'Not used when Frequency is Once';
    } else {
        dayEnd.disabled = false;
        dayEnd.style.opacity = '';
        dayEnd.title = '';
    }
}

function bindBankResendModalFrequencySyncOnce() {
    const modal = document.getElementById('confirmBankResendModal');
    if (!modal || modal._bankResendFreqBound) return;
    modal._bankResendFreqBound = true;
    const dayEnd = document.getElementById('bank_resend_day_end');
    const freq = document.getElementById('bank_resend_frequency');
    if (!dayEnd || !freq) return;
    function syncResendFreq() {
        if (freq.value === 'once') {
            const monthlyOptOnce = freq.querySelector('option[value="monthly"]');
            if (monthlyOptOnce) monthlyOptOnce.disabled = false;
            return;
        }
        const monthlyOpt = freq.querySelector('option[value="monthly"]');
        const hasEnd = !!(dayEnd.value && String(dayEnd.value).trim());
        if (hasEnd) {
            freq.value = '1st_of_every_month';
            if (monthlyOpt) monthlyOpt.disabled = true;
        } else if (monthlyOpt) {
            monthlyOpt.disabled = false;
        }
    }
    function onDayEndOrFreqChange() {
        syncBankResendModalOnceDayEndUi();
        syncResendFreq();
    }
    dayEnd.addEventListener('change', onDayEndOrFreqChange);
    dayEnd.addEventListener('input', onDayEndOrFreqChange);
    freq.addEventListener('change', onDayEndOrFreqChange);
}

function bindBankResendDayStartClearInlineErrorOnce() {
    const el = document.getElementById('bank_resend_day_start');
    if (!el || el._bankResendInlineErrorClearBound) return;
    el._bankResendInlineErrorClearBound = true;
    function tryClear() {
        const bm = getBankProcessModule();
        if (bm && typeof bm.clearBankResendDayStartInlineError === 'function') {
            bm.clearBankResendDayStartInlineError();
        }
    }
    el.addEventListener('change', tryClear);
    el.addEventListener('input', tryClear);
}

function normalizeResendDayStartToYmd(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const dd = String(parseInt(dmy[1], 10)).padStart(2, '0');
        const mm = String(parseInt(dmy[2], 10)).padStart(2, '0');
        const yy = dmy[3];
        return yy + '-' + mm + '-' + dd;
    }
    return '';
}

function isSelectedDayStartResendLockedToday(proc, selectedDayStartRaw) {
    if (!proc) return false;
    const selectedYmd = normalizeResendDayStartToYmd(selectedDayStartRaw);
    if (!selectedYmd) return false;
    const lockedCsv = String(proc.resend_guard_day_starts_today || '').trim();
    if (lockedCsv) {
        const lockedSet = new Set(
            lockedCsv
                .split(',')
                .map(function (item) { return normalizeResendDayStartToYmd(item); })
                .filter(Boolean)
        );
        return lockedSet.has(selectedYmd);
    }
    // Backward-compatible fallback (older payload shape):
    return !!proc.resend_today_day_start_locked;
}

async function checkBankResendDayStartLockFromBackend(processId, selectedDayStartRaw) {
    const dayStartYmd = normalizeResendDayStartToYmd(selectedDayStartRaw);
    if (!processId || !dayStartYmd) return false;
    const response = await fetch(buildApiUrl('api/bankprocess_maintenance/resend_accounting_due_api.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bank_process_id: processId,
            mode: 'check_daystart_lock',
            day_start: dayStartYmd
        })
    });
    const result = await response.json();
    if (!result || !result.success) {
        throw new Error((result && result.message) ? result.message : 'Check failed');
    }
    return !!(result.data && result.data.locked);
}

async function refreshBankResendConfirmButtonState() {
    const confirmBtn = document.getElementById('confirmBankResendBtn');
    const dsEl = document.getElementById('bank_resend_day_start');
    const id = pendingBankResendProcessId;
    if (!confirmBtn || !dsEl || !id) return;
    const proc = Array.isArray(processes) ? processes.find(function (p) { return p.id === id; }) : null;
    const rawDayStart = dsEl.value;
    const quickLocked = isSelectedDayStartResendLockedToday(proc, rawDayStart);
    const requestSeq = ++bankResendLockCheckSeq;
    if (!normalizeResendDayStartToYmd(rawDayStart)) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Resend';
        confirmBtn.title = '';
        return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Resend';
    confirmBtn.title = 'Checking latest backend status...';
    try {
        const backendLocked = await checkBankResendDayStartLockFromBackend(id, rawDayStart);
        if (requestSeq !== bankResendLockCheckSeq) return;
        if (backendLocked) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Resend';
            confirmBtn.title = 'Today for this Day start has already been resent and related maintenance data still exists. Please choose another date.';
            return;
        }
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Resend';
        confirmBtn.title = '';
    } catch (err) {
        if (requestSeq !== bankResendLockCheckSeq) return;
        // Fallback to current in-memory payload when live check fails.
        if (quickLocked) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Resend';
            confirmBtn.title = 'Today for this Day start has already been resent. Please choose another date.';
        } else {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Resend';
            confirmBtn.title = '';
        }
    }
}

function bindBankResendDayStartButtonLockSyncOnce() {
    const el = document.getElementById('bank_resend_day_start');
    if (!el || el._bankResendDayStartLockBound) return;
    el._bankResendDayStartLockBound = true;
    el.addEventListener('change', function () { void refreshBankResendConfirmButtonState(); });
    el.addEventListener('input', function () { void refreshBankResendConfirmButtonState(); });
}

function showConfirmBankResendModal(processId) {
    const id = parseInt(processId, 10);
    if (!id) return;
    const modalEl = document.getElementById('confirmBankResendModal');
    if (!modalEl) {
        const bankModule = getBankProcessModule();
        if (bankModule && typeof bankModule.executeAccountingDueResend === 'function' &&
            window.confirm('Resend this process to Accounting Due?')) {
            void bankModule.executeAccountingDueResend(id);
        }
        return;
    }
    pendingBankResendProcessId = id;
    function bankResendModalFrequencyFromStored(freq) {
        if (freq === 'monthly') return 'monthly';
        if (freq === 'once') return 'once';
        return '1st_of_every_month';
    }
    const msgEl = document.getElementById('confirmBankResendMessage');
    const proc = Array.isArray(processes) ? processes.find(p => p.id === id) : null;
    const label = proc
        ? String(proc.supplier || proc.card_lower || ('#' + id)).trim() || ('#' + id)
        : ('#' + id);
    if (msgEl) {
        msgEl.textContent =
            'Resend "' + label + '" to Accounting Due?\n\n' +
            'This clears posted markers so the process can appear in Accounting Due again. The schedule below applies only to this Resend and does not change the Edit Process form.';
    }
    bindBankResendModalFrequencySyncOnce();
    const bmClear = getBankProcessModule();
    if (bmClear && typeof bmClear.clearBankResendDayStartInlineError === 'function') {
        bmClear.clearBankResendDayStartInlineError();
    }
    bindBankResendDayStartClearInlineErrorOnce();
    const dsEl = document.getElementById('bank_resend_day_start');
    const deEl = document.getElementById('bank_resend_day_end');
    const fqEl = document.getElementById('bank_resend_frequency');
    let scheduleSeed = {
        day_start: proc ? (proc.day_start || '') : '',
        day_end: proc ? (proc.day_end || '') : '',
        day_start_frequency: bankResendModalFrequencyFromStored(proc ? proc.day_start_frequency : '')
    };
    const bankModule = getBankProcessModule();
    if (bankModule && typeof bankModule.getPendingResendScheduleForProcess === 'function') {
        const pendingSchedule = bankModule.getPendingResendScheduleForProcess(id);
        if (pendingSchedule) {
            scheduleSeed = {
                day_start: pendingSchedule.day_start || '',
                day_end: pendingSchedule.day_end || '',
                day_start_frequency: bankResendModalFrequencyFromStored(pendingSchedule.day_start_frequency)
            };
        }
    }
    if (dsEl) {
        const d1 = scheduleSeed.day_start || '';
        dsEl.value = d1 ? (d1.length === 10 ? d1 : String(d1).split(' ')[0]) : '';
    }
    if (deEl) {
        const d2 = scheduleSeed.day_end || '';
        deEl.value = d2 ? (d2.length === 10 ? d2 : String(d2).split(' ')[0]) : '';
    }
    if (fqEl) {
        fqEl.value = bankResendModalFrequencyFromStored(scheduleSeed.day_start_frequency);
    }
    const dayEndSync = document.getElementById('bank_resend_day_end');
    const freqSync = document.getElementById('bank_resend_frequency');
    if (dayEndSync && freqSync) {
        const monthlyOpt = freqSync.querySelector('option[value="monthly"]');
        if (freqSync.value === 'once') {
            if (monthlyOpt) monthlyOpt.disabled = false;
        } else {
            const hasEnd = !!(dayEndSync.value && String(dayEndSync.value).trim());
            if (hasEnd) {
                freqSync.value = '1st_of_every_month';
                if (monthlyOpt) monthlyOpt.disabled = true;
            } else if (monthlyOpt) {
                monthlyOpt.disabled = false;
            }
        }
    }
    syncBankResendModalOnceDayEndUi();
    const confirmBtn = document.getElementById('confirmBankResendBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Resend';
        confirmBtn.title = '';
    }
    bindBankResendDayStartButtonLockSyncOnce();
    void refreshBankResendConfirmButtonState();
    if (modalEl) {
        const cancelBtn = modalEl.querySelector('.confirm-bank-resend-cancel');
        if (cancelBtn) cancelBtn.disabled = false;
        modalEl.style.display = 'block';
    }
}

function closeConfirmBankResendModal() {
    const bm = getBankProcessModule();
    if (bm && typeof bm.clearBankResendDayStartInlineError === 'function') {
        bm.clearBankResendDayStartInlineError();
    }
    const modal = document.getElementById('confirmBankResendModal');
    if (modal) modal.style.display = 'none';
    pendingBankResendProcessId = null;
    const fqClose = document.getElementById('bank_resend_frequency');
    if (fqClose) {
        const mo = fqClose.querySelector('option[value="monthly"]');
        if (mo) mo.disabled = false;
    }
    const deClose = document.getElementById('bank_resend_day_end');
    if (deClose) {
        deClose.disabled = false;
        deClose.style.opacity = '';
        deClose.title = '';
    }
    const confirmBtn = document.getElementById('confirmBankResendBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Resend';
        confirmBtn.title = '';
    }
    if (modal) {
        const cancelBtn = modal.querySelector('.confirm-bank-resend-cancel');
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

async function confirmBankResendFromModal() {
    const id = pendingBankResendProcessId;
    if (!id) {
        closeConfirmBankResendModal();
        return;
    }
    const modal = document.getElementById('confirmBankResendModal');
    const confirmBtn = document.getElementById('confirmBankResendBtn');
    const cancelBtn = modal ? modal.querySelector('.confirm-bank-resend-cancel') : null;
    const dsEl = document.getElementById('bank_resend_day_start');
    const deEl = document.getElementById('bank_resend_day_end');
    const fqEl = document.getElementById('bank_resend_frequency');
    const scheduleOpts = (dsEl && deEl && fqEl) ? {
        day_start: (dsEl.value || '').trim(),
        day_end: fqEl.value === 'once' ? '' : (deEl.value || '').trim(),
        day_start_frequency: fqEl.value === 'monthly' ? 'monthly' : (fqEl.value === 'once' ? 'once' : '1st_of_every_month')
    } : null;
    const proc = Array.isArray(processes) ? processes.find(p => p.id === id) : null;
    let backendLocked = false;
    try {
        backendLocked = await checkBankResendDayStartLockFromBackend(id, scheduleOpts ? scheduleOpts.day_start : '');
    } catch (e) {
        backendLocked = isSelectedDayStartResendLockedToday(proc, scheduleOpts ? scheduleOpts.day_start : '');
    }
    if (backendLocked) {
        if (typeof showNotification === 'function') {
            showNotification('This process has already been resent for this Day start today. Please select another Day start.', 'warning');
        }
        void refreshBankResendConfirmButtonState();
        return;
    }
    const bankModule = getBankProcessModule();
    const forbidMsg = bankModule && typeof bankModule.bankResendScheduleDayStartForbiddenMessage === 'function'
        ? bankModule.bankResendScheduleDayStartForbiddenMessage(scheduleOpts ? scheduleOpts.day_start : '', proc ? proc.day_start : null)
        : null;
    if (forbidMsg) {
        const bm = getBankProcessModule();
        if (bm && typeof bm.presentBankResendDayStartValidationError === 'function') {
            bm.presentBankResendDayStartValidationError(forbidMsg);
        } else if (typeof showNotification === 'function') {
            showNotification(forbidMsg, 'danger', { durationMs: 14500, prominent: true });
        }
        return;
    }
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Resending...';
    }
    if (cancelBtn) cancelBtn.disabled = true;
    try {
        if (bankModule && typeof bankModule.executeAccountingDueResend === 'function') {
            await bankModule.executeAccountingDueResend(id, scheduleOpts);
        }
    } finally {
        closeConfirmBankResendModal();
    }
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
            await loadAccountingInbox();
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
    const bankModule = getBankProcessModule();
    if (bankModule && typeof bankModule.postToTransactionSelected === 'function') {
        return bankModule.postToTransactionSelected();
    }
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
            notifyTransactionDataChanged('processlist_bulk_post');
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
            if (selectedPermission === 'Bank') {
                // Keep the full Bank dataset in memory so toggling Show Inactive can reveal rows immediately.
                renderTable();
                renderPagination();
            } else {
                const processIndex = processes.findIndex(p => String(p.id) === String(processId));
                if (processIndex > -1) processes.splice(processIndex, 1);
                renderTable();
            }
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
                        // Contract cell (index 6): gray for 1 MONTH / 1+1 / 1+2 / 1+3 / ONCE when active (same badge style)
                        const baseContractClass = getContractStateClass(process.day_start || null, process.day_end || null);
                        const isOnceRowUpd = process && String(process.day_start_frequency || '') === 'once';
                        let contractCellHtml;
                        if (isOnceRowUpd) {
                            const onceContractClass = baseContractClass === 'contract-active' ? 'contract-1month-active' : baseContractClass;
                            contractCellHtml = '<span class="contract-badge ' + onceContractClass + '">' + escapeHtml('ONCE') + '</span>';
                        } else {
                            const contractRaw = process && process.contract ? (contractMap[process.contract] || process.contract) : '';
                            const grayContracts = ['1 MONTH', '1+1 MONTH', '1+2 MONTHS', '1+3 MONTHS'];
                            const contractClass = (grayContracts.indexOf(contractRaw) !== -1 && baseContractClass === 'contract-active')
                                ? 'contract-1month-active'
                                : baseContractClass;
                            contractCellHtml = (contractRaw && contractClass)
                                ? '<span class="contract-badge ' + contractClass + '">' + escapeHtml(contractRaw) + '</span>'
                                : (contractRaw ? escapeHtml(contractRaw) : escapeHtml('-'));
                        }
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
            const bankModule = getBankProcessModule();
            if (bankModule && typeof bankModule.toggleProcessStatus === 'function') {
                await bankModule.toggleProcessStatus(processId, currentStatus);
            }
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

// 全局变量：当前描述选择模式（'add' 或 'edit'）
let descriptionSelectionMode = 'add';

function expandDescription() {
    descriptionSelectionMode = 'add';
    loadExistingDescriptions();
    updateSelectedDescriptionsInModal();
    const modal = document.getElementById('descriptionSelectionModal');
    if (modal) modal.style.display = 'block';
}

function expandEditDescription() {
    descriptionSelectionMode = 'edit';
    loadExistingDescriptions();
    updateSelectedDescriptionsInModal();
    const modal = document.getElementById('descriptionSelectionModal');
    if (modal) modal.style.display = 'block';
}

async function loadExistingDescriptions() {
    try {
        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'));
        const result = await response.json();
        if (result.success) {
            const descriptionsList = document.getElementById('existingDescriptions');
            if (!descriptionsList) return;
            descriptionsList.innerHTML = '';
            if (Array.isArray(result.descriptions) && result.descriptions.length > 0) {
                result.descriptions.forEach(description => {
                    const item = document.createElement('div');
                    item.className = 'description-item';

                    const left = document.createElement('div');
                    left.className = 'description-item-left';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.name = 'available_descriptions';
                    checkbox.value = description.name;
                    checkbox.id = `desc_${description.id}`;
                    checkbox.dataset.descriptionId = description.id;

                    const label = document.createElement('label');
                    label.htmlFor = `desc_${description.id}`;
                    label.textContent = description.name.toUpperCase();

                    left.appendChild(checkbox);
                    left.appendChild(label);

                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'description-delete-btn';
                    deleteBtn.title = 'Delete description';
                    deleteBtn.setAttribute('aria-label', 'Delete description');
                    deleteBtn.innerHTML = '&times;';
                    deleteBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteDescription(description.id, description.name, item);
                    });

                    item.appendChild(left);
                    item.appendChild(deleteBtn);
                    descriptionsList.appendChild(item);

                    checkbox.addEventListener('change', function () {
                        if (this.checked) {
                            moveDescriptionToSelected(this);
                        } else {
                            moveDescriptionToAvailable(this);
                        }
                    });

                    // 如果是编辑模式且该描述已被选中，自动选中并移动到已选择列表
                    if (descriptionSelectionMode === 'edit' && window.selectedDescriptions && window.selectedDescriptions.includes(description.name)) {
                        checkbox.checked = true;
                        moveDescriptionToSelected(checkbox);
                    }
                });
            } else {
                descriptionsList.innerHTML = '<div class="no-descriptions">No descriptions found</div>';
            }
        } else {
            showNotification('Failed to load descriptions: ' + (result.error || 'Unknown error'), 'danger');
        }
    } catch (e) {
        console.error('Error loading descriptions:', e);
        showNotification('Failed to load descriptions', 'danger');
    }
}

function updateSelectedDescriptionsInModal() {
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    if (!selectedList) return;
    selectedList.innerHTML = '';
    const selections = Array.isArray(window.selectedDescriptions) ? window.selectedDescriptions : [];
    if (selections.length > 0) {
        selections.forEach((desc, idx) => {
            const div = document.createElement('div');
            div.className = 'selected-description-modal-item';
            div.innerHTML = `
                        <span>${desc.toUpperCase()}</span>
                        <button type="button" class="remove-description-modal" onclick="moveDescriptionBackToAvailable('${desc}', '${Date.now() + idx}')">&times;</button>
                    `;
            selectedList.appendChild(div);
        });
    } else {
        selectedList.innerHTML = '<div class="no-descriptions">No descriptions selected</div>';
    }
}

function moveDescriptionToSelected(checkbox) {
    const descriptionName = checkbox.value;
    const descriptionId = checkbox.dataset.descriptionId;
    const descriptionItem = checkbox.closest('.description-item');
    if (!Array.isArray(window.selectedDescriptions)) window.selectedDescriptions = [];
    if (!window.selectedDescriptions.includes(descriptionName)) {
        window.selectedDescriptions.push(descriptionName);
    }
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    // remove placeholder
    const placeholder = selectedList.querySelector('.no-descriptions');
    if (placeholder) placeholder.remove();
    const newItem = document.createElement('div');
    newItem.className = 'selected-description-modal-item';
    newItem.innerHTML = `
                <span>${descriptionName.toUpperCase()}</span>
                <button type="button" class="remove-description-modal" onclick="moveDescriptionBackToAvailable('${descriptionName}', '${descriptionId}')">&times;</button>
            `;
    selectedList.appendChild(newItem);
    // remove from available list
    if (descriptionItem) descriptionItem.remove();
}

function moveDescriptionToAvailable(checkbox) {
    const descriptionName = checkbox.value;
    const descriptionId = checkbox.dataset.descriptionId;
    const descriptionItem = checkbox.closest('.description-item');

    // Remove from selected descriptions array
    if (window.selectedDescriptions) {
        const index = window.selectedDescriptions.indexOf(descriptionName);
        if (index > -1) {
            window.selectedDescriptions.splice(index, 1);
        }
    }

    // Remove from selected list
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    const selectedItems = selectedList.querySelectorAll('.selected-description-modal-item');
    selectedItems.forEach(item => {
        if (item.querySelector('span').textContent === descriptionName) {
            item.remove();
        }
    });
    if (!selectedList.querySelector('.selected-description-modal-item')) {
        const empty = document.createElement('div');
        empty.className = 'no-descriptions';
        empty.textContent = 'No descriptions selected';
        selectedList.appendChild(empty);
    }
}

function moveDescriptionBackToAvailable(descriptionName, descriptionId) {
    // remove from selected list
    if (Array.isArray(window.selectedDescriptions)) {
        const idx = window.selectedDescriptions.indexOf(descriptionName);
        if (idx > -1) window.selectedDescriptions.splice(idx, 1);
    }
    const selectedList = document.getElementById('selectedDescriptionsInModal');
    selectedList.querySelectorAll('.selected-description-modal-item').forEach(item => {
        if (item.querySelector('span')?.textContent === descriptionName) item.remove();
    });
    if (!selectedList.querySelector('.selected-description-modal-item')) {
        const empty = document.createElement('div');
        empty.className = 'no-descriptions';
        empty.textContent = 'No descriptions selected';
        selectedList.appendChild(empty);
    }
    // add back to available list
    const list = document.getElementById('existingDescriptions');
    if (list) {
        const item = document.createElement('div');
        item.className = 'description-item';

        const left = document.createElement('div');
        left.className = 'description-item-left';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'available_descriptions';
        cb.value = descriptionName;
        cb.id = `desc_${descriptionId}`;
        cb.dataset.descriptionId = descriptionId;

        const label = document.createElement('label');
        label.htmlFor = `desc_${descriptionId}`;
        label.textContent = descriptionName.toUpperCase();

        left.appendChild(cb);
        left.appendChild(label);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'description-delete-btn';
        deleteBtn.title = 'Delete description';
        deleteBtn.setAttribute('aria-label', 'Delete description');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteDescription(descriptionId, descriptionName, item);
        });

        item.appendChild(left);
        item.appendChild(deleteBtn);
        list.appendChild(item);

        cb.addEventListener('change', function () {
            if (this.checked) moveDescriptionToSelected(this);
            else moveDescriptionToAvailable(this);
        });
    }
}

async function deleteDescription(descriptionId, descriptionName, itemElement) {
    if (!descriptionId) return;
    const confirmed = confirm(`Are you sure you want to delete description ${descriptionName}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
        const formData = new FormData();
        formData.append('action', 'delete_description');
        formData.append('description_id', descriptionId);

        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            if (itemElement && itemElement.parentNode) {
                itemElement.remove();
            }

            if (Array.isArray(window.selectedDescriptions)) {
                window.selectedDescriptions = window.selectedDescriptions.filter(desc => desc !== descriptionName);
            }

            updateSelectedDescriptionsInModal();

            // 根据当前模式更新相应的显示
            if (descriptionSelectionMode === 'edit') {
                displayEditSelectedDescriptions(window.selectedDescriptions || []);
                const editDescInput = document.getElementById('edit_description');
                if (editDescInput) {
                    editDescInput.value = (window.selectedDescriptions && window.selectedDescriptions.length > 0)
                        ? `${window.selectedDescriptions.length} description(s) selected`
                        : '';
                }
            } else {
                displaySelectedDescriptions(window.selectedDescriptions || []);
                const addDescInput = document.getElementById('add_description');
                if (addDescInput) {
                    addDescInput.value = (window.selectedDescriptions && window.selectedDescriptions.length > 0)
                        ? `${window.selectedDescriptions.length} description(s) selected`
                        : '';
                }
            }

            const descriptionsList = document.getElementById('existingDescriptions');
            if (descriptionsList && !descriptionsList.querySelector('.description-item')) {
                descriptionsList.innerHTML = '<div class="no-descriptions">No descriptions found</div>';
            }

            showNotification('Description deleted successfully', 'success');
        } else {
            showNotification(result.error || 'Failed to delete description', 'danger');
        }
    } catch (error) {
        console.error('Error deleting description:', error);
        showNotification('Failed to delete description', 'danger');
    }
}

function closeDescriptionSelectionModal() {
    document.getElementById('descriptionSelectionModal').style.display = 'none';
}

// 加载添加表单所需的数据
async function loadAddProcessData() {
    try {
        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'));
        const result = await response.json();

        if (result.success) {
            // 填充 currency 下拉列表
            const currencySelect = document.getElementById('add_currency');
            currencySelect.innerHTML = '<option value="">Select Currency</option>';
            result.currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.id;
                option.textContent = currency.code;
                currencySelect.appendChild(option);
            });

            // 填充 copy from 下拉列表（可搜索 custom select）
            const copyFromBtn = document.getElementById('add_copy_from_btn');
            const copyFromHidden = document.getElementById('add_copy_from');
            const copyFromDropdown = document.getElementById('add_copy_from_dropdown');
            const copyFromOptionsContainer = copyFromDropdown?.querySelector('.custom-select-options');
            const placeholder = (copyFromBtn && copyFromBtn.getAttribute('data-placeholder')) || 'Select Process to Copy From';
            if (copyFromBtn) copyFromBtn.textContent = placeholder;
            if (copyFromHidden) copyFromHidden.value = '';
            if (copyFromOptionsContainer) {
                copyFromOptionsContainer.innerHTML = '';
                if (result.existingProcesses && result.existingProcesses.length > 0) {
                    const sortedProcesses = [...result.existingProcesses].sort((a, b) => {
                        const aName = (a.process_name || 'Unknown').toUpperCase();
                        const bName = (b.process_name || 'Unknown').toUpperCase();
                        if (aName !== bName) return aName.localeCompare(bName);
                        const aDesc = (a.description_name || 'No Description').toUpperCase();
                        const bDesc = (b.description_name || 'No Description').toUpperCase();
                        return aDesc.localeCompare(bDesc);
                    });
                    sortedProcesses.forEach(process => {
                        const option = document.createElement('div');
                        option.className = 'custom-select-option';
                        option.textContent = `${process.process_name || 'Unknown'} - ${process.description_name || 'No Description'}`;
                        option.setAttribute('data-value', process.process_id);
                        copyFromOptionsContainer.appendChild(option);
                    });
                }
            }

            // 填充 process 复选框（用于 multi-use）
            const processCheckboxes = document.getElementById('process_checkboxes');
            if (processCheckboxes) {
                processCheckboxes.innerHTML = '';
                if (result.processes && result.processes.length > 0) {
                    // 获取唯一的process_id列表
                    const uniqueProcessIds = [...new Set(result.processes.map(p => p.process_name))];
                    uniqueProcessIds.forEach(processId => {
                        const checkboxItem = document.createElement('div');
                        checkboxItem.className = 'checkbox-item';
                        checkboxItem.innerHTML = `
                                    <input type="checkbox" id="process_${processId}" name="selected_processes[]" value="${processId}">
                                    <label for="process_${processId}">${processId}</label>
                                `;
                        processCheckboxes.appendChild(checkboxItem);
                    });

                    // 添加process复选框变化监听器
                    const processCheckboxesInputs = processCheckboxes.querySelectorAll('input[type="checkbox"]');
                    processCheckboxesInputs.forEach(checkbox => {
                        checkbox.addEventListener('change', function () {
                            updateSelectedProcessesDisplay();
                        });
                    });
                }
            }

            // 填充 day 复选框
            const dayCheckboxes = document.getElementById('day_checkboxes');
            dayCheckboxes.innerHTML = '';
            if (result.days && result.days.length > 0) {
                result.days.forEach(day => {
                    const checkboxItem = document.createElement('div');
                    checkboxItem.className = 'checkbox-item';
                    checkboxItem.innerHTML = `
                                <input type="checkbox" id="add_day_${day.id}" name="day_use[]" value="${day.id}">
                                <label for="add_day_${day.id}">${day.day_name}</label>
                            `;
                    dayCheckboxes.appendChild(checkboxItem);
                });

                // 为每个 day 复选框添加事件监听器
                dayCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', function () {
                        updateAllDayCheckbox('add');
                    });
                });
            }

            // 为 All Day 复选框添加事件监听器
            const allDayCheckbox = document.getElementById('add_all_day');
            if (allDayCheckbox) {
                allDayCheckbox.addEventListener('change', function () {
                    const dayCheckboxes = document.querySelectorAll('#day_checkboxes input[type="checkbox"]');
                    dayCheckboxes.forEach(checkbox => {
                        checkbox.checked = this.checked;
                    });
                });
            }
        } else {
            showNotification('Failed to load form data: ' + result.error, 'danger');
        }
    } catch (error) {
        console.error('Error loading form data:', error);
        showNotification('Failed to load form data', 'danger');
    }
}

// Load edit form data (currencies, days, etc.)
async function loadEditProcessData() {
    try {
        const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'));
        const result = await response.json();

        if (result.success) {
            // Populate currency dropdown
            const currencySelect = document.getElementById('edit_currency');
            currencySelect.innerHTML = '<option value="">Select Currency</option>';
            result.currencies.forEach(currency => {
                const option = document.createElement('option');
                option.value = currency.id;
                option.textContent = currency.code;
                currencySelect.appendChild(option);
            });

            // Populate day checkboxes
            const dayCheckboxes = document.getElementById('edit_day_checkboxes');
            dayCheckboxes.innerHTML = '';
            if (result.days && result.days.length > 0) {
                result.days.forEach(day => {
                    const checkboxItem = document.createElement('div');
                    checkboxItem.className = 'checkbox-item';
                    checkboxItem.innerHTML = `
                                <input type="checkbox" id="edit_day_${day.id}" name="edit_day_use[]" value="${day.id}">
                                <label for="edit_day_${day.id}">${day.day_name}</label>
                            `;
                    dayCheckboxes.appendChild(checkboxItem);
                });

                // 为每个 day 复选框添加事件监听器
                dayCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.addEventListener('change', function () {
                        updateAllDayCheckbox('edit');
                    });
                });
            }

            // 为 All Day 复选框添加事件监听器
            const allDayCheckbox = document.getElementById('edit_all_day');
            if (allDayCheckbox) {
                allDayCheckbox.addEventListener('change', function () {
                    const dayCheckboxes = document.querySelectorAll('#edit_day_checkboxes input[type="checkbox"]');
                    dayCheckboxes.forEach(checkbox => {
                        checkbox.checked = this.checked;
                    });
                });
            }
        } else {
            showNotification('Failed to load form data: ' + result.error, 'danger');
        }
    } catch (error) {
        console.error('Error loading edit form data:', error);
        showNotification('Failed to load form data', 'danger');
    }
}

function confirmDescriptions() {
    if (window.selectedDescriptions && window.selectedDescriptions.length > 0) {
        if (descriptionSelectionMode === 'edit') {
            // 编辑模式：更新编辑表单的字段
            const editDescInput = document.getElementById('edit_description');
            if (editDescInput) {
                editDescInput.value = `${window.selectedDescriptions.length} description(s) selected`;
            }
            // 显示选中的描述列表
            displayEditSelectedDescriptions(window.selectedDescriptions);
        } else {
            // 添加模式：更新添加表单的字段
            document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
            // Display selected descriptions
            displaySelectedDescriptions(window.selectedDescriptions);
        }

        closeDescriptionSelectionModal();
    } else {
        showNotification('Please select at least one description', 'danger');
    }
}

function filterDescriptions() {
    const term = (document.getElementById('descriptionSearch')?.value || '').toLowerCase();
    const items = document.querySelectorAll('#existingDescriptions .description-item');
    items.forEach(item => {
        const text = item.querySelector('label')?.textContent?.toLowerCase() || '';
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

// Display selected descriptions
function displaySelectedDescriptions(descriptions) {
    const displayDiv = document.getElementById('selected_descriptions_display');
    const listDiv = document.getElementById('selected_descriptions_list');

    if (descriptions.length > 0) {
        displayDiv.style.display = 'block';
        listDiv.innerHTML = '';

        descriptions.forEach((desc, index) => {
            const descItem = document.createElement('div');
            descItem.className = 'selected-description-item';
            descItem.innerHTML = `
                        <span>${desc.toUpperCase()}</span>
                        <button type="button" class="remove-description" onclick="removeDescription(${index})">&times;</button>
                    `;
            listDiv.appendChild(descItem);
        });

        // Store selected descriptions for form submission
        window.selectedDescriptions = descriptions;
    } else {
        displayDiv.style.display = 'none';
        window.selectedDescriptions = [];
    }
}

// Display selected descriptions for edit mode
function displayEditSelectedDescriptions(descriptions) {
    const displayDiv = document.getElementById('edit_selected_descriptions_display');
    const listDiv = document.getElementById('edit_selected_descriptions_list');

    if (descriptions.length > 0) {
        displayDiv.style.display = 'block';
        listDiv.innerHTML = '';

        descriptions.forEach((desc, index) => {
            const descItem = document.createElement('div');
            descItem.className = 'selected-description-item';
            descItem.innerHTML = `
                        <span>${desc.toUpperCase()}</span>
                        <button type="button" class="remove-description" onclick="removeEditDescription(${index})">&times;</button>
                    `;
            listDiv.appendChild(descItem);
        });

        // Store selected descriptions for form submission
        window.selectedDescriptions = descriptions;
    } else {
        displayDiv.style.display = 'none';
        window.selectedDescriptions = [];
    }
}

// Remove a description from selection
function removeDescription(index) {
    if (window.selectedDescriptions) {
        window.selectedDescriptions.splice(index, 1);
        displaySelectedDescriptions(window.selectedDescriptions);

        // Update input field
        if (window.selectedDescriptions.length > 0) {
            document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
        } else {
            document.getElementById('add_description').value = '';
            document.getElementById('selected_descriptions_display').style.display = 'none';
        }
    }
}

// Remove a description from edit selection
function removeEditDescription(index) {
    if (window.selectedDescriptions) {
        window.selectedDescriptions.splice(index, 1);
        displayEditSelectedDescriptions(window.selectedDescriptions);

        // Update input field
        const editDescInput = document.getElementById('edit_description');
        if (editDescInput) {
            if (window.selectedDescriptions.length > 0) {
                editDescInput.value = `${window.selectedDescriptions.length} description(s) selected`;
            } else {
                editDescInput.value = '';
                document.getElementById('edit_selected_descriptions_display').style.display = 'none';
            }
        }
    }
}

// ===== Multi-use (process_id) helpers =====
function updateSelectedProcessesDisplay() {
    const selectedCheckboxes = document.querySelectorAll('#process_checkboxes input[type="checkbox"]:checked');
    const displayDiv = document.getElementById('selected_processes_display');
    const listDiv = document.getElementById('selected_processes_list');
    if (!displayDiv || !listDiv) return;
    if (selectedCheckboxes.length > 0) {
        displayDiv.style.display = 'block';
        listDiv.innerHTML = '';
        const selected = [];
        selectedCheckboxes.forEach(cb => {
            const pid = cb.value;
            selected.push(pid);
            const item = document.createElement('div');
            item.className = 'selected-process-item';
            item.innerHTML = `
                        <span>${pid}</span>
                        <button type="button" class="remove-process" onclick="removeProcess('${pid}')">&times;</button>
                    `;
            listDiv.appendChild(item);
        });
        window.selectedProcesses = selected;
    } else {
        displayDiv.style.display = 'none';
        listDiv.innerHTML = '';
        if (window.selectedProcesses) window.selectedProcesses = [];
    }
}

function confirmMultiUseProcessSelection() {
    updateSelectedProcessesDisplay();
    const panel = document.getElementById('multi_use_processes');
    if (panel) panel.style.display = 'none';
    const displayDiv = document.getElementById('selected_processes_display');
    if (displayDiv) displayDiv.style.display = (window.selectedProcesses && window.selectedProcesses.length > 0) ? 'block' : 'none';
}

function removeProcess(processId) {
    const cb = document.querySelector(`#process_checkboxes input[type="checkbox"][value="${CSS.escape(processId)}"]`);
    if (cb) {
        cb.checked = false;
        updateSelectedProcessesDisplay();
    }
}

function closeConfirmDeleteModal() {
    document.getElementById('confirmDeleteModal').style.display = 'none';
}

async function confirmDelete() {
    if (pendingDeleteIds.length === 0) {
        closeConfirmDeleteModal();
        return;
    }

    closeConfirmDeleteModal();
    const deleteBtn = document.getElementById('processDeleteSelectedBtn');
    const confirmBtn = document.querySelector('#confirmDeleteModal .confirm-delete');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
    }
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';
    }

    try {
        const body = { ids: pendingDeleteIds };
        if (selectedPermission === 'Bank') {
            body.permission = 'Bank';
        }
        const response = await fetch(buildApiUrl('api/processes/delete_processes_api.php'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();

        if (result.success && result.data && typeof result.data.deleted === 'number') {
            const deletedCount = result.data.deleted;
            const idSet = new Set(pendingDeleteIds.map(String));
            processes = processes.filter(p => !idSet.has(String(p.id)));
            renderTable();
            renderPagination();
            updateDeleteButton();
            updateSelectAllProcessesVisibility();
            showNotification(deletedCount === 1 ? '1 process deleted successfully' : deletedCount + ' processes deleted successfully', 'success');
        } else {
            const msg = result.message || result.error || (result.data && result.data.error) || 'Delete failed';
            showNotification(msg, 'danger');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Delete failed: ' + (error.message || 'Network error'), 'danger');
    } finally {
        pendingDeleteIds = [];
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Delete';
        }
    }
}

// 更新 All Day 复选框状态
function updateAllDayCheckbox(mode) {
    const prefix = mode === 'add' ? 'add' : 'edit';
    const allDayCheckbox = document.getElementById(`${prefix}_all_day`);
    const dayCheckboxes = document.querySelectorAll(`#${prefix === 'add' ? 'day_checkboxes' : 'edit_day_checkboxes'} input[type="checkbox"]`);

    if (allDayCheckbox && dayCheckboxes.length > 0) {
        const allChecked = Array.from(dayCheckboxes).every(checkbox => checkbox.checked);
        allDayCheckbox.checked = allChecked;
    }
}

// 强制输入大写字母
function forceUppercase(input) {
    const cursorPosition = input.selectionStart;
    const upperValue = input.value.toUpperCase();
    input.value = upperValue;
    input.setSelectionRange(cursorPosition, cursorPosition);
}

// 事件监听器
let searchTimeout;
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    // 搜索框：允许字母、数字和空格；保持大写，避免影响现有搜索行为
    searchInput.addEventListener('input', function () {
        const cursorPosition = this.selectionStart;
        const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
        this.value = filteredValue;
        this.setSelectionRange(cursorPosition, cursorPosition);

        // 搜索功能
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            fetchProcesses();
        }, 300);
    });

    // 粘贴事件处理
    searchInput.addEventListener('paste', function () {
        setTimeout(() => {
            const cursorPosition = this.selectionStart;
            const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
            this.value = filteredValue;
            this.setSelectionRange(cursorPosition, cursorPosition);
        }, 0);
    });
}

const showInactiveCheckbox = document.getElementById('showInactive');
if (showInactiveCheckbox) {
    showInactiveCheckbox.addEventListener('change', function () {
        showInactive = this.checked;
        if (showInactive) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        if (selectedPermission === 'Bank') {
            renderTable();
            renderPagination();
        } else {
            fetchProcesses();
        }
    });
}

const showOfficialCheckbox = document.getElementById('showOfficial');
if (showOfficialCheckbox) {
    showOfficialCheckbox.addEventListener('change', function () {
        showOfficial = this.checked;
        if (showOfficial) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

const showEInvoiceCheckbox = document.getElementById('showEInvoice');
if (showEInvoiceCheckbox) {
    showEInvoiceCheckbox.addEventListener('change', function () {
        showEInvoice = this.checked;
        if (showEInvoice) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

const showBlockCheckbox = document.getElementById('showBlock');
if (showBlockCheckbox) {
    showBlockCheckbox.addEventListener('change', function () {
        showBlock = this.checked;
        if (showBlock) showAll = false;
        normalizeBankFilterState();
        currentPage = 1;
        renderTable();
        renderPagination();
    });
}

// Real-time filter when Show All checkbox changes
const showAllCheckbox = document.getElementById('showAll');
if (showAllCheckbox) {
    showAllCheckbox.addEventListener('change', function () {
        showAll = this.checked;
        normalizeBankFilterState();
        currentPage = 1;
        if (selectedPermission === 'Bank') {
            renderTable();
            renderPagination();
        } else {
            fetchProcesses();
        }
    });
}

// 处理添加表单提交
const addProcessForm = document.getElementById('addProcessForm');
if (addProcessForm) {
    addProcessForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        // 获取 multi-use 相关元素
        const multiUseCheckbox = document.getElementById('add_multi_use');
        const processInput = document.getElementById('add_process_id');

        // 验证用户是否选择了 process 或 multi-use processes
        if (!multiUseCheckbox.checked && (!processInput.value || !processInput.value.trim())) {
            showNotification('Please enter Process ID or enable Multi-use Purpose', 'danger');
            return;
        }

        if (multiUseCheckbox.checked && (!window.selectedProcesses || window.selectedProcesses.length === 0)) {
            showNotification('Please select at least one process for Multi-use Purpose', 'danger');
            return;
        }

        // 验证是否选择了描述
        if (!window.selectedDescriptions || window.selectedDescriptions.length === 0) {
            showNotification('Please select at least one description', 'danger');
            return;
        }

        const formData = new FormData(this);

        // 显式带上 Copy From（保证同步源会写入 sync_source_process_id）
        const copyFromHidden = document.getElementById('add_copy_from');
        if (copyFromHidden && copyFromHidden.value && copyFromHidden.value.trim() !== '') {
            formData.set('copy_from', copyFromHidden.value.trim());
        }

        // 添加选中的 descriptions
        formData.append('selected_descriptions', JSON.stringify(window.selectedDescriptions));

        // 添加选中的 processes (如果是 multi-use)
        if (multiUseCheckbox.checked && window.selectedProcesses && window.selectedProcesses.length > 0) {
            formData.append('selected_processes', JSON.stringify(window.selectedProcesses));
        }

        // 添加选中的 day use
        const selectedDays = [];
        document.querySelectorAll('#day_checkboxes input[name="day_use[]"]:checked').forEach(checkbox => {
            selectedDays.push(checkbox.value);
        });
        formData.append('day_use', selectedDays.join(','));

        try {
            const response = await fetch(buildApiUrl('api/processes/addprocess_api.php'), {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                let message = result.message || 'Process added successfully!';
                // 如果有 copy_from 相关的调试信息，添加到消息中
                if (result.copy_from_used !== undefined) {
                    console.log('Copy from used:', result.copy_from_used, 'Sync source set:', result.sync_source_set);
                    console.log('Source templates found:', result.source_templates_found);
                    console.log('Templates copied:', result.copied_templates_count);
                    if (result.copy_from_used && result.source_templates_found === 0) {
                        message += ' (No templates found to copy)';
                    }
                    if (result.copy_from_used && result.sync_source_set) {
                        message += ' [Sync enabled: changes will sync to these processes]';
                    } else if (result.copy_from_used && !result.sync_source_set) {
                        message += ' (Sync not set: source process not found for this company)';
                    }
                }
                showNotification(message, 'success');
                closeAddModal();
                fetchProcesses(); // 刷新列表
            } else {
                let errorMessage = result.error || 'Unknown error occurred';
                showNotification(errorMessage, 'danger');
            }
        } catch (error) {
            console.error('Error adding process:', error);
            showNotification('Failed to add process', 'danger');
        }
    });
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
    var freqOnceEl = document.getElementById('bank_day_start_frequency');
    var freqOnce = freqOnceEl && freqOnceEl.value === 'once';
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
    if (!contract && !freqOnce) { var el = document.getElementById('bank_contract'); if (el) { el.classList.add('bank-field-error'); hasError = true; } }
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
        freqSelectEl.addEventListener('change', function () {
            if (typeof syncBankOnceFrequencyUi === 'function') syncBankOnceFrequencyUi();
            syncBankDayEndContractMin();
        });
    }
}

// Bank Add/Edit 表单 submit 由 bank_process_list.js 绑定（该文件在 processlist.js 之后加载，避免两套 handler 分叉）。

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
    const dayEndEl = document.getElementById('bank_day_end');
    const freqEl = document.getElementById('bank_day_start_frequency');
    if (!dayEndEl || !freqEl) return;

    const minYmd = bankFormDayEndMinYmdAttr(dayEndEl);
    if (minYmd && dayEndEl.value && dayEndEl.value < minYmd) {
        setBankFormDayInputYmd(dayEndEl, minYmd);
    }

    const monthlyOption = freqEl.querySelector('option[value="monthly"]');
    if (monthlyOption) {
        monthlyOption.disabled = false;
    }
}

/** 与 api/processes/billing_schedule.php getBillingTermMonthsFromContract 一致（账单期数；1+1→2 等） */
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

/** Add Process Day end 租期月数：凡「1+N」（1+1 / 1+2 / 1+3）均只算首段 1 个月租期；+N 为损坏罚金不参与租期终点（与入账侧 active 按 1 个月一致） */
function parseBankContractRentalMonthsForDayEnd(contract) {
    if (contract == null || String(contract).trim() === '') {
        return null;
    }
    const c = String(contract).trim();
    if (/^1\+\d+/i.test(c)) {
        return 1;
    }
    return parseBankContractTermMonths(contract);
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

/** 与 billing_schedule.php：exclusive 归还日的前一天 = day_end 最后一天计入 */
function subtractOneDayFromYmd(ymd) {
    if (!ymd) return null;
    const head = String(ymd).trim().substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(head)) return null;
    const p = head.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * 仅用于 Bank 表单 Day end 自动填 / min / dataset.bankContractEndHint；不参与入账。
 * 合同边界以服务端为准；入账仍用 PHP，本函数不改变合同定义。
 * 起租日当月 1 号：monthly 与 1st 均用 addCalendarMonthsToYmd（如 5/1+3M→8/1）。
 * 起租日非 1 号：两种 frequency 均用「起租日 + N 个自然月」再减一天（如 4/15+3M→7/14），不用 1st 锚点日。
 * @param {string} frequency 保留供调用方兼容，非 1 号起租时不再分支。
 */
function contractBillingEndYmdForBankForm(startYmd, termMonths, frequency) {
    if (!startYmd || termMonths == null || termMonths < 1) {
        return null;
    }
    const head = String(startYmd).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!head) {
        return null;
    }
    const startDay = parseInt(head[3], 10);
    if (startDay === 1) {
        return addCalendarMonthsToYmd(startYmd, termMonths);
    }
    const exclusiveCal = addCalendarMonthsToYmd(startYmd, termMonths);
    if (!exclusiveCal) {
        return null;
    }
    return subtractOneDayFromYmd(exclusiveCal) || null;
}

/**
 * Day start + Contract 有有效月数时自动填入 Day end（与 dd/mm 显示同步）。
 * 设置合约对应的 min；早于 min 则上调。
 * 若 Day end 仍等于上次算出的合约结束日，起始日/合约/Frequency 变化后随新结果更新。
 * 合同月数缩短（或起始日变化导致合约结束提前）时：若当前 Day end 仍落在「旧合约结束日及之前」且晚于新结束日，则随新合同收到新结束日。
 * 明显高于旧合约结束日的日期视为尾段延长，不因缩短月数被自动改掉。
 * Day end 自动填由 contractBillingEndYmdForBankForm：1 号起租为起租+N 月；非 1 号为起租+N 月再减一天（与 frequency 入账规则独立）。
 */
function autoCalculateBankDayEnd() {
    const dayStartEl = document.getElementById('bank_day_start');
    const dayEndEl = document.getElementById('bank_day_end');
    const contractEl = document.getElementById('bank_contract');
    if (!dayEndEl) {
        return;
    }
    const freqOnceGuard = document.getElementById('bank_day_start_frequency');
    if (freqOnceGuard && freqOnceGuard.value === 'once') {
        dayEndEl.removeAttribute('min');
        delete dayEndEl.dataset.bankContractEndHint;
        updateBankFrequencyOptions();
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
    const term = parseBankContractRentalMonthsForDayEnd(contract);
    const calculated = term ? contractBillingEndYmdForBankForm(start, term, frequency) : null;
    if (!calculated) {
        dayEndEl.setAttribute('min', start);
        delete dayEndEl.dataset.bankContractEndHint;
        if (dayEndEl.value && dayEndEl.value < start) {
            setBankFormDayInputYmd(dayEndEl, start);
        }
        updateBankFrequencyOptions();
        return;
    }
    dayEndEl.setAttribute('min', calculated);
    const cur = (dayEndEl.value || '').trim();
    if (!cur || cur < calculated || (prevContractEnd && cur === prevContractEnd && calculated !== cur)) {
        setBankFormDayInputYmd(dayEndEl, calculated);
    } else if (prevContractEnd && cur && calculated < prevContractEnd && cur <= prevContractEnd && cur > calculated) {
        setBankFormDayInputYmd(dayEndEl, calculated);
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
                        const displayText = formatBankAccountDisplay(
                            result.data && result.data.account_id,
                            result.data && result.data.name,
                            newAccountId
                        );
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
        document.getElementById('edit_account_id_field').value = formatAccountIdForDisplay(account.account_id).toUpperCase();
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
    ['bank_card_merchant', 'bank_customer', 'bank_profit_account'].forEach(function (buttonId) {
        const btn = document.getElementById(buttonId);
        const dropdown = document.getElementById(buttonId + '_dropdown');
        const optionsContainer = dropdown && dropdown.querySelector('.custom-select-options');
        if (!optionsContainer) return;
        optionsContainer.innerHTML = '';
        accounts.forEach(function (account) {
            const option = document.createElement('div');
            option.className = 'custom-select-option';
            option.setAttribute('data-value', account.id);
            const label = formatBankAccountDisplay(account.account_id, account.name, account.id);
            option.textContent = label;
            option.addEventListener('click', function () {
                if (btn) {
                    btn.textContent = label;
                    btn.setAttribute('data-value', account.id);
                }
                if (dropdown) dropdown.style.display = 'none';
            });
            optionsContainer.appendChild(option);
        });
    });
    syncBankFormAccountButtonLabelsFromAccounts();
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

document.addEventListener('DOMContentLoaded', function () {
    restoreSelectedCountriesFromStorage();
    // Add Account modal: payment alert toggle
    document.querySelectorAll('input[name="add_payment_alert"]').forEach(radio => {
        radio.addEventListener('change', function () { toggleAlertFieldsBank('add'); });
    });
    // Edit Account modal: payment alert toggle
    document.querySelectorAll('input[name="payment_alert"]').forEach(radio => {
        radio.addEventListener('change', function () { toggleAlertFieldsBank('edit'); });
    });
    // Edit Account modal: uppercase for edit_name, edit_remark, editCurrencyInput
    ['edit_name', 'edit_remark', 'editCurrencyInput'].forEach(inputId => {
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
    // Add Account modal: uppercase for account fields and currency input
    ['add_account_id', 'add_name', 'add_remark', 'addCurrencyInput'].forEach(inputId => {
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

    // Bank Add/Edit 表单：必填项变化时更新 Add Process 按钮可用状态
    ['bank_country', 'bank_bank', 'bank_type', 'bank_name', 'bank_day_start', 'bank_day_end', 'bank_cost', 'bank_price', 'bank_contract'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateBankSubmitButtonState);
            el.addEventListener('change', updateBankSubmitButtonState);
        }
    });
    // 统一管理需要大写的输入框（Remarks/Remark 默认大写英语字母）；bank_remark 已改为 SOP 弹窗内编辑，保存时大写
    const uppercaseInputs = [
        'add_process_id',
        'new_description_name',
        'add_remove_words',
        'add_replace_word_from',
        'add_replace_word_to',
        'add_remarks',
        'edit_remove_words',
        'edit_replace_word_from',
        'edit_replace_word_to',
        'edit_remarks'
    ];

    // 为所有需要大写的输入框添加事件监听
    uppercaseInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // 输入时转换为大写
            input.addEventListener('input', function () {
                forceUppercase(this);
            });

            // 粘贴时也转换为大写
            input.addEventListener('paste', function () {
                setTimeout(() => forceUppercase(this), 0);
            });
        }
    });

    // 描述搜索框：允许字母、数字和空格（恢复可输入空格搜索）
    const descSearchInput = document.getElementById('descriptionSearch');
    if (descSearchInput) {
        descSearchInput.addEventListener('input', function () {
            const cursorPosition = this.selectionStart;
            const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
            this.value = filteredValue;
            this.setSelectionRange(cursorPosition, cursorPosition);
        });

        descSearchInput.addEventListener('paste', function () {
            setTimeout(() => {
                const cursorPosition = this.selectionStart;
                const filteredValue = this.value.replace(/[^A-Z0-9 ]/gi, '').toUpperCase();
                this.value = filteredValue;
                this.setSelectionRange(cursorPosition, cursorPosition);
            }, 0);
        });
    }

    // 处理 multi-use 复选框变化
    const multiUseToggle = document.getElementById('add_multi_use');
    const multiUsePanel = document.getElementById('multi_use_processes');
    const processInput = document.getElementById('add_process_id');
    if (multiUseToggle && multiUsePanel && processInput) {
        multiUseToggle.addEventListener('change', async function () {
            if (this.checked) {
                multiUsePanel.style.display = 'block';
                processInput.disabled = true;
                processInput.value = '';
                processInput.style.backgroundColor = '#f8f9fa';
                processInput.style.cursor = 'not-allowed';
                processInput.removeAttribute('required');
                // 勾选 Multi-Process 后：若已选 Copy From，自动将 Description 与 Copy From 的账号同步（含 Data Capture Formula 在提交时由后端复制）
                const copyFromHidden = document.getElementById('add_copy_from');
                if (copyFromHidden && copyFromHidden.value) {
                    try {
                        await syncFormFromCopyFrom(copyFromHidden.value);
                    } catch (e) {
                        console.error('Multi-Process: sync from Copy From failed', e);
                    }
                }
            } else {
                multiUsePanel.style.display = 'none';
                const selectedDisplay = document.getElementById('selected_processes_display');
                if (selectedDisplay) selectedDisplay.style.display = 'none';
                processInput.disabled = false;
                processInput.style.backgroundColor = 'white';
                processInput.style.cursor = 'default';
                processInput.setAttribute('required', 'required');
                const listDiv = document.getElementById('selected_processes_list');
                if (listDiv) listDiv.innerHTML = '';
                if (window.selectedProcesses) window.selectedProcesses = [];
                // uncheck all
                document.querySelectorAll('#process_checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
            }
        });
    }

    // 从 Copy From 同步到表单（含 Description/账号；Data Capture Formula 在提交时由后端复制）
    async function syncFormFromCopyFrom(processId) {
        if (!processId) return;
        const currencySelect = document.getElementById('add_currency');
        if (!currencySelect || currencySelect.options.length <= 1) {
            await loadAddProcessData();
        }
        const response = await fetch(buildApiUrl(`api/processes/addprocess_api.php?action=copy_from&process_id=${processId}`));
        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error(result.error || 'Unknown error');
        }
        const data = result.data;
        // 填充货币
        if (data.currency_id) {
            const currencyIdStr = String(data.currency_id);

            // 函数：尝试设置 currency 值
            const setCurrencyValue = () => {
                // 检查选项是否存在
                const optionExists = Array.from(currencySelect.options).some(opt => opt.value === currencyIdStr);
                if (optionExists) {
                    currencySelect.value = currencyIdStr;
                    console.log('Currency set successfully:', currencyIdStr);
                    return true;
                }
                return false;
            };

            // 立即尝试设置
            if (!setCurrencyValue()) {
                // 如果失败，等待下拉列表加载完成
                console.log('Currency dropdown not ready, waiting...');
                let attempts = 0;
                const maxAttempts = 10; // 减少到10次（1秒）
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (setCurrencyValue() || attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        if (attempts >= maxAttempts && currencySelect.value !== currencyIdStr) {
                            // 检查是否有警告信息
                            if (data.currency_warning) {
                                console.warn('Currency ID', currencyIdStr, 'does not belong to current company. Available options:', Array.from(currencySelect.options).map(opt => ({ value: opt.value, text: opt.text })));
                                showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
                            } else {
                                console.error('Failed to set currency after', maxAttempts, 'attempts. Currency ID:', currencyIdStr, 'Available options:', Array.from(currencySelect.options).map(opt => ({ value: opt.value, text: opt.text })));
                                showNotification('Warning: Currency could not be set automatically. Please select manually.', 'danger');
                            }
                        }
                    }
                }, 100);
            }
        } else if (data.currency_warning) {
            // 如果 currency_id 为空但有警告，说明原货币不属于当前公司
            // 尝试根据货币代码自动匹配当前公司的相同货币
            if (data.currency_code) {
                const currencyCode = data.currency_code.toUpperCase();
                const matchingOption = Array.from(currencySelect.options).find(opt =>
                    opt.textContent.toUpperCase() === currencyCode
                );
                if (matchingOption) {
                    currencySelect.value = matchingOption.value;
                    console.log('Auto-matched currency by code:', currencyCode, '-> ID:', matchingOption.value);
                } else {
                    showNotification('Warning: The original currency (' + currencyCode + ') does not belong to your company. Please select a currency manually.', 'danger');
                }
            } else {
                showNotification('Warning: The original currency does not belong to your company. Please select a currency manually.', 'danger');
            }
        }

        // 填充移除词汇
        if (data.remove_word) {
            document.getElementById('add_remove_words').value = data.remove_word;
        }

        // 填充替换词汇
        if (data.replace_word_from) {
            document.getElementById('add_replace_word_from').value = data.replace_word_from;
        }
        if (data.replace_word_to) {
            document.getElementById('add_replace_word_to').value = data.replace_word_to;
        }

        // 填充备注
        if (data.remark) {
            // 如果 remark 是 JSON 格式，尝试解析
            try {
                const meta = JSON.parse(data.remark);
                if (meta.user_remarks) {
                    document.getElementById('add_remarks').value = meta.user_remarks;
                } else {
                    document.getElementById('add_remarks').value = data.remark;
                }
            } catch (e) {
                document.getElementById('add_remarks').value = data.remark;
            }
        }

        // 填充 day use checkboxes
        if (data.day_use) {
            const dayIdsArray = data.day_use.split(',');
            dayIdsArray.forEach(dayId => {
                const checkbox = document.querySelector(`#day_checkboxes input[name="day_use[]"][value="${dayId.trim()}"]`);
                if (checkbox) checkbox.checked = true;
            });
            // 更新 All Day 复选框状态
            updateAllDayCheckbox('add');
        }

        // 自动选择 description
        if (data.description_name) {
            // 先清空之前选择的 description
            if (window.selectedDescriptions) {
                // 将之前选择的 description 移回可用列表
                window.selectedDescriptions.forEach(descName => {
                    const existingCheckbox = document.querySelector(`#existingDescriptions input[type="checkbox"][value="${CSS.escape(descName)}"]`);
                    if (existingCheckbox) {
                        existingCheckbox.checked = false;
                    }
                });
                window.selectedDescriptions = [];
            }

            // 确保 descriptions 列表已加载
            await loadExistingDescriptions();

            // 查找对应的 description 复选框
            const descriptionName = data.description_name.trim();
            const descriptionCheckbox = document.querySelector(`#existingDescriptions input[type="checkbox"][value="${CSS.escape(descriptionName)}"]`);

            if (descriptionCheckbox) {
                // 选中该复选框
                descriptionCheckbox.checked = true;
                // 移动到已选择列表
                moveDescriptionToSelected(descriptionCheckbox);
                // 更新显示
                document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
                displaySelectedDescriptions(window.selectedDescriptions);
            } else {
                console.warn('Description not found in available list:', descriptionName);
                // 如果找不到，仍然设置到 selectedDescriptions 中
                if (!window.selectedDescriptions) {
                    window.selectedDescriptions = [];
                }
                if (!window.selectedDescriptions.includes(descriptionName)) {
                    window.selectedDescriptions.push(descriptionName);
                    document.getElementById('add_description').value = `${window.selectedDescriptions.length} description(s) selected`;
                    displaySelectedDescriptions(window.selectedDescriptions);
                }
            }
        }
    }

    // 处理 copy-from 下拉选择变化（现为 hidden input，选择时由 initCopyFromSelect 设值并 dispatch change）
    const copyFromHidden = document.getElementById('add_copy_from');
    if (copyFromHidden) {
        copyFromHidden.addEventListener('change', async function () {
            const processId = this.value;
            if (!processId) {
                document.getElementById('add_currency').value = '';
                document.getElementById('add_remove_words').value = '';
                document.getElementById('add_replace_word_from').value = '';
                document.getElementById('add_replace_word_to').value = '';
                document.getElementById('add_remarks').value = '';
                document.querySelectorAll('#day_checkboxes input[name="day_use[]"]').forEach(cb => cb.checked = false);
                if (window.selectedDescriptions) window.selectedDescriptions = [];
                document.getElementById('add_description').value = '';
                document.getElementById('selected_descriptions_display').style.display = 'none';
                document.getElementById('selected_descriptions_list').innerHTML = '';
                document.querySelectorAll('#existingDescriptions input[type="checkbox"]').forEach(cb => cb.checked = false);
                return;
            }
            try {
                await syncFormFromCopyFrom(processId);
            } catch (error) {
                console.error('Error loading copy-from data:', error);
                showNotification('Failed to load process data: ' + (error.message || 'Unknown error'), 'danger');
            }
        });
    }

    // Copy From：与 Select Process 一致的可搜索下拉（展开/搜索/选择）
    function initCopyFromSelect() {
        const btn = document.getElementById('add_copy_from_btn');
        const dropdown = document.getElementById('add_copy_from_dropdown');
        const searchInput = dropdown?.querySelector('.custom-select-search input');
        const optionsContainer = dropdown?.querySelector('.custom-select-options');
        const hiddenInput = document.getElementById('add_copy_from');
        if (!btn || !dropdown || !searchInput || !optionsContainer || !hiddenInput) return;
        let isOpen = false;

        function updateCopyFromFilter(filterText) {
            const filterLower = (filterText || '').toLowerCase().trim();
            const allOptions = Array.from(optionsContainer.querySelectorAll('.custom-select-option'));
            allOptions.forEach(opt => {
                const text = (opt.textContent || '').toLowerCase();
                opt.style.display = !filterLower || text.includes(filterLower) ? '' : 'none';
            });
            let noResults = dropdown.querySelector('.custom-select-no-results');
            const visibleCount = allOptions.filter(o => o.style.display !== 'none').length;
            if (visibleCount === 0 && filterLower) {
                if (!noResults) {
                    noResults = document.createElement('div');
                    noResults.className = 'custom-select-no-results';
                    noResults.textContent = 'No results found';
                    optionsContainer.appendChild(noResults);
                }
                noResults.style.display = 'block';
            } else if (noResults) noResults.style.display = 'none';
        }

        function closeDropdown() {
            isOpen = false;
            dropdown.classList.remove('show');
            btn.classList.remove('open');
        }

        function selectCopyFromOption(option) {
            const value = option.getAttribute('data-value');
            const text = option.textContent || '';
            hiddenInput.value = value || '';
            btn.textContent = value ? text : (btn.getAttribute('data-placeholder') || 'Select Process to Copy From');
            optionsContainer.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
            closeDropdown();
        }

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            isOpen = !isOpen;
            if (isOpen) {
                dropdown.classList.add('show');
                btn.classList.add('open');
                searchInput.value = '';
                updateCopyFromFilter('');
                setTimeout(function () { searchInput.focus(); }, 10);
            } else closeDropdown();
        });
        searchInput.addEventListener('input', function () { updateCopyFromFilter(this.value); });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeDropdown();
        });
        optionsContainer.addEventListener('click', function (e) {
            const option = e.target.closest('.custom-select-option');
            if (option && option.style.display !== 'none') selectCopyFromOption(option);
        });
        document.addEventListener('click', function (e) {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
        });
    }
    initCopyFromSelect();

    // 检查 URL 参数并显示相应的消息
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');
    const successParam = urlParams.get('success');

    if (errorParam === 'process_linked_to_formula') {
        showNotification('Cannot delete: This process is linked to a formula. Please remove the related formula records first.', 'danger');
        // 清除 URL 参数
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'bank_has_day_start') {
        showNotification('Delete failed: Processes with Day Start set cannot be deleted.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'no_inactive_processes') {
        showNotification('Cannot delete: Only inactive processes can be deleted.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'process_has_transactions') {
        showNotification('Cannot delete: This process has transaction records. Remove related transactions first.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorParam === 'delete_failed') {
        showNotification('Delete failed. Please try again.', 'danger');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (successParam === 'deleted') {
        showNotification('Deleted successfully!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    initProcessListDateFilter();
    if (window.MaintenanceDateRangePicker && typeof window.MaintenanceDateRangePicker.initBankFormDayPickers === 'function') {
        window.MaintenanceDateRangePicker.initBankFormDayPickers();
    }
    console.log('DOM loaded, calling fetchProcesses...');
    try {
        loadPermissionButtons().then(() => {
            if (!window._isRedirecting) {
                fetchProcesses();
            }
        });
    } catch (error) {
        console.error('Error in fetchProcesses:', error);
        showError('Error loading data: ' + error.message);
    }

    const accountingInboxBtn = document.getElementById('processAccountingInboxBtn');
    if (accountingInboxBtn) {
        accountingInboxBtn.addEventListener('click', () => {
            const modal = document.getElementById('processAccountingDueModal');
            if (modal && modal.style.display === 'block') {
                closeAccountingDueModal();
            } else {
                openAccountingDueModal();
            }
        });
    }
    const accountingInboxRefresh = document.getElementById('processAccountingInboxRefreshBtn');
    if (accountingInboxRefresh) {
        accountingInboxRefresh.addEventListener('click', () => loadAccountingInbox());
    }
    const accountingInboxPost = document.getElementById('processAccountingInboxPostBtn');
    if (accountingInboxPost) {
        accountingInboxPost.addEventListener('click', () => postAccountingInboxToTransaction());
    }
    /* Accounting Due 弹窗：点击弹窗以外区域不关闭，仅通过 X 或 Cancel 关闭 */
});

window.addEventListener('resize', function () {
    if (selectedPermission === 'Bank') {
        const bankModule = getBankProcessModule();
        if (bankModule && typeof bankModule.syncBankTableColumnWidth === 'function') {
            bankModule.syncBankTableColumnWidth();
        } else {
            syncBankTableColumnWidth();
        }
    }
});

// 浏览器后退/前进时还原 category 状态（配合 history.pushState 实现的无刷新切换）
window.addEventListener('popstate', function (e) {
    try {
        const pageName = window.location.pathname.replace(/.*\//, '');
        const permission = (pageName === 'bank_process_list.php') ? 'Bank' : 'Games';
        if (permission !== selectedPermission) {
            // 直接执行原地切换（不再 pushState，避免递归）
            selectedPermission = permission;
            updateProcessListPageTitle(permission);
            if (permission === 'Bank') {
                document.body.classList.add('process-page--bank');
            } else {
                document.body.classList.remove('process-page--bank');
            }
            const buttons = document.querySelectorAll('#process-list-permission-buttons .process-company-btn');
            buttons.forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.permission === permission);
            });
            const processTableWrapperEl = document.getElementById('processTableWrapper');
            const bankTableWrapperEl = document.getElementById('bankTableWrapper');
            if (permission === 'Bank') {
                if (processTableWrapperEl) processTableWrapperEl.style.display = 'none';
                if (bankTableWrapperEl) bankTableWrapperEl.style.display = 'block';
            } else {
                if (processTableWrapperEl) processTableWrapperEl.style.display = 'grid';
                if (bankTableWrapperEl) bankTableWrapperEl.style.display = 'none';
            }
            updateProcessListDateFilterVisibility();
            updateBankListScrollMode();
            currentPage = 1;
            fetchProcesses();
        }
    } catch (err) {
        // 降级：刷新页面
        window.location.reload();
    }
});

// 加载权限按钮
async function loadPermissionButtons() {
    const currentCompanyId = (typeof window.PROCESSLIST_COMPANY_ID !== 'undefined' ? window.PROCESSLIST_COMPANY_ID : null);
    const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');
    const permissionFilterEl = document.getElementById('process-list-permission-filter');
    const permissionContainer = document.getElementById('process-list-permission-buttons');

    if (!currentCompanyCode) {
        if (permissionFilterEl) permissionFilterEl.style.display = 'none';
        return;
    }

    try {
        const response = await fetch('api/domain/domain_api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get_company_permissions',
                company_id: currentCompanyCode
            })
        });

        const result = await response.json();
        let permissions = result.success && result.data && result.data.permissions ? result.data.permissions : ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
        // 兼容旧数据：数据库可能仍是 "Gambling"，统一为 "Games" 显示与逻辑
        permissions = [...new Set(permissions.map(p => p === 'Gambling' ? 'Games' : p))];

        permissionContainer.innerHTML = '';

        if (permissions.length > 0) {
            if (permissionFilterEl) {
                permissionFilterEl.style.display = (hidePermissionFilter || permissions.length <= 1) ? 'none' : 'flex';
            }

            permissions.forEach(permission => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'process-company-btn';
                btn.textContent = permission;
                btn.dataset.permission = permission;
                btn.onclick = () => switchPermission(permission);
                permissionContainer.appendChild(btn);
            });

            // 尝试从 localStorage 恢复之前选择的权限（兼容旧值 Gambling）
            let savedPermission = localStorage.getItem(`selectedPermission_${currentCompanyCode}`);
            if (savedPermission === 'Gambling') savedPermission = 'Games';
            if (forcedPermission && permissions.includes(forcedPermission)) {
                switchPermission(forcedPermission);
            } else if (savedPermission && permissions.includes(savedPermission)) {
                switchPermission(savedPermission);
            } else if (permissions.length > 0 && !selectedPermission) {
                // 如果没有保存的权限，默认选择第一个
                switchPermission(permissions[0]);
            }
        } else {
            if (permissionFilterEl) permissionFilterEl.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading permissions:', error);
        if (permissionFilterEl) permissionFilterEl.style.display = 'none';
    }
}

// 切换权限
function switchPermission(permission) {
    const targetPage = getProcessListPageByPermission(permission);
    // 使用 history.pushState 无刷新更新 URL（替代全页跳转，消除白屏卡顿）
    // 注：currentProcessListPage 是 const 不会更新，必须从实时 URL 读取当前页名做比较
    if (targetPage) {
        const _currentPageName = window.location.pathname.replace(/.*\//, '');
        if (targetPage !== _currentPageName) {
            try {
                const _pUrl = new URL(window.location.href);
                _pUrl.pathname = _pUrl.pathname.replace(/[^/]*$/, targetPage);
                history.pushState({ permission: permission, page: targetPage }, '', _pUrl.toString());
            } catch (e) { /* 降级：正常跳转 */ window.location.href = window.location.href.replace(/[^/]*$/, targetPage); return; }
        }
    }

    selectedPermission = permission;
    updateProcessListPageTitle(permission);

    // Bank 列表：外层 .container 纵向滚动；与 processlist.php 上 PHP 注入的 process-page--bank 一致（同页切换 Category 时补齐）
    if (permission === 'Bank') {
        document.body.classList.add('process-page--bank');
    } else {
        document.body.classList.remove('process-page--bank');
    }

    // 保存到 localStorage
    const currentCompanyCode = (typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' ? window.PROCESSLIST_COMPANY_CODE : '');
    if (currentCompanyCode) {
        localStorage.setItem(`selectedPermission_${currentCompanyCode}`, permission);
    }

    // 更新按钮状态
    const buttons = document.querySelectorAll('#process-list-permission-buttons .process-company-btn');
    buttons.forEach(btn => {
        if (btn.dataset.permission === permission) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 根据类别更新表格头部
    const gamblingHeaders = document.querySelectorAll('.gambling-header');
    const bankHeaders = document.querySelectorAll('.bank-header');
    const selectAllGambling = document.getElementById('selectAllProcesses');
    const selectAllBank = document.getElementById('selectAllBankProcesses');
    const tableHeader = document.getElementById('tableHeader');
    const processCards = document.querySelectorAll('.process-card');

    const processTableBodyEl = document.getElementById('processTableBody');
    const processTableWrapperEl = document.getElementById('processTableWrapper');
    const bankTableWrapperEl = document.getElementById('bankTableWrapper');
    if (permission === 'Bank') {
        if (processTableWrapperEl) processTableWrapperEl.style.display = 'none';
        if (bankTableWrapperEl) bankTableWrapperEl.style.display = 'block';
        if (processTableBodyEl) processTableBodyEl.classList.add('bank-mode');
        gamblingHeaders.forEach(header => header.style.display = 'none');
        bankHeaders.forEach(header => header.style.display = 'flex');
        if (selectAllGambling) selectAllGambling.style.display = 'none';
        if (selectAllBank) selectAllBank.style.display = 'inline-block';
        if (tableHeader) tableHeader.style.gridTemplateColumns = BANK_GRID_TEMPLATE_COLUMNS;
        processCards.forEach(card => { card.style.gridTemplateColumns = BANK_GRID_TEMPLATE_COLUMNS; });
    } else {
        if (processTableWrapperEl) processTableWrapperEl.style.display = 'grid';
        if (bankTableWrapperEl) bankTableWrapperEl.style.display = 'none';
        if (processTableBodyEl) processTableBodyEl.classList.remove('bank-mode');
        if (processTableBodyEl) processTableBodyEl.style.removeProperty('--table-header-width');
        // 显示 Games 表格头部，隐藏 Bank 表格头部
        gamblingHeaders.forEach(header => header.style.display = 'flex');
        bankHeaders.forEach(header => header.style.display = 'none');
        if (selectAllGambling) selectAllGambling.style.display = 'inline-block';
        if (selectAllBank) selectAllBank.style.display = 'none';

        // 恢复 Games 表格的列数（7列）
        if (tableHeader) {
            // Restore original columns, allocating more space to Status AND matching the row exactly
            tableHeader.style.gridTemplateColumns = '0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr 0.2fr';
        }
        processCards.forEach(card => {
            card.style.gridTemplateColumns = '0.3fr 0.8fr 0.95fr 0.35fr 0.3fr 1.1fr 0.2fr';
        });
    }

    updateProcessListDateFilterVisibility();
    updateBankOnlyFiltersVisibility();

    // Post to Transaction 仅 Bank 显示，Games 隐藏
    updatePostToTransactionButton();
    // Accounting Due Inbox: show only on Bank
    updateAccountingInboxVisibility();

    if (typeof window.updateSidebarDataCaptureVisibility === 'function' && typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined') {
        window.updateSidebarDataCaptureVisibility(window.SIDEBAR_COMPANY_HAS_GAMBLING, window.SIDEBAR_COMPANY_HAS_BANK);
    }

    updateBankListScrollMode();

    // 重新加载数据
    currentPage = 1;
    fetchProcesses();
}

async function switchProcessListCompany(companyId) {
    // 先更新 session
    try {
        const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
        const result = await response.json();
        if (!result.success) {
            const blocked = (typeof window.handleCompanySwitchDenied === 'function')
                ? await window.handleCompanySwitchDenied(result)
                : false;
            if (blocked) return;
            console.error('Failed to update session:', result.error);
            // 非到期/未设置类错误：保持原行为
        }
    } catch (error) {
        console.error('Error updating session:', error);
        // 即使 API 失败，也继续刷新页面（PHP 端会处理）
    }

    const url = new URL(window.location.href);
    url.searchParams.set('company_id', companyId);
    window.location.href = url.toString();
}