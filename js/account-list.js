/* account-list.js - 依赖 PHP 中最小化 script 输出的 window.ACCOUNT_LIST_* 变量 */
(function () {
    if (typeof window.ACCOUNT_LIST_SHOW_INACTIVE === 'undefined') window.ACCOUNT_LIST_SHOW_INACTIVE = false;
    if (typeof window.ACCOUNT_LIST_SHOW_ALL === 'undefined') window.ACCOUNT_LIST_SHOW_ALL = false;
    if (typeof window.ACCOUNT_LIST_COMPANY_ID === 'undefined') window.ACCOUNT_LIST_COMPANY_ID = null;
    if (typeof window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD === 'undefined') window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD = [];
})();

// Notification functions - 与 userlist 保持一致
function showNotification(message, type = 'success') {
    const container = document.getElementById('accountNotificationContainer');
    if (!container) return;
    const existingNotifications = container.querySelectorAll('.account-notification');
    if (existingNotifications.length >= 2) {
        const oldestNotification = existingNotifications[0];
        oldestNotification.classList.remove('show');
        setTimeout(function () {
            if (oldestNotification && oldestNotification.parentNode) {
                oldestNotification.remove();
            }
        }, 300);
    }

    // 鍒涘缓鏂伴€氱煡
    const notification = document.createElement('div');
    notification.className = `account-notification account-notification-${type}`;
    notification.textContent = message;

    // 娣诲姞鍒板鍣?
    container.appendChild(notification);

    // 瑙﹀彂鏄剧ず鍔ㄧ敾
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // 1.5绉掑悗寮€濮嬫秷澶卞姩鐢?
    setTimeout(() => {
        notification.classList.remove('show');
        // 0.3绉掑悗瀹屽叏绉婚櫎
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 1500);
}

// Confirm delete modal functions
let deleteCallback = null;
let deleteParams = null;

function showConfirmDelete(message, callback, ...params) {
    const modal = document.getElementById('confirmDeleteModal');
    const messageEl = document.getElementById('confirmDeleteMessage');

    messageEl.textContent = message;
    deleteCallback = callback;
    deleteParams = params;

    modal.style.display = 'block';
}

function closeConfirmDeleteModal() {
    const modal = document.getElementById('confirmDeleteModal');
    modal.style.display = 'none';
    deleteCallback = null;
    deleteParams = null;
}

function confirmDelete() {
    if (deleteCallback && deleteParams) {
        deleteCallback(...deleteParams);
    }
    closeConfirmDeleteModal();
}


const PAGE_SIZE = 20;
let accounts = [];
let currentPage = 1;
let showInactive = window.ACCOUNT_LIST_SHOW_INACTIVE;
let showAll = window.ACCOUNT_LIST_SHOW_ALL;

// 鎺掑簭鐘舵€?
let sortColumn = 'account'; // 'account' 鎴?'role'
let sortDirection = 'asc'; // 'asc' 鎴?'desc'

// 浠嶢PI鑾峰彇鏁版嵁
async function fetchAccounts() {
    try {
        const searchInput = document.getElementById('searchInput');
        const searchTerm = searchInput ? searchInput.value : '';
        const url = new URL('api/accounts/accountlistapi.php', window.location.href);

        // 娣诲姞褰撳墠閫夋嫨鐨?company_id
        const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID
        if (currentCompanyId !== null && currentCompanyId !== undefined && currentCompanyId !== '') {
            url.searchParams.set('company_id', currentCompanyId)
        }

        if (searchTerm.trim()) {
            url.searchParams.set('search', searchTerm);
        }
        if (showInactive) {
            url.searchParams.set('showInactive', '1');
        }
        if (showAll) {
            url.searchParams.set('showAll', '1');
        }

        const response = await fetch(url);
        const result = await response.json();

        if (result.success) {
            accounts = result.data && result.data.accounts ? result.data.accounts : (result.data || []);
            // 搴旂敤褰撳墠鎺掑簭
            applySorting();
            currentPage = 1;
            renderTable();
            renderPagination();
            updateDeleteButton(); // 鏇存柊鍒犻櫎鎸夐挳鐘舵€?
        } else {
            console.error('API error:', result.message || result.error);
            showNotification('Failed to get data: ' + (result.message || result.error), 'danger');
        }
    } catch (error) {
        console.error('Network error:', error);
        showNotification('Network connection failed', 'danger');
    }
}

window.fetchAccounts = fetchAccounts;

function renderTable() {
    const container = document.getElementById('accountTableBody');
    container.innerHTML = '';

    if (accounts.length === 0) {
        container.innerHTML = `
                    <div class="account-card">
                        <div class="account-card-item" style="text-align: center; padding: 20px; grid-column: 1 / -1;">
                            No account data found
                        </div>
                    </div>
                `;
        renderPagination();
        return;
    }

    let pageItems;
    let startIndex;

    // showAll 模式：只显示 active 账户，一页展示所有数据
    let displayAccounts = accounts;
    if (showAll) {
        displayAccounts = accounts.filter(acc => acc.status === 'active');
        startIndex = 0;
        pageItems = displayAccounts;
    } else {
        const totalPages = Math.max(1, Math.ceil(displayAccounts.length / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;
        startIndex = (currentPage - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, displayAccounts.length);
        pageItems = displayAccounts.slice(startIndex, endIndex);
    }

    pageItems.forEach((account, idx) => {
        const card = document.createElement('div');
        card.className = 'account-card';
        card.setAttribute('data-id', account.id);

        const statusClass = account.status === 'active' ? 'account-status-active' : 'account-status-inactive';

        // 妫€鏌?payment_alert 鐘舵€侊紙澶勭悊鍚勭鏁版嵁绫诲瀷锛?
        const hasPaymentAlert = account.payment_alert == 1 || account.payment_alert === true || account.payment_alert === '1' || parseInt(account.payment_alert) === 1;
        const alertClass = hasPaymentAlert ? 'account-status-active' : 'account-status-inactive';
        const alertText = hasPaymentAlert ? 'ON' : 'OFF';

        // 鏍规嵁role鍐冲畾account_id鐨勬樉绀烘牸寮?
        // 绉婚櫎鎷彿涓殑鍚嶅瓧锛屽彧鏄剧ず account_id
        const accountIdText = escapeHtml((account.account_id || '').toUpperCase());
        const accountIdDisplay = accountIdText;

        card.innerHTML = `
                    <div class="account-card-item">${startIndex + idx + 1}</div>
                    <div class="account-card-item">${accountIdDisplay}</div>
                    <div class="account-card-item">${escapeHtml((account.name || '').toUpperCase())}</div>
                    <div class="account-card-item">
                        <span class="account-role-badge account-role-${account.role ? account.role.toLowerCase().replace(/\s+/g, '-') : 'none'}">
                            ${escapeHtml((account.role || '').toUpperCase() === 'UPLINE' ? 'SUPPLIER' : (account.role || '').toUpperCase())}
                        </span>
                    </div>
                    <div class="account-card-item">
                        <span class="account-role-badge ${alertClass} account-status-clickable" onclick="togglePaymentAlert(${account.id}, ${hasPaymentAlert ? 1 : 0})" title="Click to toggle payment alert">
                            ${alertText}
                        </span>
                    </div>
                    <div class="account-card-item">
                        <span class="account-role-badge ${statusClass} account-status-clickable" onclick="toggleAccountStatus(${account.id}, '${account.status}')" title="Click to toggle status">
                            ${escapeHtml((account.status || '').toUpperCase())}
                        </span>
                    </div>
                    <div class="account-card-item">${escapeHtml((account.last_login || '').toUpperCase())}</div>
                    <div class="account-card-item">${escapeHtml((account.remark || '').toUpperCase())}</div>
                    <div class="account-card-item">
                        <button class="account-edit-btn" onclick="editAccount(${account.id})" aria-label="Edit" title="Edit">
                            <img src="images/edit.svg" alt="Edit" />
                        </button>
                        <button class="account-edit-btn" onclick="linkAccount(${account.id})" aria-label="Link Account" title="Link Account" style="margin-left: 5px;">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 3V13M3 8H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </button>
                        ${account.status === 'active' ? '' : `<input type="checkbox" class="account-row-checkbox" data-id="${account.id}" title="Select for deletion" onchange="updateDeleteButton()" style="margin-left: 10px;">`}
                    </div>
                `;
        container.appendChild(card);
    });
    renderPagination();
    updateSelectAllAccountsVisibility();
}

function renderPagination() {
    const paginationContainer = document.getElementById('paginationContainer');

    // showAll 模式：隐藏分页控件
    if (showAll) {
        paginationContainer.style.display = 'none';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));

    // 鏇存柊鍒嗛〉鎺т欢淇℃伅
    document.getElementById('paginationInfo').textContent = `${currentPage} of ${totalPages}`;

    // 鏇存柊鎸夐挳鐘舵€?
    const isPrevDisabled = currentPage <= 1;
    const isNextDisabled = currentPage >= totalPages;

    document.getElementById('prevBtn').disabled = isPrevDisabled;
    document.getElementById('nextBtn').disabled = isNextDisabled;

    // 濡傛灉鍙湁涓€椤垫垨娌℃湁鏁版嵁锛岄殣钘忓垎椤垫帶浠?
    if (accounts.length === 0) {
        paginationContainer.style.display = 'none';
    } else {
        paginationContainer.style.display = 'flex';
    }
}

function changePage(newPage) {
    const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
    if (newPage < 1 || newPage > totalPages) return;
    currentPage = newPage;
    renderTable();
}

window.c168AccountListPrevPage = function () {
    changePage(currentPage - 1);
};
window.c168AccountListNextPage = function () {
    changePage(currentPage + 1);
};

function showError(message) {
    const container = document.getElementById('accountTableBody');
    container.innerHTML = `
                <div class="account-card">
                    <div class="account-card-item" style="text-align: center; padding: 20px; color: red; grid-column: 1 / -1;">
                        ${escapeHtml(message)}
                    </div>
                </div>
            `;
    showNotification(message, 'danger');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 鎺掑簭鍑芥暟
function applySorting() {
    if (sortColumn === 'account') {
        accounts.sort((a, b) => {
            const aKey = String(a.account_id || '').toLowerCase();
            const bKey = String(b.account_id || '').toLowerCase();
            let result = 0;
            if (aKey < bKey) result = -1;
            else if (aKey > bKey) result = 1;
            else {
                // 濡傛灉 account_id 鐩稿悓锛屾寜 name 鎺掑簭
                const aName = String(a.name || '').toLowerCase();
                const bName = String(b.name || '').toLowerCase();
                if (aName < bName) result = -1;
                else if (aName > bName) result = 1;
            }
            return sortDirection === 'asc' ? result : -result;
        });
    } else if (sortColumn === 'role') {
        const roleOrder = {};
        ROLE_PRIORITY.forEach((role, index) => {
            roleOrder[role] = index;
        });

        let dynamicIndex = ROLE_PRIORITY.length;
        const registerRole = (roleValue) => {
            let normalized = String(roleValue || '').toUpperCase().trim();
            if (!normalized) return;
            // 兼容性：如果数据库中是 UPLINE，按 SUPPLIER 的优先级排序
            if (normalized === 'UPLINE') {
                normalized = 'SUPPLIER';
            }
            if (roleOrder[normalized] === undefined) {
                roleOrder[normalized] = dynamicIndex++;
            }
        };

        (roles || []).forEach(registerRole);
        accounts.forEach(account => registerRole(account.role));

        accounts.sort((a, b) => {
            const aRole = String(a.role || '').toUpperCase().trim();
            const bRole = String(b.role || '').toUpperCase().trim();

            // 兼容性：列表排序时也将 UPLINE 按 SUPPLIER 的优先级处理，确保与下拉顺序一致
            const aRoleForOrder = aRole === 'UPLINE' ? 'SUPPLIER' : aRole;
            const bRoleForOrder = bRole === 'UPLINE' ? 'SUPPLIER' : bRole;

            const aOrder = roleOrder[aRoleForOrder] !== undefined ? roleOrder[aRoleForOrder] : 9999;
            const bOrder = roleOrder[bRoleForOrder] !== undefined ? roleOrder[bRoleForOrder] : 9999;

            let result = 0;
            if (aOrder < bOrder) result = -1;
            else if (aOrder > bOrder) result = 1;
            else {
                // 濡傛灉灞傜骇鐩稿悓锛屾寜 role 鍚嶇О瀛楁瘝椤哄簭鎺掑簭
                if (aRoleForOrder < bRoleForOrder) result = -1;
                else if (aRoleForOrder > bRoleForOrder) result = 1;
                else {
                    // 濡傛灉 role 涔熺浉鍚岋紝鎸?account_id 鎺掑簭
                    const aKey = String(a.account_id || '').toLowerCase();
                    const bKey = String(b.account_id || '').toLowerCase();
                    if (aKey < bKey) result = -1;
                    else if (aKey > bKey) result = 1;
                }
            }
            return sortDirection === 'asc' ? result : -result;
        });
    }
    updateSortIndicators();
}

// 鏇存柊鎺掑簭鎸囩ず鍣?
function updateSortIndicators() {
    const accountIndicator = document.getElementById('sortAccountIndicator');
    const roleIndicator = document.getElementById('sortRoleIndicator');

    if (!accountIndicator || !roleIndicator) return;

    if (sortColumn === 'account') {
        accountIndicator.textContent = sortDirection === 'asc' ? '\u25B2' : '\u25BC';
        accountIndicator.style.display = 'inline';
        roleIndicator.textContent = '\u25B2'; // 鏈€変腑鏃舵樉绀洪粯璁ょ澶?
        roleIndicator.style.display = 'inline';
    } else if (sortColumn === 'role') {
        roleIndicator.textContent = sortDirection === 'asc' ? '\u25B2' : '\u25BC';
        roleIndicator.style.display = 'inline';
        accountIndicator.textContent = '\u25B2'; // 鏈€変腑鏃舵樉绀洪粯璁ょ澶?
        accountIndicator.style.display = 'inline';
    }
}

// 鎸?Account 鎺掑簭
function sortByAccount() {
    if (sortColumn === 'account') {
        // 鍒囨崲鎺掑簭鏂瑰悜
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 鍒囨崲鍒?account 鎺掑簭锛岄粯璁ゅ崌搴?
        sortColumn = 'account';
        sortDirection = 'asc';
    }
    applySorting();
    currentPage = 1;
    renderTable();
    renderPagination();
}

// 鎸?Role 鎺掑簭
function sortByRole() {
    if (sortColumn === 'role') {
        // 鍒囨崲鎺掑簭鏂瑰悜
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 鍒囨崲鍒?role 鎺掑簭锛岄粯璁ゅ崌搴?
        sortColumn = 'role';
        sortDirection = 'asc';
    }
    applySorting();
    currentPage = 1;
    renderTable();
    renderPagination();
}

async function addAccount() {
    // Show add account modal
    document.getElementById('addModal').style.display = 'block';
    // 鍔犺浇鎵€鏈夎揣甯佷负寮€鍏冲紡
    await loadAccountCurrencies(null, 'add');
    // 鍔犺浇鎵€鏈夊叕鍙镐负寮€鍏冲紡
    await loadAccountCompanies(null, 'add');
}

function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
    document.getElementById('addAccountForm').reset();
    // 閲嶇疆閫変腑鐨勮揣甯佸垪琛?
    selectedCurrencyIdsForAdd = [];
    // 閲嶇疆宸插垹闄ょ殑璐у竵鍒楄〃
    deletedCurrencyIds = [];
    // 閲嶇疆閫変腑鐨勫叕鍙稿垪琛紝淇濈暀褰撳墠鍏徃
    const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
    selectedCompanyIdsForAdd = currentCompanyId ? [currentCompanyId] : [];
}

let currencies = [];
let roles = [];
const ROLE_PRIORITY = ['CAPITAL', 'BANK', 'CASH', 'PROFIT', 'EXPENSES', 'COMPANY', 'PARTNER', 'STAFF', 'SUPPLIER', 'AGENT', 'MEMBER', 'DEBTOR'];

function getOrderedRoles(includeStaff = true) {
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

    // 确保 PARTNER 始终作为一个可选项，即使数据库中目前没有这个角色的账户
    if (!normalizedMap.has('PARTNER')) {
        normalizedMap.set('PARTNER', 'PARTNER');
    }

    if (!normalizedMap.has('DEBTOR')) {
        normalizedMap.set('DEBTOR', 'DEBTOR');
    }

    const orderedRoles = [];
    ROLE_PRIORITY.forEach(role => {
        if (normalizedMap.has(role)) {
            orderedRoles.push(normalizedMap.get(role));
            normalizedMap.delete(role);
        } else if (role === 'SUPPLIER' && normalizedMap.has('UPLINE')) {
            // 兼容性映射：将数据库里的 UPLINE 数据放入 SUPPLIER 的排序位置
            orderedRoles.push(normalizedMap.get('UPLINE'));
            normalizedMap.delete('UPLINE');
        }
    });

    const remaining = Array.from(normalizedMap.values()).sort((a, b) => a.localeCompare(b));
    return orderedRoles.concat(remaining);
}

function populateRoleSelect(selectElement, selectedRole = '', includeStaff = true) {
    if (!selectElement) return;
    const orderedRoles = getOrderedRoles(includeStaff);
    const selectedUpper = (selectedRole || '').toUpperCase();
    selectElement.innerHTML = '<option value="">Select Role</option>';

    orderedRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        // 将 UPLINE 显示为 SUPPLIER
        option.textContent = (role.toUpperCase() === 'UPLINE') ? 'SUPPLIER' : role;
        if (selectedUpper && role.toUpperCase() === selectedUpper) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });

    if (selectedUpper && !orderedRoles.some(role => role.toUpperCase() === selectedUpper)) {
        const fallbackOption = document.createElement('option');
        fallbackOption.value = selectedRole;
        // 将 UPLINE 显示为 SUPPLIER
        fallbackOption.textContent = (selectedRole.toUpperCase() === 'UPLINE') ? 'SUPPLIER' : selectedRole;
        fallbackOption.selected = true;
        selectElement.appendChild(fallbackOption);
    }
}

