// 构造 API 绝对 URL（与 processlist 一致，避免子目录部署时相对路径解析错误）
function buildApiUrl(pathAndQuery) {
    const pathname = window.location.pathname || '/';
    const basePath = pathname.replace(/[^/]*$/, '') || '/';
    const base = window.location.origin + basePath;
    return new URL(pathAndQuery, base).href;
}

// 分页相关变量
let currentPage = 1;
let rowsPerPage = 20;
let filteredRows = [];
let allRows = [];

// 排序状态
let sortColumn = 'loginId'; // 'loginId' 或 'role'
let sortDirection = 'asc'; // 'asc' 或 'desc'

// Show inactive / Show all（与 account-list、processlist 行为对齐）
let showAll = (typeof window.USERLIST_SHOW_ALL !== 'undefined' && !!window.USERLIST_SHOW_ALL);
let showInactive = false;

// 当前用户信息
const currentUserId = typeof window.USERLIST_CURRENT_USER_ID !== 'undefined' ? window.USERLIST_CURRENT_USER_ID : null;
const currentUserRole = typeof window.USERLIST_CURRENT_USER_ROLE !== 'undefined' ? window.USERLIST_CURRENT_USER_ROLE : '';

// 用户数据数组（从页面中提取）
let usersData = [];

// Company 相关变量
let availableCompanies = [];
let selectedCompanyIds = [];

// Account and Process permissions
let selectedAccounts = [];
let selectedProcesses = [];

// 角色层级定义（数字越小，层级越高）
const roleHierarchy = {
    'owner': 0,
    'partnership': 1,
    'admin': 2,
    'manager': 3,
    'supervisor': 4,
    'accountant': 5,
    'audit': 6,
    'customer service': 7,
   
};

// 所有可用角色列表
const allRoles = [
    { value: 'partnership', label: 'Partnership' },
    { value: 'admin', label: 'Admin' },
    { value: 'manager', label: 'Manager' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'accountant', label: 'Accountant' },
    { value: 'audit', label: 'Audit' },
    { value: 'customer service', label: 'Customer Service' },
    
];

// ── Read Only Toggle 显示/隐藏（只有 Partnership 角色才显示）──
function updateReadOnlyToggleVisibility(role) {
    const wrapper = document.getElementById('readOnlyToggleWrapper');
    const readOnlyToggle = document.getElementById('readOnlyToggle');
    const readOnlyToggleLabel = document.getElementById('readOnlyToggleLabel');
    if (!wrapper) return;
    if (role && role.toLowerCase() === 'partnership') {
        wrapper.style.display = 'block';
        const canToggle = currentUserRole === 'owner';
        if (readOnlyToggle) {
            readOnlyToggle.disabled = !canToggle;
        }
        if (readOnlyToggleLabel) {
            readOnlyToggleLabel.style.opacity = canToggle ? '1' : '0.6';
            readOnlyToggleLabel.style.cursor = canToggle ? 'pointer' : 'not-allowed';
        }
    } else {
        wrapper.style.display = 'none';
        if (readOnlyToggle) {
            readOnlyToggle.disabled = false;
        }
        if (readOnlyToggleLabel) {
            readOnlyToggleLabel.style.opacity = '';
            readOnlyToggleLabel.style.cursor = '';
        }
    }
}

// 根据当前用户角色获取可创建的角色列表
function getAvailableRolesForCreation() {
    const currentLevel = roleHierarchy[currentUserRole] ?? 999;

    // accountant, audit, customer service 不能开账号
    if (currentLevel >= 4) {
        return [];
    }

    // 返回所有比当前用户层级低的角色
    return allRoles.filter(role => {
        const roleLevel = roleHierarchy[role.value] ?? 999;
        return roleLevel > currentLevel;
    });
}

// 根据当前用户角色和被编辑用户的角色获取可编辑的角色列表
function getAvailableRolesForEdit(editingUserRole) {
    const currentLevel = roleHierarchy[currentUserRole] ?? 999;
    const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;

    // accountant, audit, customer service 不能开账号
    if (currentLevel >= 4) {
        return [];
    }

    // 如果被编辑用户的层级 >= 当前用户层级，不能修改角色
    if (editingUserLevel <= currentLevel) {
        return [];
    }

    // 返回所有比当前用户层级低的角色（不再限制必须>=原角色）
    return allRoles.filter(role => {
        const roleLevel = roleHierarchy[role.value] ?? 999;
        return roleLevel > currentLevel;
    });
}

// 更新角色下拉选项
function updateRoleOptions(availableRoles, currentRoleValue = null) {
    const roleSelect = document.getElementById('role');
    if (!roleSelect) return;

    // 清空现有选项（保留第一个空选项）
    roleSelect.innerHTML = '<option value="">Select Role</option>';

    // 添加可用的角色选项
    availableRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.value;
        option.textContent = role.label;
        // 如果是编辑模式且是当前角色，设置为选中
        if (currentRoleValue && role.value === currentRoleValue) {
            option.selected = true;
        }
        roleSelect.appendChild(option);
    });

    // 如果有当前角色值但不在可用列表中，添加它（用于显示当前值）
    if (currentRoleValue && !availableRoles.find(r => r.value === currentRoleValue)) {
        const currentRole = allRoles.find(r => r.value === currentRoleValue);
        if (currentRole) {
            const option = document.createElement('option');
            option.value = currentRole.value;
            option.textContent = currentRole.label;
            option.selected = true;
            roleSelect.insertBefore(option, roleSelect.firstChild.nextSibling);
        }
    }
}

// 提取用户数据
function extractUsersData() {
    const cards = document.querySelectorAll('#userTableBody .user-card');
    usersData = Array.from(cards).map(card => ({
        id: card.getAttribute('data-id'),
        login_id: card.getAttribute('data-login-id') || '',
        name: card.getAttribute('data-name') || '',
        email: card.getAttribute('data-email') || '',
        role: card.getAttribute('data-role') || '',
        status: card.getAttribute('data-status') || '',
        last_login: card.getAttribute('data-last-login') || '',
        created_by: card.getAttribute('data-created-by') || '',
        is_owner_shadow: card.getAttribute('data-is-owner-shadow') === '1',
        element: card
    }));
}

// 更新斑马纹类名（基于可见卡片的索引）
function updateZebraStriping() {
    // 只更新可见的卡片（不包括被过滤隐藏的）
    const visibleCards = Array.from(document.querySelectorAll('#userTableBody .user-card:not(.table-row-hidden)'));
    visibleCards.forEach((card, index) => {
        card.classList.remove('row-even', 'row-odd');
        if (index % 2 === 0) {
            card.classList.add('row-even');
        } else {
            card.classList.add('row-odd');
        }
    });
}

// 排序函数
function applySorting() {
    if (usersData.length === 0) return;

    if (sortColumn === 'loginId') {
        usersData.sort((a, b) => {
            // Owner shadow 始终在最前面
            if (a.is_owner_shadow && !b.is_owner_shadow) return -1;
            if (!a.is_owner_shadow && b.is_owner_shadow) return 1;

            const aKey = String(a.login_id || '').toLowerCase();
            const bKey = String(b.login_id || '').toLowerCase();
            let result = 0;
            if (aKey < bKey) result = -1;
            else if (aKey > bKey) result = 1;
            else {
                // 如果 login_id 相同，按 name 排序
                const aName = String(a.name || '').toLowerCase();
                const bName = String(b.name || '').toLowerCase();
                if (aName < bName) result = -1;
                else if (aName > bName) result = 1;
            }
            return sortDirection === 'asc' ? result : -result;
        });
    } else if (sortColumn === 'role') {
        // Role 层级顺序（根据常见的层级）
        const roleOrder = {
            'OWNER': 0,
            'PARTNERSHIP': 1,
            'ADMIN': 2,
            'MANAGER': 3,
            'SUPERVISOR': 4,
            'ACCOUNTANT': 5,
            'AUDIT': 6,
            'CUSTOMER SERVICE': 7,
           
        };

        usersData.sort((a, b) => {
            // Owner shadow 始终在最前面
            if (a.is_owner_shadow && !b.is_owner_shadow) return -1;
            if (!a.is_owner_shadow && b.is_owner_shadow) return 1;

            const aRole = String(a.role || '').toUpperCase().trim();
            const bRole = String(b.role || '').toUpperCase().trim();

            const aOrder = roleOrder[aRole] !== undefined ? roleOrder[aRole] : 999;
            const bOrder = roleOrder[bRole] !== undefined ? roleOrder[bRole] : 999;

            let result = 0;
            if (aOrder < bOrder) result = -1;
            else if (aOrder > bOrder) result = 1;
            else {
                // 如果层级相同，按 role 名称字母顺序排序
                if (aRole < bRole) result = -1;
                else if (aRole > bRole) result = 1;
                else {
                    // 如果 role 也相同，按 login_id 排序
                    const aKey = String(a.login_id || '').toLowerCase();
                    const bKey = String(b.login_id || '').toLowerCase();
                    if (aKey < bKey) result = -1;
                    else if (aKey > bKey) result = 1;
                }
            }
            return sortDirection === 'asc' ? result : -result;
        });
    }

    // 重新排列 DOM 元素
    const container = document.getElementById('userTableBody');
    usersData.forEach(user => {
        container.appendChild(user.element);
    });

    // 更新斑马纹类名
    updateZebraStriping();

    updateSortIndicators();
}

// 更新排序指示器
function updateSortIndicators() {
    const loginIdIndicator = document.getElementById('sortLoginIdIndicator');
    const roleIndicator = document.getElementById('sortRoleIndicator');

    if (!loginIdIndicator || !roleIndicator) return;

    if (sortColumn === 'loginId') {
        loginIdIndicator.textContent = sortDirection === 'asc' ? '▲' : '▼';
        loginIdIndicator.style.display = 'inline';
        roleIndicator.textContent = '▲'; // 未选中时显示默认箭头
        roleIndicator.style.display = 'inline';
    } else if (sortColumn === 'role') {
        roleIndicator.textContent = sortDirection === 'asc' ? '▲' : '▼';
        roleIndicator.style.display = 'inline';
        loginIdIndicator.textContent = '▲'; // 未选中时显示默认箭头
        loginIdIndicator.style.display = 'inline';
    }
}

// 按 Login Id 排序
function sortByLoginId() {
    if (sortColumn === 'loginId') {
        // 切换排序方向
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 切换到 loginId 排序，默认升序
        sortColumn = 'loginId';
        sortDirection = 'asc';
    }
    extractUsersData();
    applySorting();
    currentPage = 1;
    initializePagination();
}

// 按 Role 排序
function sortByRole() {
    if (sortColumn === 'role') {
        // 切换排序方向
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 切换到 role 排序，默认升序
        sortColumn = 'role';
        sortDirection = 'asc';
    }
    extractUsersData();
    applySorting();
    currentPage = 1;
    initializePagination();
}

