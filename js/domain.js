// PHP 变量由 domain.php 内联脚本注入到 window
var hasC168Context = typeof window.DOMAIN_HAS_C168_CONTEXT !== 'undefined' ? window.DOMAIN_HAS_C168_CONTEXT : false;
var isOwnerOrAdmin = typeof window.DOMAIN_IS_OWNER_OR_ADMIN !== 'undefined' ? window.DOMAIN_IS_OWNER_OR_ADMIN : false;

// ★★★ SINGLE_CATEGORY_MODE ★★★
// 设为 true 时：Company Settings 弹窗中 Permissions 只能选择一个分类（互斥），
// 选中新分类会自动取消之前的选中项。
// 恢复原状只需将此值改为 false。
var SINGLE_CATEGORY_MODE = true;

// 分页相关变量
let currentPage = 1;
let rowsPerPage = 20;
let filteredRows = [];
let allRows = [];

// Companies管理变量 - 现在存储对象数组 {company_id, expiration_date, group_id}
let selectedCompanies = [];
let tempCompanies = [];

// Group管理变量
let tempGroups = [];        // 当前 owner 的所有 group_id 列表 (string[])
let selectedGroupId = null; // 当前选中的 group pill（null = 显示未归组公司）
let isMultipleChoiceMode = false; // "Multiple Choice" 模式：勾选公司分配到选中的 group

// ==========================================================================
// Chips with Overflow — shared renderer
// MAX_VISIBLE: 最多显示几个普通 chip，超出部分折叠为 "+N" chip
// ==========================================================================
const MAX_VISIBLE = 3;

/**
 * 将公司列表渲染为带折叠的 chip 组 HTML 字符串。
 * @param {string[]} companyList  - 公司代号字符串数组
 * @param {Array}    companiesFull - 完整公司对象数组（含 expiration_date），可为空
 * @returns {string} HTML 字符串
 */
function renderChipsHTML(companyList, companiesFull) {
    if (!companyList || companyList.length === 0) return '-';

    const visible = companyList.slice(0, MAX_VISIBLE);
    const hidden = companyList.slice(MAX_VISIBLE);

    const visibleHTML = visible.map(function (companyId) {
        const companyIdTrim = companyId.trim();
        const companyInfo = (companiesFull || []).find(function (c) { return c.company_id === companyIdTrim; });
        const expDate = companyInfo ? companyInfo.expiration_date : null;
        const expAttr = expDate ? ' data-exp="' + expDate + '"' : '';
        return '<span class="chip company-badge"' + expAttr + '>' + companyIdTrim + '</span>';
    }).join('');

    let moreHTML = '';
    if (hidden.length > 0) {
        const hiddenNames = hidden.map(function (id) { return id.trim(); }).join(', ');
        moreHTML = '<span class="chip-more" title="' + hiddenNames + '">+' + hidden.length + '</span>';
    }

    return '<div class="chip-group">' + visibleHTML + moreHTML + '</div>';
}

// 计算到期日期
// startDate: 可选的起始日期（YYYY-MM-DD格式），如果提供则从该日期开始计算，否则从今天开始
function calculateExpirationDate(period, startDate = null) {
    let baseDate;
    if (startDate) {
        // 如果提供了起始日期，从该日期开始计算
        baseDate = new Date(startDate);
    } else {
        // 如果没有提供起始日期，从今天开始计算
        baseDate = new Date();
    }

    const expDate = new Date(baseDate);

    switch (period) {
        case '7days':
            expDate.setDate(baseDate.getDate() + 7);
            break;
        case '1month':
            expDate.setMonth(baseDate.getMonth() + 1);
            break;
        case '3months':
            expDate.setMonth(baseDate.getMonth() + 3);
            break;
        case '6months':
            expDate.setMonth(baseDate.getMonth() + 6);
            break;
        case '1year':
            expDate.setFullYear(baseDate.getFullYear() + 1);
            break;
        default:
            expDate.setMonth(baseDate.getMonth() + 1);
    }

    return expDate.toISOString().split('T')[0]; // 返回 YYYY-MM-DD 格式
}

// 格式化日期显示
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// 计算倒计时
function calculateCountdown(expirationDate) {
    if (!expirationDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDate);
    exp.setHours(0, 0, 0, 0);

    const diffTime = exp - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { text: 'Expired', days: diffDays, status: 'expired' };
    } else if (diffDays === 0) {
        return { text: 'Expires today', days: 0, status: 'warning' };
    } else if (diffDays <= 7) {
        return { text: `${diffDays} day${diffDays > 1 ? 's' : ''} left`, days: diffDays, status: 'warning' };
    } else if (diffDays <= 30) {
        return { text: `${diffDays} days left`, days: diffDays, status: 'normal' };
    } else {
        const months = Math.floor(diffDays / 30);
        const days = diffDays % 30;
        if (days === 0) {
            return { text: `${months} month${months > 1 ? 's' : ''} left`, days: diffDays, status: 'normal' };
        } else {
            return { text: `${months}m ${days}d left`, days: diffDays, status: 'normal' };
        }
    }
}

// 初始化分页
function initializePagination() {
    allRows = Array.from(document.querySelectorAll('#domainTableBody .domain-card'));

    // 获取当前搜索过滤的行
    filteredRows = allRows.filter(row => !row.classList.contains('table-row-hidden'));

    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

    // 如果当前页超过总页数，回到第一页
    if (currentPage > totalPages) {
        currentPage = 1;
    }

    updatePagination();
    showCurrentPage();
}

// 显示自定义确认弹窗
function showConfirmModal(message, onConfirm) {
    document.getElementById('confirmMessage').textContent = message;
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'flex';  // 改为 flex
    document.body.style.overflow = 'hidden';  // 添加这行，禁止背景滚动

    // 绑定确认按钮点击事件
    document.getElementById('confirmDeleteBtn').onclick = function () {
        closeConfirmModal();
        onConfirm();
    };
}

// 关闭确认弹窗
function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    document.body.style.overflow = '';  // 添加这行，恢复背景滚动
}

// 更新分页控件
function updatePagination() {
    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

    // 更新分页控件信息
    document.getElementById('paginationInfo').textContent = `${currentPage} of ${totalPages}`;

    // 更新按钮状态
    const isPrevDisabled = currentPage <= 1;
    const isNextDisabled = currentPage >= totalPages;

    document.getElementById('prevBtn').disabled = isPrevDisabled;
    document.getElementById('nextBtn').disabled = isNextDisabled;

    // 如果只有一页或没有数据，隐藏分页控件
    const paginationContainer = document.getElementById('paginationContainer');

    if (filteredRows.length === 0) {
        paginationContainer.style.display = 'none';
    } else {
        paginationContainer.style.display = 'flex';
    }
}

// 显示当前页
function showCurrentPage() {
    // 移除所有行的显示class
    allRows.forEach(row => {
        row.classList.remove('show-card');
    });

    // 计算当前页的起始和结束索引
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;

    // 显示当前页的行并更新序号
    for (let i = startIndex; i < endIndex && i < filteredRows.length; i++) {
        const row = filteredRows[i];
        row.classList.add('show-card');

        // 更新序号
        const rowNumber = startIndex + (i - startIndex) + 1;
        row.querySelector('.card-item').textContent = rowNumber;
    }

    // 重新初始化当前页的点击事件
    initializeCompanyClickHandlers();
}

// 切换页面
function changePage(direction) {
    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

    if (direction === -1 && currentPage > 1) {
        currentPage--;
    } else if (direction === 1 && currentPage < totalPages) {
        currentPage++;
    }

    updatePagination();
    showCurrentPage();
}

let isEditMode = false;

// 强制输入大写字母、数字和符号
function forceUppercase(input) {
    // 获取光标位置（部分类型可能不支持 selectionStart）
    const cursorPosition = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    // 转换为大写
    const upperValue = input.value.toUpperCase();
    // 设置值
    input.value = upperValue;
    // 恢复光标位置（某些输入类型不支持 setSelectionRange，需要捕获）
    try {
        if (typeof input.setSelectionRange === 'function') {
            input.setSelectionRange(cursorPosition, cursorPosition);
        }
    } catch (err) {
        // ignore selection errors for unsupported input types
    }
}

// 强制输入小写字母并过滤中文
function forceLowercase(input) {
    // 获取光标位置（部分类型可能不支持 selectionStart）
    const cursorPosition = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    // 过滤中文字符，只保留英文、数字和特殊符号
    const filteredValue = input.value.replace(/[\u4e00-\u9fa5]/g, '');
    // 转换为小写
    const lowerValue = filteredValue.toLowerCase();
    // 设置值
    input.value = lowerValue;
    // 恢复光标位置
    const newCursorPosition = Math.min(cursorPosition, lowerValue.length);
    try {
        if (typeof input.setSelectionRange === 'function') {
            input.setSelectionRange(newCursorPosition, newCursorPosition);
        }
    } catch (err) {
        // ignore selection errors for unsupported input types
    }
}

// 强制输入只能为数字（用于二级密码）
function forceNumeric(input) {
    const cursorPosition = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    // 只保留数字
    const numericValue = input.value.replace(/[^0-9]/g, '');
    // 限制为6位
    const limitedValue = numericValue.slice(0, 6);
    input.value = limitedValue;
    // 恢复光标位置
    try {
        if (typeof input.setSelectionRange === 'function') {
            const newCursorPosition = Math.min(cursorPosition, limitedValue.length);
            input.setSelectionRange(newCursorPosition, newCursorPosition);
        }
    } catch (err) {
        // ignore selection errors
    }
}

// 为输入框添加事件监听器
function setupInputFormatting() {
    const uppercaseInputs = ['owner_code', 'name'];
    const lowercaseInputs = ['email'];

    // 处理大写输入框
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

    // 处理小写输入框
    lowercaseInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // 输入时转换为小写
            input.addEventListener('input', function () {
                forceLowercase(this);
            });

            // 粘贴时也转换为小写
            input.addEventListener('paste', function () {
                setTimeout(() => forceLowercase(this), 0);
            });
        }
    });

    // 处理二级密码输入框（只允许数字，最多6位）
    const secondaryPasswordInput = document.getElementById('secondary_password');
    if (secondaryPasswordInput) {
        secondaryPasswordInput.addEventListener('input', function () {
            forceNumeric(this);
        });

        secondaryPasswordInput.addEventListener('paste', function () {
            setTimeout(() => forceNumeric(this), 0);
        });
    }
}