// Load currencies and roles for edit modal
async function loadEditData() {
    try {
        const response = await fetch('/api/editdata/editdata_api.php');
        const result = await response.json();

        if (result.success && result.data) {
            currencies = result.data.currencies || [];
            roles = result.data.roles || [];

            // Populate add modal dropdowns
            populateAddModalDropdowns();

            // 濡傛灉褰撳墠鏄寜 role 鎺掑簭锛岄噸鏂板簲鐢ㄦ帓搴忥紙鍥犱负 roles 鏁扮粍鐜板湪宸插姞杞斤級
            if (sortColumn === 'role' && accounts.length > 0) {
                applySorting();
                renderTable();
                renderPagination();
            }

            // 鍒濆鍖栨帓搴忔寚绀哄櫒锛堝湪 roles 鍔犺浇鍚庯級
            updateSortIndicators();
        }
    } catch (error) {
        console.error('Error loading edit data:', error);
    }
}

// Populate add modal dropdowns
function populateAddModalDropdowns() {
    // Populate role dropdown
    const addRoleSelect = document.getElementById('add_role');
    populateRoleSelect(addRoleSelect);

    // Currency selection is now handled via fixed buttons in the Advanced section
    const addCurrencyList = document.getElementById('addCurrencyList');
    if (addCurrencyList) {
        addCurrencyList.innerHTML = '';
    }
}

// 瀛樺偍褰撳墠缂栬緫鐨勮处鎴稩D
let currentEditAccountId = null;

// 瀛樺偍娣诲姞璐︽埛鏃堕€変腑鐨勮揣甯両D锛堜复鏃跺瓨鍌紝鍦ㄨ处鎴峰垱寤哄悗鍏宠仈锛?
let selectedCurrencyIdsForAdd = [];

// 瀛樺偍宸插垹闄ょ殑璐у竵ID锛堝湪娣诲姞鍜岀紪杈戞ā寮忎笅锛岄伩鍏嶉噸鏂板姞杞芥椂鍐嶆鏄剧ず锛?
let deletedCurrencyIds = [];

// 瀛樺偍娣诲姞璐︽埛鏃堕€変腑鐨勫叕鍙窱D锛堜复鏃跺瓨鍌紝鍦ㄨ处鎴峰垱寤哄悗鍏宠仈锛?
// 榛樿閫変腑褰撳墠鍏徃
let selectedCompanyIdsForAdd = (window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD && Array.isArray(window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD))
    ? [...window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD]
    : (window.ACCOUNT_LIST_COMPANY_ID !== null && window.ACCOUNT_LIST_COMPANY_ID !== undefined && window.ACCOUNT_LIST_COMPANY_ID !== '' ? [window.ACCOUNT_LIST_COMPANY_ID] : []);

// 瀛樺偍缂栬緫璐︽埛鏃堕€変腑鐨勫叕鍙窱D锛堝湪鐐瑰嚮 Update 鏃朵竴娆℃€т繚瀛橈級
let selectedCompanyIdsForEdit = [];

// 鍔犺浇鍏徃鍙敤璐у竵骞朵互鎸夐挳鏂瑰紡灞曠ず
async function loadAccountCurrencies(accountId, type) {
    const listId = type === 'add' ? 'addCurrencyList' : 'editCurrencyList';
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    listElement.innerHTML = '';

    if (accountId) {
        currentEditAccountId = accountId; // 淇濆瓨璐︽埛ID渚涘悗缁娇鐢?
        // 缂栬緫妯″紡涓嬶紝姣忔鍔犺浇鍏徃鍒楄〃鍓嶉噸缃€変腑鍏徃鍒楄〃
        if (type === 'edit') {
            selectedCompanyIdsForEdit = [];
        }
    }

    // 濡傛灉鏄坊鍔犳ā寮忥紝鍙噸缃凡鍒犻櫎鍒楄〃锛堜笉娓呯┖宸查€変腑鐨勮揣甯佸垪琛紝浠ヤ繚鐣欐柊娣诲姞鐨勮揣甯侊級
    if (type === 'add' && !accountId) {
        // 涓嶆竻绌?selectedCurrencyIdsForAdd锛屼繚鐣欏凡閫変腑鐨勮揣甯侊紙鍖呮嫭鏂版坊鍔犵殑锛?
        deletedCurrencyIds = [];
    }

    // 濡傛灉鏄紪杈戞ā寮忥紝閲嶇疆宸插垹闄ゅ垪琛?
    if (type === 'edit' && accountId) {
        deletedCurrencyIds = [];
    }

    try {
        const url = accountId
            ? `api/accounts/account_currency_api.php?action=get_available_currencies&account_id=${accountId}`
            : `api/accounts/account_currency_api.php?action=get_available_currencies`;
        const response = await fetch(url);
        const result = await response.json();

        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">No currencies available.</div>';
            return;
        }

        const isSelectable = Boolean(accountId);
        const isAddMode = type === 'add' && !accountId;

        // 鍦ㄦ坊鍔犳ā寮忎笅锛岃嚜鍔ㄩ€夋嫨MYR鎴栨渶鍏堟坊鍔犵殑璐у竵
        let currencyToAutoSelect = null;
        if (isAddMode && selectedCurrencyIdsForAdd.length === 0) {
            // 浼樺厛鏌ユ壘MYR璐у竵
            const myrCurrency = result.data.find(c => String(c.code || '').toUpperCase() === 'MYR');
            if (myrCurrency) {
                currencyToAutoSelect = myrCurrency;
            } else {
                // 濡傛灉娌℃湁MYR锛岄€夋嫨id鏈€灏忕殑璐у竵锛堟渶鍏堟坊鍔犵殑锛?
                // 鎸塱d鎺掑簭锛岄€夋嫨绗竴涓?
                const sortedById = [...result.data].sort((a, b) => a.id - b.id);
                if (sortedById.length > 0) {
                    currencyToAutoSelect = sortedById[0];
                }
            }
        }

        result.data.forEach(currency => {

            if (deletedCurrencyIds.includes(currency.id)) {
                return;
            }

            const code = String(currency.code || '').toUpperCase();
            const item = document.createElement('div');
            item.className = 'account-currency-item currency-toggle-item';
            item.setAttribute('data-currency-id', currency.id);

            // 鍒涘缓璐у竵浠ｇ爜鏂囨湰
            const codeSpan = document.createElement('span');
            codeSpan.className = 'currency-code-text';
            codeSpan.textContent = code;

            // 鍒涘缓鍒犻櫎鎸夐挳锛堝缁堟樉绀猴級
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'currency-delete-btn';
            deleteBtn.innerHTML = '×';
            deleteBtn.setAttribute('type', 'button');
            deleteBtn.setAttribute('title', 'Delete currency permanently');
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Delete button clicked:', { accountId, currencyId: currency.id, code, type });
                // 鍒犻櫎璐у竵鏈韩锛堜粠绯荤粺涓畬鍏ㄥ垹闄わ級
                deleteCurrencyPermanently(currency.id, code, item);
            });

            // 灏嗕唬鐮佸拰鍒犻櫎鎸夐挳娣诲姞鍒伴」涓?
            item.appendChild(codeSpan);
            item.appendChild(deleteBtn);

            // 濡傛灉鏄紪杈戞ā寮忎笖宸插叧鑱旓紝鏍囪涓洪€変腑
            if (currency.is_linked) {
                item.classList.add('selected');
            }
            // 濡傛灉鏄坊鍔犳ā寮忎笖涔嬪墠宸查€変腑锛屾仮澶嶉€変腑鐘舵€?
            else if (isAddMode && selectedCurrencyIdsForAdd.includes(currency.id)) {
                item.classList.add('selected');
            }
            // 濡傛灉鏄坊鍔犳ā寮忎笖闇€瑕佽嚜鍔ㄩ€夋嫨锛圡YR鎴栨渶鍏堟坊鍔犵殑璐у竵锛?
            else if (isAddMode && currencyToAutoSelect && currency.id === currencyToAutoSelect.id) {
                item.classList.add('selected');
                if (!selectedCurrencyIdsForAdd.includes(currency.id)) {
                    selectedCurrencyIdsForAdd.push(currency.id);
                }
            }


            if (isAddMode || isSelectable) {
                codeSpan.addEventListener('click', (e) => {
                    e.preventDefault(); // 闃绘榛樿琛屼负
                    e.stopPropagation(); // 闃绘浜嬩欢鍐掓场锛岄槻姝㈣Е鍙戣〃鍗曟彁浜?
                    const shouldSelect = !item.classList.contains('selected');
                    toggleAccountCurrency(
                        accountId,
                        currency.id,
                        code,
                        type,
                        shouldSelect,
                        item
                    );
                });
            } else {
                item.classList.add('currency-toggle-disabled');
            }

            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account currencies:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">Failed to load currencies.</div>';
    }
}