// 初始化分页
function initializePagination() {
    allRows = Array.from(document.querySelectorAll('#userTableBody .user-card'));

    // 获取当前搜索过滤的行
    filteredRows = allRows.filter(row => !row.classList.contains('table-row-hidden'));

    if (showAll) {
        updatePagination();
        showCurrentPage();
        return;
    }

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
    const paginationContainer = document.getElementById('paginationContainer');
    if (showAll) {
        if (paginationContainer) paginationContainer.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

    // 更新分页控件信息
    document.getElementById('paginationInfo').textContent = `${currentPage} of ${totalPages}`;

    // 更新按钮状态
    const isPrevDisabled = currentPage <= 1;
    const isNextDisabled = currentPage >= totalPages;

    document.getElementById('prevBtn').disabled = isPrevDisabled;
    document.getElementById('nextBtn').disabled = isNextDisabled;

    // 如果只有一页或没有数据，隐藏分页控件
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

    if (showAll) {
        filteredRows.forEach((row, i) => {
            row.classList.add('show-card');
            const noCell = row.querySelector('.card-item');
            if (noCell) noCell.textContent = String(i + 1);
        });
        return;
    }

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
}

// 切换页面
function changePage(direction) {
    if (showAll) return;

    const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

    if (direction === -1 && currentPage > 1) {
        currentPage--;
    } else if (direction === 1 && currentPage < totalPages) {
        currentPage++;
    }

    updatePagination();
    showCurrentPage();
}

function syncUserListShowAllUrl() {
    try {
        const url = new URL(window.location.href);
        if (showAll) {
            url.searchParams.set('showAll', '1');
        } else {
            url.searchParams.delete('showAll');
        }
        history.replaceState({}, '', url);
    } catch (e) {
        /* ignore */
    }
}

function updateUserListScrollMode() {
    if (!document.body) return;
    if (showAll) {
        document.body.classList.add('user-page--show-all');
    } else {
        document.body.classList.remove('user-page--show-all');
    }
}

let isEditMode = false;
let isDeleteMode = false;

// 在编辑模式下，把 sidebar permissions 从右侧 Permissions 面板搬到左侧 User Information 下面
function moveSidebarPermissionsToUserInfo() {
    const modal = document.getElementById('userModal');
    if (!modal) return;

    const sidebarWrapper = modal.querySelector('#sidebarPermissionsWrapper');
    const userInfoForm = modal.querySelector('.user-info-panel form');
    if (!sidebarWrapper || !userInfoForm) return;

    // 如果已经在左侧容器里，就不重复移动
    const currentContainer = sidebarWrapper.closest('.edit-mode-permissions-container');
    if (currentContainer) return;

    // 创建或获取左侧容器
    let container = document.getElementById('editModePermissionsContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'editModePermissionsContainer';
        container.className = 'edit-mode-permissions-container';

        const title = document.createElement('h3');
        title.textContent = 'Permissions';
        container.appendChild(title);
    }

    // 把 sidebar 权限块放入左侧容器
    container.appendChild(sidebarWrapper);

    // 插入到左侧表单的按钮上方
    const formActions = userInfoForm.querySelector('.form-actions');
    if (formActions && formActions.parentElement === userInfoForm) {
        userInfoForm.insertBefore(container, formActions);
    } else {
        userInfoForm.appendChild(container);
    }
}

// 退出编辑模式时，把 sidebar permissions 放回右侧 Permissions 面板
function restoreSidebarPermissionsToRightPanel() {
    const modal = document.getElementById('userModal');
    if (!modal) return;

    const container = document.getElementById('editModePermissionsContainer');
    const sidebarWrapper = container ? container.querySelector('#sidebarPermissionsWrapper') : null;
    const panelWrapper = modal.querySelector('.permissions-panel-wrapper');

    if (!sidebarWrapper || !panelWrapper) {
        if (container && !sidebarWrapper) container.remove();
        return;
    }

    // 放回右侧 permissions-panel-wrapper 的最前面
    panelWrapper.insertBefore(sidebarWrapper, panelWrapper.firstChild);

    // 移除左侧容器本身
    container.remove();
}

// 强制输入大写字母、数字和符号
function forceUppercase(input) {
    // 获取光标位置
    const cursorPosition = input.selectionStart;
    // 转换为大写
    const upperValue = input.value.toUpperCase();
    // 设置值
    input.value = upperValue;
    // 恢复光标位置（只对支持的 input 类型）
    try {
        input.setSelectionRange(cursorPosition, cursorPosition);
    } catch (e) {
        // 某些 input 类型不支持 setSelectionRange，忽略错误
    }
}

// 强制输入小写字母并过滤中文
function forceLowercase(input) {
    // 获取光标位置
    const cursorPosition = input.selectionStart;
    // 过滤中文字符，只保留英文、数字和特殊符号
    const filteredValue = input.value.replace(/[\u4e00-\u9fa5]/g, '');
    // 转换为小写
    const lowerValue = filteredValue.toLowerCase();
    // 设置值
    input.value = lowerValue;
    // 恢复光标位置（只对支持的 input 类型）
    try {
        const newCursorPosition = Math.min(cursorPosition, lowerValue.length);
        input.setSelectionRange(newCursorPosition, newCursorPosition);
    } catch (e) {
        // email 类型的 input 不支持 setSelectionRange，忽略错误
    }
}

// 为输入框添加事件监听器
function setupInputFormatting() {
    const uppercaseInputs = ['login_id', 'name'];
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
}

function showAlert(message, type = 'success') {
    const container = document.getElementById('notificationContainer');

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
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('status').value = 'active';
    document.getElementById('password').required = true;
    // 显示密码字段（根据是否是c168公司显示不同的布局）
    const passwordRowContainer = document.getElementById('passwordRowContainer');
    const passwordGroup = document.getElementById('passwordGroup');
    if (passwordRowContainer) {
        // C168公司：显示密码行容器
        passwordRowContainer.style.display = 'flex';
    } else if (passwordGroup) {
        // 非C168公司：显示单个密码字段
        passwordGroup.style.display = 'block';
    }
    document.getElementById('login_id').disabled = false;
    const hiddenLoginId = document.getElementById('hidden_login_id');
    if (hiddenLoginId) {
        hiddenLoginId.remove();
    }

    // 切换到添加模式 UI (修正: 在新建用户时也展示 Right Panel 和 Bottom Bar，避免留白过大)
    const editModeRightPanel = document.getElementById('editModeRightPanel');
    const editModeBottomBar = document.getElementById('editModeBottomBar');
    const addModeActions = document.querySelector('.add-mode-actions');
    if (editModeRightPanel) editModeRightPanel.style.display = 'flex';
    if (editModeBottomBar) editModeBottomBar.style.display = 'flex';
    if (addModeActions) addModeActions.style.display = 'none';

    // 根据当前用户角色更新可选择的角色选项
    const availableRoles = getAvailableRolesForCreation();
    if (availableRoles.length === 0) {
        showAlert('You do not have permission to create new accounts', 'danger');
        return;
    }
    updateRoleOptions(availableRoles);

    // 根据当前用户的权限限制权限复选框（创建用户时）
    restrictPermissionsByCurrentUserRole();

    // 默认勾选所有可用的权限复选框（创建新用户时）
    document.querySelectorAll('.permission-checkbox:not(:disabled)').forEach(checkbox => {
        checkbox.checked = true;
    });

    // 根据当前用户角色控制 Company 字段的显示
    toggleCompanyFieldVisibility();

    // 加载并显示 company 列表（只有 admin 和 owner 会加载）
    if (currentUserRole === 'admin' || currentUserRole === 'owner') {
        loadCompaniesForModal();
    }

    // 重置 company 选择
    selectedCompanyIds = [];

    // 显示 Account 和 Process 权限区域（既然要像 Desktop 正常展示所有，就让它全程显示）
    const accProcSection = document.getElementById('accountProcessPermissionsSection');
    if (accProcSection) accProcSection.style.display = 'flex';

    // 重置并默认全选 Account 和 Process（因为新建用户通常拥有所有可见权限）
    selectedAccounts = [];
    selectedProcesses = [];
    selectAllAccounts();
    selectAllProcesses();

    // 重置 Read Only toggle（创建模式默认隐藏，打开时 role 还未选，等 role change 时触发）
    updateReadOnlyToggleVisibility('');
    const readOnlyToggle = document.getElementById('readOnlyToggle');
    if (readOnlyToggle) readOnlyToggle.checked = true; // 默认 read-only ON

    document.getElementById('userModal').style.display = 'block';
    // 设置输入格式化
    setupInputFormatting();
}

// 根据当前用户角色控制 Company 字段的显示（只有 admin 和 owner 显示）
function toggleCompanyFieldVisibility() {
    const companyFieldGroup = document.querySelector('.company-field-group');
    if (companyFieldGroup) {
        // 只有 admin 和 owner 可以看到 Company 字段
        if (currentUserRole === 'admin' || currentUserRole === 'owner') {
            companyFieldGroup.style.display = 'block';
        } else {
            companyFieldGroup.style.display = 'none';
        }
    }
}

// 加载 Company 列表用于 Modal
function loadCompaniesForModal() {
    return fetch(buildApiUrl('api/transactions/get_owner_companies_api.php'))
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data.length > 0) {
                availableCompanies = data.data;
                const container = document.getElementById('user-company-buttons-container');
                container.innerHTML = '';

                // 创建 company 按钮（可多选）
                data.data.forEach(company => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'transaction-company-btn';
                    btn.textContent = company.company_id;
                    btn.dataset.companyId = company.id;
                    btn.addEventListener('click', function () {
                        toggleCompanySelection(company.id);
                    });
                    container.appendChild(btn);
                });

                // 如果没有预设的选中项，默认选中当前 session 的 company
                if (selectedCompanyIds.length === 0) {
                    const currentCompanyId = typeof window.USERLIST_CURRENT_COMPANY_ID !== 'undefined' ? window.USERLIST_CURRENT_COMPANY_ID : null;
                    if (currentCompanyId) {
                        selectedCompanyIds = [currentCompanyId];
                    } else if (data.data.length > 0) {
                        // 如果没有当前 company，默认选中第一个
                        selectedCompanyIds = [data.data[0].id];
                    }
                }
                updateCompanyButtonsState();
            } else {
                // 没有 company 数据
                const container = document.getElementById('user-company-buttons-container');
                container.innerHTML = '<span style="color: #999; font-size: 12px;">No companies available</span>';
                selectedCompanyIds = [];
            }
        })
        .catch(error => {
            console.error('Failed to load Company list:', error);
            const container = document.getElementById('user-company-buttons-container');
            container.innerHTML = '<span style="color: #f00; font-size: 12px;">Failed to load companies</span>';
        });
}

// 切换 Company 选择（多选）
function toggleCompanySelection(companyId) {
    const index = selectedCompanyIds.indexOf(companyId);
    if (index > -1) {
        selectedCompanyIds.splice(index, 1);
    } else {
        selectedCompanyIds.push(companyId);
    }
    updateCompanyButtonsState();
}

