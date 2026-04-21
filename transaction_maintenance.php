<?php
// 使用统一的session检查
require_once 'session_check.php';

// 仅当公司具有 Games category 权限时才可访问此页（Bank-only 自动跳转 dashboard）
$session_company_id = $_SESSION['company_id'] ?? null;
if ($session_company_id) {
    try {
        $stmt = $pdo->prepare("SELECT permissions FROM company WHERE id = ?");
        $stmt->execute([$session_company_id]);
        $permsJson = $stmt->fetchColumn();
        $companyPerms = ($permsJson ? json_decode($permsJson, true) : null);
        $hasGamesPermission = is_array($companyPerms) && (in_array('Games', $companyPerms) || in_array('Gambling', $companyPerms));
        $isBankOnlyCategory = is_array($companyPerms) && in_array('Bank', $companyPerms) && !$hasGamesPermission;
        if ($isBankOnlyCategory) {
            header('Location: dashboard.php');
            exit;
        }
        if (!$hasGamesPermission) {
            header('Location: processlist.php?error=no_gambling_permission');
            exit;
        }
    } catch (PDOException $e) {
        header('Location: processlist.php?error=permission_check_failed');
        exit;
    }
} else {
    header('Location: processlist.php');
    exit;
}

// Get URL parameters for notifications
$success = isset($_GET['success']) ? true : false;
$error = isset($_GET['error']) ? true : false;

require_once __DIR__ . '/api/get_companies_helper.php';
$user_companies = [];
try {
    $current_user_id = $_SESSION['user_id'] ?? null;
    $current_user_role = $_SESSION['role'] ?? '';
    if ($current_user_id) {
        if ($current_user_role === 'owner') {
            $owner_id = $_SESSION['real_owner_id'] ?? $_SESSION['owner_id'] ?? $current_user_id;
            $user_companies = getCompaniesByOwner($pdo, $owner_id, true);
        } else {
            $user_companies = getCompaniesByUser($pdo, $current_user_id, true);
        }
    }
} catch (Exception $e) { }

// 获取 session 中的 company_id（用于跨页面同步）
$session_company_id = $_SESSION['company_id'] ?? null;
$company_id = $session_company_id;