// 姘镐箙鍒犻櫎璐у竵锛堜粠绯荤粺涓畬鍏ㄥ垹闄わ級
async function deleteCurrencyPermanently(currencyId, currencyCode, itemElement) {
    console.log('deleteCurrencyPermanently called:', { currencyId, currencyCode });
    if (!confirm(`Are you sure you want to permanently delete currency ${currencyCode}? This action cannot be undone.`)) {
        console.log('User cancelled currency deletion');
        return;
    }

    console.log('User confirmed deletion, sending request to api/accounts/delete_currency_api.php...');
    try {
        const response = await fetch('/api/accounts/delete_currency_api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: currencyId })
        });

        console.log('Response received:', response.status, response.statusText);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        console.log('Response text:', text);

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON:', e, 'Response text:', text);
            throw new Error('Invalid JSON response: ' + text.substring(0, 100));
        }

        console.log('Parsed response data:', data);

        if (data.success) {
            // 浠?DOM 涓Щ闄?
            if (itemElement && itemElement.parentNode) {
                itemElement.remove();
            }
            // 娣诲姞鍒板凡鍒犻櫎鍒楄〃
            if (!deletedCurrencyIds.includes(currencyId)) {
                deletedCurrencyIds.push(currencyId);
            }
            showNotification(`Currency ${currencyCode} deleted successfully!`, 'success');
        } else {
            console.error('Delete failed:', data.error);
            showNotification(data.error || 'Failed to delete currency', 'danger');
        }
    } catch (error) {
        console.error('Error deleting currency:', error);
        showNotification('Failed to delete currency: ' + error.message, 'danger');
    }
}

// 浠庤处鎴蜂腑绉婚櫎璐у竵鍏宠仈锛堜笉鍒犻櫎璐у竵鏈韩锛?
async function deleteAccountCurrency(accountId, currencyId, currencyCode, type, itemElement) {
    const isAddMode = type === 'add' && !accountId;
    const isSelected = itemElement.classList.contains('selected');

    // 濡傛灉鏄坊鍔犳ā寮忥紝鍙粠鍓嶇绉婚櫎
    if (isAddMode) {
        // 浠庨€変腑鍒楄〃涓Щ闄わ紙濡傛灉宸查€変腑锛?
        if (isSelected) {
            selectedCurrencyIdsForAdd = selectedCurrencyIdsForAdd.filter(id => id !== currencyId);
        }
        // 娣诲姞鍒板凡鍒犻櫎鍒楄〃锛岄伩鍏嶉噸鏂板姞杞芥椂鍐嶆鏄剧ず
        if (!deletedCurrencyIds.includes(currencyId)) {
            deletedCurrencyIds.push(currencyId);
        }
        // 浠?DOM 涓Щ闄?
        itemElement.remove();
        showNotification(`Currency ${currencyCode} removed`, 'success');
        return;
    }

    // 缂栬緫妯″紡锛氶渶瑕?accountId 鎵嶈兘鎿嶄綔
    if (!accountId) {
        showNotification('Please save the account first before removing currencies', 'info');
        return;
    }

    // 濡傛灉璐у竵宸插叧鑱旓紝闇€瑕佽皟鐢?API 绉婚櫎鍏宠仈
    if (isSelected) {
        // 纭鍒犻櫎
        if (!confirm(`Are you sure you want to remove currency ${currencyCode} from this account?`)) {
            return;
        }

        try {
            const response = await fetch('/api/accounts/account_currency_api.php?action=remove_currency', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    account_id: accountId,
                    currency_id: currencyId
                })
            });

            const result = await response.json();

            if (result.success) {
                // 娣诲姞鍒板凡鍒犻櫎鍒楄〃锛岄伩鍏嶉噸鏂板姞杞芥椂鍐嶆鏄剧ず
                if (!deletedCurrencyIds.includes(currencyId)) {
                    deletedCurrencyIds.push(currencyId);
                }
                // 浠?DOM 涓Щ闄?
                itemElement.remove();
                showNotification(`Currency ${currencyCode} removed from account`, 'success');
            } else {
                const errorMsg = result.error || 'Failed to remove currency';
                console.error('Currency delete API error:', result);
                showNotification(errorMsg, 'danger');
            }
        } catch (error) {
            console.error('Error removing currency:', error);
            showNotification('Failed to remove currency, please check network connection', 'danger');
        }
    } else {
        // 濡傛灉璐у竵鏈叧鑱旓紝娣诲姞鍒板凡鍒犻櫎鍒楄〃骞剁Щ闄?
        if (!deletedCurrencyIds.includes(currencyId)) {
            deletedCurrencyIds.push(currencyId);
        }
        // 浠?DOM 涓Щ闄?
        itemElement.remove();
        showNotification(`Currency ${currencyCode} removed`, 'success');
    }
}

// 鍒囨崲璐у竵寮€鍏筹紙娣诲姞鎴栫Щ闄よ揣甯侊級
async function toggleAccountCurrency(accountId, currencyId, currencyCode, type, isChecked, itemElement) {
    const isAddMode = type === 'add' && !accountId;

    // 濡傛灉鏄坊鍔犳ā寮忥紝鍙洿鏂板墠绔姸鎬侊紝涓嶈皟鐢?API
    if (isAddMode) {
        if (isChecked) {
            itemElement.classList.add('selected');
            if (!selectedCurrencyIdsForAdd.includes(currencyId)) {
                selectedCurrencyIdsForAdd.push(currencyId);
            }
        } else {
            itemElement.classList.remove('selected');
            selectedCurrencyIdsForAdd = selectedCurrencyIdsForAdd.filter(id => id !== currencyId);
        }
        return;
    }

    // 缂栬緫妯″紡锛氶渶瑕?accountId 鎵嶈兘鎿嶄綔
    if (!accountId) {
        showNotification('Please save the account first before adding currencies', 'info');
        return;
    }

    // 绔嬪嵆鏇存柊 UI 鐘舵€侊紝鎻愪緵鍗虫椂鍙嶉
    const previousState = itemElement.classList.contains('selected');
    if (isChecked) {
        itemElement.classList.add('selected');
    } else {
        itemElement.classList.remove('selected');
    }

    try {
        const action = isChecked ? 'add_currency' : 'remove_currency';
        const response = await fetch('/api/accounts/account_currency_api.php?action=' + encodeURIComponent(action), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                account_id: accountId,
                currency_id: currencyId
            })
        });

        const result = await response.json();

        if (result.success) {
            const message = isChecked ?
                `Currency ${currencyCode} added to account` :
                `Currency ${currencyCode} removed from account`;
            showNotification(message, 'success');
            // UI 宸茬粡鏇存柊锛屼笉闇€瑕侀噸鏂板姞杞芥暣涓垪琛?
        } else {
            // API 澶辫触锛屽洖婊?UI 鐘舵€?
            if (previousState) {
                itemElement.classList.add('selected');
            } else {
                itemElement.classList.remove('selected');
            }
            const errorMsg = result.error || `Currency ${isChecked ? 'add' : 'remove'} failed`;
            console.error('Currency toggle API error:', result);
            showNotification(errorMsg, 'danger');
        }
    } catch (error) {
        // 缃戠粶閿欒锛屽洖婊?UI 鐘舵€?
        if (previousState) {
            itemElement.classList.add('selected');
        } else {
            itemElement.classList.remove('selected');
        }
        console.error(`Error ${isChecked ? 'adding' : 'removing'} currency:`, error);
        showNotification(`Currency ${isChecked ? 'add' : 'remove'} failed, please check network connection`, 'danger');
    }
}

// 鍔犺浇鍏徃鍒楄〃骞朵互鎸夐挳鏂瑰紡灞曠ず
async function loadAccountCompanies(accountId, type) {
    const listId = type === 'add' ? 'addCompanyList' : 'editCompanyList';
    const listElement = document.getElementById(listId);
    if (!listElement) return;
    listElement.innerHTML = '';

    if (accountId) {
        currentEditAccountId = accountId; // 淇濆瓨璐︽埛ID渚涘悗缁娇鐢?
    }

    // 濡傛灉鏄坊鍔犳ā寮忥紝纭繚褰撳墠鍏徃琚€変腑
    if (type === 'add' && !accountId) {
        const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
        if (currentCompanyId && !selectedCompanyIdsForAdd.includes(currentCompanyId)) {
            selectedCompanyIdsForAdd.push(currentCompanyId);
        }
    }

    try {
        const url = accountId
            ? `api/accounts/account_company_api.php?action=get_available_companies&account_id=${accountId}`
            : `api/accounts/account_company_api.php?action=get_available_companies`;
        const response = await fetch(url);
        const result = await response.json();

        if (!result.success || !Array.isArray(result.data) || result.data.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">No companies available.</div>';
            return;
        }

        const isSelectable = Boolean(accountId);
        const isAddMode = type === 'add' && !accountId;

        result.data.forEach(company => {
            const code = String(company.company_code || '').toUpperCase();
            const item = document.createElement('div');
            item.className = 'account-currency-item currency-toggle-item';
            item.setAttribute('data-company-id', company.id);
            item.textContent = code;

            // 濡傛灉鏄紪杈戞ā寮忎笖宸插叧鑱旓紝鏍囪涓洪€変腑骞惰褰曞埌 selectedCompanyIdsForEdit
            if (company.is_linked) {
                item.classList.add('selected');
                if (type === 'edit' && accountId && !selectedCompanyIdsForEdit.includes(company.id)) {
                    selectedCompanyIdsForEdit.push(company.id);
                }
            }
            // 濡傛灉鏄坊鍔犳ā寮忎笖涔嬪墠宸查€変腑锛屾仮澶嶉€変腑鐘舵€?
            else if (isAddMode && selectedCompanyIdsForAdd.includes(company.id)) {
                item.classList.add('selected');
            }

            // 娣诲姞妯″紡鎴栫紪杈戞ā寮忛兘鍙互閫夋嫨
            if (isAddMode || isSelectable) {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const shouldSelect = !item.classList.contains('selected');
                    toggleAccountCompany(
                        accountId,
                        company.id,
                        code,
                        type,
                        shouldSelect,
                        item
                    );
                });
            } else {
                item.classList.add('currency-toggle-disabled');
            }

            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account companies:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">Failed to load companies.</div>';
    }
}

// 鍒囨崲鍏徃寮€鍏筹紙娣诲姞鎴栫Щ闄ゅ叕鍙革級
async function toggleAccountCompany(accountId, companyId, type, isChecked, itemElement) {
    const isAddMode = type === 'add' && !accountId;

    // 濡傛灉鏄坊鍔犳ā寮忥紝鍙洿鏂板墠绔姸鎬侊紝涓嶈皟鐢?API
    if (isAddMode) {
        if (isChecked) {
            itemElement.classList.add('selected');
            if (!selectedCompanyIdsForAdd.includes(companyId)) {
                selectedCompanyIdsForAdd.push(companyId);
            }
        } else {
            itemElement.classList.remove('selected');
            selectedCompanyIdsForAdd = selectedCompanyIdsForAdd.filter(id => id !== companyId);
        }
        return;
    }

    // 缂栬緫妯″紡锛氬彧鏇存柊鍓嶇鐘舵€侊紝瀹為檯淇濆瓨鐢?Update 鎸夐挳缁熶竴鎻愪氦锛堜笌 userlist 涓€鑷达級
    if (!accountId) {
        showNotification('Please save the account first before adding companies', 'info');
        return;
    }

    if (isChecked) {
        itemElement.classList.add('selected');
        if (!selectedCompanyIdsForEdit.includes(companyId)) {
            selectedCompanyIdsForEdit.push(companyId);
        }
    } else {
        itemElement.classList.remove('selected');
        selectedCompanyIdsForEdit = selectedCompanyIdsForEdit.filter(id => id !== companyId);
    }
}

let currentLinkAccountId = null;

let selectedLinkedAccountIdsForLink = [];

let currentLinkType = 'bidirectional';

async function linkAccount(accountId) {
    currentLinkAccountId = accountId;
    selectedLinkedAccountIdsForLink = [];
    currentLinkType = 'bidirectional';

    document.getElementById('linkTypeBidirectional').checked = true;
    document.getElementById('linkTypeUnidirectional').checked = false;
    updateLinkTypeDescription();

    await loadAccountLinks(accountId);

    document.getElementById('linkAccountModal').style.display = 'block';
}