// Company管理相关函数
// 初始化 tempCompanies（在打开 Domain Modal 时调用）
function initTempCompanies(extraGroups = []) {
    tempCompanies = selectedCompanies.map(c => ({ ...c }));
    tempCompanies.forEach(company => {
        company.originalExpirationDate = company.expiration_date || null;
        company.selectedPeriod = company.expiration_date ? getPeriodFromDate(company.expiration_date) : null;
        company.startDate = company.expiration_date ? null : new Date().toISOString().split('T')[0];
        company.isExtending = company.expiration_date ? true : false;
        ensureCompanyFeeShare(company);
        company.fee_share_allocations = normalizeFeeShareFromServer(company.fee_share_allocations);
    });
    // 提取 unique group_ids
    const groupsFromCompanies = tempCompanies.filter(c => c.group_id).map(c => c.group_id);
    tempGroups = [...new Set([...groupsFromCompanies, ...extraGroups])];
    selectedGroupId = null;
    isMultipleChoiceMode = false;
    resetMultipleChoiceBtn();
    updateGroupPills();
    updateCompanyDisplay();
}

// 重置 Multiple Choice 按钮状态 + 根据是否有 group 来显示/隐藏
function resetMultipleChoiceBtn() {
    const btn = document.getElementById('multipleChoiceBtn');
    if (!btn) return;
    btn.classList.remove('active');
    btn.textContent = 'Multiple Choice';
    updateMultipleChoiceBtnVisibility();
}

// 只有选中了某个 group 时才显示 Multiple Choice 按钮
function updateMultipleChoiceBtnVisibility() {
    const btn = document.getElementById('multipleChoiceBtn');
    if (!btn) return;
    btn.style.display = selectedGroupId ? 'inline-block' : 'none';
}

// ============ Group 管理 ============
function addGroupToList() {
    const input = document.getElementById('groupInput');
    const groupId = input.value.trim().toUpperCase();
    if (!groupId) {
        showAlert('Please enter a Group ID', 'danger');
        return;
    }
    if (tempGroups.includes(groupId)) {
        showAlert('Group ID already exists', 'danger');
        return;
    }
    tempGroups.push(groupId);
    updateGroupPills();
    input.value = '';
    showAlert(`Group "${groupId}" added!`);
}

function removeGroup(groupId) {
    const count = tempCompanies.filter(c => c.group_id === groupId).length;
    const msg = count > 0
        ? `Are you sure you want to delete group "${groupId}"?\n\n${count} company(ies) in this group will become ungrouped.`
        : `Are you sure you want to delete group "${groupId}"?`;
    if (!confirm(msg)) return;

    // 把该 group 下的公司变回独立
    tempCompanies.forEach(c => {
        if (c.group_id === groupId) {
            c.group_id = null;
        }
    });
    tempGroups = tempGroups.filter(g => g !== groupId);
    if (selectedGroupId === groupId) {
        selectedGroupId = null;
        isMultipleChoiceMode = false;
    }
    resetMultipleChoiceBtn();
    updateGroupPills();
    updateCompanyDisplay();
    syncCompaniesHiddenField();
    showAlert(`Group "${groupId}" removed`);
}

function selectGroup(groupId) {
    if (selectedGroupId === groupId) {
        selectedGroupId = null;
    } else {
        selectedGroupId = groupId;
    }
    isMultipleChoiceMode = false;
    resetMultipleChoiceBtn();
    updateGroupPills();
    updateCompanyDisplay();
}

function updateGroupPills() {
    const container = document.getElementById('groupPillsContainer');
    if (!container) return;
    if (tempGroups.length === 0) {
        container.innerHTML = '<span style="color: #94a3b8; font-size: 12px;">No groups created</span>';
        return;
    }
    container.innerHTML = tempGroups.map(gid => {
        const isActive = selectedGroupId === gid;
        const count = tempCompanies.filter(c => c.group_id === gid).length;
        return `
            <span class="group-pill ${isActive ? 'active' : ''}" onclick="selectGroup('${gid}')">
                ${gid} (${count})
                <span class="remove-x" onclick="event.stopPropagation(); removeGroup('${gid}')">&times;</span>
            </span>
        `;
    }).join('');
}

// ============ Multiple Choice 模式 ============
function toggleMultipleChoice() {
    if (!selectedGroupId) {
        showAlert('Please select a Group first', 'danger');
        return;
    }
    isMultipleChoiceMode = !isMultipleChoiceMode;
    const btn = document.getElementById('multipleChoiceBtn');
    if (btn) {
        btn.classList.toggle('active', isMultipleChoiceMode);
        btn.textContent = isMultipleChoiceMode ? 'Done ✓' : 'Multiple Choice';
    }
    updateCompanyDisplay();
    if (!isMultipleChoiceMode) {
        updateGroupPills(); // 退出时刷新 pill 上的数量
    }
}

function toggleCompanyGroup(companyId) {
    if (!selectedGroupId) return;
    const company = tempCompanies.find(c => c.company_id === companyId);
    if (!company) return;
    if (company.group_id === selectedGroupId) {
        // 已在该 group → 移出
        company.group_id = null;
    } else {
        // 加入该 group
        company.group_id = selectedGroupId;
    }
    updateGroupPills();
    updateCompanyDisplay();
    syncCompaniesHiddenField();
}

// openCompanyModal / closeCompanyModal are no longer used;
// companies are managed inline in the domain modal.

function addCompanyToList() {
    const input = document.getElementById('companyInput');
    const companyId = input.value.trim().toUpperCase();

    if (!companyId) {
        showAlert('Please enter a company ID', 'danger');
        return;
    }

    // 检查是否已存在
    if (tempCompanies.some(c => c.company_id === companyId)) {
        showAlert('Company ID already added', 'danger');
        return;
    }

    // 添加新公司（C168 是永久公司，无到期日）
    const isC168 = companyId === 'C168';
    const today = new Date().toISOString().split('T')[0]; // 今天的日期 YYYY-MM-DD
    const newExpirationDate = isC168 ? null : calculateExpirationDate('1month', today);
    tempCompanies.push({
        company_id: companyId,
        expiration_date: newExpirationDate,
        originalExpirationDate: newExpirationDate,
        startDate: today,
        isExtending: false,
        group_id: selectedGroupId || null, // 新添加的公司默认是独立的，如果有选中group则归入该group
        fee_share_allocations: defaultFeeShareAllocations()
    });

    if (selectedGroupId) {
        updateGroupPills();
    }

    updateCompanyDisplay();
    input.value = '';
}

function removeCompanyFromList(companyId) {
    tempCompanies = tempCompanies.filter(c => c.company_id !== companyId);
    updateCompanyDisplay();
}

function updateCompanyExpiration(companyId, period) {
    // 如果选择的是占位符选项，不执行更新
    if (!period || period === '') {
        return;
    }
    const company = tempCompanies.find(c => c.company_id === companyId);
    if (company) {
        let startDate;
        if (company.isExtending) {
            // 续上时间：从原始到期日期开始计算
            startDate = company.originalExpirationDate || null;
        } else {
            // 新添加或重置：使用用户选择的开始日期，如果没有则使用今天
            startDate = company.startDate || new Date().toISOString().split('T')[0];
        }
        company.expiration_date = calculateExpirationDate(period, startDate);
        // 记录用户选择的period，这样下拉框会显示选中的选项
        company.selectedPeriod = period;
        updateCompanyDisplay();
    }
}

// 更新开始日期
function updateCompanyStartDate(companyId, startDate) {
    const company = tempCompanies.find(c => c.company_id === companyId);
    if (company && !company.isExtending) {
        // 只有在新添加或重置时才能修改开始日期
        company.startDate = startDate;
        // 如果已经选择了period，重新计算到期日期
        if (company.selectedPeriod) {
            company.expiration_date = calculateExpirationDate(company.selectedPeriod, startDate);
        }
        updateCompanyDisplay();
    }
}

// 重置到期日期
function resetCompanyExpiration(companyId) {
    const company = tempCompanies.find(c => c.company_id === companyId);
    if (company) {
        // 重置为今天
        const today = new Date().toISOString().split('T')[0];
        company.startDate = today;
        company.isExtending = false; // 重置后可以修改开始日期
        company.originalExpirationDate = null; // 清除原始到期日期
        // 如果之前选择了period，保持选择并重新计算到期日期
        if (company.selectedPeriod) {
            company.expiration_date = calculateExpirationDate(company.selectedPeriod, today);
        } else {
            // 如果没有选择period，清除到期日期
            company.expiration_date = null;
        }
        updateCompanyDisplay();
    }
}

// 当前正在编辑的公司ID（用于弹窗）
let currentEditingCompanyId = null;
// 打开弹窗时该公司状态的快照，Cancel 时用于还原
let companySnapshotWhenModalOpened = null;
// Company Settings → Share %：下拉账户列表（来自 API）
let shareModalAccounts = [];
let domainFeePriceCache = 0;

function defaultFeeShareAllocations() {
    return { sales: [], cs: [], it: [] };
}

function normalizeFeeShareFromServer(raw) {
    const d = defaultFeeShareAllocations();
    if (!raw || typeof raw !== 'object') {
        return d;
    }
    ['sales', 'cs', 'it'].forEach(function (k) {
        if (Array.isArray(raw[k])) {
            d[k] = raw[k].map(function (r) {
                return {
                    account_id: parseInt(r.account_id, 10) || 0,
                    percentage: r.percentage != null ? parseFloat(r.percentage) : 0
                };
            }).filter(function (r) { return r.account_id !== 0; });
        }
    });
    return d;
}

function ensureCompanyFeeShare(company) {
    if (!company) {
        return;
    }
    if (!company.fee_share_allocations || typeof company.fee_share_allocations !== 'object') {
        company.fee_share_allocations = defaultFeeShareAllocations();
    }
    ['sales', 'cs', 'it'].forEach(function (k) {
        if (!Array.isArray(company.fee_share_allocations[k])) {
            company.fee_share_allocations[k] = [];
        }
    });
}

