// Notification functions
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    
    // 检查现有通知，最多保留2个
    const existingNotifications = container.querySelectorAll('.maintenance-notification');
    if (existingNotifications.length >= 2) {
        const oldestNotification = existingNotifications[0];
        oldestNotification.classList.remove('show');
        setTimeout(() => {
            if (oldestNotification.parentNode) {
                oldestNotification.remove();
            }
        }, 300);
    }
    
    const notification = document.createElement('div');
    notification.className = `maintenance-notification maintenance-notification-${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // 2秒后淡出
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 2000);
}

function initMaintenanceDropdownHover() {
    const selector = document.querySelector('.restaurant-selector');
    const dropdown = document.getElementById('maintenance_mode_dropdown');
    if (!selector || !dropdown) return;

    let hideTimeout = null;

    const showDropdown = () => {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        dropdown.classList.add('show');
    };

    const scheduleHideDropdown = () => {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
        }
        hideTimeout = setTimeout(() => {
            dropdown.classList.remove('show');
            hideTimeout = null;
        }, 100);
    };

    selector.addEventListener('mouseenter', showDropdown);
    selector.addEventListener('mouseleave', scheduleHideDropdown);
    selector.addEventListener('focusin', showDropdown);
    selector.addEventListener('focusout', (event) => {
        if (!selector.contains(event.relatedTarget)) {
            scheduleHideDropdown();
        }
    });
}

function selectMaintenanceMode(value, text) {
    // 更新按钮文本
    document.getElementById('maintenance_mode_text').textContent = text;
    
    // 更新活动状态
    const items = document.querySelectorAll('.selector-dropdown .dropdown-item');
    items.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-value') === value) {
            item.classList.add('active');
        }
    });
    
    // 关闭下拉菜单
    document.getElementById('maintenance_mode_dropdown').classList.remove('show');
    
    // 跳转到目标页面
    if (value) {
        window.location.href = value;
    }
}

// 点击外部关闭下拉菜单
document.addEventListener('click', function(event) {
    const selector = document.querySelector('.restaurant-selector');
    const dropdown = document.getElementById('maintenance_mode_dropdown');
    if (selector && !selector.contains(event.target) && dropdown) {
        dropdown.classList.remove('show');
    }
});

// Load Process list
function loadProcesses() {
    const params = [];
    if (currentCompanyId) {
        params.push(`company_id=${encodeURIComponent(currentCompanyId)}`);
    }
    const url = params.length ? `/api/processes/processlist_api.php?${params.join('&')}` : '/api/processes/processlist_api.php';
    
    return fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const processButton = document.getElementById('filter_process');
                const dropdown = document.getElementById('filter_process_dropdown');
                const optionsContainer = dropdown?.querySelector('.custom-select-options');
                
                if (!processButton || !dropdown || !optionsContainer) return;
                
                // Save previously selected value
                const previousValue = processButton.getAttribute('data-value') || '';
                
                // Clear options
                optionsContainer.innerHTML = '';
                
                // Sort processes
                const sortedProcesses = [...data.data].sort((a, b) => {
                    const nameA = (a.process_name || '').toUpperCase();
                    const nameB = (b.process_name || '').toUpperCase();
                    if (nameA < nameB) return -1;
                    if (nameA > nameB) return 1;
                    return 0;
                });
                
                // Add "All Process" option
                const allOption = document.createElement('div');
                allOption.className = 'custom-select-option';
                allOption.textContent = '--Select All--';
                allOption.setAttribute('data-value', '');
                if (!previousValue) {
                    allOption.classList.add('selected');
                    processButton.textContent = '--Select All--';
                }
                optionsContainer.appendChild(allOption);
                
                // Add all process options
                sortedProcesses.forEach(process => {
                    const option = document.createElement('div');
                    option.className = 'custom-select-option';
                    const displayText = process.description 
                        ? `${process.process_name} (${process.description})`
                        : process.process_name;
                    option.textContent = displayText;
                    option.setAttribute('data-value', process.process_name);
                    
                    // If current value matches, mark as selected
                    if (previousValue && process.process_name === previousValue) {
                        option.classList.add('selected');
                        processButton.textContent = displayText;
                        processButton.setAttribute('data-value', process.process_name);
                    }
                    
                    optionsContainer.appendChild(option);
                });
                
                // If no value selected, show placeholder
                if (!previousValue) {
                    processButton.textContent = processButton.getAttribute('data-placeholder') || '--Select All--';
                    processButton.removeAttribute('data-value');
                }
                
                console.log('✅ Process列表加载成功');
            } else {
                throw new Error(data.error || '加载Process列表失败');
            }
        })
        .catch(error => {
            console.error('❌ 加载Process列表失败:', error);
            showNotification(error.message || 'Failed to load process list', 'error');
        });
}

// Initialize custom select for process
function initProcessSelect() {
    const processButton = document.getElementById('filter_process');
    const dropdown = document.getElementById('filter_process_dropdown');
    const searchInput = dropdown?.querySelector('.custom-select-search input');
    const optionsContainer = dropdown?.querySelector('.custom-select-options');
    
    if (!processButton || !dropdown || !searchInput || !optionsContainer) return;
    
    let isOpen = false;
    let filteredOptions = [];
    
    // Update options list
    function updateOptions(filterText = '') {
        const filterLower = filterText.toLowerCase().trim();
        const allOptions = Array.from(optionsContainer.querySelectorAll('.custom-select-option'));
        
        filteredOptions = allOptions.filter(option => {
            const text = option.textContent.toLowerCase();
            const matches = !filterLower || text.includes(filterLower);
            option.style.display = matches ? '' : 'none';
            return matches;
        });
        
        // Clear all selected states
        allOptions.forEach(opt => opt.classList.remove('selected'));
        
        // If there are visible options, select the first one
        const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
        if (visibleOptions.length > 0) {
            visibleOptions[0].classList.add('selected');
        }
        
        // Show/hide "no results" message
        let noResults = dropdown.querySelector('.custom-select-no-results');
        if (filteredOptions.length === 0 && filterText) {
            if (!noResults) {
                noResults = document.createElement('div');
                noResults.className = 'custom-select-no-results';
                noResults.textContent = 'No results found';
                optionsContainer.appendChild(noResults);
            }
            noResults.style.display = 'block';
        } else if (noResults) {
            noResults.style.display = 'none';
        }
    }
    
    // Toggle dropdown
    function toggleDropdown() {
        isOpen = !isOpen;
        if (isOpen) {
            dropdown.classList.add('show');
            processButton.classList.add('open');
            searchInput.value = '';
            updateOptions('');
            setTimeout(() => searchInput.focus(), 10);
        } else {
            dropdown.classList.remove('show');
            processButton.classList.remove('open');
        }
    }
    
    // Select option
    function selectOption(option) {
        const value = option.getAttribute('data-value');
        const text = option.textContent;
        
        processButton.textContent = text;
        if (value) {
            processButton.setAttribute('data-value', value);
        } else {
            processButton.removeAttribute('data-value');
        }
        
        // Update selected state
        optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // Trigger change event
        processButton.dispatchEvent(new Event('change', { bubbles: true }));
        
        toggleDropdown();
    }
    
    // Button click event
    processButton.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDropdown();
    });
    
    // Search input event
    searchInput.addEventListener('input', function() {
        updateOptions(this.value);
    });
    
    // Option click event
    optionsContainer.addEventListener('click', function(e) {
        const option = e.target.closest('.custom-select-option');
        if (option && option.style.display !== 'none') {
            selectOption(option);
        }
    });
    
    // Click outside to close
    document.addEventListener('click', function(e) {
        if (!processButton.contains(e.target) && !dropdown.contains(e.target)) {
            if (isOpen) {
                toggleDropdown();
            }
        }
    });
    
    // Keyboard events
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            toggleDropdown();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
            // Select the currently highlighted option (with selected class), or the first one if none
            const selectedOption = visibleOptions.find(opt => opt.classList.contains('selected'));
            if (selectedOption) {
                selectOption(selectedOption);
            } else if (visibleOptions.length > 0) {
                selectOption(visibleOptions[0]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
            if (visibleOptions.length > 0) {
                const currentIndex = visibleOptions.findIndex(opt => opt.classList.contains('selected'));
                const nextIndex = (currentIndex + 1) % visibleOptions.length;
                visibleOptions.forEach(opt => opt.classList.remove('selected'));
                visibleOptions[nextIndex].classList.add('selected');
                visibleOptions[nextIndex].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
            if (visibleOptions.length > 0) {
                const currentIndex = visibleOptions.findIndex(opt => opt.classList.contains('selected'));
                const prevIndex = currentIndex <= 0 ? visibleOptions.length - 1 : currentIndex - 1;
                visibleOptions.forEach(opt => opt.classList.remove('selected'));
                visibleOptions[prevIndex].classList.add('selected');
                visibleOptions[prevIndex].scrollIntoView({ block: 'nearest' });
            }
        }
    });
}

let ownerCompanies = [];
// 从 PHP session 中获取 company_id（用于跨页面同步）
let currentCompanyId = typeof window.FORMULA_MAINTENANCE_COMPANY_ID !== 'undefined' ? window.FORMULA_MAINTENANCE_COMPANY_ID : null;
let currentCompanyCode = typeof window.currentCompanyCode !== 'undefined' ? (window.currentCompanyCode || '') : '';
let selectedPermission = null;
let hasSearched = false;
let searchInputDebounce = null;
const SEARCH_INPUT_DEBOUNCE_MS = 300;
const FORMULA_EMPTY_STATE_INITIAL = 'Use search or filters to view data.'
const FORMULA_EMPTY_STATE_NO_RESULTS =
    'No data found. Please adjust your search criteria and try again.'




function setFormulaEmptyStateMessage(text) {
    const emptyState = document.getElementById('emptyState')
    const emptyP = emptyState && emptyState.querySelector('p')
    if (emptyP) emptyP.textContent = text
}

function showFormulaInitialEmptyState() {
    hasSearched = false
    const tbody = document.getElementById('dataCaptureTableBody')
    if (tbody) tbody.innerHTML = ''
    const container = document.getElementById('dataCaptureTableContainer')
    if (container) container.style.display = 'none'
    
    setFormulaEmptyStateMessage(FORMULA_EMPTY_STATE_INITIAL)
    const emptyState = document.getElementById('emptyState')
    if (emptyState) emptyState.style.display = 'block'

    if (typeof updateClearFiltersButtonVisibility === 'function') {
        updateClearFiltersButtonVisibility();
    }
}



async function loadPermissionButtons() {
    const filterEl = document.getElementById('maintenance-permission-filter');
    const containerEl = document.getElementById('maintenance-permission-buttons');
    if (!filterEl || !containerEl) return;
    const code = currentCompanyCode || (typeof window.currentCompanyCode !== 'undefined' ? window.currentCompanyCode : '');
    if (!code) {
        filterEl.style.display = 'none';
        return;
    }
    try {
        const response = await fetch('/api/domain/domain_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_company_permissions', company_id: code })
        });
        const result = await response.json();
        let permissions = result.success && result.data && result.data.permissions
            ? result.data.permissions
            : ['Games', 'Loan', 'Rate', 'Money'];
        // Formula 页不显示 Bank category
        permissions = permissions.filter(p => p !== 'Bank');
        containerEl.innerHTML = '';
        if (permissions.length > 0) {
            filterEl.style.display = (permissions.length <= 1) ? 'none' : 'flex';
            permissions.forEach(permission => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'maintenance-company-btn';
                btn.textContent = permission;
                btn.dataset.permission = permission;
                btn.onclick = () => switchPermission(permission);
                containerEl.appendChild(btn);
            });
            const savedPermission = localStorage.getItem(`selectedPermission_${code}`);
            if (savedPermission && permissions.includes(savedPermission)) {
                switchPermission(savedPermission, true);
            } else if (permissions.length > 0) {
                switchPermission(permissions[0], true);
            }
        } else {
            filterEl.style.display = 'none';
        }
    } catch (err) {
        console.error('Error loading permissions:', err);
        filterEl.style.display = 'none';
    }
}

async function fetchCompanyPermissions(companyCode) {
    if (!companyCode) return [];
    try {
        const response = await fetch('/api/domain/domain_api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_company_permissions', company_id: companyCode })
        });
        const result = await response.json();
        if (result.success && result.data && Array.isArray(result.data.permissions)) {
            return result.data.permissions;
        }
    } catch (err) {
        console.error('Error fetching company permissions:', err);
    }
    return [];
}

function isBankOnlyCategoryCompany(permissions) {
    if (!Array.isArray(permissions) || permissions.length === 0) return false;
    const hasBank = permissions.includes('Bank');
    const hasGames = permissions.includes('Games') || permissions.includes('Gambling');
    return hasBank && !hasGames;
}

function switchPermission(permission, skipLoad) {
    selectedPermission = permission;
    if (currentCompanyCode) {
        localStorage.setItem(`selectedPermission_${currentCompanyCode}`, permission);
    }
    const buttons = document.querySelectorAll('#maintenance-permission-buttons .maintenance-company-btn');
    buttons.forEach(btn => {
        if (btn.dataset.permission === permission) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    if (typeof window.updateSidebarDataCaptureVisibility === 'function' && typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined') {
        window.updateSidebarDataCaptureVisibility(window.SIDEBAR_COMPANY_HAS_GAMBLING);
    }
    if (!skipLoad) {
        searchData();
    }
}

async function switchCompany(companyId, companyCode) {
    if (parseInt(currentCompanyId, 10) === parseInt(companyId, 10)) return;
    let hasGamblingFromSession = undefined;
    let hasBankFromSession = undefined;
    try {
        const response = await fetch(`/api/session/update_company_session_api.php?company_id=${companyId}`);
        const result = await response.json();
        if (!result.success) {
            console.error('更新 session 失败:', result.error);
        } else if (result.data) {
            if (result.data.has_gambling !== undefined) hasGamblingFromSession = result.data.has_gambling;
            if (result.data.has_bank !== undefined) hasBankFromSession = result.data.has_bank;
        }
    } catch (error) {
        console.error('更新 session 时出错:', error);
    }
    currentCompanyId = companyId;
    currentCompanyCode = companyCode || '';
    if (typeof window !== 'undefined') {
        window.SIDEBAR_COMPANY_CODE = currentCompanyCode;
    }
    const permissions = await fetchCompanyPermissions(currentCompanyCode);
    if (isBankOnlyCategoryCompany(permissions)) {
        if (typeof window.redirectAfterCompanySwitch === 'function') {
            window.redirectAfterCompanySwitch(companyId, { preferDashboard: false });
        } else {
            window.location.href = 'processlist.php';
        }
        return;
    }
    if (typeof window.updateSidebarDataCaptureVisibility === 'function') {
        const hg = hasGamblingFromSession !== undefined
            ? hasGamblingFromSession
            : (typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' ? window.SIDEBAR_COMPANY_HAS_GAMBLING : false);
        window.updateSidebarDataCaptureVisibility(hg, hasBankFromSession);
    }

    // Clear filters when switching company
    const searchFilter = document.getElementById('search_filter');
    if (searchFilter) searchFilter.value = '';
    const processButton = document.getElementById('filter_process');
    if (processButton) {
        processButton.removeAttribute('data-value');
        processButton.textContent = processButton.getAttribute('data-placeholder') || '--Select All--';
    }

    loadPermissionButtons();
    loadProcesses();
    
    // Instead of auto-searching, reset to initial state
    showFormulaInitialEmptyState();
}



// Search function
function searchData() {
    hasSearched = true;
    updateClearFiltersButtonVisibility();
    // 直接加载数据捕获列表
    loadDataCaptureList();
}

function clearFormulaFilters() {
    const searchFilter = document.getElementById('search_filter');
    if (searchFilter) searchFilter.value = '';
    
    const processButton = document.getElementById('filter_process');
    if (processButton) {
        processButton.removeAttribute('data-value');
        processButton.textContent = processButton.getAttribute('data-placeholder') || '--Select All--';
        
        const dropdown = document.getElementById('filter_process_dropdown');
        if (dropdown) {
            dropdown.querySelectorAll('.custom-select-option').forEach(opt => {
                opt.classList.remove('selected');
                if (!opt.getAttribute('data-value')) {
                    opt.classList.add('selected');
                }
            });
        }
    }
    
    showFormulaInitialEmptyState();
}

function updateClearFiltersButtonVisibility() {
    const btn = document.getElementById('clear_filters_btn');
    if (!btn) return;
    
    if (hasSearched) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
    } else {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
    }
}

function initAutoSearchFilters() {
    const processSelect = document.getElementById('filter_process');
    if (processSelect) {
        processSelect.addEventListener('change', () => {
            searchData();
        });
    }

    const searchFilter = document.getElementById('search_filter');
    if (searchFilter) {
        searchFilter.addEventListener('input', () => {
            if (searchInputDebounce) {
                clearTimeout(searchInputDebounce);
            }
            searchInputDebounce = setTimeout(() => {
                searchData();
            }, SEARCH_INPUT_DEBOUNCE_MS);
        });
    }
}

// ==================== 加载模板列表 ====================
function loadDataCaptureList() {
    const processButton = document.getElementById('filter_process');
    const process = processButton?.getAttribute('data-value') || '';
    // 使用展示文本进行精确匹配，避免包含相同字眼的其他 Process 也被列出
    const selectedProcessDisplay = (processButton?.textContent || '').trim();
    const selectedProcessUpper = selectedProcessDisplay && selectedProcessDisplay !== '--Select All--'
        ? selectedProcessDisplay.toUpperCase()
        : '';
    const searchFilter = document.getElementById('search_filter').value.trim();

    // 显示加载状态
    const tbody = document.getElementById('dataCaptureTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 20px;">Loading...</td></tr>';
    }
    document.getElementById('emptyState').style.display = 'none';
    const container = document.getElementById('dataCaptureTableContainer');
    if (container) {
        container.style.display = 'block';
    }

    let categoryToSend = selectedPermission;
    if (!categoryToSend) {
        const activeBtn = document.querySelector('#maintenance-permission-buttons .maintenance-company-btn.active');
        if (activeBtn && activeBtn.dataset.permission) {
            categoryToSend = activeBtn.dataset.permission;
        }
    }

    const params = [];
    if (currentCompanyId) {
        params.push(`company_id=${encodeURIComponent(currentCompanyId)}`);
    }
    if (categoryToSend) {
        params.push(`category=${encodeURIComponent(categoryToSend)}`);
    }
    if (process) {
        params.push(`process=${encodeURIComponent(process)}`);
    }
    if (searchFilter) {
        params.push(`search=${encodeURIComponent(searchFilter)}`);
    }

    let url = `/api/formula_maintenance/list_api.php`;
    if (params.length > 0) {
        url += '?' + params.join('&');
    } else {
        url += '?';
    }

    // 添加时间戳防止缓存
    url += (params.length > 0 ? '&' : '') + `_t=${Date.now()}`;
    
    console.log('🔍 加载模板列表:', url);
    
    fetch(url, {
        method: 'GET',
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const list = (data.data && data.data.list) ? data.data.list : (data.data || []);
                console.log('✅ 数据捕获列表加载成功:', list);
                
                // 如果有 Process 筛选，过滤数据
                // 注意：API 已经做了筛选，这里的过滤是双重保险
                let filteredData = list;
                if (selectedProcessUpper) {
                    filteredData = list.filter(row => {
                        if (!row.process) return false;
                        const rowProcessUpper = (row.process || '').trim().toUpperCase();
                        // 仅保留与选中展示文本完全一致的行
                        return rowProcessUpper === selectedProcessUpper;
                    });
                }
                
                // 如果有搜索筛选，过滤数据
                if (searchFilter) {
                    const searchUpper = searchFilter.toUpperCase();
                    filteredData = filteredData.filter(row => 
                        (row.formula && row.formula.toUpperCase().includes(searchUpper)) ||
                        (row.formula_edit && row.formula_edit.toUpperCase().includes(searchUpper)) ||
                        (row.description && row.description.toUpperCase().includes(searchUpper)) ||
                        (row.product && row.product.toUpperCase().includes(searchUpper)) ||
                        (row.account && row.account.toUpperCase().includes(searchUpper)) ||
                        (row.account_name && row.account_name.toUpperCase().includes(searchUpper)) ||
                        (row.process && row.process.toUpperCase().includes(searchUpper)) ||
                        (row.source && row.source.toUpperCase().includes(searchUpper)) ||
                        (row.source_ref && String(row.source_ref).toUpperCase().includes(searchUpper))
                    );
                }
                
                if (filteredData.length === 0) {
                    setFormulaEmptyStateMessage(FORMULA_EMPTY_STATE_NO_RESULTS);
                    document.getElementById('emptyState').style.display = 'block';
                    if (container) {
                        container.style.display = 'none';
                    }
                    
                    showNotification('No data found', 'info');
                } else {
                    renderDataCaptureTable(filteredData);
                    showNotification(`Found ${filteredData.length} record(s)`, 'success');
                }
            } else {
                console.error('❌ 加载数据捕获列表失败:', data.message || data.error);
                showNotification(data.message || data.error || 'Search failed', 'error');
                setFormulaEmptyStateMessage(FORMULA_EMPTY_STATE_NO_RESULTS);
                document.getElementById('emptyState').style.display = 'block';
                if (container) {
                    container.style.display = 'none';
                }
            }
        })
        .catch(error => {
            console.error('❌ 加载数据捕获列表失败:', error);
            showNotification('Search failed: ' + error.message, 'error');
            setFormulaEmptyStateMessage(FORMULA_EMPTY_STATE_NO_RESULTS);
            document.getElementById('emptyState').style.display = 'block';
            if (container) {
                container.style.display = 'none';
            }
        });
}

// ==================== 渲染数据捕获列表 ====================
function renderDataCaptureTable(data) {
    const container = document.getElementById('dataCaptureTableBody');
    const tableContainer = document.getElementById('dataCaptureTableContainer');
    
    if (!container || !tableContainer) {
        return;
    }
    
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        tableContainer.style.display = 'none';
        return;
    }
    
    // 显示列表区域
    tableContainer.style.display = 'block';
    
    // 渲染每一行
    data.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-row-id', row.id);
        
        // 保存原始数据
        const rowData = {
            id: row.id,
            account: row.account || '',
            account_id: row.account_id || null,
            source: row.source || '',
            source_ref: row.source_ref != null ? String(row.source_ref) : '',
            input_method: row.input_method || '',
            formula: row.formula || '',
            formula_edit: row.formula_edit || row.formula || '',
            description: row.description || ''
        };
        tr.setAttribute('data-row-data', JSON.stringify(rowData));
        
        // 创建所有列的内容
        
        // Input Method 选项
        const inputMethodOptions = [
            { value: '', text: 'Select Input Method (Optional)' },
            { value: 'positive_to_negative_negative_to_positive', text: 'Positive to negative, negative to positive' },
            { value: 'positive_to_negative_negative_to_zero', text: 'Positive to negative, negative to zero' },
            { value: 'negative_to_positive_positive_to_zero', text: 'Negative to positive, positive to zero' },
            { value: 'positive_unchanged_negative_to_zero', text: 'Positive unchanged, negative to zero' },
            { value: 'negative_unchanged_positive_to_zero', text: 'Negative unchanged, positive to zero' },
            { value: 'change_to_positive', text: 'Change to positive' },
            { value: 'change_to_negative', text: 'Change to negative' },
            { value: 'change_to_zero', text: 'Change to zero' }
        ];
        let inputMethodOptionsHtml = '';
        inputMethodOptions.forEach(option => {
            const selected = option.value === (row.input_method || '') ? 'selected' : '';
            inputMethodOptionsHtml += `<option value="${option.value}" ${selected}>${option.text}</option>`;
        });
        
        tr.innerHTML = `
            <td>${row.no}</td>
            <td>${toUpperDisplay(row.process)}</td>
            <td class="account-cell" data-original-account="${escapeHtml(row.account || '')}" data-original-account-id="${row.account_id || ''}">
                <span class="account-display">${toUpperDisplay(row.account)}</span>
                <select class="account-select" style="display: none; width: 100%; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: clamp(9px, 0.63vw, 12px);"></select>
            </td>
            <td class="currency-cell">${toUpperDisplay(row.currency)}</td>
            <td class="source-cell" data-original-source="${escapeHtml(row.source || '')}" data-source-ref="${escapeHtml(row.source_ref != null ? String(row.source_ref) : '')}">
                <span class="source-display" title="${escapeHtml(row.source || '')}">${toUpperDisplay(row.source)}</span>
                <input type="text" class="source-input" value="${escapeHtml(row.source != null && String(row.source).trim() !== '' ? String(row.source) : '1')}" style="display: none; width: 100%; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: clamp(9px, 0.63vw, 12px);">
            </td>
            <td>${toUpperDisplay(row.product)}</td>
            <td class="input-method-cell" data-original-input-method="${escapeHtml(row.input_method || '')}">
                <span class="input-method-display" title="${escapeHtml(row.input_method || '')}">${toUpperDisplay(row.input_method)}</span>
                <select class="input-method-select" style="display: none; width: 100%; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: clamp(9px, 0.63vw, 12px);">${inputMethodOptionsHtml}</select>
            </td>
            <td class="formula-cell" data-original-formula="${escapeHtml(row.formula_edit || row.formula || '')}">
                <span class="formula-display" style="word-break: break-word;" title="${escapeHtml(row.formula || '')}">${toUpperDisplay(row.formula)}</span>
                <input type="text" class="formula-input" value="${escapeHtml(row.formula_edit || row.formula || '')}" style="display: none; width: 100%; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: clamp(9px, 0.63vw, 12px);">
            </td>
            <td class="description-cell" data-original-description="${escapeHtml(row.description || '')}">
                <span class="description-display" style="word-break: break-word;">${toUpperDisplay(row.description)}</span>
                <input type="text" class="description-input" value="${escapeHtml(row.description || '')}" style="display: none; width: 100%; padding: 2px 4px; border: 1px solid #ddd; border-radius: 4px; font-size: clamp(9px, 0.63vw, 12px);">
            </td>
            <td style="text-align: center; vertical-align: middle;">
                <div style="display: flex; align-items: center; justify-content: center; gap: clamp(8px, 0.73vw, 12px);">
                    <button class="maintenance-edit-btn" onclick="editDataCaptureRow(${row.id}, this)" aria-label="Edit" title="Edit">
                        <img src="images/edit.svg" alt="Edit" class="edit-icon" />
                        <svg class="save-icon" style="display: none;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button class="maintenance-cancel-btn" onclick="cancelEditDataCaptureRow(${row.id}, this)" aria-label="Cancel" title="Cancel" style="display: none;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <input type="checkbox" class="data-capture-row-checkbox" data-id="${row.id}" onchange="updateDeleteButtonState()">
                </div>
            </td>
        `;
        
        container.appendChild(tr);
    });
    
    console.log(`✅ 数据捕获列表渲染完成，共 ${data.length} 条记录`);
    
    // 重置 Select All 复选框状态
    const selectAllCheckbox = document.getElementById('select_all_data_capture');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }
    
    // 更新删除按钮状态
    updateDeleteButtonState();
}

// Toggle select all rows
function toggleSelectAllRows(source) {
    const rowCheckboxes = document.querySelectorAll('.data-capture-row-checkbox');
    const targetState = !!source.checked;
    rowCheckboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = targetState;
        }
    });
    updateDeleteButtonState();
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ==================== 文本转大写显示 ====================
function toUpperDisplay(value) {
    if (value === null || value === undefined) {
        return '-';
    }
    const str = String(value).trim();
    return str ? str.toUpperCase() : '-';
}

function splitFormulaSourcePercent(rawFormula) {
    const formula = rawFormula == null ? '' : String(rawFormula).trim();
    if (!formula) {
        return { base: '', sourcePercent: '' };
    }

    const lastStar = formula.lastIndexOf('*');
    if (lastStar === -1) {
        return { base: formula, sourcePercent: '' };
    }

    const base = formula.slice(0, lastStar).trim();
    let rate = formula.slice(lastStar + 1).trim();
    if (!base || !rate || rate.includes('$')) {
        return { base: formula, sourcePercent: '' };
    }

    const wrapped = rate.match(/^\((.+)\)$/);
    if (wrapped) {
        rate = wrapped[1].trim();
    }

    const rateCompact = rate.replace(/[%\s]/g, '');
    if (!rateCompact || !/^[0-9.\/()+-]+$/.test(rateCompact)) {
        return { base: formula, sourcePercent: '' };
    }

    return { base, sourcePercent: rate };
}

function buildFormulaWithSourcePercent(rawFormula, rawSourcePercent) {
    const { base } = splitFormulaSourcePercent(rawFormula);
    const sourcePercent = rawSourcePercent == null ? '' : String(rawSourcePercent).trim();
    const sourceCompact = sourcePercent.replace(/[%\s]/g, '');
    if (!base || !sourceCompact) {
        return base;
    }
    return `${base}*${sourcePercent}`;
}

// ==================== 编辑数据捕获行 ====================
function editDataCaptureRow(rowId, editBtn) {
    const row = editBtn.closest('tr');
    const accountCell = row.querySelector('.account-cell');
    const sourceCell = row.querySelector('.source-cell');
    const inputMethodCell = row.querySelector('.input-method-cell');
    const formulaCell = row.querySelector('.formula-cell');
    const descriptionCell = row.querySelector('.description-cell');
    
    const accountDisplay = accountCell.querySelector('.account-display');
    const accountSelect = accountCell.querySelector('.account-select');
    const sourceDisplay = sourceCell.querySelector('.source-display');
    const sourceInput = sourceCell.querySelector('.source-input');
    const inputMethodDisplay = inputMethodCell.querySelector('.input-method-display');
    const inputMethodSelect = inputMethodCell.querySelector('.input-method-select');
    const formulaDisplay = formulaCell.querySelector('.formula-display');
    const formulaInput = formulaCell.querySelector('.formula-input');
    const descriptionDisplay = descriptionCell.querySelector('.description-display');
    const descriptionInput = descriptionCell.querySelector('.description-input');
    const cancelBtn = row.querySelector('.maintenance-cancel-btn');
    const checkbox = row.querySelector('.data-capture-row-checkbox');
    
    // 加载 account 列表
    loadAccountList(accountSelect, accountCell.getAttribute('data-original-account-id')).then(() => {
        const rowDataForEdit = JSON.parse(row.getAttribute('data-row-data') || '{}');
        formulaInput.value = rowDataForEdit.formula_edit || rowDataForEdit.formula || '';
        sourceInput.value = rowDataForEdit.source != null && String(rowDataForEdit.source).trim() !== ''
            ? String(rowDataForEdit.source)
            : '1';
        sourceInput.oninput = function() {
            formulaInput.value = buildFormulaWithSourcePercent(formulaInput.value, sourceInput.value);
        };
        // 显示输入框/下拉列表，隐藏显示文本
        accountDisplay.style.display = 'none';
        accountSelect.style.display = 'block';
        sourceDisplay.style.display = 'none';
        sourceInput.style.display = 'block';
        inputMethodDisplay.style.display = 'none';
        inputMethodSelect.style.display = 'block';
        formulaDisplay.style.display = 'none';
        formulaInput.style.display = 'block';
        descriptionDisplay.style.display = 'none';
        descriptionInput.style.display = 'block';
        
        // 切换图标：edit icon -> save icon (check)
        const editIcon = editBtn.querySelector('.edit-icon');
        const saveIcon = editBtn.querySelector('.save-icon');
        if (editIcon) editIcon.style.display = 'none';
        if (saveIcon) {
            saveIcon.style.display = 'block';
            saveIcon.style.visibility = 'visible';
        }
        editBtn.setAttribute('onclick', `saveDataCaptureRow(${rowId}, this)`);
        editBtn.setAttribute('aria-label', 'Save');
        editBtn.setAttribute('title', 'Save');
        
        // 隐藏 checkbox，显示 cancel button (打叉)
        if (checkbox) {
            checkbox.style.display = 'none';
        }
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-block';
        }
        
        // 聚焦到第一个输入框
        sourceInput.focus();
    });
}

// ==================== 加载 Account 列表 ====================
function loadAccountList(selectElement, currentAccountId) {
    return new Promise((resolve, reject) => {
        // 如果已经有选项，直接返回
        if (selectElement.options.length > 0) {
            if (currentAccountId) {
                selectElement.value = currentAccountId;
            }
            resolve();
            return;
        }
        
        let url = '/api/transactions/get_accounts_api.php';
        const params = [];
        if (currentCompanyId) {
            params.push(`company_id=${encodeURIComponent(currentCompanyId)}`);
        }
        params.push('status=active');
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    selectElement.innerHTML = '<option value="">--Select Account--</option>';
                    data.data.forEach(account => {
                        const option = document.createElement('option');
                        option.value = account.id;
                        option.textContent = account.display_text;
                        if (currentAccountId && parseInt(account.id, 10) === parseInt(currentAccountId, 10)) {
                            option.selected = true;
                        }
                        selectElement.appendChild(option);
                    });
                    resolve();
                } else {
                    reject(new Error(data.error || '加载账户列表失败'));
                }
            })
            .catch(error => {
                console.error('加载账户列表失败:', error);
                reject(error);
            });
    });
}

// ==================== 取消编辑数据捕获行 ====================
function cancelEditDataCaptureRow(rowId, cancelBtn) {
    const row = cancelBtn.closest('tr');
    const accountCell = row.querySelector('.account-cell');
    const sourceCell = row.querySelector('.source-cell');
    const inputMethodCell = row.querySelector('.input-method-cell');
    const formulaCell = row.querySelector('.formula-cell');
    const descriptionCell = row.querySelector('.description-cell');
    
    const accountDisplay = accountCell.querySelector('.account-display');
    const accountSelect = accountCell.querySelector('.account-select');
    const sourceDisplay = sourceCell.querySelector('.source-display');
    const sourceInput = sourceCell.querySelector('.source-input');
    const inputMethodDisplay = inputMethodCell.querySelector('.input-method-display');
    const inputMethodSelect = inputMethodCell.querySelector('.input-method-select');
    const formulaDisplay = formulaCell.querySelector('.formula-display');
    const formulaInput = formulaCell.querySelector('.formula-input');
    const descriptionDisplay = descriptionCell.querySelector('.description-display');
    const descriptionInput = descriptionCell.querySelector('.description-input');
    const editBtn = row.querySelector('.maintenance-edit-btn');
    const checkbox = row.querySelector('.data-capture-row-checkbox');
    
    const rowData = JSON.parse(row.getAttribute('data-row-data'));
    
    // 恢复原始值
    accountSelect.value = rowData.account_id || '';
    sourceInput.value = rowData.source != null && String(rowData.source).trim() !== ''
        ? String(rowData.source)
        : '1';
    sourceInput.oninput = null;
    inputMethodSelect.value = rowData.input_method || '';
    formulaInput.value = rowData.formula_edit || rowData.formula || '';
    descriptionInput.value = rowData.description || '';
    
    accountDisplay.textContent = toUpperDisplay(rowData.account);
    sourceDisplay.textContent = toUpperDisplay(rowData.source);
    sourceDisplay.title = rowData.source || '';
    inputMethodDisplay.textContent = toUpperDisplay(rowData.input_method);
    formulaDisplay.textContent = toUpperDisplay(rowData.formula);
    formulaDisplay.title = rowData.formula || '';
    descriptionDisplay.textContent = toUpperDisplay(rowData.description);
    
    // 隐藏输入框/下拉列表，显示显示文本
    accountDisplay.style.display = 'inline';
    accountSelect.style.display = 'none';
    sourceDisplay.style.display = 'inline';
    sourceInput.style.display = 'none';
    inputMethodDisplay.style.display = 'inline';
    inputMethodSelect.style.display = 'none';
    formulaDisplay.style.display = 'inline';
    formulaInput.style.display = 'none';
    descriptionDisplay.style.display = 'inline';
    descriptionInput.style.display = 'none';
    
    // 切换图标：save icon (check) -> edit icon
    const editIcon = editBtn.querySelector('.edit-icon');
    const saveIcon = editBtn.querySelector('.save-icon');
    if (editIcon) editIcon.style.display = 'block';
    if (saveIcon) saveIcon.style.display = 'none';
    editBtn.setAttribute('onclick', `editDataCaptureRow(${rowId}, this)`);
    editBtn.setAttribute('aria-label', 'Edit');
    editBtn.setAttribute('title', 'Edit');
    
    // 隐藏 cancel button，显示 checkbox
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    if (checkbox) {
        checkbox.style.display = 'inline-block';
        checkbox.disabled = false;
    }
}

// ==================== 保存数据捕获行 ====================
function saveDataCaptureRow(rowId, saveBtn) {
    const row = saveBtn.closest('tr');
    const accountCell = row.querySelector('.account-cell');
    const sourceCell = row.querySelector('.source-cell');
    const inputMethodCell = row.querySelector('.input-method-cell');
    const formulaCell = row.querySelector('.formula-cell');
    const descriptionCell = row.querySelector('.description-cell');
    
    const accountSelect = accountCell.querySelector('.account-select');
    const accountDisplay = accountCell.querySelector('.account-display');
    const sourceInput = sourceCell.querySelector('.source-input');
    const sourceDisplay = sourceCell.querySelector('.source-display');
    const inputMethodSelect = inputMethodCell.querySelector('.input-method-select');
    const inputMethodDisplay = inputMethodCell.querySelector('.input-method-display');
    const formulaInput = formulaCell.querySelector('.formula-input');
    const formulaDisplay = formulaCell.querySelector('.formula-display');
    const descriptionInput = descriptionCell.querySelector('.description-input');
    const descriptionDisplay = descriptionCell.querySelector('.description-display');
    const editBtn = row.querySelector('.maintenance-edit-btn');
    const cancelBtn = row.querySelector('.maintenance-cancel-btn');
    const checkbox = row.querySelector('.data-capture-row-checkbox');
    
    const accountId = accountSelect.value;
    const accountText = accountSelect.options[accountSelect.selectedIndex]?.text || '';
    const sourceValue = sourceInput.value.trim();
    const prevRow = JSON.parse(row.getAttribute('data-row-data') || '{}');
    const sourceRef = sourceCell.getAttribute('data-source-ref') || prevRow.source_ref || '';
    const inputMethodValue = inputMethodSelect.value;
    const inputMethodText = inputMethodSelect.options[inputMethodSelect.selectedIndex]?.text || '';
    const formulaValue = buildFormulaWithSourcePercent(formulaInput.value.trim(), sourceValue);
    formulaInput.value = formulaValue;
    const descriptionValue = descriptionInput.value.trim();
    
    const saveData = {
        template_id: rowId,
        account_id: accountId || null,
        source_columns: sourceRef,
        source_display: sourceRef,
        input_method: inputMethodValue,
        formula: formulaValue,
        description: descriptionValue
    };
    
    if (currentCompanyId) {
        saveData.company_id = currentCompanyId;
    }
    
    console.log('保存数据:', saveData);
    
    fetch('/api/formula_maintenance/update_api.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(saveData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.message || data.error || `服务器错误 (${response.status})`);
            }).catch(() => {
                throw new Error(`服务器错误 (${response.status})`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            const norm = data.data || {};
            const disp = norm.formula_display_paren != null ? norm.formula_display_paren : formulaValue;
            const edit = norm.formula_edit != null ? norm.formula_edit : formulaValue;
            // 更新显示文本
            accountDisplay.textContent = accountText ? toUpperDisplay(accountText.split(' (')[0]) : '-';
            const sumSrc = norm.source_summary_display != null ? String(norm.source_summary_display) : (prevRow.source || '');
            const refNext = norm.source_ref != null ? String(norm.source_ref).trim() : sourceValue;
            sourceDisplay.textContent = toUpperDisplay(sumSrc !== '' ? sumSrc : '1');
            sourceDisplay.title = sumSrc !== '' ? sumSrc : '1';
            sourceInput.value = refNext;
            sourceCell.setAttribute('data-source-ref', refNext);
            inputMethodDisplay.textContent = toUpperDisplay(inputMethodValue);
            formulaDisplay.textContent = toUpperDisplay(disp);
            formulaDisplay.title = disp || '';
            formulaInput.value = edit;
            descriptionDisplay.textContent = toUpperDisplay(descriptionValue);
            
            // 隐藏输入框/下拉列表，显示显示文本
            accountDisplay.style.display = 'inline';
            accountSelect.style.display = 'none';
            sourceDisplay.style.display = 'inline';
            sourceInput.style.display = 'none';
            inputMethodDisplay.style.display = 'inline';
            inputMethodSelect.style.display = 'none';
            formulaDisplay.style.display = 'inline';
            formulaInput.style.display = 'none';
            descriptionDisplay.style.display = 'inline';
            descriptionInput.style.display = 'none';
            
            // 切换图标：save icon (check) -> edit icon
            const editIcon = editBtn.querySelector('.edit-icon');
            const saveIcon = editBtn.querySelector('.save-icon');
            if (editIcon) editIcon.style.display = 'block';
            if (saveIcon) saveIcon.style.display = 'none';
            editBtn.setAttribute('onclick', `editDataCaptureRow(${rowId}, this)`);
            editBtn.setAttribute('aria-label', 'Edit');
            editBtn.setAttribute('title', 'Edit');
            
            // 隐藏 cancel button，显示 checkbox
            if (cancelBtn) {
                cancelBtn.style.display = 'none';
            }
            if (checkbox) {
                checkbox.style.display = 'inline-block';
                checkbox.disabled = false;
            }
            sourceInput.oninput = null;
            
            // 更新保存的数据
            const sumSrcFinal = norm.source_summary_display != null ? String(norm.source_summary_display) : (prevRow.source || '');
            const refFinal = norm.source_ref != null ? String(norm.source_ref).trim() : sourceValue;
            const newRowData = {
                id: rowId,
                account: accountText.split(' (')[0] || '',
                account_id: accountId || null,
                source: sumSrcFinal !== '' ? sumSrcFinal : (prevRow.source || '1'),
                source_ref: refFinal,
                input_method: inputMethodValue,
                formula: disp,
                formula_edit: edit,
                description: descriptionValue
            };
            row.setAttribute('data-row-data', JSON.stringify(newRowData));
            
            showNotification('Update successful', 'success');
        } else {
            showNotification(data.message || data.error || 'Save failed', 'error');
        }
    })
    .catch(error => {
        console.error('保存失败:', error);
        showNotification('Save failed: ' + error.message, 'error');
    });
}

// ==================== 删除数据 ====================
function deleteData() {
    const confirmCheckbox = document.getElementById('confirmDelete');
    
    if (!confirmCheckbox.checked) {
        showNotification('Please check the confirm delete checkbox', 'error');
        return;
    }
    
    // 获取所有选中的记录 ID
    const checkboxes = document.querySelectorAll('.data-capture-row-checkbox:checked');
    if (checkboxes.length === 0) {
        showNotification('Please select at least one record', 'error');
        return;
    }
    
    const templateIds = Array.from(checkboxes).map(cb => parseInt(cb.getAttribute('data-id')));
    
    showConfirmDelete(
        `Are you sure you want to delete the selected ${templateIds.length} record(s)? This action cannot be undone.`,
        function() {
            const deleteData = {
                template_ids: templateIds
            };
            
            if (currentCompanyId) {
                deleteData.company_id = currentCompanyId;
            }
            
            fetch('/api/formula_maintenance/delete_api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(deleteData)
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.message || data.error || `服务器错误 (${response.status})`);
                    }).catch(() => {
                        throw new Error(`服务器错误 (${response.status})`);
                    });
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    showNotification(data.message || `Deleted ${templateIds.length} record(s)`, 'success');
                    checkboxes.forEach(cb => cb.checked = false);
                    confirmCheckbox.checked = false;
                    updateDeleteButtonState();
                    setTimeout(() => {
                        searchData();
                    }, 300);
                } else {
                    showNotification(data.message || data.error || 'Delete failed', 'error');
                }
            })
            .catch(error => {
                console.error('删除失败:', error);
                showNotification('Delete failed: ' + error.message, 'error');
            });
        }
    );
}

// ==================== 更新删除按钮状态 ====================
function updateDeleteButtonState() {
    const checkboxes = document.querySelectorAll('.data-capture-row-checkbox:checked');
    const deleteBtn = document.getElementById('deleteBtn');
    const confirmCheckbox = document.getElementById('confirmDelete');
    
    if (checkboxes.length > 0 && confirmCheckbox && confirmCheckbox.checked) {
        deleteBtn.disabled = false;
    } else {
        deleteBtn.disabled = true;
    }
}

// ==================== 切换删除按钮 ====================
function toggleDeleteButton() {
    updateDeleteButtonState();
}

// ==================== 确认删除模态框 ====================
let deleteCallback = null;

function showConfirmDelete(message, callback) {
    const modal = document.getElementById('confirmDeleteModal');
    const messageEl = document.getElementById('confirmDeleteMessage');
    
    messageEl.textContent = message;
    deleteCallback = callback;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeConfirmDeleteModal() {
    const modal = document.getElementById('confirmDeleteModal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
    deleteCallback = null;
}

function confirmDelete() {
    if (deleteCallback) {
        deleteCallback();
    }
    closeConfirmDeleteModal();
}


// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    initMaintenanceDropdownHover();
    initAutoSearchFilters();

    Promise.resolve()
        .then(() => (typeof loadPermissionButtons === 'function' ? loadPermissionButtons() : Promise.resolve()))
        .catch(() => {})
        .then(() => loadProcesses().catch(() => {}))
        .then(() => {
            initProcessSelect();
            showFormulaInitialEmptyState();
        });
    
    
    // 初始化删除按钮状态
    updateDeleteButtonState();
    
    // Check for URL parameters and show notifications
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === '1') {
        showNotification('Operation completed successfully!', 'success');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('error') === '1') {
        showNotification('Operation failed. Please try again.', 'error');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
window.switchCompany = switchCompany;