function closeLinkAccountModal() {
    document.getElementById('linkAccountModal').style.display = 'none';
    currentLinkAccountId = null;
    selectedLinkedAccountIdsForLink = [];
    currentLinkType = 'bidirectional';
}

function updateLinkTypeDescription() {
    const descEl = document.getElementById('linkTypeDescription');
    if (!descEl) return;
    const isBidi = document.getElementById('linkTypeBidirectional') && document.getElementById('linkTypeBidirectional').checked;
    descEl.textContent = isBidi
        ? 'Bidirectional: Data syncs both ways.'
        : 'Unidirectional flows from A to B.';
}

async function saveAccountLinks() {
    if (!currentLinkAccountId) {
        showNotification('No account selected', 'error');
        return;
    }

    try {
        const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
        if (!currentCompanyId) {
            showNotification('Please select a company first', 'error');
            return;
        }

        const linkTypeRadio = document.querySelector('input[name="linkType"]:checked');
        const linkType = linkTypeRadio ? linkTypeRadio.value : 'bidirectional';

        let currentLinkedIds = [];
        try {
            const response = await fetch(`api/accounts/account_link_api.php?action=get_linked_accounts&account_id=${currentLinkAccountId}&company_id=${currentCompanyId}`);
            const result = await response.json();
            const data = result.data || {};
            const accountsArr = data.accounts || result.data || [];
            const typesMap = data.link_types_map || result.link_types_map || {};
            if (result.success && Array.isArray(accountsArr) && (data.link_types_map || result.link_types_map)) {
                currentLinkedIds = accountsArr
                    .filter(acc => typesMap[acc.id] === linkType)
                    .map(acc => acc.id);
            }
        } catch (error) {
            console.error('Error fetching current links:', error);
        }

        // 璁＄畻闇€瑕佹坊鍔犲拰绉婚櫎鐨勫叧鑱旓紙鍙拡瀵瑰綋鍓嶈繛鎺ョ被鍨嬶級
        const newIds = Array.isArray(selectedLinkedAccountIdsForLink) ? selectedLinkedAccountIdsForLink : [];
        const toAdd = newIds.filter(id => !currentLinkedIds.includes(id));
        const toRemove = currentLinkedIds.filter(id => !newIds.includes(id));

        // 绉婚櫎鍏宠仈
        for (const linkedId of toRemove) {
            try {
                const response = await fetch('/api/accounts/account_link_api.php?action=unlink_accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_id_1: currentLinkAccountId,
                        account_id_2: linkedId,
                        company_id: currentCompanyId
                    })
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message || result.error || 'Failed to unlink account');
                }
            } catch (error) {
                console.error('Error unlinking account:', error);
                showNotification(`Failed to unlink account: ${error.message}`, 'error');
                return;
            }
        }

        for (const linkedId of toAdd) {
            try {
                const response = await fetch('/api/accounts/account_link_api.php?action=link_accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_id_1: currentLinkAccountId,
                        account_id_2: linkedId,
                        company_id: currentCompanyId,
                        link_type: linkType,
                        source_account_id: linkType === 'unidirectional' ? currentLinkAccountId : null
                    })
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message || result.error || 'Failed to link account');
                }
            } catch (error) {
                console.error('Error linking account:', error);
                showNotification(`Failed to link account: ${error.message}`, 'error');
                return;
            }
        }

        if (toAdd.length === 0 && toRemove.length === 0 && newIds.length > 0) {
            for (const linkedId of newIds) {
                try {
                    const response = await fetch('/api/accounts/account_link_api.php?action=update_link_type', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            account_id_1: currentLinkAccountId,
                            account_id_2: linkedId,
                            company_id: currentCompanyId,
                            link_type: linkType,
                            source_account_id: linkType === 'unidirectional' ? currentLinkAccountId : null
                        })
                    });
                    const result = await response.json();
                    if (!result.success) {
                        console.warn(`Failed to update link type: ${result.message || result.error}`);
                    }
                } catch (error) {
                    console.warn('Error updating link type:', error);
                }
            }
        }

        showNotification('Account links saved successfully', 'success');
        closeLinkAccountModal();
        fetchAccounts();
    } catch (error) {
        console.error('Error saving account links:', error);
        showNotification(`Failed to save account links: ${error.message}`, 'error');
    }
}

async function loadAccountLinks(accountId) {
    const listElement = document.getElementById('linkAccountList');
    if (!listElement) return;
    listElement.innerHTML = '';
    const searchInput = document.getElementById('linkAccountSearchInput');
    if (searchInput) searchInput.value = '';

    if (!accountId) {
        listElement.innerHTML = '<div class="currency-toggle-note">Invalid account ID</div>';
        return;
    }

    try {
        const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
        if (!currentCompanyId) {
            listElement.innerHTML = '<div class="currency-toggle-note">璇峰厛閫夋嫨鍏徃</div>';
            return;
        }

        // 鑾峰彇褰撳墠鍏徃涓嬫墍鏈夎处鎴凤紙鎺掗櫎褰撳墠璐︽埛锛?
        const url = `api/accounts/accountlistapi.php?company_id=${currentCompanyId}&showAll=1`;
        const response = await fetch(url);
        const result = await response.json();
        const accountList = result.data && result.data.accounts ? result.data.accounts : (result.data || []);

        if (!result.success || !Array.isArray(accountList) || accountList.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">褰撳墠鍏徃涓嬫病鏈夊叾浠栬处鎴?/div>';
            return;
        }

        // 杩囨护鎺夊綋鍓嶈处鎴?
        const availableAccounts = accountList.filter(acc => acc.id != accountId);

        if (availableAccounts.length === 0) {
            listElement.innerHTML = '<div class="currency-toggle-note">褰撳墠鍏徃涓嬫病鏈夊叾浠栬处鎴峰彲鍏宠仈</div>';
            return;
        }

        // 鑾峰彇褰撳墠璐︽埛宸插叧鑱旂殑璐︽埛鍒楄〃鍜岃繛鎺ョ被鍨嬩俊鎭?
        let linkedAccountIds = [];
        let linkTypeInfo = null;
        let linkTypesMap = {}; // 瀛樺偍姣忎釜璐︽埛鐨勮繛鎺ョ被鍨嬫槧灏?
        try {
            const linkResponse = await fetch(`api/accounts/account_link_api.php?action=get_linked_accounts&account_id=${accountId}&company_id=${currentCompanyId}`);
            const linkResult = await linkResponse.json();
            const linkData = linkResult.data || {};
            const linkAccounts = linkData.accounts || linkResult.data || [];
            if (linkResult.success && Array.isArray(linkAccounts)) {
                linkedAccountIds = linkAccounts.map(acc => acc.id);
                selectedLinkedAccountIdsForLink = [...linkedAccountIds];
            }
            // 鑾峰彇杩炴帴绫诲瀷淇℃伅
            if (linkResult.success && (linkData.link_type_info || linkResult.link_type_info)) {
                linkTypeInfo = linkData.link_type_info || linkResult.link_type_info;
            }
            // 鑾峰彇姣忎釜璐︽埛鐨勮繛鎺ョ被鍨嬫槧灏?
            if (linkResult.success && (linkData.link_types_map || linkResult.link_types_map)) {
                linkTypesMap = linkData.link_types_map || linkResult.link_types_map;
            }
        } catch (error) {
            console.error('Error loading linked accounts:', error);
        }

        // 鏍规嵁杩炴帴绫诲瀷淇℃伅璁剧疆鍗曢€夋寜閽紙榛樿鏄剧ず鍙屽悜锛?
        document.getElementById('linkTypeBidirectional').checked = true;
        document.getElementById('linkTypeUnidirectional').checked = false;
        currentLinkType = 'bidirectional';
        updateLinkTypeDescription();

        // 瀛樺偍杩炴帴绫诲瀷鏄犲皠锛岀敤浜庡姩鎬佹洿鏂板嬀閫夌姸鎬?
        window.linkTypesMap = linkTypesMap;

        // 鎸?account_id 鎺掑簭
        availableAccounts.sort((a, b) => {
            const aId = String(a.account_id || '').toUpperCase();
            const bId = String(b.account_id || '').toUpperCase();
            return aId.localeCompare(bId);
        });

        // 钃濇鍐?3 鍒楃綉鏍硷紝璐﹀彿鐩存帴鏀惧叆鍒楄〃锛堟悳绱㈡椂鑷姩閲嶆帓涓?3 鍒椼€侀棿璺濅竴鑷达級
        availableAccounts.forEach(account => {
            const accountIdText = String(account.account_id || '').toUpperCase();
            const accountIdDisplay = accountIdText;
            const accountLinkType = window.linkTypesMap && window.linkTypesMap[account.id] ? window.linkTypesMap[account.id] : null;
            const isLinked = linkedAccountIds.includes(account.id) &&
                accountLinkType &&
                accountLinkType === currentLinkType;

            const item = document.createElement('div');
            item.className = 'account-item-compact';
            item.setAttribute('data-linked-account-id', account.id);
            item.setAttribute('data-account-id', accountIdDisplay);
            item.style.cssText = 'display: flex; align-items: center; padding: 6px 8px; margin: 0; border-radius: 6px; transition: background-color 0.2s; background-color: white; border: 1px solid #eee;';

            if (isLinked) {
                item.style.backgroundColor = '#e8f5e9';
                item.style.borderColor = '#4caf50';
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `link_account_${account.id}`;
            checkbox.value = account.id;
            checkbox.checked = isLinked;
            checkbox.style.cssText = 'margin: 0 6px 0 0; width: 14px; height: 14px; flex-shrink: 0;';
            checkbox.addEventListener('change', function () {
                if (this.checked) {
                    if (!selectedLinkedAccountIdsForLink.includes(account.id)) {
                        selectedLinkedAccountIdsForLink.push(account.id);
                    }
                    item.style.backgroundColor = '#e8f5e9';
                    item.style.borderColor = '#4caf50';
                } else {
                    selectedLinkedAccountIdsForLink = selectedLinkedAccountIdsForLink.filter(id => id !== account.id);
                    item.style.backgroundColor = 'white';
                    item.style.borderColor = '#eee';
                }
            });

            const label = document.createElement('label');
            label.htmlFor = `link_account_${account.id}`;
            label.style.cssText = 'font-size: 13px; font-weight: 600; color: #333; cursor: pointer; flex: 1; min-width: 0; word-break: break-all; line-height: 1.3;';
            label.textContent = accountIdDisplay;

            item.appendChild(checkbox);
            item.appendChild(label);
            listElement.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading account links:', error);
        listElement.innerHTML = '<div class="currency-toggle-note">鍔犺浇鍏宠仈璐︽埛澶辫触</div>';
    }
}

function filterLinkAccountList() {
    const listElement = document.getElementById('linkAccountList');
    if (!listElement) return;
    const searchInput = document.getElementById('linkAccountSearchInput');
    const searchVal = (searchInput ? searchInput.value : '').trim().toUpperCase();
    const items = listElement.querySelectorAll('.account-item-compact');
    items.forEach(item => {
        const accountId = (item.getAttribute('data-account-id') || '').toUpperCase();
        item.style.display = accountId.includes(searchVal) ? 'flex' : 'none';
    });
}

(function () {
    const linkSearchInput = document.getElementById('linkAccountSearchInput');
    if (linkSearchInput) linkSearchInput.addEventListener('input', filterLinkAccountList);
})();

// Select All Linked Accounts
function selectAllLinkedAccounts() {
    const checkboxes = document.querySelectorAll('#linkAccountList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));
        }
    });
}

// Clear All Linked Accounts
function clearAllLinkedAccounts() {
    const checkboxes = document.querySelectorAll('#linkAccountList input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));
        }
    });
}