function isFeeShareAllocationsEmpty(fs) {
    if (!fs || typeof fs !== 'object') {
        return true;
    }
    return (!fs.sales || !fs.sales.length) && (!fs.cs || !fs.cs.length) && (!fs.it || !fs.it.length);
}

function escapeHtmlShare(str) {
    if (!str) {
        return '';
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}

function buildShareAccountOptionsHtml(selectedId) {
    var sel = selectedId !== undefined && selectedId !== null && selectedId !== '' ? String(selectedId) : '';
    var h = '<option value="">— Select —</option>';
    shareModalAccounts.forEach(function (a) {
        var id = String(a.id);
        var label = (a.account_id || '');
        h += '<option value="' + id + '"' + (id === sel ? ' selected' : '') + '>' + escapeHtmlShare(label) + '</option>';
    });
    return h;
}

function readFeeShareFromModalDom() {
    var out = defaultFeeShareAllocations();
    var cfg = [['sales', 'shareRowsSales'], ['cs', 'shareRowsCs'], ['it', 'shareRowsIt']];
    cfg.forEach(function (pair) {
        var role = pair[0];
        var tid = pair[1];
        var tb = document.getElementById(tid);
        if (!tb) {
            return;
        }
        tb.querySelectorAll('.company-share-data-row').forEach(function (tr) {
            var sEl = tr.querySelector('.share-account-select');
            var pEl = tr.querySelector('.share-pct-input');
            var aid = sEl ? parseInt(sEl.value, 10) : 0;
            var pct = pEl ? String(pEl.value).trim() : '';
            // Keep incomplete rows in local state so users can add multiple rows
            // continuously without previous empty rows being dropped.
            if (pct === '') {
                out[role].push({ account_id: aid, percentage: '' });
                return;
            }
            var pctNum = parseFloat(pct);
            out[role].push({ account_id: aid, percentage: isFinite(pctNum) ? pctNum : '' });
        });
    });
    return out;
}

function syncFeeShareFromDomToCompany(company) {
    ensureCompanyFeeShare(company);
    company.fee_share_allocations = readFeeShareFromModalDom();
}

function pruneEmptyShareRows(fs) {
    var out = defaultFeeShareAllocations();
    if (!fs || typeof fs !== 'object') {
        return out;
    }
    ['sales', 'cs', 'it'].forEach(function (role) {
        var rows = Array.isArray(fs[role]) ? fs[role] : [];
        out[role] = rows.filter(function (row) {
            var aid = row && row.account_id !== undefined ? parseInt(row.account_id, 10) : 0;
            // Keep only rows with a selected account.
            return aid !== 0;
        }).map(function (row) {
            var pct = row && row.percentage !== undefined && row.percentage !== null && row.percentage !== ''
                ? parseFloat(row.percentage)
                : '';
            return {
                account_id: parseInt(row.account_id, 10) || 0,
                percentage: isFinite(pct) ? pct : ''
            };
        });
    });
    return out;
}

function countShareRoleAssignedAccounts(role) {
    var map = { sales: 'shareRowsSales', cs: 'shareRowsCs', it: 'shareRowsIt' };
    var tb = document.getElementById(map[role]);
    if (!tb) {
        return 0;
    }
    var n = 0;
    tb.querySelectorAll('.company-share-data-row').forEach(function (tr) {
        var sel = tr.querySelector('.share-account-select');
        var aid = sel ? parseInt(sel.value, 10) : 0;
        if (aid !== 0) {
            n++;
        }
    });
    return n;
}

function collapseAllShareRoleCards() {
    document.querySelectorAll('.company-share-role-card').forEach(function (card) {
        card.classList.remove('expanded');
        var hdr = card.querySelector('.company-share-role-header');
        if (hdr) {
            hdr.setAttribute('aria-expanded', 'false');
        }
    });
}

function toggleShareRoleCard(role) {
    var card = document.querySelector('.company-share-role-card[data-share-card="' + role + '"]');
    if (!card) {
        return;
    }
    card.classList.toggle('expanded');
    var hdr = card.querySelector('.company-share-role-header');
    if (hdr) {
        hdr.setAttribute('aria-expanded', card.classList.contains('expanded') ? 'true' : 'false');
    }
}

function updateCompanyShareTotals() {
    var out = readFeeShareFromModalDom();
    var grand = 0;
    [['sales', 'shareTotalSales'], ['cs', 'shareTotalCs'], ['it', 'shareTotalIt']].forEach(function (pair) {
        var role = pair[0];
        var tid = pair[1];
        var el = document.getElementById(tid);
        if (!el) {
            return;
        }
        var t = 0;
        (out[role] || []).forEach(function (r) {
            t += parseFloat(r.percentage) || 0;
        });
        grand += t;
        el.textContent = t.toFixed(2) + '%';
        el.classList.toggle('company-share-card-sum--over', t > 100);

        var count = countShareRoleAssignedAccounts(role);
        var sumEl = document.getElementById('shareAccountSummary-' + role);
        if (sumEl) {
            sumEl.textContent = count === 1 ? '1 account' : count + ' accounts';
        }
        var fill = document.getElementById('shareProgressFill-' + role);
        if (fill) {
            var w = Math.min(100, Math.max(0, t));
            fill.style.width = w + '%';
            fill.classList.toggle('company-share-progress-fill--over', t > 100);
        }
    });
    var grandEl = document.getElementById('shareGrandTotal');
    var grandBar = document.getElementById('shareGrandTotalBar');
    if (grandEl) {
        grandEl.textContent = grand.toFixed(2) + '%';
    }
    if (grandBar) {
        grandBar.classList.toggle('company-share-grand-total--over', grand > 100);
    }
    updateCompanyShareRowAmounts();
}

function getDomainPriceForShareCalc() {
    var n = Number(domainFeePriceCache);
    return isFinite(n) ? n : 0;
}

function formatShareRowAmount2(value) {
    var n = Number(value);
    if (!isFinite(n)) {
        return '0.00';
    }
    return n.toFixed(2);
}

function updateCompanyShareRowAmounts() {
    var price = getDomainPriceForShareCalc();
    var rows = document.querySelectorAll('.company-share-data-row');
    rows.forEach(function (row) {
        var pctEl = row.querySelector('.share-pct-input');
        var amountEl = row.querySelector('.company-share-amount-input');
        if (!pctEl || !amountEl) {
            return;
        }
        var pct = parseFloat(pctEl.value);
        if (!isFinite(pct) || pct < 0) {
            pct = 0;
        }
        // percentage input uses % unit, so convert by /100.
        var amount = price * (pct / 100);
        amountEl.value = formatShareRowAmount2(amount);
    });
}

function renderCompanySharePanel() {
    if (!currentEditingCompanyId) {
        return;
    }
    var company = tempCompanies.find(function (c) { return c.company_id === currentEditingCompanyId; });
    if (!company) {
        return;
    }
    ensureCompanyFeeShare(company);
    var map = { sales: 'shareRowsSales', cs: 'shareRowsCs', it: 'shareRowsIt' };
    Object.keys(map).forEach(function (role) {
        var tbody = document.getElementById(map[role]);
        if (!tbody) {
            return;
        }
        tbody.innerHTML = '';
        company.fee_share_allocations[role].forEach(function (row, idx) {
            var tr = document.createElement('div');
            tr.className = 'company-share-data-row';
            tr.setAttribute('role', 'listitem');
            var pctVal = row.percentage !== undefined && row.percentage !== null && row.percentage !== ''
                ? row.percentage
                : '';
            tr.innerHTML = '<div class="company-share-cell company-share-cell-account">' +
                '<select class="share-account-select company-share-select" aria-label="Account">' +
                buildShareAccountOptionsHtml(row.account_id) +
                '</select></div>' +
                '<div class="company-share-cell company-share-cell-pct">' +
                '<div class="company-share-pct-wrap">' +
                '<input type="number" class="share-pct-input company-share-pct-input" step="0.1" min="0" max="100" value="' +
                (pctVal !== '' ? escapeHtmlShare(String(pctVal)) : '') + '" placeholder="0" inputmode="decimal" aria-label="Percentage" />' +
                '<span class="company-share-pct-suffix">%</span></div></div>' +
                '<div class="company-share-cell company-share-cell-amount">' +
                '<input type="text" class="company-share-amount-input" value="0.00" readonly tabindex="-1" aria-label="Calculated total" />' +
                '</div>' +
                '<div class="company-share-cell company-share-cell-remove">' +
                '<button type="button" class="company-share-remove-btn" data-share-role="' + role + '" data-share-idx="' + idx + '" title="Remove row" aria-label="Remove row">' +
                '<span aria-hidden="true">&times;</span></button></div>';
            tbody.appendChild(tr);
            tr.querySelector('.company-share-remove-btn').addEventListener('click', function () {
                removeCompanyShareRow(this.getAttribute('data-share-role'), parseInt(this.getAttribute('data-share-idx'), 10));
            });
        });
        tbody.querySelectorAll('.share-account-select, .share-pct-input').forEach(function (el) {
            el.addEventListener('change', updateCompanyShareTotals);
            el.addEventListener('input', updateCompanyShareTotals);
        });
        var card = tbody.closest('.company-share-role-card');
        if (card) {
            card.classList.toggle('company-share-role-card--empty', tbody.children.length === 0);
        }
    });
    var hint = document.getElementById('companyShareNoAccountsHint');
    if (hint) {
        hint.style.display = shareModalAccounts.length ? 'none' : 'block';
    }
    updateCompanyShareTotals();
}

function addCompanyShareRow(role) {
    if (!currentEditingCompanyId) {
        return;
    }
    var company = tempCompanies.find(function (c) { return c.company_id === currentEditingCompanyId; });
    if (!company) {
        return;
    }
    ensureCompanyFeeShare(company);
    syncFeeShareFromDomToCompany(company);
    // Remove unfinished rows added via "+ Add Account" when user saves.
    company.fee_share_allocations = pruneEmptyShareRows(company.fee_share_allocations);
    if (!company.fee_share_allocations[role]) {
        company.fee_share_allocations[role] = [];
    }
    company.fee_share_allocations[role].push({ account_id: 0, percentage: '' });
    renderCompanySharePanel();
    var card = document.querySelector('.company-share-role-card[data-share-card="' + role + '"]');
    if (card) {
        card.classList.add('expanded');
        var hdr = card.querySelector('.company-share-role-header');
        if (hdr) {
            hdr.setAttribute('aria-expanded', 'true');
        }
    }
}

function removeCompanyShareRow(role, index) {
    if (!currentEditingCompanyId) {
        return;
    }
    var company = tempCompanies.find(function (c) { return c.company_id === currentEditingCompanyId; });
    if (!company) {
        return;
    }
    syncFeeShareFromDomToCompany(company);
    if (company.fee_share_allocations[role] && company.fee_share_allocations[role][index] !== undefined) {
        company.fee_share_allocations[role].splice(index, 1);
    }
    renderCompanySharePanel();
}

function loadCompanyShareDataForModal(companyCode) {
    fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_company_share_settings', company_id: companyCode })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data && Array.isArray(res.data.accounts)) {
                shareModalAccounts = res.data.accounts;
            } else {
                shareModalAccounts = [];
            }
            var company = tempCompanies.find(function (c) { return c.company_id === companyCode; });
            if (company && res.success && res.data && res.data.company_exists && isFeeShareAllocationsEmpty(company.fee_share_allocations)) {
                company.fee_share_allocations = normalizeFeeShareFromServer(res.data.allocations);
            }
            renderCompanySharePanel();
        })
        .catch(function () {
            shareModalAccounts = [];
            renderCompanySharePanel();
        });
}