// 更新 Company 按钮状态
function updateCompanyButtonsState() {
    const buttons = document.querySelectorAll('#user-company-buttons-container .transaction-company-btn');
    buttons.forEach(btn => {
        const companyId = parseInt(btn.dataset.companyId);
        if (selectedCompanyIds.includes(companyId)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function editUser(id, isOwnerShadow = false) {
    // 检查是否是owner影子且当前用户不是owner
    if (isOwnerShadow && currentUserRole !== 'owner') {
        showAlert('Only the owner can edit owner records', 'danger');
        return;
    }

    // 所有角色都可以编辑其他用户（移除权限限制）
    // 但只能编辑 Account 和 Process Permissions，其他字段保持锁定

    isEditMode = true;
    document.getElementById('modalTitle').textContent = isOwnerShadow ? 'Edit Owner' : 'Edit User';
    document.getElementById('password').required = false;
    // 显示密码字段（根据是否是c168公司显示不同的布局）
    const passwordRowContainer = document.getElementById('passwordRowContainer');
    const passwordGroup = document.getElementById('passwordGroup');
    if (passwordRowContainer) {
        // C168公司：显示密码行容器
        passwordRowContainer.style.display = 'flex';
    } else if (passwordGroup) {
        // 非C168公司：显示单个密码字段
        passwordGroup.style.display = 'block';
    }

    // 切换到编辑模式 UI
    const editModeRightPanel = document.getElementById('editModeRightPanel');
    const editModeBottomBar = document.getElementById('editModeBottomBar');
    const addModeActions = document.querySelector('.add-mode-actions');
    if (editModeRightPanel) editModeRightPanel.style.display = 'flex';
    if (editModeBottomBar) editModeBottomBar.style.display = 'flex';
    if (addModeActions) addModeActions.style.display = 'none';

    // 编辑模式下先恢复所有权限复选框为可用状态（加载权限后会根据当前用户权限再次限制）
    restoreAllPermissionsCheckboxes();

    // 根据当前用户角色控制 Company 字段的显示
    toggleCompanyFieldVisibility();

    // Get user data from user card
    const card = document.querySelector(`.user-card[data-id="${id}"]`);
    const items = card.querySelectorAll('.card-item');

    document.getElementById('userId').value = id;
    document.getElementById('login_id').value = items[1].textContent;
    document.getElementById('login_id').disabled = true;

    // 添加隐藏字段来保存 login_id
    const hiddenLoginId = document.createElement('input');
    hiddenLoginId.type = 'hidden';
    hiddenLoginId.name = 'login_id';
    hiddenLoginId.value = items[1].textContent;
    hiddenLoginId.id = 'hidden_login_id';
    document.getElementById('userForm').appendChild(hiddenLoginId);

    document.getElementById('name').value = items[2].textContent;
    document.getElementById('email').value = items[3].textContent;

    // 检查是否是编辑自己
    const editingUserId = parseInt(id);
    const isEditingSelf = currentUserId && editingUserId && currentUserId === editingUserId;

    // 如果是owner影子，禁用role字段
    const roleSelect = document.getElementById('role');
    if (isOwnerShadow) {
        roleSelect.value = 'owner';
        roleSelect.disabled = true;
    } else {
        const editingUserRole = items[4].querySelector('.role-badge').textContent.trim().toLowerCase();

        // 如果编辑的是自己，禁用 role 字段（不能修改自己的角色）
        if (isEditingSelf) {
            roleSelect.disabled = true;
            // 恢复所有角色选项以便显示当前值
            updateRoleOptions(allRoles, editingUserRole);
            roleSelect.value = editingUserRole;
        } else {
            // 检查层级关系
            const currentLevel = roleHierarchy[currentUserRole] ?? 999;
            const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
            const isUpperLevel = currentLevel < editingUserLevel; // 当前用户层级更高（数字更小）
            const isSameLevel = currentLevel === editingUserLevel; // 同级
            const isLowerLevel = currentLevel > editingUserLevel; // 当前用户层级更低（数字更大）

            if (isUpperLevel) {
                // 上级编辑下级：可以编辑所有内容
                const availableRoles = getAvailableRolesForEdit(editingUserRole);
                if (availableRoles.length > 0) {
                    roleSelect.disabled = false;
                    updateRoleOptions(availableRoles, editingUserRole);
                } else {
                    roleSelect.disabled = true;
                    updateRoleOptions(allRoles, editingUserRole);
                }
                roleSelect.value = editingUserRole;

                // User Information 字段保持可编辑
                document.getElementById('name').disabled = false;
                document.getElementById('email').disabled = false;
                document.getElementById('password').disabled = false;

                // Company 字段保持可编辑（如果当前用户是 admin 或 owner，会在后面加载时处理）
                // Sidebar Permissions 保持可编辑（但受当前用户权限限制）
                // 会在后面根据当前用户权限限制
            } else if (isSameLevel || isLowerLevel) {
                // 同级编辑同级 或 下级编辑上级：只能编辑 Account 和 Process Permissions
                roleSelect.disabled = true;
                updateRoleOptions(allRoles, editingUserRole);
                roleSelect.value = editingUserRole;

                // 禁用所有 User Information 字段
                document.getElementById('name').disabled = true;
                document.getElementById('email').disabled = true;
                document.getElementById('password').disabled = true;

                // 禁用 Company 字段（如果显示）
                const companyButtons = document.querySelectorAll('#user-company-buttons-container .transaction-company-btn');
                companyButtons.forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.6';
                    btn.style.cursor = 'not-allowed';
                });

                // 禁用所有 Sidebar Permissions 复选框
                const sidebarCheckboxes = document.querySelectorAll('.permission-checkbox');
                sidebarCheckboxes.forEach(checkbox => {
                    checkbox.disabled = true;
                    checkbox.style.opacity = '0.6';
                    checkbox.style.cursor = 'not-allowed';
                });

                // 禁用 Sidebar Permissions 的 Select All / Clear All 按钮
                const sidebarActions = document.querySelector('#sidebarPermissionsWrapper .permissions-actions');
                if (sidebarActions) {
                    const sidebarButtons = sidebarActions.querySelectorAll('button');
                    sidebarButtons.forEach(btn => {
                        btn.disabled = true;
                        btn.style.opacity = '0.6';
                        btn.style.cursor = 'not-allowed';
                    });
                }
            }
        }
    }

    document.getElementById('status').value = items[5].querySelector('.role-badge').textContent.trim().toLowerCase();

    // 显示 Account 和 Process 权限区域（只在编辑模式显示）
    document.getElementById('accountProcessPermissionsSection').style.display = 'flex';

    // 获取用户权限数据（只有非owner影子才获取）
    if (!isOwnerShadow) {
        fetch(buildApiUrl('api/users/userlist_api.php'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'get',
                id: id
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (!isEditMode) return;
                    if (String(document.getElementById('userId').value) !== String(id)) return;

                    let permissions = [];
                    try {
                        if (data.data.permissions) {
                            const parsed = JSON.parse(data.data.permissions);
                            permissions = Array.isArray(parsed) ? parsed : [];
                        }
                    } catch (e) {
                        permissions = [];
                    }
                    setUserPermissions(permissions);

                    const apiRole = (data.data.role || '').toLowerCase().trim();
                    if (apiRole) {
                        applyRoleTemplateChecks(apiRole);
                    }

                    // 加载 Account 和 Process 权限
                    // null 表示未设置（默认全选），[] 表示已设置但为空（不选），有值表示只选这些
                    let accountPermissions = null;
                    let processPermissions = null;

                    // 解析 account_permissions
                    if (data.data.account_permissions !== null && data.data.account_permissions !== undefined) {
                        try {
                            accountPermissions = typeof data.data.account_permissions === 'string'
                                ? JSON.parse(data.data.account_permissions)
                                : data.data.account_permissions;
                            // 确保是数组类型
                            if (!Array.isArray(accountPermissions)) {
                                accountPermissions = [];
                            }
                        } catch (e) {
                            console.error('Error parsing account_permissions:', e, data.data.account_permissions);
                            accountPermissions = [];
                        }
                    }

                    // 解析 process_permissions
                    if (data.data.process_permissions !== null && data.data.process_permissions !== undefined) {
                        try {
                            processPermissions = typeof data.data.process_permissions === 'string'
                                ? JSON.parse(data.data.process_permissions)
                                : data.data.process_permissions;
                            // 确保是数组类型
                            if (!Array.isArray(processPermissions)) {
                                processPermissions = [];
                            }
                        } catch (e) {
                            console.error('Error parsing process_permissions:', e, data.data.process_permissions);
                            processPermissions = [];
                        }
                    }

                    // 加载 read_only 值并更新 Toggle
                    const readOnlyToggle = document.getElementById('readOnlyToggle');
                    if (readOnlyToggle) {
                        // read_only: 1 = 只读（toggle ON/checked），0 = 可编辑（toggle OFF/unchecked）
                        // 默认为 1（只读）
                        const readOnlyVal = data.data.read_only !== undefined ? parseInt(data.data.read_only) : 1;
                        readOnlyToggle.checked = (readOnlyVal === 1);
                    }

                    // 根据被编辑用户的角色显示/隐藏 Read Only toggle
                    const editedCard = document.querySelector(`.user-card[data-id="${id}"]`);
                    const editedRole = editedCard ? editedCard.getAttribute('data-role') : '';
                    updateReadOnlyToggleVisibility(editedRole);

                    // 添加小延迟确保 DOM 已完全渲染
                    setTimeout(() => {
                        loadAccountPermissions(accountPermissions);
                        loadProcessPermissions(processPermissions);
                    }, 50);

                    // 检查是否是编辑自己
                    const editingUserId = parseInt(id);
                    const isEditingSelf = currentUserId && editingUserId && currentUserId === editingUserId;

                    // 获取被编辑用户的角色和层级
                    const card = document.querySelector(`.user-card[data-id="${id}"]`);
                    const editingUserRole = card ? card.getAttribute('data-role')?.toLowerCase() : '';
                    const currentLevel = roleHierarchy[currentUserRole] ?? 999;
                    const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
                    const isUpperLevel = !isEditingSelf && currentLevel < editingUserLevel; // 上级编辑下级
                    const isSameLevel = !isEditingSelf && currentLevel === editingUserLevel; // 同级编辑同级
                    const isLowerLevel = !isEditingSelf && currentLevel > editingUserLevel; // 下级编辑上级

                    // 如果编辑的是自己，只禁用 Sidebar permissions（系统级权限）
                    // 但允许用户自己修改 Account 和 Process 权限（可见性权限）
                    if (isEditingSelf) {
                        // 禁用 Sidebar permissions 复选框（系统级权限，用户不能自己修改）
                        const sidebarCheckboxes = document.querySelectorAll('.permission-checkbox');
                        sidebarCheckboxes.forEach(checkbox => {
                            checkbox.disabled = true;
                            checkbox.style.opacity = '0.6';
                            checkbox.style.cursor = 'not-allowed';
                        });

                        // 禁用 Sidebar permissions 的 Select All / Clear All 按钮
                        const sidebarActions = document.querySelector('#sidebarPermissionsWrapper .permissions-actions');
                        if (sidebarActions) {
                            const sidebarButtons = sidebarActions.querySelectorAll('button');
                            sidebarButtons.forEach(btn => {
                                btn.disabled = true;
                                btn.style.opacity = '0.6';
                                btn.style.cursor = 'not-allowed';
                            });
                        }

                        // 允许用户自己修改 Account 和 Process 权限（可见性权限）
                        // Account permissions 保持可编辑
                        // Process permissions 保持可编辑
                    } else if (isUpperLevel) {
                        // 上级编辑下级：可以编辑所有内容，但 Sidebar Permissions 受当前用户权限限制
                        restrictPermissionsByCurrentUserRole();
                        // Account 和 Process Permissions 保持可编辑
                    } else if (isSameLevel || isLowerLevel) {
                        // 同级编辑同级 或 下级编辑上级：Sidebar Permissions 已在上面禁用
                        // Account 和 Process Permissions 保持可编辑（这是唯一允许编辑的部分）
                    }

                    // 加载用户已关联的 company（编辑模式下也显示 company 按钮，只有 admin 和 owner 才加载）
                    if (currentUserRole === 'admin' || currentUserRole === 'owner') {
                        if (data.data.company_ids && Array.isArray(data.data.company_ids)) {
                            selectedCompanyIds = data.data.company_ids.map(cid => parseInt(cid));
                            loadCompaniesForModal().then(() => {
                                updateCompanyButtonsState();

                                // 检查层级关系
                                const card = document.querySelector(`.user-card[data-id="${id}"]`);
                                const editingUserRole = card ? card.getAttribute('data-role')?.toLowerCase() : '';
                                const currentLevel = roleHierarchy[currentUserRole] ?? 999;
                                const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
                                const isUpperLevel = !isEditingSelf && currentLevel < editingUserLevel;
                                const isSameLevel = !isEditingSelf && currentLevel === editingUserLevel;
                                const isLowerLevel = !isEditingSelf && currentLevel > editingUserLevel;

                                const companyButtons = document.querySelectorAll('#user-company-buttons-container .transaction-company-btn');
                                if (isEditingSelf) {
                                    // 如果编辑的是自己，禁用 company 按钮（用户不能修改自己所属的公司）
                                    companyButtons.forEach(btn => {
                                        btn.disabled = true;
                                        btn.style.opacity = '0.6';
                                        btn.style.cursor = 'not-allowed';
                                    });
                                } else if (isUpperLevel) {
                                    // 上级编辑下级：Company 按钮可编辑（已在上面设置为可编辑）
                                    // 不需要禁用
                                } else if (isSameLevel || isLowerLevel) {
                                    // 同级编辑同级 或 下级编辑上级：禁用 Company 按钮
                                    companyButtons.forEach(btn => {
                                        btn.disabled = true;
                                        btn.style.opacity = '0.6';
                                        btn.style.cursor = 'not-allowed';
                                    });
                                }
                            });
                        } else {
                            loadCompaniesForModal().then(() => {
                                // 检查层级关系
                                const card = document.querySelector(`.user-card[data-id="${id}"]`);
                                const editingUserRole = card ? card.getAttribute('data-role')?.toLowerCase() : '';
                                const currentLevel = roleHierarchy[currentUserRole] ?? 999;
                                const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
                                const isUpperLevel = !isEditingSelf && currentLevel < editingUserLevel;
                                const isSameLevel = !isEditingSelf && currentLevel === editingUserLevel;
                                const isLowerLevel = !isEditingSelf && currentLevel > editingUserLevel;

                                const companyButtons = document.querySelectorAll('#user-company-buttons-container .transaction-company-btn');
                                if (isEditingSelf) {
                                    // 如果编辑的是自己，禁用 company 按钮
                                    companyButtons.forEach(btn => {
                                        btn.disabled = true;
                                        btn.style.opacity = '0.6';
                                        btn.style.cursor = 'not-allowed';
                                    });
                                } else if (isUpperLevel) {
                                    // 上级编辑下级：Company 按钮可编辑
                                    // 不需要禁用
                                } else if (isSameLevel || isLowerLevel) {
                                    // 同级编辑同级 或 下级编辑上级：禁用 Company 按钮
                                    companyButtons.forEach(btn => {
                                        btn.disabled = true;
                                        btn.style.opacity = '0.6';
                                        btn.style.cursor = 'not-allowed';
                                    });
                                }
                            });
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Error loading user permissions:', error);
                // 只有 admin 和 owner 才加载 company 列表
                if (currentUserRole === 'admin' || currentUserRole === 'owner') {
                    loadCompaniesForModal();
                }
            });
    } else {
        // owner 影子：显示并预设为全选（强制勾选全部权限，且只读，不提交）
        const allPermissionCheckboxes = document.querySelectorAll('.permission-checkbox');
        allPermissionCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        const sidebarCheckboxes = document.querySelectorAll('.permission-checkbox');
        sidebarCheckboxes.forEach(checkbox => {
            checkbox.disabled = true;
            checkbox.style.opacity = '0.6';
            checkbox.style.cursor = 'not-allowed';
        });
        const sidebarActions = document.querySelector('#sidebarPermissionsWrapper .permissions-actions');
        if (sidebarActions) {
            const sidebarButtons = sidebarActions.querySelectorAll('button');
            sidebarButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            });
        }
        // owner 影子不显示 company 按钮
        selectedCompanyIds = [];
        // owner 影子：Account / Process 默认全选
        const accProcSectionEdit = document.getElementById('accountProcessPermissionsSection');
        if (accProcSectionEdit) accProcSectionEdit.style.display = 'flex';
        loadAccountPermissions(null);
        loadProcessPermissions(null);
    }

    document.getElementById('userModal').style.display = 'block';
    setupInputFormatting();
}


function closeModal() {
    isEditMode = false;
    document.getElementById('userModal').style.display = 'none';

    // 清理隐藏的 login_id 字段
    const hiddenLoginId = document.getElementById('hidden_login_id');
    if (hiddenLoginId) {
        hiddenLoginId.remove();
    }

    // 重置到添加模式 UI
    const closeRightPanel = document.getElementById('editModeRightPanel');
    const closeBottomBar = document.getElementById('editModeBottomBar');
    const closeAddActions = document.querySelector('.add-mode-actions');
    if (closeRightPanel) closeRightPanel.style.display = 'none';
    if (closeBottomBar) closeBottomBar.style.display = 'none';
    if (closeAddActions) closeAddActions.style.display = 'flex';

    // 恢复role字段和选项
    const roleSelect = document.getElementById('role');
    if (roleSelect) {
        roleSelect.disabled = false;
        // 恢复所有角色选项（下次打开时会根据权限重新过滤）
        updateRoleOptions(allRoles);
    }

    // 恢复 User Information 字段
    document.getElementById('name').disabled = false;
    document.getElementById('email').disabled = false;
    document.getElementById('password').disabled = false;

    // 恢复 Company 按钮
    const companyButtons = document.querySelectorAll('#user-company-buttons-container .transaction-company-btn');
    companyButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
    });

    // 先清除所有权限（包括被禁用的复选框）
    const allPermissionCheckboxes = document.querySelectorAll('.permission-checkbox');
    allPermissionCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    // 恢复所有权限复选框的状态（移除禁用状态，包括创建用户时的限制）
    restoreAllPermissionsCheckboxes();

    // 恢复 Account 和 Process 权限复选框的状态
    const accountProcessCheckboxes = document.querySelectorAll('#accountGrid input[type="checkbox"], #processGrid input[type="checkbox"]');
    accountProcessCheckboxes.forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.style.opacity = '';
        checkbox.style.cursor = '';
    });

    // 恢复所有权限按钮的状态
    const allPermissionButtons = document.querySelectorAll('.permissions-actions button, .account-control-buttons button');
    allPermissionButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
    });

    // 隐藏 Account 和 Process 权限区域
    document.getElementById('accountProcessPermissionsSection').style.display = 'none';

    // 重置 Account 和 Process 选择
    selectedAccounts = [];
    selectedProcesses = [];
    clearAllAccounts();
    clearAllProcesses();

    // 重置 Read Only toggle
    updateReadOnlyToggleVisibility('');
    const readOnlyToggle = document.getElementById('readOnlyToggle');
    if (readOnlyToggle) readOnlyToggle.checked = true;
}