async function editAccount(id) {
    try {
        // 浠庢暟鎹簱鑾峰彇瀹屾暣鐨勮处鎴疯褰?
        const response = await fetch(`getaccountapi.php?id=${id}`);
        const result = await response.json();

        if (!result.success) {
            showNotification(result.error, 'danger');
            return;
        }

        const account = result.data;

        // Debug: Log account data
        console.log('Account data:', account);
        console.log('Account role:', account.role);
        console.log('Available roles:', roles);
        console.log('Currency ID:', account.currency_table_id);
        console.log('Currency code:', account.currency);
        console.log('Available currencies:', currencies);

        // Populate form with account data
        document.getElementById('edit_account_id').value = account.id;
        document.getElementById('edit_account_id_field').value = (account.account_id || '').toUpperCase();
        document.getElementById('edit_name').value = (account.name || '').toUpperCase();
        document.getElementById('edit_password').value = account.password || ''; // Show password from database

        // 澶勭悊 alert_type: 濡傛灉鏄?weekly 鎴?monthly锛岀洿鎺ヨ缃紱濡傛灉鏄暟瀛楋紝璁剧疆涓烘暟瀛楋紱鍚﹀垯涓虹┖
        let alertType = '';
        if (account.alert_type) {
            alertType = account.alert_type;
        } else if (account.alert_day) {
            // 鍏煎鏃ф暟鎹細濡傛灉 alert_day 鏄?weekly/monthly锛屼娇鐢ㄥ畠锛涘惁鍒欏彲鑳芥槸鏁板瓧
            const alertDay = String(account.alert_day).toLowerCase();
            if (alertDay === 'weekly' || alertDay === 'monthly') {
                alertType = alertDay;
            } else if (parseInt(account.alert_day) >= 1 && parseInt(account.alert_day) <= 31) {
                alertType = account.alert_day;
            }
        }
        document.getElementById('edit_alert_type').value = alertType;

        // 澶勭悊 alert_start_date: 浣跨敤 alert_start_date 鎴?alert_specific_date锛堝吋瀹规棫鏁版嵁锛?
        const alertStartDate = account.alert_start_date || account.alert_specific_date || '';
        document.getElementById('edit_alert_start_date').value = alertStartDate;

        // 澶勭悊 alert_amount - 鐩存帴鏄剧ず璐熸暟锛堟暟鎹簱涓瓨鍌ㄧ殑鏄礋鏁帮級
        const alertAmount = account.alert_amount || '';
        document.getElementById('edit_alert_amount').value = alertAmount;
        document.getElementById('edit_remark').value = (account.remark || '').toUpperCase();

        // Set payment alert radio button
        const paymentAlert = account.payment_alert == 1 ? '1' : '0';
        document.querySelector(`input[name="payment_alert"][value="${paymentAlert}"]`).checked = true;

        // Toggle alert fields based on payment alert setting
        toggleAlertFields('edit');

        // Populate role dropdown with priority order
        const roleSelect = document.getElementById('edit_role');
        const accountRole = (account.role || '').trim();
        populateRoleSelect(roleSelect, accountRole);

        // Currency selection is now handled in the "Advanced Account" section
        // No need to populate edit_currency_id as it's been removed from the form

        // 鍔犺浇鎵€鏈夎揣甯佷负寮€鍏冲紡
        await loadAccountCurrencies(id, 'edit');
        // 鍔犺浇鎵€鏈夊叕鍙镐负寮€鍏冲紡
        await loadAccountCompanies(id, 'edit');

        // Show modal
        document.getElementById('editModal').style.display = 'block';

    } catch (error) {
        console.error('Error loading account data:', error);
        showNotification('Failed to load account data', 'danger');
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editAccountForm').reset();
    // 閲嶇疆宸插垹闄ょ殑璐у竵鍒楄〃
    deletedCurrencyIds = [];
}

// 鍒囨崲 Payment Alert 鐘舵€?
async function togglePaymentAlert(accountId, currentPaymentAlert) {
    try {
        const formData = new FormData();
        formData.append('id', accountId);

        const response = await fetch('/api/accounts/toggle_payment_alert_api.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // 鏇存柊鏈湴鏁版嵁
            const account = accounts.find(acc => acc.id === accountId);
            if (account) {
                account.payment_alert = result.newPaymentAlert;
            }

            // 绔嬪嵆鏇存柊 alert badge 鐨勬樉绀?
            const card = document.querySelector(`.account-card[data-id="${accountId}"]`);
            if (card) {
                const items = card.querySelectorAll('.account-card-item');
                if (items.length > 4) {
                    // Alert 鏄 4 鍒楋紙绱㈠紩 4锛?
                    const alertClass = result.newPaymentAlert == 1 ? 'account-status-active' : 'account-status-inactive';
                    const alertText = result.newPaymentAlert == 1 ? 'ON' : 'OFF';
                    items[4].innerHTML = `<span class="account-role-badge ${alertClass} account-status-clickable" onclick="togglePaymentAlert(${accountId}, ${result.newPaymentAlert})" title="Click to toggle payment alert">${alertText}</span>`;
                }
            }

            const alertText = result.newPaymentAlert == 1 ? 'enabled' : 'disabled';
            showNotification(`Payment alert ${alertText}`, 'success');
        } else {
            showNotification(result.error || 'Payment alert toggle failed', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Payment alert toggle failed', 'danger');
    }
}

// 鍒囨崲璐︽埛鐘舵€?
async function toggleAccountStatus(accountId, currentStatus) {
    try {
        const formData = new FormData();
        formData.append('id', accountId);

        const toggleUrl = new URL('api/accounts/toggle_account_status_api.php', window.location.href);
        const response = await fetch(toggleUrl, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // 鏇存柊鏈湴鏁版嵁
            const account = accounts.find(acc => acc.id === accountId);
            if (account) {
                account.status = (result.newStatus || (result.data && result.data.newStatus));
            }

            // 绔嬪嵆鏇存柊鐘舵€?badge 鐨勬樉绀?
            const card = document.querySelector(`.account-card[data-id="${accountId}"]`);
            if (card) {
                const items = card.querySelectorAll('.account-card-item');
                if (items.length > 5) {
                    const statusClass = (result.newStatus || (result.data && result.data.newStatus)) === 'active' ? 'account-status-active' : 'account-status-inactive';
                    // Status 鏄 5 鍒楋紙绱㈠紩 5锛夛紝Alert 鏄 4 鍒楋紙绱㈠紩 4锛?
                    items[5].innerHTML = `<span class="account-role-badge ${statusClass} account-status-clickable" onclick="toggleAccountStatus(${accountId}, '${result.newStatus || (result.data && result.data.newStatus)}')" title="Click to toggle status">${((result.newStatus || (result.data && result.data.newStatus)) || '').toUpperCase()}</span>`;
                    // 鏇存柊鍒犻櫎澶嶉€夋鏄剧ず锛欰CTIVE 涓嶆樉绀猴紝INACTIVE 鎵嶆樉绀?
                    const actionCell = items[8]; // Action 鍒?
                    if (actionCell) {
                        const existingCheckbox = actionCell.querySelector('.account-row-checkbox');
                        if ((result.newStatus || (result.data && result.data.newStatus)) === 'active') {
                            if (existingCheckbox) existingCheckbox.remove();
                        } else {
                            if (!existingCheckbox) {
                                const checkbox = document.createElement('input');
                                checkbox.type = 'checkbox';
                                checkbox.className = 'account-row-checkbox';
                                checkbox.dataset.id = String(accountId);
                                checkbox.title = 'Select for deletion';
                                checkbox.style.marginLeft = '10px';
                                checkbox.onchange = updateDeleteButton;
                                actionCell.appendChild(checkbox);
                            }
                        }
                    }
                }

                // 鏍规嵁 showAll 鍜?showInactive 鐘舵€佸喅瀹氭槸鍚︽樉绀鸿鍗＄墖
                // showAll=true: 鏄剧ず鎵€鏈夎处鎴?
                // showInactive=true: 鍙樉绀?inactive 璐︽埛
                // showInactive=false: 鍙樉绀?active 璐︽埛
                const shouldShow = showAll ? true : (showInactive ? (result.newStatus || (result.data && result.data.newStatus)) === 'inactive' : (result.newStatus || (result.data && result.data.newStatus)) === 'active');
                if (!shouldShow) {
                    // 濡傛灉涓嶅簲璇ユ樉绀猴紝浠?accounts 鏁扮粍涓Щ闄ゅ苟閲嶆柊娓叉煋
                    const accountIndex = accounts.findIndex(acc => acc.id === accountId);
                    if (accountIndex > -1) {
                        accounts.splice(accountIndex, 1);
                    }
                    // 閲嶆柊娓叉煋琛ㄦ牸锛堜細闅愯棌璇ュ崱鐗囷級
                    renderTable();
                }
                // 濡傛灉搴旇鏄剧ず锛岀姸鎬?badge 宸茬粡鏇存柊锛屼笉闇€瑕侀噸鏂版覆鏌撴暣涓〃鏍?
            }

            // 鏇存柊鍒犻櫎鎸夐挳鐘舵€?
            updateDeleteButton();
            updateSelectAllAccountsVisibility();

            const statusText = (result.newStatus || (result.data && result.data.newStatus)) === 'active' ? 'activated' : 'deactivated';
            showNotification(`Account status changed to ${statusText}`, 'success');
        } else {
            showNotification(result.error || 'Status toggle failed', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Status toggle failed', 'danger');
    }
}

// 鍏ㄩ€?鍙栨秷鍏ㄩ€夋墍鏈夎处鎴?
function toggleSelectAllAccounts() {
    const selectAllCheckbox = document.getElementById('selectAllAccounts');
    if (!selectAllCheckbox) {
        console.error('selectAllAccounts checkbox not found');
        return;
    }

    // 閫夋嫨鎵€鏈?checkbox锛岀劧鍚庤繃婊ゆ帀 disabled 鐨?
    const allCheckboxes = Array.from(document.querySelectorAll('.account-row-checkbox')).filter(cb => !cb.disabled);
    console.log('Found checkboxes:', allCheckboxes.length, 'Select all checked:', selectAllCheckbox.checked);

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateDeleteButton();
}

// 鏍规嵁褰撳墠椤甸潰鏄惁鏈夊彲鍒犻櫎椤癸紝鏄剧ず/闅愯棌鍏ㄩ€夋
function updateSelectAllAccountsVisibility() {
    const selectAllCheckbox = document.getElementById('selectAllAccounts');
    if (!selectAllCheckbox) return;

    const anyRowCheckbox = document.querySelectorAll('.account-row-checkbox').length > 0;
    selectAllCheckbox.style.display = anyRowCheckbox ? 'inline-block' : 'none';
    if (!anyRowCheckbox) {
        selectAllCheckbox.checked = false;
    }
}

// 鏇存柊鍒犻櫎鎸夐挳鐘舵€?
function updateDeleteButton() {
    const selectedCheckboxes = document.querySelectorAll('.account-row-checkbox:checked');
    const deleteBtn = document.getElementById('accountDeleteSelectedBtn');
    const selectAllCheckbox = document.getElementById('selectAllAccounts');
    // 閫夋嫨鎵€鏈?checkbox锛岀劧鍚庤繃婊ゆ帀 disabled 鐨?
    const allCheckboxes = Array.from(document.querySelectorAll('.account-row-checkbox')).filter(cb => !cb.disabled);

    // 鏇存柊鍏ㄩ€?checkbox 鐘舵€?
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        const allSelected = allCheckboxes.length > 0 &&
            allCheckboxes.every(cb => cb.checked);
        selectAllCheckbox.checked = allSelected;
    }

    if (selectedCheckboxes.length > 0) {
        deleteBtn.textContent = `Delete (${selectedCheckboxes.length})`;
        deleteBtn.disabled = false;
    } else {
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = true;
    }
}

function deleteSelected() {
    const checkboxes = document.querySelectorAll('.account-row-checkbox:checked');
    const idsToDelete = Array.from(checkboxes)
        .map(cb => parseInt(cb.dataset.id))
        .filter(id => !isNaN(id));

    if (idsToDelete.length === 0) {
        showNotification('Please select accounts to delete.', 'danger');
        return;
    }

    // Check if any selected accounts are active
    const activeAccounts = [];
    const inactiveAccounts = [];

    idsToDelete.forEach(id => {
        const account = accounts.find(acc => acc.id === id);
        if (account) {
            if (account.status === 'active') {
                activeAccounts.push(account.account_id || account.name || `ID: ${id}`);
            } else {
                inactiveAccounts.push(account.account_id || account.name || `ID: ${id}`);
            }
        }
    });

    // Show error if any active accounts are selected
    if (activeAccounts.length > 0) {
        showNotification(`Cannot delete active accounts: ${activeAccounts.join(', ')}. Only inactive accounts can be deleted.`, 'danger');
        return;
    }

    showConfirmDelete(
        `Are you sure you want to delete ${idsToDelete.length} selected inactive account(s)? This action cannot be undone.`,
        async function () {
            closeConfirmDeleteModal();
            const deleteBtn = document.getElementById('accountDeleteSelectedBtn');
            if (deleteBtn) {
                deleteBtn.disabled = true;
                deleteBtn.textContent = 'Deleting...';
            }
            try {
                const response = await fetch('/api/accounts/delete_accounts_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: idsToDelete })
                });
                const result = await response.json();
                if (result.success && result.data && typeof result.data.deleted === 'number') {
                    const deletedCount = result.data.deleted;
                    accounts = accounts.filter(acc => !idsToDelete.includes(parseInt(acc.id, 10)));
                    renderTable();
                    renderPagination();
                    updateDeleteButton();
                    showNotification(deletedCount === 1 ? '1 account deleted successfully' : deletedCount + ' accounts deleted successfully', 'success');
                } else {
                    showNotification(result.message || result.error || 'Failed to delete accounts', 'danger');
                }
            } catch (err) {
                showNotification('Failed to delete accounts: ' + (err.message || 'Network error'), 'danger');
            } finally {
                if (deleteBtn) {
                    deleteBtn.disabled = false;
                    deleteBtn.textContent = 'Delete';
                }
            }
        }
    );
}

// 寮哄埗杈撳叆澶у啓瀛楁瘝
function forceUppercase(input) {
    const cursorPosition = input.selectionStart;
    const upperValue = input.value.toUpperCase();
    input.value = upperValue;
    input.setSelectionRange(cursorPosition, cursorPosition);
}

// Real-time search as user types
let searchTimeout;
const searchInputEl = document.getElementById('searchInput');
if (searchInputEl) {
    searchInputEl.addEventListener('input', function () {
        // 鎼滅储鍔熻兘
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchAccounts(); // 瀹炴椂鑾峰彇鏁版嵁
            c168PushAccountListFiltersToUrl();
        }, 300); // 寤惰繜300ms閬垮厤棰戠箒璇锋眰
    });

    // paste 不做过滤，允许空格与符号
}

// Real-time filter when checkbox changes
document.getElementById('showInactive').addEventListener('change', function () {
    showInactive = this.checked;
    // 濡傛灉鍕鹃€変簡 Show All锛屽彇娑?Show Inactive
    if (showAll) {
        document.getElementById('showAll').checked = false;
        showAll = false;
        updateAccountListScrollMode();
    }
    fetchAccounts(); // 瀹炴椂鑾峰彇鏁版嵁
    c168PushAccountListFiltersToUrl();
});

// Real-time filter when Show All checkbox changes
document.getElementById('showAll').addEventListener('change', function () {
    showAll = this.checked;
    // 濡傛灉鍕鹃€変簡 Show All锛屽彇娑?Show Inactive
    if (showAll) {
        document.getElementById('showInactive').checked = false;
        showInactive = false;
    }
    // 切换 showAll 时始终回到第一页
    currentPage = 1;
    updateAccountListScrollMode();
    fetchAccounts(); // 瀹炴椂鑾峰彇鏁版嵁
    c168PushAccountListFiltersToUrl();
});

/** showAll 时允许页面纵向滚动；否则恢复 overflow hidden */
function updateAccountListScrollMode() {
    if (!document.body) return;
    if (showAll) {
        document.body.classList.add('account-page--show-all');
    } else {
        document.body.classList.remove('account-page--show-all');
    }
}

function c168IsAccountListSpaEmbed() {
    return (typeof document !== 'undefined' && document.body &&
        document.body.classList.contains('account-list-spa-embed')) ||
        (typeof window !== 'undefined' && window.__ACCOUNT_LIST_SPA_EMBED__ === true);
}

/** React `/accounts`：把当前筛选写入地址栏（可书签/分享；经典全页不写回 URL） */
function c168PushAccountListFiltersToUrl() {
    if (!c168IsAccountListSpaEmbed()) return;
    try {
        const url = new URL(window.location.href);
        const p = url.searchParams;
        if (showInactive) {
            p.set('showInactive', '1');
        } else {
            p.delete('showInactive');
        }
        if (showAll) {
            p.set('showAll', '1');
        } else {
            p.delete('showAll');
        }
        const inp = document.getElementById('searchInput');
        const q = inp ? String(inp.value || '').trim() : '';
        if (q) {
            p.set('search', q);
        } else {
            p.delete('search');
        }
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        window.dispatchEvent(new Event('c168:account-list-url-replaced'));
    } catch (e) {
        console.error(e);
    }
}

/** React Router / 浏览器前进后退：用当前 `location.search` 刷新勾选状态与 legacy 变量（与经典页 GET 参数语义一致） */
function c168SyncAccountListFromLocation() {
    try {
        const p = new URLSearchParams(window.location.search);
        const nextInactive = p.has('showInactive');
        const nextAll = p.has('showAll');
        const nextSearch = p.has('search') ? String(p.get('search') || '') : '';
        const inp = document.getElementById('searchInput');
        const curSearch = inp ? String(inp.value || '').trim() : '';
        const si = document.getElementById('showInactive');
        const sa = document.getElementById('showAll');

        if (
            nextInactive === showInactive &&
            nextAll === showAll &&
            nextSearch === curSearch
        ) {
            return;
        }

        showInactive = nextInactive;
        showAll = nextAll;
        if (si) si.checked = showInactive;
        if (sa) sa.checked = showAll;
        if (inp) {
            inp.value = p.has('search') ? (p.get('search') || '') : '';
        }
        updateAccountListScrollMode();
        fetchAccounts();
    } catch (e) {
        console.error(e);
    }
}

window.c168SyncAccountListFromLocation = c168SyncAccountListFromLocation;
window.c168PushAccountListFiltersToUrl = c168PushAccountListFiltersToUrl;

// Toggle alert fields visibility
function toggleAlertFields(type) {
    const paymentAlert = document.querySelector(`input[name="${type === 'add' ? 'add_payment_alert' : 'payment_alert'}"]:checked`);
    const alertFields = document.getElementById(`${type}_alert_fields`);
    const alertAmountRow = document.getElementById(`${type}_alert_amount_row`);
    const alertType = document.getElementById(`${type}_alert_type`);
    const alertStartDate = document.getElementById(`${type}_alert_start_date`);
    const alertAmount = document.getElementById(`${type}_alert_amount`);

    if (paymentAlert && paymentAlert.value === '1') {
        // Show alert fields when Yes is selected
        alertFields.style.display = 'flex';
        if (alertAmountRow) {
            alertAmountRow.style.display = 'flex';
        }
    } else {
        // Hide alert fields when No is selected and clear their values
        alertFields.style.display = 'none';
        if (alertAmountRow) {
            alertAmountRow.style.display = 'none';
        }
        // Clear values when hiding fields
        if (alertType) alertType.value = '';
        if (alertStartDate) alertStartDate.value = '';
        if (alertAmount) alertAmount.value = '';
    }
}

// Payment alert validation
function validatePaymentAlert() {
    const paymentAlert = document.querySelector('input[name="payment_alert"]:checked');
    const alertType = document.getElementById('edit_alert_type').value;
    const alertStartDate = document.getElementById('edit_alert_start_date').value;
    const alertAmount = document.getElementById('edit_alert_amount').value;

    if (paymentAlert && paymentAlert.value === '1') {
        // If payment alert is Yes, both alert type and start date must be filled
        if (!alertType || !alertStartDate) {
            showNotification('When Payment Alert is Yes, both Alert Type and Start Date must be filled.', 'danger');
            return false;
        }
        // Validate alert amount must be a negative number
        if (alertAmount && (isNaN(parseFloat(alertAmount)) || parseFloat(alertAmount) >= 0)) {
            showNotification('Alert Amount must be a negative number.', 'danger');
            return false;
        }
    }
    return true;
}

// Handle edit form submission
document.getElementById('editAccountForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    // Validate payment alert fields
    if (!validatePaymentAlert()) {
        return;
    }

    const formData = new FormData(this);
    const accountId = formData.get('id');

    // 濡傛灉 payment_alert 涓?0锛屾竻绌?alert 鐩稿叧瀛楁
    const paymentAlert = formData.get('payment_alert');
    if (paymentAlert === '0' || paymentAlert === 0) {
        formData.set('alert_type', '');
        formData.set('alert_start_date', '');
        formData.set('alert_amount', '');
    }
    // 娉ㄦ剰锛歛lert_amount 宸茬粡鍦ㄨ緭鍏ユ椂鑷姩杞崲涓鸿礋鏁版樉绀猴紝鎵€浠ョ洿鎺ユ彁浜ゅ嵆鍙?

    // 灏嗙紪杈戞ā寮忎笅閫変腑鐨勫叕鍙窱D涓€骞舵彁浜わ紝鐢卞悗绔竴娆℃€у鐞嗭紙涓?userlist 琛屼负涓€鑷达級
    if (Array.isArray(selectedCompanyIdsForEdit) && selectedCompanyIdsForEdit.length > 0) {
        formData.set('company_ids', JSON.stringify(selectedCompanyIdsForEdit));
    }

    // 璋冭瘯锛氳緭鍑鸿〃鍗曟暟鎹?
    console.log('Submitting form data:');
    for (let [key, value] of formData.entries()) {
        console.log(`  ${key}: ${value}`);
    }

    try {
        const response = await fetch('/api/accounts/update_api.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification('Account updated successfully!', 'success');
            closeEditModal();
            fetchAccounts(); // Refresh the list
        } else {
            console.error('Account update failed:', result);
            console.error('Account ID:', accountId);
            // 濡傛灉鏄?璐︽埛鏇存柊澶辫触鎴栨棤鏉冮檺鎿嶄綔"锛屽彲鑳芥槸鏁版嵁娌℃湁鍙樺寲
            if (result.message && result.message.includes('Account update failed or no permission')) {
                showNotification('Update failed: Data may not have changed, or account does not exist/no permission', 'danger');
            } else {
                showNotification(result.message || 'Account update failed', 'danger');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Update failed: Network error', 'danger');
    }
});

// Add new currency from input
async function addCurrencyFromInput(type, event) {
    // 濡傛灉浼犲叆浜嗕簨浠跺璞★紝闃绘榛樿琛屼负鍜屼簨浠跺啋娉?
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const inputId = type === 'add' ? 'addCurrencyInput' : 'editCurrencyInput';
    const input = document.getElementById(inputId);
    const currencyCode = input.value.trim().toUpperCase();

    if (!currencyCode) {
        showNotification('Please enter currency code', 'danger');
        input.focus();
        return false;
    }

    // 妫€鏌ヨ揣甯佹槸鍚﹀凡瀛樺湪
    const existingCurrency = currencies.find(c => c.code.toUpperCase() === currencyCode);
    if (existingCurrency) {
        showNotification(`Currency ${currencyCode} already exists`, 'info');
        input.value = '';
        return;
    }

    try {
        // 鍒涘缓鏂拌揣甯?- company_id: 椤甸潰閫夋嫨鎴栫紪杈戞ā寮忓璐︽埛宸插叧鑱旂殑鍏徃
        let currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
        if ((!currentCompanyId || currentCompanyId === null) && type === 'edit' && selectedCompanyIdsForEdit && selectedCompanyIdsForEdit.length > 0) {
            currentCompanyId = selectedCompanyIdsForEdit[0];
        }
        if (!currentCompanyId) {
            showNotification('Please select a company first (or switch company in the sidebar)', 'danger');
            return false;
        }
        const response = await fetch('/api/accounts/create_currency_api.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: currencyCode,
                company_id: currentCompanyId
            })
        });

        const result = await response.json();

        if (result.success && result.data) {
            const newCurrencyId = result.data.id;
            // 娣诲姞鍒版湰鍦拌揣甯佸垪琛?
            currencies.push({ id: newCurrencyId, code: result.data.code });

            // 涓嶈嚜鍔ㄩ€変腑鏂版坊鍔犵殑璐у竵锛岃鐢ㄦ埛鎵嬪姩閫夋嫨

            // 閲嶆柊鍔犺浇璐у竵鍒楄〃
            const accountId = type === 'edit' ? currentEditAccountId : null;
            await loadAccountCurrencies(accountId, type);

            // 濡傛灉鏄紪杈戞ā寮忎笖璐︽埛宸插瓨鍦紝鑷姩鍏宠仈鏂拌揣甯佸埌璐︽埛
            if (type === 'edit' && accountId) {
                try {
                    const linkResponse = await fetch('/api/accounts/account_currency_api.php?action=add_currency', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            account_id: accountId,
                            currency_id: newCurrencyId
                        })
                    });

                    const linkResult = await linkResponse.json();
                    if (linkResult.success) {
                        // 閲嶆柊鍔犺浇璐у竵鍒楄〃浠ユ洿鏂伴€変腑鐘舵€?
                        await loadAccountCurrencies(accountId, type);
                        showNotification(`Currency ${currencyCode} created and linked to account successfully`, 'success');
                    } else {
                        showNotification(`Currency ${currencyCode} created successfully, but failed to link to account`, 'warning');
                    }
                } catch (linkError) {
                    console.error('Error linking currency:', linkError);
                    showNotification(`Currency ${currencyCode} created successfully, but failed to link to account`, 'warning');
                }
            } else {
                showNotification(`Currency ${currencyCode} created successfully`, 'success');
            }

            input.value = '';
        } else {
            showNotification(result.message || result.error || 'Failed to create currency', 'danger');
        }
    } catch (error) {
        console.error('Error creating currency:', error);
        showNotification('Failed to create currency', 'danger');
    }

    return false; // 闃叉瑙﹀彂琛ㄥ崟鎻愪氦
}