// Company Settings → Share %：開關 On 時在「主視窗 Confirm」後才寫入 domain fee / commission（transactions）
function syncCompanyShareChargeToggleUi() {
    var cb = document.getElementById('companyShareChargeToggle');
    var stateEl = document.getElementById('companyShareChargeState');
    if (!cb) {
        return;
    }
    if (stateEl) {
        stateEl.textContent = cb.checked ? 'On' : 'Off';
        stateEl.classList.toggle('company-share-charge-on-save__state--on', cb.checked);
    }
    cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
}

// 打开到期日期设置弹窗
function openCompanyExpDateModal(companyId) {
    const company = tempCompanies.find(c => c.company_id === companyId);
    if (!company) return;
    ensureCompanyFeeShare(company);

    currentEditingCompanyId = companyId;
    // 保存打开时的完整状态，Cancel 时还原为此状态
    companySnapshotWhenModalOpened = JSON.parse(JSON.stringify(company));

    // 设置公司名称
    document.getElementById('expDateCompanyName').textContent = `Company: ${company.company_id}`;

    // 若本会话内已保存过权限，优先用 tempCompanies 中的显示，避免“再点回去全部点完”
    if (company.permissions && Array.isArray(company.permissions)) {
        const perms = company.permissions;
        document.getElementById('permissionGambling').checked = perms.includes('Games');
        document.getElementById('permissionBank').checked = perms.includes('Bank');
        document.getElementById('permissionLoan').checked = perms.includes('Loan');
        document.getElementById('permissionRate').checked = perms.includes('Rate');
        document.getElementById('permissionMoney').checked = perms.includes('Money');
        updatePermissionDisplay();
    } else {
        loadCompanyPermissions(company.company_id);
    }

    // 设置开始日期
    const startDate = company.startDate || new Date().toISOString().split('T')[0];
    document.getElementById('expDateStartDate').value = startDate;

    // 设置是否禁用开始日期（续上时间时禁用）
    const startDateInput = document.getElementById('expDateStartDate');
    if (company.isExtending) {
        startDateInput.disabled = true;
        document.getElementById('expDateStartDateHelp').textContent = 'Cannot modify start date when extending time';
        document.getElementById('expDateStartDateHelp').style.color = '#ef4444';
    } else {
        startDateInput.disabled = false;
        document.getElementById('expDateStartDateHelp').textContent = 'Select the start date for calculating expiration date';
        document.getElementById('expDateStartDateHelp').style.color = '#64748b';
    }

    // Period 默认显示 "Select Period"；只有用户手动选择具体期限时才在保存时更新到期日，避免仅改权限时误加 period
    document.getElementById('expDatePeriod').value = '';

    // 如果已经有到期日期，直接显示；否则根据选择的period计算
    const displayElement = document.getElementById('expDateDisplay');
    if (company.expiration_date) {
        displayElement.textContent = formatDate(company.expiration_date);
        displayElement.style.color = '#1e293b';
    } else {
        // 更新到期日期显示（根据选择的period计算）
        updateExpDateDisplay();
    }

    // 添加事件监听器
    document.getElementById('expDateStartDate').onchange = function () {
        if (!company.isExtending) {
            updateExpDateDisplay();
        }
    };
    document.getElementById('expDatePeriod').onchange = function () {
        updateExpDateDisplay();
    };

    // 显示弹窗（左右分栏同时展示 Company 与 Share %）
    document.getElementById('companyExpDateModal').style.display = 'block';
    var chargeToggle = document.getElementById('companyShareChargeToggle');
    if (chargeToggle) {
        chargeToggle.checked = !!company.apply_commission_payments_on_domain_save;
        syncCompanyShareChargeToggleUi();
    }
    collapseAllShareRoleCards();
    loadCompanyShareDataForModal(company.company_id);
}

// 关闭到期日期设置弹窗。restore === true 时还原为打开弹窗时的状态（Cancel/X/点击遮罩）
function closeCompanyExpDateModal(restore = false) {
    if (restore && companySnapshotWhenModalOpened) {
        const idx = tempCompanies.findIndex(c => c.company_id === companySnapshotWhenModalOpened.company_id);
        if (idx >= 0) {
            Object.assign(tempCompanies[idx], companySnapshotWhenModalOpened);
            updateCompanyDisplay();
        }
    }
    companySnapshotWhenModalOpened = null;
    currentEditingCompanyId = null;
    document.getElementById('companyExpDateModal').style.display = 'none';
}

// 更新到期日期显示（在弹窗中）；同时同步到 company，避免勾选/取消 permission 时丢失到期日
function updateExpDateDisplay() {
    if (!currentEditingCompanyId) return;

    const company = tempCompanies.find(c => c.company_id === currentEditingCompanyId);
    if (!company) return;

    const startDate = document.getElementById('expDateStartDate').value;
    const period = document.getElementById('expDatePeriod').value;

    let expDate = null;
    if (period) {
        if (company.isExtending) {
            const originalDate = company.originalExpirationDate || null;
            expDate = calculateExpirationDate(period, originalDate);
        } else {
            const baseDate = startDate || new Date().toISOString().split('T')[0];
            expDate = calculateExpirationDate(period, baseDate);
        }
    }

    company.expiration_date = expDate || null;
    company.selectedPeriod = period || null;

    const displayElement = document.getElementById('expDateDisplay');
    if (expDate) {
        displayElement.textContent = formatDate(expDate);
        displayElement.style.color = '#1e293b';
    } else {
        displayElement.textContent = 'Not set';
        displayElement.style.color = '#94a3b8';
    }
}

// 加载公司权限设置
function loadCompanyPermissions(companyId) {
    // 从数据库获取公司权限
    fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'get_company_permissions',
            company_id: companyId
        })
    })
        .then(response => response.json())
        .then(data => {
            const permissions = (data.success && data.data && Array.isArray(data.data.permissions)) ? data.data.permissions : [];
            document.getElementById('permissionGambling').checked = permissions.includes('Games');
            document.getElementById('permissionBank').checked = permissions.includes('Bank');
            document.getElementById('permissionLoan').checked = permissions.includes('Loan');
            document.getElementById('permissionRate').checked = permissions.includes('Rate');
            document.getElementById('permissionMoney').checked = permissions.includes('Money');
            updatePermissionDisplay();
            const company = tempCompanies.find(c => c.company_id === companyId);
            if (company) company.permissions = permissions.slice();
        })
        .catch(error => {
            console.error('Error loading permissions:', error);
            const company = tempCompanies.find(c => c.company_id === companyId);
            if (company) company.permissions = [];
            document.getElementById('permissionGambling').checked = false;
            document.getElementById('permissionBank').checked = false;
            document.getElementById('permissionLoan').checked = false;
            document.getElementById('permissionRate').checked = false;
            document.getElementById('permissionMoney').checked = false;
            updatePermissionDisplay();
        });
}

// ★★★ SINGLE_CATEGORY_MODE — 互斥选择逻辑 ★★★
// 当 SINGLE_CATEGORY_MODE === true 时，点击某个分类复选框会取消其他所有分类。
// 删除此函数并将 domain.php 中 onchange 还原为 updatePermissionDisplay() 即可恢复原状。
function onPermissionCheckboxChange(clickedEl) {
    if (SINGLE_CATEGORY_MODE && clickedEl && clickedEl.checked) {
        // 取消勾选除 clickedEl 以外的所有 permission-checkbox
        var allBoxes = document.querySelectorAll('.permission-checkbox');
        allBoxes.forEach(function (cb) {
            if (cb !== clickedEl) cb.checked = false;
        });
    }
    updatePermissionDisplay();
}

// 更新权限显示（勾选/取消 permission 时保持 Expiration Date 区域可见且内容不丢失）
function updatePermissionDisplay() {
    if (!currentEditingCompanyId) return;
    const company = tempCompanies.find(c => c.company_id === currentEditingCompanyId);
    if (!company) return;
    const displayEl = document.getElementById('expDateDisplay');
    if (!displayEl) return;
    // 确保 Expiration Date 所在整块区域保持显示（避免被误隐藏）
    const expDateBlock = displayEl.closest('.form-group');
    if (expDateBlock) expDateBlock.style.display = '';
    // 确保 Expiration Date 显示与当前公司一致；新增/移除 permission 时不清除已有到期日显示
    if (company.expiration_date) {
        displayEl.textContent = formatDate(company.expiration_date);
        displayEl.style.color = '#1e293b';
    } else {
        const periodEl = document.getElementById('expDatePeriod');
        const period = periodEl ? periodEl.value : '';
        if (period) {
            const startDateEl = document.getElementById('expDateStartDate');
            const startDate = startDateEl ? startDateEl.value : '';
            const baseDate = company.isExtending ? (company.originalExpirationDate || null) : (startDate || new Date().toISOString().split('T')[0]);
            const expDate = calculateExpirationDate(period, baseDate);
            displayEl.textContent = formatDate(expDate);
            displayEl.style.color = '#1e293b';
        } else {
            // 仅当当前显示不是“日期”时才改为 Not set，避免勾选/取消 permission 时清除用户已选的到期日
            const currentText = (displayEl.textContent || '').trim();
            const looksLikeDate = /^\d{4}[\/\-]\d|^[A-Za-z]{3,}\s+\d{1,2},?\s+\d{4}$|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(currentText) || (currentText !== '' && currentText !== 'Not set');
            if (!looksLikeDate) {
                displayEl.textContent = 'Not set';
                displayEl.style.color = '#94a3b8';
            }
        }
    }
}