// 切换删除模式
function toggleDeleteMode() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const checkboxes = document.querySelectorAll('.user-checkbox');
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
    const checkboxes = document.querySelectorAll('.user-checkbox');
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

// 全选/取消全选所有用户
function toggleSelectAllUsers() {
    const selectAllCheckbox = document.getElementById('selectAllUsers');
    if (!selectAllCheckbox) {
        console.error('selectAllUsers checkbox not found');
        return;
    }

    // 选择所有 checkbox，然后过滤掉 disabled 的
    const allCheckboxes = Array.from(document.querySelectorAll('.user-checkbox')).filter(cb => !cb.disabled);
    console.log('Found checkboxes:', allCheckboxes.length, 'Select all checked:', selectAllCheckbox.checked);

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });

    updateDeleteButton();
}

// 根据当前页面是否有可删除项，显示/隐藏全选框
function updateSelectAllUsersVisibility() {
    const selectAllCheckbox = document.getElementById('selectAllUsers');
    if (!selectAllCheckbox) return;

    const anyRowCheckbox = document.querySelectorAll('.user-checkbox').length > 0;
    selectAllCheckbox.style.display = anyRowCheckbox ? 'inline-block' : 'none';
    if (!anyRowCheckbox) {
        selectAllCheckbox.checked = false;
    }
}

// 更新删除按钮状态
function updateDeleteButton() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const selectAllCheckbox = document.getElementById('selectAllUsers');
    // 选择所有 checkbox，然后过滤掉 disabled 的
    const allCheckboxes = Array.from(document.querySelectorAll('.user-checkbox')).filter(cb => !cb.disabled);

    // 更新全选 checkbox 状态
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

    updateSelectAllUsersVisibility();
}

// 权限选择相关函数
function selectAllPermissions() {
    // 只选择当前用户有权限的复选框
    const currentUserPermissions = getCurrentUserRolePermissions();
    document.querySelectorAll('.permission-checkbox').forEach(checkbox => {
        const permissionValue = checkbox.value;
        // 只勾选当前用户有权限且未禁用的复选框
        if (currentUserPermissions.includes(permissionValue) && !checkbox.disabled) {
            checkbox.checked = true;
        }
    });
}

function clearAllPermissions() {
    // 只清除当前用户有权限的复选框（可以取消勾选）
    const currentUserPermissions = getCurrentUserRolePermissions();
    document.querySelectorAll('.permission-checkbox').forEach(checkbox => {
        const permissionValue = checkbox.value;
        // 只清除当前用户有权限且未禁用的复选框
        if (currentUserPermissions.includes(permissionValue) && !checkbox.disabled) {
            checkbox.checked = false;
        }
    });
}