// Payment alert validation for add modal
function validatePaymentAlertForAdd() {
    const paymentAlert = document.querySelector('input[name="add_payment_alert"]:checked');
    const alertType = document.getElementById('add_alert_type').value;
    const alertStartDate = document.getElementById('add_alert_start_date').value;
    const alertAmount = document.getElementById('add_alert_amount').value;

    if (paymentAlert && paymentAlert.value === '1') {
        // If payment alert is Yes, both alert type and start date must be filled
        if (!alertType || !alertStartDate) {
            showNotification('When Payment Alert is Yes, both Alert Type and Start Date must be filled.', 'danger');
            return false;
        }
        // Validate alert amount must be a negative number
        if (alertAmount && (isNaN(parseFloat(alertAmount)) || parseFloat(alertAmount) >= 0)) {
            showNotification('Alert Amount must be a negative number.', 'danger');
            return false;
        }
    }
    return true;
}

// Handle add form submission
document.getElementById('addAccountForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    // Validate payment alert fields
    if (!validatePaymentAlertForAdd()) {
        return;
    }

    const formData = new FormData(this);

    // Convert radio button name for consistency
    const paymentAlert = document.querySelector('input[name="add_payment_alert"]:checked');
    if (paymentAlert) {
        formData.set('payment_alert', paymentAlert.value);

        // 濡傛灉 payment_alert 涓?0锛屾竻绌?alert 鐩稿叧瀛楁
        if (paymentAlert.value === '0' || paymentAlert.value === 0) {
            formData.set('alert_type', '');
            formData.set('alert_start_date', '');
            formData.set('alert_amount', '');
        }
        // 娉ㄦ剰锛歛lert_amount 宸茬粡鍦ㄨ緭鍏ユ椂鑷姩杞崲涓鸿礋鏁版樉绀猴紝鎵€浠ョ洿鎺ユ彁浜ゅ嵆鍙?
    }

    // 娣诲姞褰撳墠閫夋嫨鐨?company_id
    const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID
    if (currentCompanyId !== null && currentCompanyId !== undefined && currentCompanyId !== '') {
        formData.set('company_id', currentCompanyId)
    }

    // 娣诲姞閫変腑鐨勮揣甯両D锛堝鏋滄湁锛?
    if (selectedCurrencyIdsForAdd.length > 0) {
        formData.set('currency_ids', JSON.stringify(selectedCurrencyIdsForAdd));
    }

    // 娣诲姞閫変腑鐨勫叕鍙窱D锛堝鏋滄湁锛?
    if (selectedCompanyIdsForAdd.length > 0) {
        formData.set('company_ids', JSON.stringify(selectedCompanyIdsForAdd));
    }

    try {
        const response = await fetch('/api/accounts/addaccountapi.php', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            const newAccountId = result.data && result.data.id;
            let hasErrors = false;

            // 濡傛灉璐︽埛鍒涘缓鎴愬姛涓旀湁閫変腑鐨勮揣甯侊紝鍏宠仈杩欎簺璐у竵
            if (selectedCurrencyIdsForAdd.length > 0 && newAccountId) {
                try {
                    // 鎵归噺鍏宠仈璐у竵
                    const currencyPromises = selectedCurrencyIdsForAdd.map(currencyId =>
                        fetch('/api/accounts/account_currency_api.php?action=add_currency', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                account_id: newAccountId,
                                currency_id: currencyId
                            })
                        }).then(res => res.json())
                    );

                    const currencyResults = await Promise.all(currencyPromises);
                    const failedCurrencies = currencyResults.filter(r => !r.success);

                    if (failedCurrencies.length > 0) {
                        console.warn('Some currencies failed to link:', failedCurrencies);
                        hasErrors = true;
                    }
                } catch (currencyError) {
                    console.error('Error linking currencies:', currencyError);
                    hasErrors = true;
                }
            }

            // 濡傛灉璐︽埛鍒涘缓鎴愬姛涓旀湁閫変腑鐨勫叕鍙革紝鍏宠仈杩欎簺鍏徃
            if (selectedCompanyIdsForAdd.length > 0 && newAccountId) {
                try {
                    // 鎵归噺鍏宠仈鍏徃
                    const companyPromises = selectedCompanyIdsForAdd.map(companyId =>
                        fetch('/api/accounts/account_company_api.php?action=add_company', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                account_id: newAccountId,
                                company_id: companyId
                            })
                        }).then(res => res.json())
                    );

                    const companyResults = await Promise.all(companyPromises);
                    const failedCompanies = companyResults.filter(r => !r.success);

                    if (failedCompanies.length > 0) {
                        console.warn('Some companies failed to link:', failedCompanies);
                        hasErrors = true;
                    }
                } catch (companyError) {
                    console.error('Error linking companies:', companyError);
                    hasErrors = true;
                }
            }

            if (hasErrors) {
                showNotification('Account created successfully, but some associations failed', 'warning');
            } else if (selectedCurrencyIdsForAdd.length > 0 || selectedCompanyIdsForAdd.length > 0) {
                showNotification('Account added successfully with currencies and companies!', 'success');
            } else {
                showNotification('Account added successfully!', 'success');
            }

            // 閲嶇疆閫変腑鐨勮揣甯佸垪琛紝淇濈暀褰撳墠鍏徃
            selectedCurrencyIdsForAdd = [];
            const currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
            selectedCompanyIdsForAdd = currentCompanyId ? [currentCompanyId] : [];
            closeAddModal();
            fetchAccounts(); // Refresh the list
        } else {
            const msg = result.error || result.message || 'Failed to add account'
            showNotification(msg, 'danger')
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to add account', 'danger');
    }
});