// 保存到期日期设置
function saveCompanyExpDate() {
    if (!currentEditingCompanyId) return;

    const company = tempCompanies.find(c => c.company_id === currentEditingCompanyId);
    if (!company) return;

    const startDate = document.getElementById('expDateStartDate').value;
    const period = document.getElementById('expDatePeriod').value;

    // 如果选择了 period，则计算到期日期；否则保持原有或清空
    if (period) {
        // 更新公司数据
        if (!company.isExtending) {
            // 新添加或重置：可以修改开始日期
            company.startDate = startDate || new Date().toISOString().split('T')[0];
        }

        // 计算到期日期
        let expDate;
        if (company.isExtending) {
            // 续上时间：从原始到期日期开始计算
            const originalDate = company.originalExpirationDate || null;
            expDate = calculateExpirationDate(period, originalDate);
        } else {
            // 新添加或重置：使用选择的开始日期
            const baseDate = company.startDate || new Date().toISOString().split('T')[0];
            expDate = calculateExpirationDate(period, baseDate);
        }

        company.expiration_date = expDate;
        company.selectedPeriod = period;
    } else {
        // 未选 period 时：只更新权限等，不清空已有到期日（避免仅添加/移除 permission 保存后 Expiration Date 消失）
        if (!company.expiration_date) {
            company.selectedPeriod = null;
        }
        if (!company.isExtending && startDate) {
            company.startDate = startDate;
        }
    }

    // 获取选中的权限
    const permissions = [];
    if (document.getElementById('permissionGambling').checked) permissions.push('Games');
    if (document.getElementById('permissionBank').checked) permissions.push('Bank');
    if (document.getElementById('permissionLoan').checked) permissions.push('Loan');
    if (document.getElementById('permissionRate').checked) permissions.push('Rate');
    if (document.getElementById('permissionMoney').checked) permissions.push('Money');

    // ★★★ SINGLE_CATEGORY_MODE — 保存时校验 ★★★
    if (SINGLE_CATEGORY_MODE) {
        if (permissions.length === 0) {
            showAlert('Please select one category', 'danger');
            return;
        }
        if (permissions.length > 1) {
            showAlert('Only one category can be selected at a time', 'danger');
            return;
        }
    }

    // 存入当前公司，再次打开 Set 时优先用此显示
    company.permissions = permissions.slice();
    syncFeeShareFromDomToCompany(company);

    var chargeOnSave = !!(document.getElementById('companyShareChargeToggle') && document.getElementById('companyShareChargeToggle').checked);
    company.apply_commission_payments_on_domain_save = chargeOnSave;

    const permReq = fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'update_company_permissions',
            company_id: company.company_id,
            permissions: permissions,
            expiration_date: company.expiration_date || null  // 同步写库；null 时清除到期日
        })
    }).then(response => response.json());

    const shareReq = fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'save_company_share_settings',
            company_id: company.company_id,
            fee_share_allocations: company.fee_share_allocations,
            apply_commission_payments: false
        })
    }).then(response => response.json());

    Promise.all([permReq, shareReq])
        .then(function (results) {
            const permData = results[0];
            const shareData = results[1];
            updateCompanyDisplay();
            syncCompaniesHiddenField();
            closeCompanyExpDateModal(false);
            if (!permData.success) {
                console.error('Error saving permissions:', permData.message);
                showAlert(permData.message || 'Permissions save failed', 'danger');
                return;
            }
            if (!shareData.success) {
                const msg = shareData.message || '';
                if (msg.indexOf('not found') !== -1 || msg.indexOf('Save the domain first') !== -1) {
                    showAlert('Company settings updated. Share % will apply after you save the domain.');
                    return;
                }
                showAlert(msg || 'Share % save failed', 'danger');
                return;
            }
            var chargeHint = chargeOnSave ? ' Fee posts when you Confirm the domain (main modal).' : '';
            showAlert('Company settings updated successfully!' + chargeHint);
        })
        .catch(function (error) {
            console.error('Error saving company settings:', error);
            updateCompanyDisplay();
            syncCompaniesHiddenField();
            closeCompanyExpDateModal(false);
            showAlert('Could not reach server. Changes kept locally — try again.', 'danger');
        });
}

// 在弹窗中重置到期日期
function resetCompanyExpDateInModal() {
    if (!currentEditingCompanyId) return;

    const company = tempCompanies.find(c => c.company_id === currentEditingCompanyId);
    if (!company) return;

    // 重置为今天
    const today = new Date().toISOString().split('T')[0];
    company.startDate = today;
    company.isExtending = false;
    company.originalExpirationDate = null;
    company.selectedPeriod = null;
    company.expiration_date = null;

    // 更新弹窗中的显示
    document.getElementById('expDateStartDate').value = today;
    document.getElementById('expDateStartDate').disabled = false;
    document.getElementById('expDateStartDateHelp').textContent = 'Select the start date for calculating expiration date';
    document.getElementById('expDateStartDateHelp').style.color = '#64748b';
    document.getElementById('expDatePeriod').value = '';
    document.getElementById('expDateDisplay').textContent = 'Not set';
    document.getElementById('expDateDisplay').style.color = '#94a3b8';

    // 重置权限（SINGLE_CATEGORY_MODE 时仅选第一个 Games）
    if (SINGLE_CATEGORY_MODE) {
        document.getElementById('permissionGambling').checked = true;
        document.getElementById('permissionBank').checked = false;
        document.getElementById('permissionLoan').checked = false;
        document.getElementById('permissionRate').checked = false;
        document.getElementById('permissionMoney').checked = false;
    } else {
        document.getElementById('permissionGambling').checked = true;
        document.getElementById('permissionBank').checked = true;
        document.getElementById('permissionLoan').checked = true;
        document.getElementById('permissionRate').checked = true;
        document.getElementById('permissionMoney').checked = true;
    }
    updatePermissionDisplay();

    company.fee_share_allocations = defaultFeeShareAllocations();
    company.apply_commission_payments_on_domain_save = false;
    renderCompanySharePanel();
    collapseAllShareRoleCards();
    var chargeToggleReset = document.getElementById('companyShareChargeToggle');
    if (chargeToggleReset) {
        chargeToggleReset.checked = false;
        syncCompanyShareChargeToggleUi();
    }
}

// 根据到期日期判断对应的期限选项
function getPeriodFromDate(expirationDate) {
    if (!expirationDate) return '1month';

    const today = new Date();
    const exp = new Date(expirationDate);
    const diffMonths = (exp.getFullYear() - today.getFullYear()) * 12 + (exp.getMonth() - today.getMonth());

    // 允许一些误差（±2天）
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

    if (diffDays >= 360 && diffDays <= 370) return '1year';
    if (diffDays >= 175 && diffDays <= 190) return '6months';
    if (diffDays >= 88 && diffDays <= 95) return '3months';
    if (diffDays >= 28 && diffDays <= 32) return '1month';
    if (diffDays >= 5 && diffDays <= 9) return '7days';

    // 默认返回最接近的选项
    if (diffMonths >= 11) return '1year';
    if (diffMonths >= 5) return '6months';
    if (diffMonths >= 2) return '3months';
    if (diffDays >= 28) return '1month';
    if (diffDays >= 7) return '7days';
    return '7days';
}

function updateCompanyDisplay() {
    const container = document.getElementById('companyItems');

    if (tempCompanies.length === 0) {
        container.innerHTML = '<span style="color: #94a3b8; font-size: 11px;">No companies added yet</span>';
    } else {
        // 根据 selectedGroupId 筛选
        let filteredCompanies;
        if (selectedGroupId) {
            // 选中了某个 group → 只显示该 group 的公司
            filteredCompanies = tempCompanies.filter(c => c.group_id === selectedGroupId);
        } else if (tempGroups.length > 0) {
            // 有 group 但没有选中 → 只显示独立公司（group_id = null）
            filteredCompanies = tempCompanies.filter(c => !c.group_id);
        } else {
            // 没有任何 group → 显示所有公司
            filteredCompanies = [...tempCompanies];
        }

        // Multiple Choice 模式：显示 checkbox 列表让用户勾选
        if (isMultipleChoiceMode && selectedGroupId) {
            // 显示所有未归组的公司(group_id=null) + 已在该 group 的公司
            const assignableCandidates = tempCompanies.filter(c => {
                return !c.group_id || c.group_id === selectedGroupId;
            });

            const sortedCandidates = [...assignableCandidates].sort((a, b) => {
                return a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase());
            });

            const itemsHtml = sortedCandidates.map(company => {
                const isInGroup = company.group_id === selectedGroupId;
                return `
                    <div class="company-assign-item" onclick="toggleCompanyGroup('${company.company_id}')">
                        <input type="checkbox" ${isInGroup ? 'checked' : ''} onclick="event.stopPropagation(); toggleCompanyGroup('${company.company_id}')">
                        <label>${company.company_id}</label>
                    </div>
                `;
            }).join('');

            container.innerHTML = `<div class="assign-grid">${itemsHtml}</div>`;

            if (sortedCandidates.length === 0) {
                container.innerHTML = '<span style="color: #94a3b8; font-size: 12px;">No ungrouped companies available</span>';
            }

            syncCompaniesHiddenField();
            return;
        }

        // 按字母顺序排序
        const sortedCompanies = [...filteredCompanies].sort((a, b) => {
            return a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase());
        });

        if (sortedCompanies.length === 0) {
            const msg = selectedGroupId
                ? `No companies in group "${selectedGroupId}". Click "Multiple Choice" to assign.`
                : 'No ungrouped companies';
            container.innerHTML = `<span style="color: #94a3b8; font-size: 12px;">${msg}</span>`;
            syncCompaniesHiddenField();
            return;
        }

        container.innerHTML = sortedCompanies.map(company => {
            const removeButton = `<button type="button" class="company-remove-btn" onclick="removeCompanyFromList('${company.company_id}')">Remove</button>`;

            // 显示到期日期和设置按钮
            const expDateText = company.expiration_date ? formatDate(company.expiration_date) : 'Not set';
            const expirationControls = `
                <span class="exp-date-display" style="margin-right: 8px;">${expDateText}</span>
                <button type="button" class="company-reset-btn" onclick="openCompanyExpDateModal('${company.company_id}')" title="Set expiration date" style="background: linear-gradient(180deg, #60C1FE 0%, #0F61FF 100%);">Set</button>
            `;

            return `
                <div class="company-item">
                    <div class="company-item-left">
                        <span>${company.company_id}</span>
                    </div>
                    <div class="company-item-right">
                        ${expirationControls}
                        ${removeButton}
                    </div>
                </div>
            `;
        }).join('');

        // 同步 hidden 字段，确保表单提交时数据正确
        syncCompaniesHiddenField();
    }
}