// 当前 session 公司的 company_code（用于 Category 权限按钮）
$session_company_code = '';
if (!empty($session_company_id)) {
    try {
        $stmt = $pdo->prepare("SELECT company_id FROM company WHERE id = ?");
        $stmt->execute([$session_company_id]);
        $row = $stmt->fetchColumn();
        $session_company_code = $row ? (string) $row : '';
    } catch (PDOException $e) {
        $session_company_code = '';
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href='https://fonts.googleapis.com/css?family=Amaranth' rel='stylesheet'>
    <link href='https://fonts.googleapis.com/css2?family=Amaranth:wght@400;700&display=swap' rel='stylesheet'>
    <link rel="stylesheet" href="css/accountCSS.css?v=<?php echo time(); ?>" />
    <link rel="stylesheet" href="css/transaction_maintenance.css?v=<?php echo time(); ?>">
    <title>Transaction Maintenance</title>
    <link rel="stylesheet" href="css/date-range-picker.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="css/sidebar.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="js/sidebar.js?v=<?php echo time(); ?>"></script>
    <?php include 'sidebar.php'; ?>
    <link rel="stylesheet" href="css/global-13inch.css?v=<?php echo file_exists('css/global-13inch.css') ? filemtime('css/global-13inch.css') : time(); ?>">
</head>
<body>
    <div class="container">
        <div class="maintenance-header">
            <h1 id="maintenance-page-title">Maintenance - Transaction</h1>
            <!-- Category 选项（与 bankprocess_maintenance 一致） -->
            <div id="maintenance-permission-filter" class="maintenance-permission-filter-header" style="display: none;">
                <span class="maintenance-company-label">Category:</span>
                <div id="maintenance-permission-buttons" class="maintenance-company-buttons">
                    <!-- Permission buttons will be loaded dynamically -->
                </div>
            </div>
        </div>
        
        <!-- Search Section -->
        <div class="maintenance-search-section">
            <div class="maintenance-filters">
                <div class="maintenance-form-group">
                    <label class="maintenance-label">Process</label>
                    <div class="custom-select-wrapper">
                        <button type="button" class="custom-select-button" id="filter_process" data-placeholder="--Select All--">--Select All--</button>
                        <div class="custom-select-dropdown" id="filter_process_dropdown">
                            <div class="custom-select-search">
                                <input type="text" placeholder="Search process..." autocomplete="off">
                            </div>
                            <div class="custom-select-options"></div>
                        </div>
                    </div>
                </div>
                
                <div class="maintenance-form-group">
                    <label class="maintenance-label">Date Range</label>
                    <div class="date-range-picker" id="date-range-picker">
                        <i class="fas fa-calendar-alt"></i>
                        <span id="date-range-display">Select date range</span>
                    </div>
                    <input type="hidden" id="date_from" value="<?php echo date('d/m/Y'); ?>">
                    <input type="hidden" id="date_to" value="<?php echo date('d/m/Y'); ?>">
                </div>
                <div class="maintenance-form-group quick-select-wrap">
                    <label class="form-label"><i class="fas fa-clock"></i> Quick Select</label>
                    <div class="quick-select-dropdown quick-select-dropdown-toggle">
                        <button type="button" class="dropdown-toggle" onclick="event.stopPropagation(); window.toggleQuickSelectDropdown();">
                            <i class="fas fa-calendar-alt"></i>
                            <span id="quick-select-text">Period</span>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="dropdown-menu" id="quick-select-dropdown">
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('today')">Today</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('yesterday')">Yesterday</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('thisWeek')">This Week</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('lastWeek')">Last Week</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('thisMonth')">This Month</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('lastMonth')">Last Month</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('thisYear')">This Year</button>
                            <button type="button" class="dropdown-item" onclick="selectQuickRange('lastYear')">Last Year</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="maintenance-filter-row">
                <div class="maintenance-filter-left">
                    <!-- Shared Group & Company Filter (SSR) -->
                    <?php
                    $filter_prefix = 'maintenance'; 
                    include 'includes/company_filter.php'; 
                    ?>
                    <script>
                        window.onSharedCompanyFilterChanged = function(companyId, companyCode) {
                            if (typeof switchCompany === 'function') {
                                switchCompany(companyId, companyCode);
                            }
                        };
                    </script>
                </div>
                
                <!-- No delete actions for transaction maintenance -->
                <div class="maintenance-actions"></div>
            </div>
        </div>
        
        <!-- Data List Container -->
        <div class="maintenance-list-container" id="tableContainer" style="display: none;">
            <table class="maintenance-table">
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Created At</th>
                        <th>Process</th>
                        <th>Id_Product</th>
                        <th>Account</th>
                        <th>Description</th>
                        <th>Remark</th>
                        <th>Percent</th>
                        <th>Currency</th>
                        <th>Rate</th>
                        <th>Cr</th>
                        <th>Dr</th>
                        <th>Submitter</th>
                    </tr>
                </thead>
                <tbody id="dataTableBody">
                    <!-- Rows will be populated dynamically -->
                </tbody>
            </table>
        </div>
        
        <!-- Empty State -->
        <div class="empty-state-container" id="emptyState" style="display: none;">
            <div class="empty-state">
                <p>No data found. Please adjust your search criteria and try again.</p>
            </div>
        </div>
    </div>

    <!-- Notification Container -->
    <div id="notificationContainer" class="maintenance-notification-container"></div>

    <!-- Calendar popup (same as dashboard) -->
    <div class="calendar-popup" id="calendar-popup" style="display: none;">
        <div class="calendar-header">
            <button type="button" class="calendar-nav-btn" onclick="event.stopPropagation(); window.changeMonth(-1)">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="calendar-month-year" onclick="event.stopPropagation();">
                <select id="calendar-month-select">
                    <option value="0">Jan</option>
                    <option value="1">Feb</option>
                    <option value="2">Mar</option>
                    <option value="3">Apr</option>
                    <option value="4">May</option>
                    <option value="5">Jun</option>
                    <option value="6">Jul</option>
                    <option value="7">Aug</option>
                    <option value="8">Sep</option>
                    <option value="9">Oct</option>
                    <option value="10">Nov</option>
                    <option value="11">Dec</option>
                </select>
                <select id="calendar-year-select"></select>
            </div>
            <button type="button" class="calendar-nav-btn" onclick="event.stopPropagation(); window.changeMonth(1)">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="calendar-weekdays">
            <div class="calendar-weekday">Sun</div>
            <div class="calendar-weekday">Mon</div>
            <div class="calendar-weekday">Tue</div>
            <div class="calendar-weekday">Wed</div>
            <div class="calendar-weekday">Thu</div>
            <div class="calendar-weekday">Fri</div>
            <div class="calendar-weekday">Sat</div>
        </div>
        <div class="calendar-days" id="calendar-days"></div>
    </div>

    <script>
        let ownerCompanies = [];
        // 从 PHP session 中获取 company_id（用于跨页面同步）
        let currentCompanyId = <?php echo json_encode($session_company_id); ?>;
        let currentCompanyCode = <?php echo json_encode($session_company_code); ?>;
        let hasSearched = false;

        async function fetchCompanyPermissions(companyCode) {
            if (!companyCode) return [];
            try {
                const response = await fetch('api/domain/domain_api.php', {
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



        async function switchCompany(companyId, companyCode) {
            if (parseInt(currentCompanyId, 10) === parseInt(companyId, 10)) return;
            
            // 先更新 session
            let hasGamblingFromSession = undefined;
            try {
                const response = await fetch(`api/session/update_company_session_api.php?company_id=${companyId}`);
                const result = await response.json();
                if (!result.success) {
                    console.error('更新 session 失败:', result.error);
                } else if (typeof window.updateSidebarDataCaptureVisibility === 'function' && result.data) {
                    if (result.data.has_gambling !== undefined) hasGamblingFromSession = result.data.has_gambling;
                    window.updateSidebarDataCaptureVisibility(result.data.has_gambling, result.data.has_bank);
                }
            } catch (error) {
                console.error('更新 session 时出错:', error);
            }
            
            currentCompanyId = companyId;
            currentCompanyCode = companyCode || '';
            if (typeof window !== 'undefined') {
                window.SIDEBAR_COMPANY_CODE = currentCompanyCode;
            }
            if (hasGamblingFromSession === false) {
                window.location.href = 'dashboard.php';
                return;
            }
            const permissions = await fetchCompanyPermissions(currentCompanyCode);
            if (isBankOnlyCategoryCompany(permissions)) {
                window.location.href = 'dashboard.php';
                return;
            }
            loadProcesses();
            if (hasSearched) {
                searchData();
            }
        }



        // Load Process list
        function loadProcesses() {
            const params = [];
            if (currentCompanyId) {
                params.push(`company_id=${encodeURIComponent(currentCompanyId)}`);
            }
            const url = params.length ? `api/processes/processlist_api.php?${params.join('&')}` : 'api/processes/processlist_api.php';
            
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
                        data.data.forEach(process => {
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


        // Search function（须与 js/transaction_maintenance.js 一致：带 category 参数）
        function searchData() {
            const processButton = document.getElementById('filter_process');
            const process = processButton?.getAttribute('data-value') || '';
            const dateFrom = document.getElementById('date_from').value.trim();
            const dateTo = document.getElementById('date_to').value.trim();

            if (!dateFrom || !dateTo) {
                showNotification('Please select date range', 'error');
                return;
            }

            let categoryToSend = typeof selectedPermission !== 'undefined' ? selectedPermission : null;
            if (!categoryToSend) {
                const activeBtn = document.querySelector('#maintenance-permission-buttons .maintenance-company-btn.active');
                if (activeBtn && activeBtn.dataset.permission) {
                    categoryToSend = activeBtn.dataset.permission;
                }
            }
            console.log('🔍 搜索参数:', { process, dateFrom, dateTo, companyId: currentCompanyId, category: categoryToSend });

            let url = `api/transactions/maintenance_search_api.php?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
            if (process) {
                url += `&process=${encodeURIComponent(process)}`;
            }
            if (currentCompanyId) {
                url += `&company_id=${encodeURIComponent(currentCompanyId)}`;
            }
            if (categoryToSend) {
                url += `&category=${encodeURIComponent(categoryToSend)}`;
            }
            
            // 显示加载状态
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '<tr><td class="maintenance-table-cell" colspan="13" style="text-align: center; padding: 20px;">Loading...</td></tr>';
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('tableContainer').style.display = 'block';
            
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log('✅ 搜索成功:', data.data);
                        hasSearched = true;
                        
                        // 填充表格
                        fillTable(data.data);
                        
                        if (data.data.length === 0) {
                            document.getElementById('emptyState').style.display = 'block';
                            document.getElementById('tableContainer').style.display = 'none';
                            showNotification('No data found', 'info');
                        } else {
                            showNotification(`Found ${data.data.length} record(s)`, 'success');
                        }
                    } else {
                        showNotification(data.error || 'Search failed', 'error');
                        document.getElementById('emptyState').style.display = 'block';
                        document.getElementById('tableContainer').style.display = 'none';
                    }
                })
                .catch(error => {
                    console.error('❌ 搜索失败:', error);
                    showNotification('Search failed: ' + error.message, 'error');
                    document.getElementById('emptyState').style.display = 'block';
                    document.getElementById('tableContainer').style.display = 'none';
                });
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

        // Fill list function
        function fillTable(data) {
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '';
            
            if (!data || data.length === 0) {
                const emptyRow = document.createElement('tr');
                emptyRow.className = 'maintenance-row-empty';
                emptyRow.innerHTML = `
                    <td class="maintenance-table-cell" colspan="13" style="text-align: center; padding: 16px;">
                        No data
                    </td>
                `;
                tbody.appendChild(emptyRow);
                return;
            }
            
            data.forEach((row, index) => {
                const tr = document.createElement('tr');
                tr.className = 'maintenance-row';
                
                const dtsCreatedDisplay = row.dts_created ? escapeHtml(row.dts_created) : '-';
                const processDisplay = row.process ? escapeHtml(row.process) : '-';
                const idProductDisplay = (row.id_product !== null && row.id_product !== undefined && row.id_product !== '') ? escapeHtml(row.id_product) : '-';
                const accountDisplay = row.account ? escapeHtml(row.account) : '-';
                const descriptionDisplay = row.description ? escapeHtml(row.description) : '-';
                const remarkDisplay = row.remark ? escapeHtml(row.remark) : '-';
                const percentDisplay = (row.percent !== null && row.percent !== undefined && row.percent !== '') ? escapeHtml(row.percent) : '-';
                const currencyDisplay = row.currency ? escapeHtml(row.currency) : '-';
                const rateDisplay = (row.rate !== null && row.rate !== undefined && row.rate !== '') ? escapeHtml(row.rate) : '-';
                const crDisplay = row.cr !== null && row.cr !== undefined && row.cr !== '' ? escapeHtml(parseFloat(row.cr).toFixed(2)) : '-';
                const drDisplay = row.dr !== null && row.dr !== undefined && row.dr !== '' ? escapeHtml(parseFloat(row.dr).toFixed(2)) : '-';
                const createdByDisplay = row.created_by ? escapeHtml(row.created_by) : '-';
                
                const isDeleted = row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;
                
                if (isDeleted) {
                    tr.classList.add('maintenance-row-deleted');
                }
                
                tr.setAttribute('data-transaction-id', row.transaction_id || '');
                
                tr.innerHTML = `
                    <td class="maintenance-table-cell">${row.no || index + 1}</td>
                    <td class="maintenance-table-cell">${dtsCreatedDisplay}</td>
                    <td class="maintenance-table-cell">${processDisplay}</td>
                    <td class="maintenance-table-cell">${idProductDisplay}</td>
                    <td class="maintenance-table-cell">${accountDisplay}</td>
                    <td class="maintenance-table-cell">${descriptionDisplay}</td>
                    <td class="maintenance-table-cell">${remarkDisplay}</td>
                    <td class="maintenance-table-cell">${percentDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-currency">${currencyDisplay}</td>
                    <td class="maintenance-table-cell">${rateDisplay}</td>
                    <td class="maintenance-table-cell">${crDisplay}</td>
                    <td class="maintenance-table-cell">${drDisplay}</td>
                    <td class="maintenance-table-cell">${createdByDisplay}</td>
                `;
                
                tbody.appendChild(tr);
            });
        }

        // Date range picker (same as dashboard)
        function initDatePickers() {
            if (typeof window.MaintenanceDateRangePicker !== 'undefined') {
                window.MaintenanceDateRangePicker.init({ onChange: searchData });
            }
        }

        function initAutoSearchFilters() {
            const processSelect = document.getElementById('filter_process');
            if (processSelect) {
                processSelect.addEventListener('change', () => {
                    searchData();
                });
            }
        }

        // Initialize page
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' && window.SIDEBAR_COMPANY_HAS_GAMBLING === false) {
                window.location.href = 'dashboard.php';
                return;
            }
            // Initialize date pickers
            initDatePickers();
            initMaintenanceDropdownHover();
            
            initAutoSearchFilters();

            Promise.resolve()
                .then(() => (typeof loadPermissionButtons === 'function' ? loadPermissionButtons() : Promise.resolve()))
                .catch(() => {})
                .then(() => loadProcesses())
                .catch(() => {})
                .then(() => {
                    initProcessSelect();
                    searchData();
                });
            
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
    </script>
   
    <script src="js/date-range-picker.js?v=<?php echo time(); ?>"></script>
    <script>window.TRANSACTION_MAINTENANCE = { currentCompanyId: <?php echo json_encode($session_company_id); ?>, currentCompanyCode: <?php echo json_encode($session_company_code); ?> };</script>
    <script src="js/transaction_maintenance.js?v=<?php echo time(); ?>"></script>
</body>
</html>