// Prevent modals from closing when clicking outside their content
window.onclick = function () { }

// Helper function to get day suffix (1st, 2nd, 3rd, etc.)
function getDaySuffix(day) {
    if (day >= 11 && day <= 13) {
        return 'th';
    }
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}



// 鍒囨崲 Company锛堝埛鏂伴〉闈互鍔犺浇鏂?company 鐨勮处鎴峰垪琛級
async function switchAccountListCompany(companyId, companyCode) {
    if (!companyId) {
        console.error('switchAccountListCompany: missing companyId', { companyId, companyCode })
        return
    }
    const spaEmbed =
        (typeof document !== 'undefined' &&
            document.body &&
            document.body.classList.contains('account-list-spa-embed')) ||
        (typeof window !== 'undefined' && window.__ACCOUNT_LIST_SPA_EMBED__ === true);

    if (spaEmbed) {
        try {
            const response = await fetch(
                'api/session/update_company_session_api.php?company_id=' + encodeURIComponent(companyId)
            );
            const result = await response.json();
            if (!result.success) {
                const blocked = (typeof window.handleCompanySwitchDenied === 'function')
                    ? await window.handleCompanySwitchDenied(result)
                    : false;
                if (blocked) return;
                console.error('Failed to update session:', result.message);
            }
        } catch (error) {
            console.error('Error updating session:', error);
        }
        const idNum = typeof companyId === 'string' ? parseInt(companyId, 10) : companyId;
        window.ACCOUNT_LIST_COMPANY_ID = idNum;
        window.ACCOUNT_LIST_SELECTED_COMPANY_IDS_FOR_ADD = [idNum];
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('company_id', String(companyId));
            window.history.replaceState({}, '', url.pathname + url.search);
            window.dispatchEvent(new Event('c168:account-list-url-replaced'));
        } catch (e) {
            /* ignore */
        }
        await fetchAccounts();
        return;
    }

    // 鍏堟洿鏂?session
    try {
        const response = await fetch(`api/session/update_company_session_api.php?company_id=${companyId}`);
        const result = await response.json();
        if (!result.success) {
            const blocked = (typeof window.handleCompanySwitchDenied === 'function')
                ? await window.handleCompanySwitchDenied(result)
                : false;
            if (blocked) return;
            console.error('Failed to update session:', result.message);
            // 非到期/未设置类错误：保持原行为
        }
    } catch (error) {
        console.error('Error updating session:', error);
        // 鍗充娇 API 澶辫触锛屼篃缁х画鍒锋柊椤甸潰锛圥HP 绔細澶勭悊锛?
    }

    // 浣跨敤 URL 鍙傛暟浼犻€?company_id锛岀劧鍚庡埛鏂伴〉闈?
    const url = new URL(window.location.href);
    url.searchParams.set('company_id', companyId);
    window.location.href = url.toString();
}

// 椤甸潰鍔犺浇鏃惰幏鍙栨暟鎹?
function initAccountListPage() {
    loadEditData(); // Load currencies and roles for edit modal
    updateAccountListScrollMode(); // 初始化滚动模式
    fetchAccounts();

    // 缁熶竴绠＄悊闇€瑕佸ぇ鍐欑殑杈撳叆妗?
    const uppercaseInputs = [
        'add_account_id',
        'add_name',
        'edit_name',
        'add_remark',
        'edit_remark',
        'addCurrencyInput',
        'editCurrencyInput'
    ];

    // 涓烘墍鏈夐渶瑕佸ぇ鍐欑殑杈撳叆妗嗘坊鍔犱簨浠剁洃鍚?
    uppercaseInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // 杈撳叆鏃惰浆鎹负澶у啓
            input.addEventListener('input', function () {
                forceUppercase(this);
            });

            // 绮樿创鏃朵篃杞崲涓哄ぇ鍐?
            input.addEventListener('paste', function () {
                setTimeout(() => forceUppercase(this), 0);
            });
        }
    });

    // 涓鸿揣甯佽緭鍏ユ娣诲姞鍥炶溅閿簨浠?
    const editCurrencyInput = document.getElementById('editCurrencyInput');
    if (editCurrencyInput) {
        editCurrencyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCurrencyFromInput('edit');
            }
        });
    }

    const addCurrencyInput = document.getElementById('addCurrencyInput');
    if (addCurrencyInput) {
        addCurrencyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCurrencyFromInput('add');
            }
        });
    }

    // Add event listeners for payment alert radio buttons
    document.querySelectorAll('input[name="payment_alert"]').forEach(radio => {
        radio.addEventListener('change', function () {
            toggleAlertFields('edit');
        });
    });

    document.querySelectorAll('input[name="add_payment_alert"]').forEach(radio => {
        radio.addEventListener('change', function () {
            toggleAlertFields('add');
        });
    });

    // Add event listeners for link type radio buttons
    document.querySelectorAll('input[name="linkType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            currentLinkType = this.value;
            updateLinkTypeDescription();
            // 褰撹繛鎺ョ被鍨嬫敼鍙樻椂锛屾洿鏂版墍鏈夎处鎴风殑鍕鹃€夌姸鎬?
            updateAccountCheckboxesByLinkType();
        });
    });

    // 鏍规嵁褰撳墠閫夋嫨鐨勮繛鎺ョ被鍨嬫洿鏂拌处鎴峰嬀閫夌姸鎬?
    function updateAccountCheckboxesByLinkType() {
        if (!window.linkTypesMap) return;

        const checkboxes = document.querySelectorAll('#linkAccountList input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const accountId = parseInt(checkbox.value);
            const accountLinkType = window.linkTypesMap[accountId];
            const item = checkbox.closest('.account-item-compact');

            if (accountLinkType) {
                // 濡傛灉璐︽埛鏈夎繛鎺ワ紝鏍规嵁杩炴帴绫诲瀷鍖归厤褰撳墠閫夋嫨鐨勭被鍨?
                const shouldBeChecked = accountLinkType === currentLinkType;
                checkbox.checked = shouldBeChecked;

                // 鏇存柊閫変腑鐘舵€佹暟缁?
                if (shouldBeChecked) {
                    if (!selectedLinkedAccountIdsForLink.includes(accountId)) {
                        selectedLinkedAccountIdsForLink.push(accountId);
                    }
                    if (item) {
                        item.style.backgroundColor = '#e8f5e9';
                        item.style.borderColor = '#4caf50';
                    }
                } else {
                    selectedLinkedAccountIdsForLink = selectedLinkedAccountIdsForLink.filter(id => id !== accountId);
                    if (item) {
                        item.style.backgroundColor = 'white';
                        item.style.borderColor = '#eee';
                    }
                }
            } else {
                // 濡傛灉璐︽埛娌℃湁杩炴帴锛屽彇娑堝嬀閫?
                checkbox.checked = false;
                selectedLinkedAccountIdsForLink = selectedLinkedAccountIdsForLink.filter(id => id !== accountId);
                if (item) {
                    item.style.backgroundColor = 'white';
                    item.style.borderColor = '#eee';
                }
            }
        });
    }

    // Alert amount: 鐢ㄦ埛杈撳叆姝ｆ暟锛岃緭鍏ユ鑷姩鏄剧ず涓鸿礋鏁?
    function setupAlertAmountAutoNegative(inputElement) {
        if (!inputElement) return;

        inputElement.addEventListener('input', function () {
            let value = this.value.trim();
            const cursorPos = this.selectionStart;

            // 濡傛灉杈撳叆鐨勬槸绾暟瀛楋紙姝ｆ暟锛夛紝鑷姩娣诲姞璐熷彿
            if (value && /^\d+\.?\d*$/.test(value)) {
                // 鏄函鏁板瓧锛屾坊鍔犺礋鍙?
                this.value = '-' + value;
                // 鎭㈠鍏夋爣浣嶇疆锛堝洜涓烘坊鍔犱簡璐熷彿锛屼綅缃渶瑕?1锛?
                this.setSelectionRange(cursorPos + 1, cursorPos + 1);
            } else if (value && value.startsWith('-')) {
                // 濡傛灉宸茬粡鏈夎礋鍙凤紝妫€鏌ュ悗闈㈢殑鍐呭
                const numPart = value.substring(1);
                if (numPart && !/^\d+\.?\d*$/.test(numPart)) {
                    // 璐熷彿鍚庨潰涓嶆槸鏈夋晥鏁板瓧锛屽彧淇濈暀璐熷彿鍜屾湁鏁堥儴鍒?
                    const validPart = numPart.match(/^\d+\.?\d*/);
                    if (validPart) {
                        this.value = '-' + validPart[0];
                    } else {
                        this.value = '-';
                    }
                }
            } else if (value && !value.startsWith('-')) {
                // 濡傛灉杈撳叆浜嗛潪鏁板瓧瀛楃涓旀病鏈夎礋鍙凤紝灏濊瘯鎻愬彇鏁板瓧閮ㄥ垎
                const numMatch = value.match(/^\d+\.?\d*/);
                if (numMatch) {
                    this.value = '-' + numMatch[0];
                }
            }
        });

        inputElement.addEventListener('blur', function () {
            let value = this.value.trim();
            // 澶卞幓鐒︾偣鏃讹紝纭繚鏄湁鏁堢殑璐熸暟
            if (value) {
                if (value.startsWith('-')) {
                    const numValue = parseFloat(value);
                    if (isNaN(numValue) || numValue >= 0) {
                        // 鏃犳晥鐨勮礋鏁帮紝娓呯┖
                        this.value = '';
                    }
                } else {
                    // 濡傛灉鏄鏁帮紝杞崲涓鸿礋鏁?
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.value = '-' + value;
                    } else {
                        this.value = '';
                    }
                }
            }
        });
    }

    setupAlertAmountAutoNegative(document.getElementById('edit_alert_amount'));
    setupAlertAmountAutoNegative(document.getElementById('add_alert_amount'));

    // Check for URL parameters (error or success)
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const deleted = urlParams.get('deleted');

    if (error === 'cannot_delete_active') {
        showNotification('Cannot delete active accounts. Only inactive accounts can be deleted.', 'danger');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'cannot_delete_used_in_datacapture') {
        const accounts = urlParams.get('accounts') || '';
        const message = accounts
            ? `Cannot delete accounts: ${accounts}. These accounts are being used in datacapture formula settings.`
            : 'Cannot delete accounts. These accounts are being used in datacapture formula settings.';
        showNotification(message, 'danger');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (error === 'delete_failed') {
        showNotification('Failed to delete accounts. Please try again.', 'danger');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (deleted) {
        const count = parseInt(deleted);
        const message = count === 1 ? '1 account deleted successfully' : `${count} accounts deleted successfully`;
        showNotification(message, 'success');
        updateDeleteButton(); // 閲嶇疆鍒犻櫎鎸夐挳鐘舵€?
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    if (document.body && document.body.classList.contains('account-list-spa-embed')) return;
    initAccountListPage();
});
window.runAccountListPageInit = initAccountListPage;

// ==========================================
// Currency Setting Modal Logic
// ==========================================
let currencySettingCurrentCurrencyId = null;
let currencySettingLinkedAccounts = new Set();
let currencySettingInitialLinkedAccounts = new Set();

function openCurrencySettingModal() {
    document.getElementById('currencySettingModal').style.display = 'block';
    currencySettingCurrentCurrencyId = null;
    currencySettingLinkedAccounts.clear();
    currencySettingInitialLinkedAccounts.clear();
    
    // Populate Role filter
    const roleSelect = document.getElementById('currencySettingRoleSelect');
    populateRoleSelect(roleSelect, '', false);
    const options = roleSelect.options;
    if(options.length > 0 && options[0].value === "") {
        options[0].textContent = "Filter Row";
    }

    // Load pills and accounts
    loadCurrencySettingPills();
    renderCurrencySettingAccounts();

    // Setup event listeners for search and filter
    const searchInput = document.getElementById('currencySettingSearchInput');
    const roleFilter = document.getElementById('currencySettingRoleSelect');
    
    // Clear old listeners by cloning
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.addEventListener('input', renderCurrencySettingAccounts);
    
    const newRoleFilter = roleFilter.cloneNode(true);
    roleFilter.parentNode.replaceChild(newRoleFilter, roleFilter);
    newRoleFilter.addEventListener('change', renderCurrencySettingAccounts);
}

function closeCurrencySettingModal() {
    document.getElementById('currencySettingModal').style.display = 'none';
    document.getElementById('currencySettingAddInput').value = '';
    document.getElementById('currencySettingSearchInput').value = '';
    document.getElementById('currencySettingRoleSelect').value = '';
    currencySettingCurrentCurrencyId = null;
    currencySettingLinkedAccounts.clear();
    currencySettingInitialLinkedAccounts.clear();
}

async function addCurrencyFromSettingModal() {
    const input = document.getElementById('currencySettingAddInput');
    const currencyCode = input.value.trim().toUpperCase();

    if (!currencyCode) {
        showNotification('Please enter currency code', 'danger');
        input.focus();
        return;
    }

    let currentCompanyId = window.ACCOUNT_LIST_COMPANY_ID;
    if (!currentCompanyId) {
        showNotification('Please select a company first', 'danger');
        return;
    }

    try {
        const response = await fetch('/api/accounts/create_currency_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: currencyCode, company_id: currentCompanyId })
        });
        const result = await response.json();

        if (result.success && result.data) {
            showNotification(`Currency ${currencyCode} added`, 'success');
            input.value = '';
            // Refresh pills
            await loadCurrencySettingPills();
            
            // Auto click the new currency
            const pills = document.querySelectorAll('.currency-setting-pill');
            for (let pill of pills) {
                if (pill.textContent.trim() === currencyCode) {
                    toggleSettingCurrency(result.data.id, pill);
                    break;
                }
            }
        } else {
            showNotification(result.message || result.error || 'Failed to add currency', 'danger');
        }
    } catch (e) {
        console.error(e);
        showNotification('Network error adding currency', 'danger');
    }
}