/** Domain 表單 JSON：帶入「確認後才入帳」標記（與 domain_api apply_commission_payments_on_domain_save 對應） */
function companyToDomainPayloadEntry(c) {
    const o = {
        company_id: c.company_id,
        expiration_date: c.expiration_date,
        permissions: Array.isArray(c.permissions) ? c.permissions : [],
        group_id: c.group_id || null,
        fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations),
        // 明确传递开关状态：Off 时也传 false，确保后端不会因缺字段而误判
        apply_commission_payments_on_domain_save: !!c.apply_commission_payments_on_domain_save
    };
    return o;
}

// 同步 selectedCompanies 和 hidden field（表单提交前调用）
function syncCompaniesFromTemp() {
    const sortedCompanies = [...tempCompanies].sort((a, b) => {
        return a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase());
    });
    selectedCompanies = sortedCompanies.map(c => companyToDomainPayloadEntry(c));

    // 处理没有任何公司的 group，使其也能被保存
    const groupsWithCompanies = new Set(selectedCompanies.map(c => c.group_id).filter(g => g));
    tempGroups.forEach(gid => {
        if (!groupsWithCompanies.has(gid)) {
            selectedCompanies.push(companyToDomainPayloadEntry({
                company_id: '',
                expiration_date: null,
                permissions: [],
                group_id: gid,
                fee_share_allocations: defaultFeeShareAllocations()
            }));
        }
    });

    document.getElementById('companies').value = JSON.stringify(selectedCompanies);
}

// 实时同步 hidden 字段
function syncCompaniesHiddenField() {
    const sortedCompanies = [...tempCompanies].sort((a, b) => {
        return a.company_id.toUpperCase().localeCompare(b.company_id.toUpperCase());
    });
    const cleaned = sortedCompanies.map(c => companyToDomainPayloadEntry(c));

    // 处理没有任何公司的 group
    const groupsWithCompanies = new Set(cleaned.map(c => c.group_id).filter(g => g));
    tempGroups.forEach(gid => {
        if (!groupsWithCompanies.has(gid)) {
            cleaned.push(companyToDomainPayloadEntry({
                company_id: '',
                expiration_date: null,
                permissions: [],
                group_id: gid,
                fee_share_allocations: defaultFeeShareAllocations()
            }));
        }
    });

    document.getElementById('companies').value = JSON.stringify(cleaned);
}

// updateSelectedCompaniesDisplay 现在不再单独使用（inline显示由 updateCompanyDisplay 处理）
function updateSelectedCompaniesDisplay() {
    // No-op: companies are now displayed inline in the main modal via updateCompanyDisplay()
}

// 允许Enter键添加company/group和格式化输入
document.addEventListener('DOMContentLoaded', function () {
    const companyInput = document.getElementById('companyInput');
    if (companyInput) {
        // Enter键添加
        companyInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCompanyToList();
            }
        });

        // 输入时强制大写
        companyInput.addEventListener('input', function () {
            forceUppercase(this);
        });

        // 粘贴时强制大写
        companyInput.addEventListener('paste', function () {
            setTimeout(() => forceUppercase(this), 0);
        });
    }

    // Group ID input handlers
    const groupInput = document.getElementById('groupInput');
    if (groupInput) {
        groupInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addGroupToList();
            }
        });
        groupInput.addEventListener('input', function () {
            forceUppercase(this);
        });
        groupInput.addEventListener('paste', function () {
            setTimeout(() => forceUppercase(this), 0);
        });
    }

    refreshDomainFeeSummaryFromApi();
});

/** 展示用：固定两位小数 */
function formatDomainFeeDisplay2(val) {
    if (val === null || val === undefined || val === '') {
        return '—';
    }
    var n = Number(val);
    if (!isFinite(n)) {
        return '—';
    }
    return n.toFixed(2);
}

/** 编辑用：固定两位小数填入输入框 */
function formatDomainFeeEdit2(val) {
    if (val === null || val === undefined || val === '') {
        return '';
    }
    var n = Number(val);
    if (!isFinite(n)) {
        return '';
    }
    return n.toFixed(2);
}

function buildDomainFeeSummaryHtml2(data) {
    var p2 = formatDomainFeeDisplay2(data.price);
    return 'Display: Price <strong>' + p2 + '</strong>';
}

function buildDomainFeeInlineSummaryText2(data) {
    var p2 = formatDomainFeeDisplay2(data.price);
    if (p2 === '—') {
        return '';
    }
    return 'Display: Price ' + p2;
}

function applyDomainFeeSummaryDisplays(data) {
    if (!data) {
        return;
    }
    var parsedPrice = Number(data.price);
    domainFeePriceCache = isFinite(parsedPrice) ? parsedPrice : 0;
    var modalEl = document.getElementById('domainFeeSummaryDisplay');
    if (modalEl) {
        modalEl.innerHTML = buildDomainFeeSummaryHtml2(data);
    }
    var inline = document.getElementById('domainFeeInlineSummary');
    if (inline) {
        inline.textContent = buildDomainFeeInlineSummaryText2(data);
    }
    updateCompanyShareRowAmounts();
}

function applyDomainFeeEditInputs(data) {
    if (!data) {
        return;
    }
    var p = document.getElementById('domainFeePrice');
    if (p) {
        p.value = formatDomainFeeEdit2(data.price);
    }
}

/** 页面加载时更新列表旁「展示」文案（失败则静默） */
function refreshDomainFeeSummaryFromApi() {
    if (!document.getElementById('domainFeeInlineSummary')) {
        return;
    }
    fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_domain_fee_settings' })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                applyDomainFeeSummaryDisplays(res.data);
            }
        })
        .catch(function () { /* ignore */ });
}

function openDomainFeeSettingsModal() {
    const modal = document.getElementById('domainFeeSettingsModal');
    if (!modal) return;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_domain_fee_settings' })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success && res.data) {
                applyDomainFeeSummaryDisplays(res.data);
                applyDomainFeeEditInputs(res.data);
            } else {
                showAlert(res.message || 'Could not load settings', 'danger');
            }
        })
        .catch(function () {
            showAlert('Could not load settings', 'danger');
        });
}

function closeDomainFeeSettingsModal() {
    var modal = document.getElementById('domainFeeSettingsModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function saveDomainFeeSettings() {
    var priceEl = document.getElementById('domainFeePrice');
    var price = priceEl ? String(priceEl.value).trim() : '';
    fetch('api/domain/domain_api.php', {
        cache: 'no-cache',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'save_domain_fee_settings',
            price: price
        })
    })
        .then(function (r) { return r.json(); })
        .then(function (res) {
            if (res.success) {
                if (res.data) {
                    applyDomainFeeSummaryDisplays(res.data);
                } else {
                    refreshDomainFeeSummaryFromApi();
                }
                showAlert(res.message || 'Saved');
                closeDomainFeeSettingsModal();
            } else {
                showAlert(res.message || 'Save failed', 'danger');
            }
        })
        .catch(function () {
            showAlert('Save failed', 'danger');
        });
}