// 设置用户权限
function setUserPermissions(permissions) {
    // 清除所有选择
    clearAllPermissions();

    // 如果有权限数据，设置对应的复选框（权限值统一转小写以兼容 API 返回大小写不一致）
    if (permissions && Array.isArray(permissions)) {
        permissions.forEach(permission => {
            const value = (typeof permission === 'string' ? permission : '').toLowerCase().trim();
            if (!value) return;
            const checkbox = document.querySelector(`.permission-checkbox[value="${value}"]`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }
}

// 获取当前用户role的权限列表
function getCurrentUserRolePermissions() {
    const rolePermissions = {
        'owner': ['home', 'admin', 'account', 'ownership', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'admin': ['home', 'admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'manager': ['admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'supervisor': ['admin', 'account', 'process', 'datacapture', 'payment', 'report'],
        'accountant': ['payment', 'report', 'maintenance'],
        'audit': ['payment', 'report', 'maintenance'],
        'customer service': ['account', 'process', 'datacapture', 'payment', 'report']
    };

    return rolePermissions[currentUserRole] || [];
}

// 根据当前用户的权限限制权限复选框（创建用户时和编辑用户时）
// 注意：此函数只禁用复选框，不会取消已勾选的权限
// owner 不受权限限制，自动显示全部
function restrictPermissionsByCurrentUserRole() {
    // owner 不受权限限制，直接返回
    if (currentUserRole === 'owner') {
        return;
    }

    const currentUserPermissions = getCurrentUserRolePermissions();
    const allCheckboxes = document.querySelectorAll('.permission-checkbox');

    allCheckboxes.forEach(checkbox => {
        const permissionValue = checkbox.value;
        const hasPermission = currentUserPermissions.includes(permissionValue);

        if (!hasPermission) {
            // 禁用当前用户没有的权限复选框
            checkbox.disabled = true;
            checkbox.style.opacity = '0.5';
            checkbox.style.cursor = 'not-allowed';
            // 添加视觉提示
            const permissionItem = checkbox.closest('.permission-item');
            if (permissionItem) {
                permissionItem.style.opacity = '0.6';
            }
        } else {
            // 确保当前用户有的权限复选框是可用的
            checkbox.disabled = false;
            checkbox.style.opacity = '1';
            checkbox.style.cursor = 'pointer';
            const permissionItem = checkbox.closest('.permission-item');
            if (permissionItem) {
                permissionItem.style.opacity = '1';
            }
        }
    });
}

// 恢复所有权限复选框为可用状态（关闭模态框时）
function restoreAllPermissionsCheckboxes() {
    const allCheckboxes = document.querySelectorAll('.permission-checkbox');
    allCheckboxes.forEach(checkbox => {
        checkbox.disabled = false;
        checkbox.style.opacity = '';
        checkbox.style.cursor = '';
        const permissionItem = checkbox.closest('.permission-item');
        if (permissionItem) {
            permissionItem.style.opacity = '';
        }
    });
}

// 目标用户 Role 对应的 Sidebar 权限模板（与下拉框 Role 一致）
function getRoleTemplateSidebarList(role) {
    if (!role) return [];
    const rolePermissions = {
        'partnership': [],
        'admin': ['home', 'admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'manager': ['admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'supervisor': ['admin', 'account', 'process', 'datacapture', 'payment', 'report'],
        'accountant': ['payment', 'report', 'maintenance'],
        'audit': ['payment', 'report', 'maintenance'],
        'customer service': ['account', 'process', 'datacapture', 'payment', 'report']
    };

    return rolePermissions[role.toLowerCase()] || [];
}

// 按角色模板补勾（与 DB 已有勾选合并，不清空已有勾选）
function applyRoleTemplateChecks(role) {
    getRoleTemplateSidebarList(role).forEach(permission => {
        const checkbox = document.querySelector(`.permission-checkbox[value="${permission}"]`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

// 根据角色设置默认权限
function setDefaultPermissionsByRole(role, options = {}) {
    const { force = false } = options;

    // 编辑模式下除非明确强制，否则不覆盖现有权限
    if (isEditMode && !force) {
        return;
    }

    if (!role) {
        clearAllPermissions();
        return;
    }

    // 先临时启用所有复选框，清除所有权限（包括被禁用的）
    const allCheckboxes = document.querySelectorAll('.permission-checkbox');
    const disabledStates = [];
    allCheckboxes.forEach((checkbox, index) => {
        disabledStates[index] = checkbox.disabled;
        checkbox.disabled = false; // 临时启用以便清除
        checkbox.checked = false; // 清除所有权限
    });

    const permissions = getRoleTemplateSidebarList(role);

    // 设置新账号 role 的所有默认权限（不受当前用户权限限制）
    permissions.forEach(permission => {
        const checkbox = document.querySelector(`.permission-checkbox[value="${permission}"]`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });

    // 如果是创建模式，应用权限限制（禁用当前用户没有的权限复选框，但保持已勾选状态）
    if (!isEditMode) {
        restrictPermissionsByCurrentUserRole();
    }
}

// 获取选中的权限
function getSelectedPermissions() {
    const checkboxes = document.querySelectorAll('.permission-checkbox:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// 获取创建模式下的最终权限（合并默认权限和用户手动修改）
function getFinalPermissionsForCreation(selectedRole) {
    if (!selectedRole) {
        // 如果没有选择 role，只返回当前用户有权限的权限
        const currentUserPermissions = getCurrentUserRolePermissions();
        return getSelectedPermissions().filter(perm => currentUserPermissions.includes(perm));
    }

    // 获取新账号 role 的完整默认权限
    const rolePermissions = {
        'admin': ['home', 'admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'manager': ['admin', 'account', 'process', 'datacapture', 'payment', 'report', 'maintenance'],
        'supervisor': ['admin', 'account', 'process', 'datacapture', 'payment', 'report'],
        'accountant': ['payment', 'report', 'maintenance'],
        'audit': ['payment', 'report', 'maintenance'],
        'customer service': ['account', 'process', 'datacapture', 'payment', 'report']
    };
    const defaultPermissions = rolePermissions[selectedRole.toLowerCase()] || [];

    // 获取当前用户的权限列表
    const currentUserPermissions = getCurrentUserRolePermissions();

    // 获取用户手动勾选的权限（只包括当前用户有权限的权限）
    const manuallySelected = getSelectedPermissions().filter(perm => currentUserPermissions.includes(perm));

    // 合并默认权限和用户手动修改的权限
    // 对于当前用户有权限的权限：如果用户手动取消了，则不包含；否则包含
    // 对于当前用户没有权限的权限：始终包含（因为是默认权限，用户无法修改）
    const finalPermissions = defaultPermissions.filter(perm => {
        if (currentUserPermissions.includes(perm)) {
            // 当前用户有权限：检查用户是否手动勾选了
            return manuallySelected.includes(perm);
        }
        // 当前用户没有权限：始终包含（默认权限）
        return true;
    });

    return finalPermissions;
}

// 删除选中的用户
function deleteSelected() {
    const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');

    if (selectedCheckboxes.length === 0) {
        showAlert('Please select users to delete first', 'danger');
        return;
    }

    // 检查用户是否试图删除自己
    const hasSelf = Array.from(selectedCheckboxes).some(cb => {
        const userId = parseInt(cb.value);
        return currentUserId && userId === currentUserId;
    });

    if (hasSelf) {
        showAlert('You cannot delete your own account', 'danger');
        return;
    }

    // 检查是否包含同等级的用户
    const currentLevel = roleHierarchy[currentUserRole] ?? 999;
    const hasSameLevel = Array.from(selectedCheckboxes).some(cb => {
        const card = cb.closest('.user-card');
        if (card) {
            const userRole = card.getAttribute('data-role')?.toLowerCase() || '';
            const userLevel = roleHierarchy[userRole] ?? 999;
            return currentLevel === userLevel;
        }
        return false;
    });

    if (hasSameLevel) {
        showAlert('You cannot delete accounts with the same role level', 'danger');
        return;
    }

    // 检查是否包含比自己层级更高的用户（数字越小，层级越高）
    const hasHigherLevel = Array.from(selectedCheckboxes).some(cb => {
        const card = cb.closest('.user-card');
        if (card) {
            const userRole = card.getAttribute('data-role')?.toLowerCase() || '';
            const userLevel = roleHierarchy[userRole] ?? 999;
            return userLevel < currentLevel; // 目标用户层级更高
        }
        return false;
    });

    if (hasHigherLevel) {
        showAlert('You cannot delete accounts with higher role level', 'danger');
        return;
    }

    // 检查是否包含owner影子且当前用户不是owner
    const hasOwnerShadow = Array.from(selectedCheckboxes).some(cb => {
        return cb.getAttribute('data-is-owner-shadow') === '1';
    });

    if (hasOwnerShadow && currentUserRole !== 'owner') {
        showAlert('Only the owner can delete owner records', 'danger');
        return;
    }

    // 检查权限限制
    const lowPrivilegeRoles = ['manager', 'supervisor', 'accountant', 'audit', 'customer service'];
    const isLowPrivilegeUser = lowPrivilegeRoles.includes(currentUserRole);

    // 检查低权限角色不能删除admin和owner（注意：同等级检查已在上面处理）
    if (isLowPrivilegeUser) {
        const hasRestrictedUser = Array.from(selectedCheckboxes).some(cb => {
            const card = cb.closest('.user-card');
            if (card) {
                const userRole = card.getAttribute('data-role')?.toLowerCase() || '';
                return userRole === 'admin' || userRole === 'owner';
            }
            return false;
        });

        if (hasRestrictedUser) {
            showAlert('You do not have permission to delete admin or owner accounts', 'danger');
            return;
        }
    }

    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    const selectedNames = Array.from(selectedCheckboxes).map(cb => {
        const card = cb.closest('.user-card');
        return card.querySelectorAll('.card-item')[2].textContent; // Name列
    });

    const confirmMessage = `Are you sure you want to delete the following ${selectedIds.length} user(s)?\n\n${selectedNames.join(', ')}`;

    showConfirmModal(confirmMessage, function () {
        // 批量删除
        Promise.all(selectedIds.map(id =>
            fetch(buildApiUrl('api/users/userlist_api.php'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'delete',
                    id: id
                })
            }).then(response => {
                // 检查HTTP响应状态
                if (!response.ok) {
                    return { success: false, message: `HTTP error: ${response.status}` };
                }
                return response.json().catch(err => {
                    console.error('JSON parse error:', err);
                    return { success: false, message: 'Invalid response from server' };
                });
            }).catch(error => {
                console.error('Fetch error for user ID', id, ':', error);
                return { success: false, message: error.message || 'Network error' };
            })
        )).then(results => {
            console.log('Delete results:', results); // 调试信息

            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;
            const failedResults = results.filter(r => !r.success);

            // 显示详细结果
            if (failCount === 0) {
                showAlert(`Successfully deleted ${successCount} users!`);

                // 只在全部成功时才删除DOM元素
                selectedCheckboxes.forEach(cb => {
                    const card = cb.closest('.user-card');
                    if (card) card.remove();
                });
            } else {
                // 显示失败详情
                const errorMessages = failedResults.map(r => r.message || 'Unknown error').join(', ');
                showAlert(`Deletion completed: ${successCount} succeeded, ${failCount} failed. Errors: ${errorMessages}`, 'danger');

                // 只删除成功删除的用户卡片
                results.forEach((result, index) => {
                    if (result.success && selectedCheckboxes[index]) {
                        const card = selectedCheckboxes[index].closest('.user-card');
                        if (card) card.remove();
                    }
                });
            }

            // 重新应用排序和分页
            extractUsersData();
            applySorting();
            initializePagination();
            // 更新斑马纹类名
            updateZebraStriping();

            // 重置按钮状态
            const deleteBtn = document.getElementById('deleteSelectedBtn');
            deleteBtn.textContent = 'Delete';
            deleteBtn.disabled = false;

            // 取消所有复选框的选中状态
            selectedCheckboxes.forEach(cb => {
                cb.checked = false;
            });
        }).catch(error => {
            console.error('Error:', error);
            showAlert('An error occurred during batch deletion: ' + error.message, 'danger');
        });
    });
}

// 添加新用户卡片到DOM
function addUserCard(userData) {
    const userCardsContainer = document.getElementById('userTableBody');

    // 创建新卡片
    const newCard = document.createElement('div');
    newCard.className = 'user-card';
    newCard.setAttribute('data-id', userData.id);
    newCard.setAttribute('data-login-id', userData.login_id || '');
    newCard.setAttribute('data-name', userData.name || '');
    newCard.setAttribute('data-email', userData.email || '');
    newCard.setAttribute('data-role', userData.role || '');
    newCard.setAttribute('data-status', userData.status || '');
    newCard.setAttribute('data-last-login', userData.last_login || '');
    newCard.setAttribute('data-created-by', userData.created_by || '');
    newCard.setAttribute('data-is-owner-shadow', '0');

    const roleClass = userData.role.replace(/\s+/g, '-').toLowerCase();
    const statusClass = userData.status === 'active' ? 'status-active' : 'status-inactive';
    const lastLogin = userData.last_login ? new Date(userData.last_login).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ') : '-';

    newCard.innerHTML = `
        <div class="card-item">1</div>
        <div class="card-item">${userData.login_id}</div>
        <div class="card-item">${userData.name}</div>
        <div class="card-item">${userData.email}</div>
        <div class="card-item uppercase-text">
            <span class="role-badge role-${roleClass}">
                ${userData.role.toUpperCase()}
            </span>
        </div>
        <div class="card-item uppercase-text">
            <span class="role-badge ${statusClass} status-clickable" onclick="toggleUserStatus(${userData.id}, '${userData.status}', false)" title="Click to toggle status" style="cursor: pointer;">
                ${userData.status.toUpperCase()}
            </span>
        </div>
        <div class="card-item">${lastLogin}</div>
        <div class="card-item uppercase-text">${(userData.created_by || '-').toUpperCase()}</div>
        <div class="card-item">
            <button class="btn btn-edit edit-btn" onclick="editUser(${userData.id}, false)" aria-label="Edit">
                <img src="images/edit.svg" alt="Edit">
            </button>
            ${(String(userData.status || '').toLowerCase() === 'active') ? '' : `<input type="checkbox" class="user-checkbox" value="${userData.id}" data-is-owner-shadow="0" data-role="${String(userData.role || '').toLowerCase()}" onchange="updateDeleteButton()">`}
        </div>
    `;

    userCardsContainer.appendChild(newCard);
    extractUsersData();
    applySorting();
    initializePagination();
    // 更新斑马纹类名
    updateZebraStriping();
}

// 更新现有用户卡片
function updateUserCard(userData) {
    const card = document.querySelector(`.user-card[data-id="${userData.id}"]`);
    if (!card) return;

    // 更新 data 属性
    card.setAttribute('data-login-id', userData.login_id || '');
    card.setAttribute('data-name', userData.name || '');
    card.setAttribute('data-email', userData.email || '');
    card.setAttribute('data-role', userData.role || '');
    card.setAttribute('data-status', userData.status || '');
    card.setAttribute('data-last-login', userData.last_login || '');
    card.setAttribute('data-created-by', userData.created_by || '');

    const items = card.querySelectorAll('.card-item');
    const roleClass = userData.role.replace(/\s+/g, '-').toLowerCase();
    const statusClass = userData.status === 'active' ? 'status-active' : 'status-inactive';
    const isOwnerShadow = card.getAttribute('data-is-owner-shadow') === '1';
    const lastLogin = userData.last_login ? new Date(userData.last_login).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ') : '-';

    // 更新各列数据（保持序号不变）
    items[1].textContent = userData.login_id;
    items[2].textContent = userData.name;
    items[3].textContent = userData.email || '-';
    items[4].innerHTML = `<span class="role-badge role-${roleClass}">${userData.role.toUpperCase()}</span>`;
    items[5].innerHTML = `<span class="role-badge ${statusClass} status-clickable" onclick="toggleUserStatus(${userData.id}, '${userData.status}', ${isOwnerShadow})" title="Click to toggle status" style="cursor: pointer;">${userData.status.toUpperCase()}</span>`;
    items[6].textContent = lastLogin;
    items[7].textContent = (userData.created_by || '-').toUpperCase();

    // 重新应用排序
    extractUsersData();
    applySorting();
    initializePagination();
    // 更新斑马纹类名
    updateZebraStriping();
    syncUserDeleteCheckbox(card);
}

function getUserDeletePermissionFromCard(card) {
    const targetUserId = parseInt(card.getAttribute('data-id') || '0', 10);
    const targetRole = (card.getAttribute('data-role') || '').toLowerCase();
    const isOwnerShadow = card.getAttribute('data-is-owner-shadow') === '1';
    const currentLevel = roleHierarchy[currentUserRole] ?? 999;
    const targetLevel = roleHierarchy[targetRole] ?? 999;
    const isSelf = currentUserId && targetUserId === parseInt(currentUserId, 10);
    const isSameLevel = currentLevel === targetLevel && !isSelf;
    const isHigherLevel = targetLevel < currentLevel; // 数字越小，层级越高
    const lowPrivilegeRoles = ['manager', 'supervisor', 'accountant', 'audit', 'customer service'];
    const isLowPrivilegeUser = lowPrivilegeRoles.includes(currentUserRole);
    const isAdminUser = targetRole === 'admin';
    const isOwnerUser = targetRole === 'owner';

    if (isSelf) {
        return { canDelete: false, reason: 'You cannot delete your own account' };
    }
    if (isOwnerShadow) {
        if (currentUserRole === 'owner') return { canDelete: true };
        return { canDelete: false, reason: 'No permission to delete' };
    }
    if (isLowPrivilegeUser && (isAdminUser || isOwnerUser)) {
        return { canDelete: false, reason: 'No permission to delete' };
    }
    if (isSameLevel) {
        return { canDelete: false, reason: 'You cannot delete accounts with the same role level' };
    }
    if (isHigherLevel) {
        return { canDelete: false, reason: 'You cannot delete accounts with higher role level' };
    }
    return { canDelete: true };
}

function syncUserDeleteCheckbox(card) {
    if (!card) return;

    const status = (card.getAttribute('data-status') || '').toLowerCase();
    const items = card.querySelectorAll('.card-item');
    const actionCell = items[8];
    if (!actionCell) return;

    const existingCheckbox = actionCell.querySelector('input.user-checkbox');

    // ACTIVE：不显示 delete checkbox
    if (status === 'active') {
        if (existingCheckbox) existingCheckbox.remove();
        return;
    }

    // INACTIVE：显示 delete checkbox（根据权限决定是否 disabled）
    if (existingCheckbox) return;

    const permission = getUserDeletePermissionFromCard(card);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'user-checkbox';
    checkbox.value = card.getAttribute('data-id') || '';
    checkbox.setAttribute('data-is-owner-shadow', card.getAttribute('data-is-owner-shadow') || '0');
    checkbox.setAttribute('data-role', (card.getAttribute('data-role') || '').toLowerCase());
    checkbox.onchange = updateDeleteButton;

    if (!permission.canDelete) {
        checkbox.disabled = true;
        checkbox.style.opacity = '0.3';
        checkbox.style.cursor = 'not-allowed';
        if (permission.reason) checkbox.title = permission.reason;
    }

    actionCell.appendChild(checkbox);
}

// 切换用户状态
async function toggleUserStatus(userId, currentStatus, isOwnerShadow = false) {
    // 检查权限限制
    const lowPrivilegeRoles = ['manager', 'supervisor', 'accountant', 'audit', 'customer service'];
    const isLowPrivilegeUser = lowPrivilegeRoles.includes(currentUserRole);

    if (!isOwnerShadow) {
        const card = document.querySelector(`.user-card[data-id="${userId}"]`);
        if (card) {
            const userRole = card.getAttribute('data-role')?.toLowerCase() || '';

            // 检查admin不能切换其他admin的状态（但可以切换自己的状态）
            if (currentUserRole === 'admin' && userRole === 'admin') {
                const targetUserId = parseInt(userId);
                if (currentUserId !== targetUserId) {
                    showAlert('Admin accounts cannot toggle status of other admin accounts', 'danger');
                    return;
                }
            }

            // 检查低权限角色不能切换admin和owner的状态
            if (isLowPrivilegeUser && (userRole === 'admin' || userRole === 'owner')) {
                showAlert('You do not have permission to toggle status of admin or owner accounts', 'danger');
                return;
            }
        }
    }

    try {
        const formData = new FormData();
        formData.append('id', userId);

        const response = await fetch(buildApiUrl('api/users/toggle_status_api.php'), {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        const newStatus = (result.data && result.data.newStatus) || result.newStatus;

        if (result.success && newStatus) {
            // 更新本地数据
            const card = document.querySelector(`.user-card[data-id="${userId}"]`);
            if (card) {
                // 更新 data-status 属性
                card.setAttribute('data-status', newStatus);

                // 立即更新状态 badge 的显示
                const items = card.querySelectorAll('.card-item');
                if (items.length > 5) {
                    const statusClass = newStatus === 'active' ? 'status-active' : 'status-inactive';
                    items[5].innerHTML = `<span class="role-badge ${statusClass} status-clickable" onclick="toggleUserStatus(${userId}, '${newStatus}', ${isOwnerShadow})" title="Click to toggle status" style="cursor: pointer;">${(newStatus || '').toUpperCase()}</span>`;
                }

                // 更新 delete checkbox 显示：ACTIVE 不显示，INACTIVE 才显示
                syncUserDeleteCheckbox(card);
            }

            // 更新用户数据数组
            const userData = usersData.find(u => u.id == userId);
            if (userData) {
                userData.status = newStatus;
            }

            // 重新应用过滤和分页
            filterUsers(); // 重新应用过滤（这会根据新的状态显示/隐藏行）
            updateDeleteButton(); // 更新删除按钮状态

            const statusText = newStatus === 'active' ? 'activated' : 'deactivated';
            showAlert(`User status changed to ${statusText}`, 'success');
        } else {
            showAlert(result.error || '状态切换失败', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('状态切换失败', 'danger');
    }
}

// 过滤用户（结合搜索和 showInactive）
function filterUsers() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const tableRows = document.querySelectorAll('#userTableBody .user-card');

    tableRows.forEach(row => {
        const items = row.querySelectorAll('.card-item');
        const loginId = items[1].textContent.toLowerCase();
        const name = items[2].textContent.toLowerCase();
        const email = items[3].textContent.toLowerCase();

        // 从 data-status 属性获取用户状态（更可靠）
        const status = row.getAttribute('data-status') || '';
        const isInactive = status.toLowerCase() === 'inactive';

        // 搜索匹配
        const matchesSearch = searchTerm === '' ||
            loginId.includes(searchTerm) ||
            name.includes(searchTerm) ||
            email.includes(searchTerm);

        // Show Inactive 过滤：
        // - Show All：不按状态过滤（active + inactive 均可）
        // - 未勾选 Show Inactive：只显示 active
        // - 勾选 Show Inactive：只显示 inactive
        const matchesInactiveFilter = showAll ? true : (showInactive ? isInactive : !isInactive);

        // 只有当两个条件都满足时才显示
        if (matchesSearch && matchesInactiveFilter) {
            row.classList.remove('table-row-hidden');
        } else {
            row.classList.add('table-row-hidden');
        }
    });

    // 重新计算分页（不需要重新排序，只更新分页）
    initializePagination();
    // 更新斑马纹类名（确保过滤后的顺序正确）
    updateZebraStriping();
}

// 搜索功能
function setupSearch() {
    const searchInput = document.getElementById('searchInput');

    if (!searchInput) return;

    // 强制大写和只允许字母数字
    searchInput.addEventListener('input', function (e) {
        const cursorPosition = this.selectionStart;
        // 只保留大写字母和数字
        const filteredValue = this.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        this.value = filteredValue;
        try {
            this.setSelectionRange(cursorPosition, cursorPosition);
        } catch (e) {
            // 忽略不支持的 input 类型
        }
        // 触发过滤
        filterUsers();
    });

    searchInput.addEventListener('paste', function (e) {
        setTimeout(() => {
            const cursorPosition = this.selectionStart;
            const filteredValue = this.value.replace(/[^A-Z0-9]/gi, '').toUpperCase();
            this.value = filteredValue;
            try {
                this.setSelectionRange(cursorPosition, cursorPosition);
            } catch (e) {
                // 忽略不支持的 input 类型
            }
            // 触发过滤
            filterUsers();
        }, 0);
    });

    // 添加 showInactive 复选框的事件监听
    const showInactiveCheckbox = document.getElementById('showInactive');
    if (showInactiveCheckbox) {
        showInactiveCheckbox.addEventListener('change', function () {
            showInactive = this.checked;
            if (showInactive && showAll) {
                showAll = false;
                const sa = document.getElementById('showAll');
                if (sa) sa.checked = false;
                syncUserListShowAllUrl();
                updateUserListScrollMode();
            }
            filterUsers();
        });
    }

    const showAllCheckbox = document.getElementById('showAll');
    if (showAllCheckbox) {
        showAllCheckbox.addEventListener('change', function () {
            showAll = this.checked;
            if (showAll) {
                showInactive = false;
                if (showInactiveCheckbox) showInactiveCheckbox.checked = false;
            }
            currentPage = 1;
            syncUserListShowAllUrl();
            updateUserListScrollMode();
            filterUsers();
        });
    }
}

// 更新行号（现在由分页系统处理）
function updateRowNumbers() {
    // 这个函数现在由 showCurrentPage() 处理
    initializePagination();
}

// 切换 Company（刷新页面以加载新 company 的用户列表）
async function switchUserListCompany(companyId, companyCode) {
    // 先更新 session
    try {
        const response = await fetch(buildApiUrl(`api/session/update_company_session_api.php?company_id=${companyId}`));
        const result = await response.json();
        if (!result.success) {
            const blocked = (typeof window.handleCompanySwitchDenied === 'function')
                ? await window.handleCompanySwitchDenied(result)
                : false;
            if (blocked) return;
            console.error('更新 session 失败:', result.error);
            // 非到期/未设置类错误：保持原行为
        }
    } catch (error) {
        console.error('更新 session 时出错:', error);
        // 即使 API 失败，也继续刷新页面（PHP 端会处理）
    }

    // 使用 URL 参数传递 company_id，然后刷新页面
    const url = new URL(window.location.href);
    url.searchParams.set('company_id', companyId);
    window.location.href = url.toString();
}

// 页面加载完成后初始化搜索功能
document.addEventListener('DOMContentLoaded', function () {
    extractUsersData();
    applySorting(); // 应用默认排序
    updateSortIndicators(); // 初始化排序指示器
    if (showAll) {
        showInactive = false;
        const si = document.getElementById('showInactive');
        if (si) si.checked = false;
    }
    updateUserListScrollMode();
    setupSearch();
    filterUsers(); // 初始化过滤（默认隐藏 inactive 用户）
    updateDeleteButton(); // 初始化删除按钮状态
    // 初始化斑马纹类名
    updateZebraStriping();

    // 为二级密码输入框添加限制（只允许6位数字）
    const secondaryPasswordInput = document.getElementById('secondary_password');
    if (secondaryPasswordInput) {
        secondaryPasswordInput.addEventListener('input', function () {
            // 只保留数字
            this.value = this.value.replace(/[^0-9]/g, '');
            // 限制为6位
            if (this.value.length > 6) {
                this.value = this.value.slice(0, 6);
            }
        });

        secondaryPasswordInput.addEventListener('paste', function (e) {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text');
            const numericOnly = pastedText.replace(/[^0-9]/g, '').slice(0, 6);
            this.value = numericOnly;
        });
    }

    // 为 role 下拉框添加 change 事件监听器
    const roleSelect = document.getElementById('role');
    if (roleSelect) {
        roleSelect.addEventListener('change', function () {
            const selectedRole = this.value;
            // 显示/隐藏 Read Only toggle（只在 Partnership 角色时显示）
            updateReadOnlyToggleVisibility(selectedRole);
            if (selectedRole) {
                // 用户主动改 Role：始终按角色模板套用；编辑模式下再按当前登录者限制可勾选项
                setDefaultPermissionsByRole(selectedRole, { force: true });
                if (isEditMode) {
                    restrictPermissionsByCurrentUserRole();
                }
            } else {
                // 选择"Select Role"时，无论模式都清空权限
                clearAllPermissions();
                // 如果是创建模式，重新应用权限限制
                if (!isEditMode) {
                    restrictPermissionsByCurrentUserRole();
                }
            }
        });
    }
});

// Close modal when clicking outside
window.onclick = function () { }

document.getElementById('userForm').addEventListener('submit', function (e) {
    e.preventDefault();

    // 前端验证：创建模式时必须填写密码
    if (!isEditMode) {
        const passwordInput = document.getElementById('password');
        if (!passwordInput || !passwordInput.value || passwordInput.value.trim() === '') {
            showAlert('Password is required when creating a new user', 'danger');
            return;
        }
    }

    const formData = new FormData(this);
    const data = Object.fromEntries(formData.entries());
    data.action = isEditMode ? 'update' : 'create';

    // 检查是否是owner影子
    const userId = document.getElementById('userId').value;
    const card = document.querySelector(`.user-card[data-id="${userId}"]`);
    const isOwnerShadow = card && card.getAttribute('data-is-owner-shadow') === '1';

    // 如果 role 字段被禁用，从原始数据中获取 role 值
    const roleSelect = document.getElementById('role');
    if (roleSelect && roleSelect.disabled) {
        if (isEditMode && card) {
            // 编辑模式：从卡片中获取原始 role
            const editingUserRole = card.getAttribute('data-role')?.toLowerCase() || '';
            if (editingUserRole) {
                data.role = editingUserRole;
            }
        } else if (isOwnerShadow) {
            // Owner 影子：role 固定为 owner
            data.role = 'owner';
        }
    }

    // 验证角色权限（创建模式仍然需要权限检查）
    if (!isOwnerShadow && data.role && !isEditMode) {
        // 创建模式：检查是否允许创建选择的角色
        const availableRoles = getAvailableRolesForCreation();
        const selectedRole = data.role.toLowerCase();

        if (!availableRoles.find(r => r.value === selectedRole)) {
            showAlert('You do not have permission to create accounts with role ' + data.role, 'danger');
            return;
        }
    }
    // 编辑模式：所有角色都可以编辑其他用户（但只能编辑 Account 和 Process Permissions）

    // 添加 read_only 字段（只针对 partnership 角色）
    const roleForReadOnly = data.role || (card ? card.getAttribute('data-role') : '');
    if (currentUserRole === 'owner' && roleForReadOnly && roleForReadOnly.toLowerCase() === 'partnership') {
        const readOnlyToggle = document.getElementById('readOnlyToggle');
        data.read_only = (readOnlyToggle && readOnlyToggle.checked) ? 1 : 0;
    }

    // 只有非owner影子才添加权限数据
    if (!isOwnerShadow) {
        // 检查是否是编辑自己
        const editingUserId = parseInt(document.getElementById('userId').value);
        const isEditingSelf = currentUserId && editingUserId && currentUserId === editingUserId;

        // 权限数据处理
        if (!isEditMode) {
            // 创建模式：在提交前更新选择，确保提交了用户分配的账号和进程
            updateAccountSelection();
            updateProcessSelection();
            
            // 创建模式：合并默认权限和用户手动修改的权限
            data.permissions = getFinalPermissionsForCreation(data.role);
            data.account_permissions = selectedAccounts;
            data.process_permissions = selectedProcesses;
        } else {
            // 编辑模式：在提交前更新选择，确保数据是最新的
            updateAccountSelection();
            updateProcessSelection();

            // 检查层级关系
            const card = document.querySelector(`.user-card[data-id="${data.id}"]`);
            const editingUserRole = card ? card.getAttribute('data-role')?.toLowerCase() : '';
            const currentLevel = roleHierarchy[currentUserRole] ?? 999;
            const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
            const isUpperLevel = !isEditingSelf && currentLevel < editingUserLevel; // 上级编辑下级
            const isSameLevel = !isEditingSelf && currentLevel === editingUserLevel; // 同级编辑同级
            const isLowerLevel = !isEditingSelf && currentLevel > editingUserLevel; // 下级编辑上级

            if (isEditingSelf) {
                // 编辑自己时：不发送 Sidebar permissions（系统级权限，用户不能自己修改）
                // 但允许发送 Account 和 Process 权限（可见性权限，用户可以自己修改）
                data.account_permissions = selectedAccounts;
                data.process_permissions = selectedProcesses;
            } else if (isUpperLevel) {
                // 上级编辑下级：发送所有权限和字段
                data.permissions = getSelectedPermissions();
                data.account_permissions = selectedAccounts;
                data.process_permissions = selectedProcesses;
            } else if (isSameLevel || isLowerLevel) {
                // 同级编辑同级 或 下级编辑上级：只发送 Account 和 Process 权限
                data.account_permissions = selectedAccounts;
                data.process_permissions = selectedProcesses;
                // 不发送 permissions（Sidebar permissions）
            }
        }
    }

    // 添加选中的 company IDs（创建和编辑模式都需要）
    if (isEditMode) {
        // 编辑模式：检查是否是编辑自己
        const editingUserId = parseInt(document.getElementById('userId').value);
        const isEditingSelf = currentUserId && editingUserId && currentUserId === editingUserId;

        // 检查层级关系
        const card = document.querySelector(`.user-card[data-id="${data.id}"]`);
        const editingUserRole = card ? card.getAttribute('data-role')?.toLowerCase() : '';
        const currentLevel = roleHierarchy[currentUserRole] ?? 999;
        const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
        const isUpperLevel = !isEditingSelf && currentLevel < editingUserLevel; // 上级编辑下级
        const isSameLevel = !isEditingSelf && currentLevel === editingUserLevel; // 同级编辑同级
        const isLowerLevel = !isEditingSelf && currentLevel > editingUserLevel; // 下级编辑上级

        // 只有 admin 和 owner 才能修改公司关联
        if (currentUserRole === 'admin' || currentUserRole === 'owner') {
            // 如果编辑的是自己，不允许修改公司关联
            if (isEditingSelf) {
                // 不发送 company_ids，保持原有关联不变
            } else if (isUpperLevel) {
                // 上级编辑下级：可以修改公司关联
                if (selectedCompanyIds.length > 0) {
                    data.company_ids = selectedCompanyIds;
                }
            } else if (isSameLevel || isLowerLevel) {
                // 同级编辑同级 或 下级编辑上级：不发送 company_ids（字段已锁定）
            }
        }
    } else {
        // 创建模式：只有 admin 和 owner 才需要选择 company
        if (currentUserRole === 'admin' || currentUserRole === 'owner') {
            // 必须选择至少一个 company
            if (selectedCompanyIds.length === 0) {
                showAlert('Please select at least one company', 'danger');
                return;
            }
            data.company_ids = selectedCompanyIds;
        }
    }

    // 编辑其他用户时：根据层级关系决定是否发送 User Information 字段的修改
    if (isEditMode && !isOwnerShadow) {
        const editingUserId = parseInt(document.getElementById('userId').value);
        const isEditingSelf = currentUserId && editingUserId && currentUserId === editingUserId;

        if (!isEditingSelf) {
            // 检查层级关系
            const card = document.querySelector(`.user-card[data-id="${data.id}"]`);
            const editingUserRole = card ? card.getAttribute('data-role')?.toLowerCase() : '';
            const currentLevel = roleHierarchy[currentUserRole] ?? 999;
            const editingUserLevel = roleHierarchy[editingUserRole] ?? 999;
            const isUpperLevel = currentLevel < editingUserLevel; // 上级编辑下级
            const isSameLevel = currentLevel === editingUserLevel; // 同级编辑同级
            const isLowerLevel = currentLevel > editingUserLevel; // 下级编辑上级

            if (isSameLevel || isLowerLevel) {
                // 同级编辑同级 或 下级编辑上级：不发送 User Information 字段的修改
                // 从原始数据中获取这些值，确保不会修改
                if (card) {
                    const items = card.querySelectorAll('.card-item');
                    // 使用原始值，不发送修改
                    data.name = items[2].textContent.trim();
                    data.email = items[3].textContent.trim();
                    const editingUserRole = items[4].querySelector('.role-badge').textContent.trim().toLowerCase();
                    data.role = editingUserRole;
                    // 不发送 password
                    delete data.password;
                }
            }
            // 如果是上级编辑下级，User Information 字段可以正常提交（已在表单中）
        }
    }

    // Remove password if empty during edit
    if (isEditMode && !data.password) {
        delete data.password;
    }

    // 处理二级密码：如果为空或未填写，则不提交
    if (!data.secondary_password || data.secondary_password.trim() === '') {
        delete data.secondary_password;
    } else {
        // 验证二级密码格式：必须是6位数字
        if (!/^\d{6}$/.test(data.secondary_password)) {
            showAlert('Secondary password must be exactly 6 digits', 'danger');
            return;
        }
    }

    // 如果是owner影子，移除role字段（因为role不能改变）
    if (isOwnerShadow) {
        delete data.role;
    }

    // 添加调试日志
    console.log('Submitting user data:', data);

    fetch(buildApiUrl('api/users/userlist_api.php'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
        .then(response => {
            // 检查 HTTP 响应状态
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('API Response:', data);
            if (data.success) {
                // 须在 closeModal() 前保存：closeModal 会把 isEditMode 置为 false，否则会误走 addUserCard 出现重复行
                const wasEditMode = isEditMode
                const apiMessage = data.message || (wasEditMode ? 'User updated successfully!' : 'User created successfully!');
                showAlert(apiMessage, 'success');
                closeModal();

                if (wasEditMode) {
                    const updatedUser = data.data || {};
                    const willLoseAccess = !!updatedUser.will_lose_access;

                    if (willLoseAccess) {
                        // 如果移除了当前公司的关联，用户将不再属于当前公司
                        // 直接从当前列表中移除该用户卡片，并重新排序/分页（与 account-list 行为一致）
                        const card = document.querySelector(`.user-card[data-id="${updatedUser.id}"]`);
                        if (card && card.parentNode) {
                            card.parentNode.removeChild(card);
                        }
                        extractUsersData();
                        applySorting();
                        initializePagination();
                    } else {
                        // 正常更新当前公司下的用户卡片
                        updateUserCard(updatedUser);
                    }
                } else {
                    addUserCard(data.data);
                }
            } else {
                // 显示详细的错误信息
                const errorMessage = data.message || 'Operation failed';
                console.error('API Error:', errorMessage);
                showAlert(errorMessage, 'danger');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlert('An error occurred while saving user: ' + error.message, 'danger');
        });
});

// Account and Process selection functions
function updateAccountSelection() {
    const selectedCheckboxes = document.querySelectorAll('#accountGrid input[type="checkbox"]:checked');
    selectedAccounts = [];

    selectedCheckboxes.forEach(checkbox => {
        selectedAccounts.push({
            id: parseInt(checkbox.value),
            account_id: checkbox.getAttribute('data-account-id')
        });
    });
}

function selectAllAccounts() {
    const visibleCheckboxes = document.querySelectorAll('#accountGrid .account-item-compact:not([style*="none"]) input[type="checkbox"]');

    visibleCheckboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            checkbox.checked = true;
        }
    });

    updateAccountSelection();
}

function clearAllAccounts() {
    const allCheckboxes = document.querySelectorAll('#accountGrid input[type="checkbox"]');

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    selectedAccounts = [];
}

function loadAccountPermissions(accountPermissions) {
    clearAllAccounts();

    // null 或 undefined 表示未设置权限，默认全选所有可见的复选框
    // [] 表示已设置但为空，不选任何复选框
    // 有值表示只选这些复选框
    if (accountPermissions === null || accountPermissions === undefined) {
        // null 表示未设置，勾选所有可见的复选框（表示可以看到所有）
        const allCheckboxes = document.querySelectorAll('#accountGrid input[type="checkbox"]:not(:disabled)');
        allCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        updateAccountSelection();
    } else if (Array.isArray(accountPermissions) && accountPermissions.length > 0) {
        // 有值，只勾选这些账户
        accountPermissions.forEach(perm => {
            // 兼容两种结构：
            // 1) { id: 123, account_id: 'JB-XXXX' }
            // 2) 123 或 '123'
            let rawId = null;
            if (perm && typeof perm === 'object' && 'id' in perm) {
                rawId = perm.id;
            } else {
                rawId = perm;
            }
            const accountId = parseInt(rawId);
            if (!isNaN(accountId)) {
                const checkbox = document.querySelector(`#account_${accountId}`);
                if (checkbox) {
                    checkbox.checked = true;
                } else {
                    console.warn(`Account checkbox not found for ID: ${accountId}`);
                }
            } else {
                console.warn(`Invalid account permission ID:`, perm);
            }
        });
        updateAccountSelection();
    }
    // 如果是空数组 []，不勾选任何复选框（已经在 clearAllAccounts 中处理了）
}

// Process selection functions
function updateProcessSelection() {
    const selectedCheckboxes = document.querySelectorAll('#processGrid input[type="checkbox"]:checked');
    selectedProcesses = [];

    selectedCheckboxes.forEach(checkbox => {
        selectedProcesses.push({
            id: parseInt(checkbox.value),
            process_id: checkbox.getAttribute('data-process-name'),
            process_description: checkbox.getAttribute('data-process-description')
        });
    });
}

function selectAllProcesses() {
    const visibleCheckboxes = document.querySelectorAll('#processGrid .account-item-compact:not([style*="none"]) input[type="checkbox"]');

    visibleCheckboxes.forEach(checkbox => {
        if (!checkbox.checked) {
            checkbox.checked = true;
        }
    });

    updateProcessSelection();
}

function clearAllProcesses() {
    const allCheckboxes = document.querySelectorAll('#processGrid input[type="checkbox"]');

    allCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    selectedProcesses = [];
}

function loadProcessPermissions(processPermissions) {
    clearAllProcesses();

    // null 或 undefined 表示未设置权限，默认全选所有可见的复选框
    // [] 表示已设置但为空，不选任何复选框
    // 有值表示只选这些复选框
    if (processPermissions === null || processPermissions === undefined) {
        // null 表示未设置，勾选所有可见的复选框（表示可以看到所有）
        const allCheckboxes = document.querySelectorAll('#processGrid input[type="checkbox"]:not(:disabled)');
        allCheckboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        updateProcessSelection();
    } else if (Array.isArray(processPermissions) && processPermissions.length > 0) {
        // 有值，只勾选这些流程
        processPermissions.forEach(perm => {
            // 兼容两种结构：
            // 1) { id: 123, process_id: 'XXX', ... }
            // 2) 123 或 '123'
            let rawId = null;
            if (perm && typeof perm === 'object' && 'id' in perm) {
                rawId = perm.id;
            } else {
                rawId = perm;
            }
            const processId = parseInt(rawId);
            if (!isNaN(processId)) {
                const checkbox = document.querySelector(`#process_${processId}`);
                if (checkbox) {
                    checkbox.checked = true;
                } else {
                    console.warn(`Process checkbox not found for ID: ${processId}`);
                }
            } else {
                console.warn(`Invalid process permission ID:`, perm);
            }
        });
        updateProcessSelection();
    }
    // 如果是空数组 []，不勾选任何复选框（已经在 clearAllProcesses 中处理了）
}

// Hover color now only shows while hovered and resets on mouse leave