async function loadCurrencySettingPills() {
    const container = document.getElementById('currencySettingPillList');
    container.innerHTML = 'Loading...';

    try {
        const response = await fetch('/api/accounts/account_currency_api.php?action=get_available_currencies');
        const result = await response.json();

        container.innerHTML = '';
        if (!result.success || !Array.isArray(result.data)) {
            container.innerHTML = 'No currencies found.';
            return;
        }

        result.data.forEach(currency => {
            const pill = document.createElement('div');
            pill.className = 'currency-setting-pill';
            if (currencySettingCurrentCurrencyId === currency.id) {
                pill.classList.add('selected');
            }
            pill.textContent = currency.code.toUpperCase();
            pill.onclick = () => toggleSettingCurrency(currency.id, pill);
            container.appendChild(pill);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = 'Error loading currencies.';
    }
}

async function toggleSettingCurrency(currencyId, pillElement) {
    if (currencySettingCurrentCurrencyId === currencyId) {
         // Unselect
         currencySettingCurrentCurrencyId = null;
         currencySettingLinkedAccounts.clear();
         currencySettingInitialLinkedAccounts.clear();
         document.querySelectorAll('.currency-setting-pill').forEach(p => p.classList.remove('selected'));
         renderCurrencySettingAccounts();
         return;
    }

    // Select new
    currencySettingCurrentCurrencyId = currencyId;
    document.querySelectorAll('.currency-setting-pill').forEach(p => p.classList.remove('selected'));
    if (pillElement) {
        pillElement.classList.add('selected');
    }

    // Fetch account relations for this currency
    try {
        const response = await fetch(`/api/accounts/bulk_account_currency_api.php?action=get_linked_accounts_by_currency&currency_id=${currencyId}`, {
            method: 'POST'
        });
        const result = await response.json();
        
        currencySettingLinkedAccounts.clear();
        currencySettingInitialLinkedAccounts.clear();
        
        if (result.success && result.data && result.data.linked_account_ids) {
            result.data.linked_account_ids.forEach(id => {
                currencySettingLinkedAccounts.add(Number(id));
                currencySettingInitialLinkedAccounts.add(Number(id));
            });
        }
        renderCurrencySettingAccounts();
    } catch (e) {
         console.error(e);
         showNotification('Error fetching linked accounts', 'danger');
    }
}

function renderCurrencySettingAccounts() {
    const container = document.getElementById('currencySettingAccountList');
    container.innerHTML = '';

    const searchTerm = document.getElementById('currencySettingSearchInput').value.toLowerCase().trim();
    const roleFilter = document.getElementById('currencySettingRoleSelect').value.toLowerCase().trim();

    // Use global 'accounts' array loaded by fetchAccounts()
    let filtered = accounts.filter(acc => {
        let matchesSearch = true;
        let matchesRole = true;

        if (searchTerm) {
            const accStr = (acc.account_id || '') + ' ' + (acc.name || '');
            matchesSearch = accStr.toLowerCase().includes(searchTerm);
        }

        if (roleFilter) {
            let accRole = (acc.role || '').toLowerCase().trim();
            if (accRole === 'upline') accRole = 'supplier'; // compatibility
            let filterRole = roleFilter === 'upline' ? 'supplier' : roleFilter;
            matchesRole = (accRole === filterRole);
        }

        return matchesSearch && matchesRole;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1 / -1; padding: 20px; text-align: center; color: #666;">No accounts found.</div>';
        return;
    }

    filtered.forEach(acc => {
        const item = document.createElement('div');
        item.className = 'currency-setting-account-item';
        
        const isSelected = currencySettingLinkedAccounts.has(Number(acc.id));
        if (isSelected) {
            item.classList.add('selected');
        }
        
        item.textContent = (acc.account_id || '').toUpperCase();
        
        item.onclick = () => {
            if (!currencySettingCurrentCurrencyId) {
                showNotification('Please select a Currency first', 'info');
                return;
            }
            if (currencySettingLinkedAccounts.has(Number(acc.id))) {
                currencySettingLinkedAccounts.delete(Number(acc.id));
                item.classList.remove('selected');
            } else {
                currencySettingLinkedAccounts.add(Number(acc.id));
                item.classList.add('selected');
            }
        };

        container.appendChild(item);
    });

    // Update Select All UI after rendering
    updateCurrencySettingSelectAllUI(filtered);
}

function updateCurrencySettingSelectAllUI(filteredAccounts) {
    const btn = document.getElementById('currencySettingSelectAllBtn');
    const countSpan = document.getElementById('currencySettingSelectedCount');
    if (!btn || !countSpan) return;

    const list = filteredAccounts || [];
    const totalVisible = list.length;
    const selectedVisible = list.filter(acc => currencySettingLinkedAccounts.has(Number(acc.id))).length;

    // Update count badge (total linked across all, not just filtered)
    const totalLinked = currencySettingLinkedAccounts.size;
    countSpan.textContent = totalLinked + ' selected';

    // Toggle button label based on filter-visible state
    if (totalVisible > 0 && selectedVisible === totalVisible) {
        btn.textContent = 'Deselect All';
        btn.classList.add('active');
    } else {
        btn.textContent = 'Select All';
        btn.classList.remove('active');
    }
}

function toggleSelectAllCurrencyAccounts() {
    if (!currencySettingCurrentCurrencyId) {
        showNotification('Please select a Currency first', 'info');
        return;
    }

    const searchTerm = document.getElementById('currencySettingSearchInput').value.toLowerCase().trim();
    const roleFilter = document.getElementById('currencySettingRoleSelect').value.toLowerCase().trim();

    // Determine currently visible (filtered) accounts
    const filtered = accounts.filter(acc => {
        let matchesSearch = true;
        let matchesRole = true;
        if (searchTerm) {
            const accStr = (acc.account_id || '') + ' ' + (acc.name || '');
            matchesSearch = accStr.toLowerCase().includes(searchTerm);
        }
        if (roleFilter) {
            let accRole = (acc.role || '').toLowerCase().trim();
            if (accRole === 'upline') accRole = 'supplier';
            let filterRole = roleFilter === 'upline' ? 'supplier' : roleFilter;
            matchesRole = (accRole === filterRole);
        }
        return matchesSearch && matchesRole;
    });

    const allSelected = filtered.every(acc => currencySettingLinkedAccounts.has(Number(acc.id)));

    if (allSelected) {
        // Deselect all visible
        filtered.forEach(acc => currencySettingLinkedAccounts.delete(Number(acc.id)));
    } else {
        // Select all visible
        filtered.forEach(acc => currencySettingLinkedAccounts.add(Number(acc.id)));
    }

    // Re-render to reflect changes
    renderCurrencySettingAccounts();
}

async function saveCurrencySetting() {
    if (!currencySettingCurrentCurrencyId) {
        showNotification('No currency selected to save', 'info');
        return;
    }
    
    const linked = [];
    const unlinked = [];
    
    accounts.forEach(acc => {
        let accId = Number(acc.id);
        const originallyLinked = currencySettingInitialLinkedAccounts.has(accId);
        const currentlyLinked = currencySettingLinkedAccounts.has(accId);
        
        if (currentlyLinked && !originallyLinked) {
            linked.push(accId);
        } else if (!currentlyLinked && originallyLinked) {
            unlinked.push(accId);
        }
    });

    if (linked.length === 0 && unlinked.length === 0) {
        showNotification('No changes detected', 'info');
        closeCurrencySettingModal();
        return;
    }

    try {
        const response = await fetch('/api/accounts/bulk_account_currency_api.php?action=bulk_update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currency_id: currencySettingCurrentCurrencyId,
                linked_account_ids: linked,
                unlinked_account_ids: unlinked
            })
        });

        const result = await response.json();
        if (result.success) {
            showNotification('Currency settings saved successfully', 'success');
            closeCurrencySettingModal();
            fetchAccounts();
        } else {
            showNotification(result.message || 'Error saving settings', 'danger');
        }
    } catch (e) {
        console.error(e);
        showNotification('Network error saving settings', 'danger');
    }
}