function showAlert(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    // 每次显示通知时把容器移到 body 末尾，确保 DOM 顺序和堆叠顺序都在最前
    document.body.appendChild(container);

    // 检查现有通知数量，最多保留2个
    const existingNotifications = container.querySelectorAll('.notification');
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
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // 添加到容器
    container.appendChild(notification);

    // 触发显示动画
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // 1.5秒后开始消失动画
    setTimeout(() => {
        notification.classList.remove('show');
        // 0.3秒后完全移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 1500);
}

function openAddModal() {
    isEditMode = false;
    document.getElementById('modalTitle').textContent = 'ADD DOMAIN';
    document.getElementById('domainForm').reset();
    document.getElementById('domainId').value = '';
    document.getElementById('password').required = true;
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('owner_code').disabled = false;

    // 添加模式：二级密码必填
    const secondaryPasswordInput = document.getElementById('secondary_password');
    secondaryPasswordInput.required = true;
    secondaryPasswordInput.disabled = false;
    document.getElementById('secondaryPasswordGroup').style.display = 'block';

    // 重置companies
    selectedCompanies = [];
    tempCompanies = [];
    tempGroups = [];
    selectedGroupId = null;
    isMultipleChoiceMode = false;
    document.getElementById('companies').value = '';
    updateGroupPills();
    updateCompanyDisplay();

    // 清空 inputs
    const companyInput = document.getElementById('companyInput');
    if (companyInput) companyInput.value = '';
    const groupInput = document.getElementById('groupInput');
    if (groupInput) groupInput.value = '';
    // 重置 multiple choice 按钮
    resetMultipleChoiceBtn();

    document.getElementById('domainModal').style.display = 'block';
    // 设置输入格式化
    setupInputFormatting();
}

function editDomain(id) {
    isEditMode = true;
    document.getElementById('modalTitle').textContent = 'EDIT DOMAIN';
    document.getElementById('password').required = false;
    document.getElementById('passwordGroup').style.display = 'block';

    // 编辑模式：只有C168的owner/admin可以修改二级密码
    const secondaryPasswordInput = document.getElementById('secondary_password');
    if (hasC168Context && isOwnerOrAdmin) {
        secondaryPasswordInput.required = false;
        secondaryPasswordInput.disabled = false;
        secondaryPasswordInput.placeholder = 'Leave empty to keep current password';
        document.getElementById('secondaryPasswordGroup').style.display = 'block';
    } else {
        secondaryPasswordInput.required = false;
        secondaryPasswordInput.disabled = true;
        secondaryPasswordInput.value = '';
        document.getElementById('secondaryPasswordGroup').style.display = 'none';
    }

    // Get domain data from domain card
    const card = document.querySelector(`.domain-card[data-id="${id}"]`);
    const items = card.querySelectorAll('.card-item');

    document.getElementById('domainId').value = id;
    document.getElementById('owner_code').value = items[1].textContent.trim();
    document.getElementById('owner_code').disabled = true;
    document.getElementById('name').value = items[2].textContent;
    document.getElementById('email').value = items[3].textContent;

    // 清空 company input
    const companyInput = document.getElementById('companyInput');
    if (companyInput) companyInput.value = '';

    // 从 API 获取完整的公司信息（包括到期日期）
    fetch(`api/domain/domain_api.php`, {
        cache: 'no-cache',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'get_companies',
            owner_id: id
        })
    })
        .then(response => response.json())
        .then(data => {
            let standaloneGroups = [];
            if (data.success && data.data && data.data.companies) {
                const validCompanies = [];
                const allGroups = new Set();

                data.data.companies.forEach(c => {
                    if (c.group_id) allGroups.add(c.group_id);
                    if (c.company_id) {
                        validCompanies.push({
                            company_id: c.company_id,
                            expiration_date: c.expiration_date || null,
                            permissions: Array.isArray(c.permissions) ? c.permissions : [],
                            group_id: c.group_id || null,
                            fee_share_allocations: normalizeFeeShareFromServer(c.fee_share_allocations)
                        });
                    }
                });
                selectedCompanies = validCompanies;
                standaloneGroups = Array.from(allGroups);
            } else {
                selectedCompanies = [];
            }
            // 初始化 tempCompanies 并渲染 inline 列表
            initTempCompanies(standaloneGroups);
        })
        .catch(error => {
            console.error('Error loading companies:', error);
            selectedCompanies = [];
            initTempCompanies();
        });

    document.getElementById('domainModal').style.display = 'block';
    setupInputFormatting();
}


function closeModal() {
    document.getElementById('domainModal').style.display = 'none';
    selectedCompanies = [];
    tempCompanies = [];
    tempGroups = [];
    selectedGroupId = null;
    isMultipleChoiceMode = false;
    // 重置二级密码输入框
    const secondaryPasswordInput = document.getElementById('secondary_password');
    if (secondaryPasswordInput) {
        secondaryPasswordInput.value = '';
        secondaryPasswordInput.required = true;
    }
    // 重置 multiple choice 按钮
    resetMultipleChoiceBtn();
}

// 切换删除模式
function toggleDeleteMode() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const checkboxes = document.querySelectorAll('.domain-checkbox');
    const tableContainer = document.querySelector('.table-container');

    if (!isDeleteMode) {
        // 进入删除模式
        isDeleteMode = true;
        deleteBtn.textContent = 'Confirm Delete';
        deleteBtn.onclick = deleteSelected;
        deleteBtn.classList.add('active');

        // 给表格容器添加删除模式class
        tableContainer.classList.add('delete-mode');

        // 显示所有勾选框
        checkboxes.forEach(cb => {
            cb.classList.add('show');
        });

        // 添加取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-cancel';
        cancelBtn.id = 'cancelDeleteBtn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.marginLeft = '10px';
        cancelBtn.style.minWidth = '';
        cancelBtn.style.height = '';
        cancelBtn.onclick = exitDeleteMode;
        deleteBtn.parentNode.insertBefore(cancelBtn, deleteBtn.nextSibling);

    } else {
        // 执行删除
        deleteSelected();
    }
}

// 退出删除模式
function exitDeleteMode() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const checkboxes = document.querySelectorAll('.domain-checkbox');
    const tableContainer = document.querySelector('.table-container');

    isDeleteMode = false;
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = toggleDeleteMode;
    deleteBtn.classList.remove('active');
    deleteBtn.disabled = false;

    // 移除删除模式class
    tableContainer.classList.remove('delete-mode');

    // 隐藏所有勾选框并取消选中
    checkboxes.forEach(cb => {
        cb.classList.remove('show');
        cb.checked = false;
    });

    // 移除取消按钮
    if (cancelBtn) {
        cancelBtn.remove();
    }
}

// 更新删除按钮状态
function updateDeleteButton() {
    const selectedCheckboxes = document.querySelectorAll('.domain-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');

    if (selectedCheckboxes.length > 0) {
        deleteBtn.textContent = `Delete (${selectedCheckboxes.length})`;
        deleteBtn.disabled = false;
    } else {
        deleteBtn.textContent = 'Delete';
        deleteBtn.disabled = true;
    }
}

// 检查某个 owner 卡片是否包含受保护的 Company ID（例如 C168）
function cardHasProtectedCompany(card) {
    if (!card) return false;
    const companiesColumn = card.querySelector('.companies-column');
    if (!companiesColumn) return false;

    // 优先从 data-companies 属性中解析 company_id
    try {
        const dataAttr = companiesColumn.getAttribute('data-companies');
        if (dataAttr) {
            const companies = JSON.parse(dataAttr);
            if (Array.isArray(companies) && companies.some(c => String(c.company_id || '').trim().toUpperCase() === 'C168')) {
                return true;
            }
        }
    } catch (err) {
        console.warn('Error parsing companies data for delete protection:', err);
    }

    // 回退：从文本内容中解析 company 列（例如 "95, C168, KZ"）
    const text = (companiesColumn.textContent || '').toUpperCase();
    return text.split(',').some(id => id.trim() === 'C168');
}

// 删除选中的域
function deleteSelected() {
    const selectedCheckboxes = document.querySelectorAll('.domain-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        showAlert('Please select owners to delete first', 'danger');
        return;
    }

    // 过滤掉包含受保护 Company ID（C168）的账号
    const invalidCheckboxes = Array.from(selectedCheckboxes).filter(cb => {
        const card = cb.closest('.domain-card');
        return cardHasProtectedCompany(card);
    });

    const validCheckboxes = Array.from(selectedCheckboxes).filter(cb => {
        const card = cb.closest('.domain-card');
        return !cardHasProtectedCompany(card);
    });

    if (invalidCheckboxes.length > 0 && validCheckboxes.length === 0) {
        showAlert('Cannot delete owners linked to company C168', 'danger');
        return;
    }

    if (invalidCheckboxes.length > 0 && validCheckboxes.length > 0) {
        showAlert(`Owners linked to company C168 cannot be deleted. ${validCheckboxes.length} other owner(s) will be deleted.`, 'danger');
    }

    const selectedIds = validCheckboxes.map(cb => cb.value);
    const selectedNames = validCheckboxes.map(cb => {
        const card = cb.closest('.domain-card');
        return card.querySelectorAll('.card-item')[2].textContent; // Name列（现在是第3列，索引2）
    });

    const confirmMessage = `Are you sure you want to delete the following ${selectedIds.length} owner(s)?\n\n${selectedNames.join(', ')}`;

    showConfirmModal(confirmMessage, function () {
        // 批量删除
        Promise.all(selectedIds.map(id =>
            fetch('api/domain/domain_api.php', {
                cache: 'no-cache',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'delete',
                    id: id
                })
            }).then(response => response.json())
        )).then(results => {
            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            if (failCount === 0) {
                showAlert(`Successfully deleted ${successCount} owners!`);
            } else {
                showAlert(`Deletion completed: ${successCount} succeeded, ${failCount} failed`, 'danger');
            }

            // 删除选中的卡片
            validCheckboxes.forEach(cb => {
                const card = cb.closest('.domain-card');
                card.remove();
            });

            // 重新初始化分页
            initializePagination();

            // 在这里添加重置按钮的代码
            const deleteBtn = document.getElementById('deleteSelectedBtn');
            deleteBtn.textContent = 'Delete';
            deleteBtn.disabled = false;
        }).catch(error => {
            console.error('Error:', error);
            showAlert('An error occurred during batch deletion', 'danger');
        });
    });
}

// 添加新域卡片到DOM
function addDomainCard(domainData) {
    const domainCardsContainer = document.getElementById('domainTableBody');

    // 创建新卡片
    const newCard = document.createElement('div');
    newCard.className = 'domain-card';
    newCard.setAttribute('data-id', domainData.id);

    // 构建公司显示
    const companiesFull = domainData.companies_full || [];
    let companiesHTML = '-';
    if (domainData.companies && domainData.companies !== '-') {
        const companyList = domainData.companies.split(', ');

        companiesHTML = renderChipsHTML(companyList, companiesFull);
    }

    const companiesDataAttr = JSON.stringify(companiesFull);

    // 判断该 owner 是否包含受保护的 Company ID（C168）
    let hasProtectedCompany = false;
    if (Array.isArray(companiesFull) && companiesFull.length > 0) {
        hasProtectedCompany = companiesFull.some(c => String(c.company_id || '').trim().toUpperCase() === 'C168');
    } else if (domainData.companies) {
        hasProtectedCompany = domainData.companies
            .split(',')
            .some(id => id.trim().toUpperCase() === 'C168');
    }

    newCard.innerHTML = `
        <div class="card-item">1</div>
        <div class="card-item uppercase-text">${domainData.owner_code}</div>
        <div class="card-item">${domainData.name}</div>
        <div class="card-item">${domainData.email}</div>
        <div class="card-item">${domainData.group_ids || '-'}</div>
        <div class="card-item companies-column" data-companies='${companiesDataAttr}'>${companiesHTML}</div>
        <div class="card-item uppercase-text">${(domainData.created_by || '-').toUpperCase()}</div>
        <div class="card-item">
            <button class="btn btn-edit edit-btn" onclick="editDomain(${domainData.id})" aria-label="Edit">
                <img src="images/edit.svg" alt="Edit">
            </button>
            ${!hasProtectedCompany ? `<input type="checkbox" class="domain-checkbox" value="${domainData.id}" onchange="updateDeleteButton()">` : ''}
        </div>
    `;

    domainCardsContainer.appendChild(newCard);
    initializePagination();
    initializeCompanyClickHandlers(); // 初始化新卡片的点击事件
}

// 更新现有域卡片
function updateDomainCard(domainData) {
    const card = document.querySelector(`.domain-card[data-id="${domainData.id}"]`);
    if (!card) return;

    const items = card.querySelectorAll('.card-item');

    // 构建公司显示
    let companiesHTML = '-';
    if (domainData.companies && domainData.companies !== '-') {
        const companiesFull = domainData.companies_full || [];
        const companyList = domainData.companies.split(', ');
        companiesHTML = renderChipsHTML(companyList, companiesFull);
    }

    // 更新各列数据（保持序号不变）
    items[1].textContent = domainData.owner_code;
    items[2].textContent = domainData.name;
    items[3].textContent = domainData.email;
    items[4].textContent = domainData.group_ids || '-';
    items[4].classList.remove('companies-column');

    items[5].innerHTML = companiesHTML;
    items[5].classList.add('companies-column');
    const companiesFull = domainData.companies_full || [];
    items[5].setAttribute('data-companies', JSON.stringify(companiesFull));

    items[6].textContent = (domainData.created_by || '-').toUpperCase();

    // 重新初始化点击事件
    initializeCompanyClickHandlers();
}

// 搜索功能
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const tableRows = document.querySelectorAll('#domainTableBody .domain-card');

    if (!searchInput) return;

    // 添加这段代码 - 强制大写和只允许字母数字
    searchInput.addEventListener('input', function (e) {
        const cursorPosition = this.selectionStart;
        // 只保留大写字母和数字
        const filteredValue = this.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        this.value = filteredValue;
        this.setSelectionRange(cursorPosition, cursorPosition);
    });

    searchInput.addEventListener('paste', function (e) {
        setTimeout(() => {
            const cursorPosition = this.selectionStart;
            const filteredValue = this.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            this.value = filteredValue;
            this.setSelectionRange(cursorPosition, cursorPosition);
        }, 0);
    });

    searchInput.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase().trim();

        tableRows.forEach(row => {
            const items = row.querySelectorAll('.card-item');
            const ownerCode = items[1] ? items[1].textContent.toLowerCase() : '';
            const name = items[2] ? items[2].textContent.toLowerCase() : '';
            const email = items[3] ? items[3].textContent.toLowerCase() : '';
            const groupIds = items[4] ? items[4].textContent.toLowerCase() : '';
            // Companies 在第 6 列；「+N」折叠的公司代号只在 data-companies JSON 里
            const companiesCol = row.querySelector('.companies-column');
            let companiesHaystack = companiesCol ? companiesCol.textContent.toLowerCase() : '';
            if (companiesCol) {
                try {
                    const full = JSON.parse(companiesCol.getAttribute('data-companies') || '[]');
                    if (Array.isArray(full)) {
                        companiesHaystack += ' ' + full.map(function (c) {
                            return String(c.company_id || '').toLowerCase();
                        }).join(' ');
                    }
                } catch (err) { /* ignore bad JSON */ }
            }

            const matches = ownerCode.includes(searchTerm) ||
                name.includes(searchTerm) ||
                email.includes(searchTerm) ||
                groupIds.includes(searchTerm) ||
                companiesHaystack.includes(searchTerm);

            if (matches || searchTerm === '') {
                row.classList.remove('table-row-hidden');
            } else {
                row.classList.add('table-row-hidden');
            }
        });

        // 重新计算分页
        initializePagination();
    });
}

// 更新行号（现在由分页系统处理）
function updateRowNumbers() {
    // 这个函数现在由 showCurrentPage() 处理
    initializePagination();
}

// 同步现有 DOM 中的删除勾选框显示规则：仅当不包含受保护 Company（如 C168）时才允许删除
function syncDeleteCheckboxProtection() {
    const cards = document.querySelectorAll('#domainTableBody .domain-card');
    cards.forEach(card => {
        const lastItem = card.querySelector('.card-item:last-child');
        if (!lastItem) return;

        const existingCheckbox = lastItem.querySelector('.domain-checkbox');
        const protectedOwner = cardHasProtectedCompany(card);

        if (protectedOwner) {
            // 受保护：移除任何已有的删除勾选框
            if (existingCheckbox) {
                existingCheckbox.remove();
            }
        } else {
            // 非受保护：如果没有勾选框，则补一个
            if (!existingCheckbox) {
                const id = card.getAttribute('data-id');
                if (!id) return;
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'domain-checkbox';
                cb.value = id;
                cb.addEventListener('change', updateDeleteButton);
                lastItem.appendChild(cb);
            }
        }
    });
}

// 初始化公司点击事件
function initializeCompanyClickHandlers() {
    // 辅助：从 companies-column 解析数据并打开弹窗
    function openModalFromColumn(el, e) {
        e.stopPropagation();
        const companiesColumn = el.closest('.companies-column');
        if (!companiesColumn) return;
        const companiesData = companiesColumn.getAttribute('data-companies');
        if (!companiesData) return;
        try {
            const companies = JSON.parse(companiesData);
            showCompanyExpirationModal(companies);
        } catch (err) {
            console.error('Error parsing companies data:', err);
        }
    }

    // 普通 chip（company-badge）
    document.querySelectorAll('.company-badge').forEach(badge => {
        if (badge.dataset.clickInitialized === 'true') return;
        badge.addEventListener('click', function (e) { openModalFromColumn(badge, e); });
        badge.dataset.clickInitialized = 'true';
    });

    // +N chip（chip-more）—— 点击也弹出完整公司列表
    document.querySelectorAll('.chip-more').forEach(more => {
        if (more.dataset.clickInitialized === 'true') return;
        more.addEventListener('click', function (e) { openModalFromColumn(more, e); });
        more.dataset.clickInitialized = 'true';
    });
}

// 显示公司到期时间弹窗
function showCompanyExpirationModal(companies) {
    const container = document.getElementById('companyExpirationList');

    if (!companies || companies.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 20px;">No companies found</div>';
    } else {
        container.innerHTML = companies.map(company => {
            const expDate = company.expiration_date || null;
            const countdown = expDate ? calculateCountdown(expDate) : null;
            const formattedDate = expDate ? formatDate(expDate) : 'No expiration date';

            let statusClass = 'normal';
            let statusText = 'Valid';

            if (countdown) {
                statusClass = countdown.status;
                statusText = countdown.text;
            } else if (!expDate) {
                statusClass = 'warning';
                statusText = 'No date set';
            }

            return `
                <div class="company-exp-item">
                    <div class="company-exp-item-left">
                        <div class="company-exp-id">${company.company_id}</div>
                        <div class="company-exp-date">Expiration: ${formattedDate}</div>
                    </div>
                    <div class="company-exp-status ${statusClass}">${statusText}</div>
                </div>
            `;
        }).join('');
    }

    document.getElementById('companyExpirationModal').style.display = 'block';
}

// 关闭公司到期时间弹窗
function closeCompanyExpirationModal() {
    document.getElementById('companyExpirationModal').style.display = 'none';
}

// 页面加载完成后初始化搜索功能及表单提交
document.addEventListener('DOMContentLoaded', function () {
    setupSearch();
    initializePagination();
    // 确保现有列表的删除勾选框与受保护 Company 规则（如 C168）保持一致
    syncDeleteCheckboxProtection();
    updateDeleteButton(); // 初始化删除按钮状态
    initializeCompanyClickHandlers(); // 初始化公司点击事件

    // 必须在 DOM 就绪后绑定，否则 #domainForm 可能为 null（脚本在 head 中加载）
    const domainForm = document.getElementById('domainForm');
    if (domainForm) {
        domainForm.addEventListener('submit', function (e) {
            e.preventDefault();

            // 先同步 tempCompanies 到 selectedCompanies 和 hidden field
            syncCompaniesFromTemp();

            const formData = new FormData(this);
            const data = Object.fromEntries(formData.entries());
            data.action = isEditMode ? 'update' : 'create';

            // Email validation: only allow @gmail.com
            if (data.email && !data.email.toLowerCase().endsWith('@gmail.com')) {
                showAlert('Only @gmail.com addresses are allowed', 'danger');
                return;
            }

            // Remove password if empty during edit
            if (isEditMode && !data.password) {
                delete data.password;
            }

            // 移除空的二级密码（编辑模式，如果用户没有修改）
            if (isEditMode && !data.secondary_password) {
                delete data.secondary_password;
            }

            // DEBUG: 检查发送的 companies 数据中的 group_id
            console.log('[Domain Save] companies data:', data.companies);

            fetch('api/domain/domain_api.php', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        showAlert(isEditMode ? 'Owner updated successfully!' : 'Owner created successfully!');
                        closeModal();

                        if (isEditMode) {
                            updateDomainCard(data.data);
                        } else {
                            addDomainCard(data.data);
                        }
                    } else {
                        showAlert(data.message || 'Operation failed', 'danger');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showAlert('An error occurred while saving owner', 'danger');
                });
        });
    }
});

// Close modal when clicking outside
window.onclick = function (event) {
    const companyExpModal = document.getElementById('companyExpirationModal');
    if (event.target === companyExpModal) {
        closeCompanyExpirationModal();
    }

    const companyExpDateModal = document.getElementById('companyExpDateModal');
    if (event.target === companyExpDateModal) {
        closeCompanyExpDateModal(true); // 点击遮罩视为 Cancel，还原状态
    }

    const domainFeeSettingsModal = document.getElementById('domainFeeSettingsModal');
    if (event.target === domainFeeSettingsModal) {
        closeDomainFeeSettingsModal();
    }

}

// Hover color now only shows while hovered and resets on mouse leave