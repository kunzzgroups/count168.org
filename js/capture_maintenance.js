let ownerCompanies = [];
        // 从 PHP session 中获取 company_id（用于跨页面同步）
        let currentCompanyId = typeof window.currentCompanyId !== 'undefined' ? window.currentCompanyId : null;
        let currentCompanyCode = typeof window.currentCompanyCode !== 'undefined' ? (window.currentCompanyCode || '') : '';
        let selectedPermission = null;
        let hasSearched = false;

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

        // Toggle delete button based on confirm checkbox and row checkboxes
        function toggleDeleteButton() {
            updateDeleteButtonState();
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
                const response = await fetch('api/domain/domain_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'get_company_permissions', company_id: code })
                });
                const result = await response.json();
                let permissions = result.success && result.data && result.data.permissions
                    ? result.data.permissions
                    : ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
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
                        switchPermission(savedPermission);
                    } else if (permissions.length > 0) {
                        switchPermission(permissions[0]);
                    }
                } else {
                    filterEl.style.display = 'none';
                }
            } catch (err) {
                console.error('Error loading permissions:', err);
                filterEl.style.display = 'none';
            }
        }

        function switchPermission(permission) {
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
        }

        async function switchCompany(companyId, companyCode) {
            if (parseInt(currentCompanyId, 10) === parseInt(companyId, 10)) return;
            let hasGamblingFromSession = undefined;
            let hasBankFromSession = undefined;
            try {
                const response = await fetch(`api/session/update_company_session_api.php?company_id=${companyId}`);
                const result = await response.json();
                if (!result.success) {
                    console.error('更新 session 失败:', result.error);
                    window.location.href = 'dashboard.php';
                    return;
                } else if (result.data) {
                    if (result.data.has_gambling !== undefined) hasGamblingFromSession = result.data.has_gambling;
                    if (result.data.has_bank !== undefined) hasBankFromSession = result.data.has_bank;
                }
            } catch (error) {
                console.error('更新 session 时出错:', error);
                window.location.href = 'dashboard.php';
                return;
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
            if (typeof window.updateSidebarDataCaptureVisibility === 'function') {
                const hg = hasGamblingFromSession !== undefined
                    ? hasGamblingFromSession
                    : (typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' ? window.SIDEBAR_COMPANY_HAS_GAMBLING : false);
                window.updateSidebarDataCaptureVisibility(hg, hasBankFromSession);
            }
            loadPermissionButtons();
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
                        
                        // Save previously selected value (use unique process DB id)
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
                            const processValue = process.id != null ? String(process.id) : String(process.process_name || '');
                            option.setAttribute('data-value', processValue);
                            
                            // If current value matches, mark as selected
                            if (previousValue && processValue === previousValue) {
                                option.classList.add('selected');
                                processButton.textContent = displayText;
                                processButton.setAttribute('data-value', processValue);
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


        // Search function
        function searchData() {
            const processButton = document.getElementById('filter_process');
            const process = processButton?.getAttribute('data-value') || '';
            const dateFrom = document.getElementById('date_from').value.trim();
            const dateTo = document.getElementById('date_to').value.trim();
            
            // 验证日期
            if (!dateFrom || !dateTo) {
                showNotification('Please select date range', 'error');
                return;
            }
            
            console.log('🔍 搜索参数:', { process, dateFrom, dateTo, companyId: currentCompanyId });
            
            // 构建URL
            let url = `api/capture_maintenance/search_api.php?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
            if (process) {
                url += `&process=${encodeURIComponent(process)}`;
            }
            if (currentCompanyId) {
                url += `&company_id=${encodeURIComponent(currentCompanyId)}`;
            }
            
            // 显示加载状态
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '<tr><td class="maintenance-table-cell" colspan="9" style="text-align: center; padding: 20px;">Loading...</td></tr>';
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
                        
                        // 更新Delete按钮状态
                        updateDeleteButtonState();
                        
                        if (data.data.length === 0) {
                            document.getElementById('emptyState').style.display = 'block';
                            document.getElementById('tableContainer').style.display = 'none';
                            showNotification('No data found', 'info');
                        } else {
                            showNotification(`Found ${data.data.length} record(s)`, 'success');
                        }
                    } else {
                        showNotification(data.message || data.error || 'Search failed', 'error');
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
                    <td class="maintenance-table-cell" colspan="9" style="text-align: center; padding: 16px;">
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
                const productDisplay = row.product ? escapeHtml(row.product) : '-';
                const processDisplay = row.process ? escapeHtml(row.process) : '-';
                const currencyDisplay = row.currency ? escapeHtml(row.currency) : '-';
                const wlGroupDisplay = row.wl_group ? escapeHtml(row.wl_group) : '-';
                const submittedByDisplay = row.submitted_by ? escapeHtml(row.submitted_by) : '-';
                
                const isDeleted = row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;
                const deletedBy = row.deleted_by ? escapeHtml(row.deleted_by) : '';
                const dtsDeleted = row.dts_deleted ? escapeHtml(row.dts_deleted) : '';
                const deletedDisplay = isDeleted && deletedBy
                    ? `${deletedBy} (${dtsDeleted || '-'})`
                    : (isDeleted ? (dtsDeleted || '-') : '-');
                
                if (isDeleted) {
                    tr.classList.add('maintenance-row-deleted');
                }
                
                tr.setAttribute('data-capture-id', row.capture_id || '');
                
                tr.innerHTML = `
                    <td class="maintenance-table-cell">${row.no || index + 1}</td>
                    <td class="maintenance-table-cell">${dtsCreatedDisplay}</td>
                    <td class="maintenance-table-cell">${productDisplay}</td>
                    <td class="maintenance-table-cell">${processDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-currency">${currencyDisplay}</td>
                    <td class="maintenance-table-cell">${wlGroupDisplay}</td>
                    <td class="maintenance-table-cell">${submittedByDisplay}</td>
                    <td class="maintenance-table-cell">${deletedDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-checkbox">
                        <input type="checkbox" class="maintenance-row-checkbox" data-capture-id="${row.capture_id || ''}" data-process-id="${row.process_id || row.process || ''}" data-currency-id="${row.currency_id || ''}" onchange="updateDeleteButtonState()" ${isDeleted ? 'disabled' : ''}>
                    </td>
                `;
                
                tbody.appendChild(tr);
            });
        }

        // Update delete button state based on checked checkboxes
        function updateDeleteButtonState() {
            const checkboxes = document.querySelectorAll('.maintenance-row-checkbox');
            const checkedCheckboxes = document.querySelectorAll('.maintenance-row-checkbox:checked');
            const deleteBtn = document.getElementById('deleteBtn');
            const confirmCheckbox = document.getElementById('confirmDelete');
            const selectAllCheckbox = document.getElementById('select_all_capture');
            
            // 更新 Select All 复选框状态
            if (selectAllCheckbox && checkboxes.length > 0) {
                const selectableRows = Array.from(checkboxes).filter(cb => !cb.disabled);
                const checkedSelectable = selectableRows.filter(cb => cb.checked);
                selectAllCheckbox.checked = selectableRows.length > 0 && checkedSelectable.length === selectableRows.length;
                selectAllCheckbox.indeterminate = checkedSelectable.length > 0 && checkedSelectable.length < selectableRows.length;
            }
            
            if (checkedCheckboxes.length > 0 && confirmCheckbox.checked) {
                deleteBtn.disabled = false;
            } else {
                deleteBtn.disabled = true;
            }
        }


        // Delete function - delete all selected rows
        function deleteData() {
            const confirmCheckbox = document.getElementById('confirmDelete');
            
            if (!confirmCheckbox.checked) {
                showNotification('Please confirm deletion by checking the checkbox', 'error');
                return;
            }
            
            // Get all checked capture IDs
            const checkboxes = document.querySelectorAll('.maintenance-row-checkbox:checked');
            if (checkboxes.length === 0) {
                showNotification('Please select at least one record', 'error');
                return;
            }
            
            const selection = Array.from(checkboxes).map(cb => ({
                capture_id: parseInt(cb.getAttribute('data-capture-id'), 10),
                process_id: cb.getAttribute('data-process-id') || null,
                currency_id: cb.getAttribute('data-currency-id') ? parseInt(cb.getAttribute('data-currency-id'), 10) : null
            })).filter(item => Number.isFinite(item.capture_id) && item.capture_id > 0);
            
            if (selection.length === 0) {
                showNotification('No valid records found for deletion', 'error');
                return;
            }
            
            showConfirmDelete(
                `Are you sure you want to delete the selected ${selection.length} record(s)? This action cannot be undone.`,
                function() {
                    const dateFrom = document.getElementById('date_from').value.trim();
                    const dateTo = document.getElementById('date_to').value.trim();
                    
                    const payload = {
                        date_from: dateFrom,
                        date_to: dateTo,
                        items: selection
                    };
                    
                    fetch('api/capture_maintenance/delete_api.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showNotification(data.message || 'Delete successful', 'success');
                            
                            checkboxes.forEach(cb => cb.checked = false);
                            confirmCheckbox.checked = false;
                            const selectAllCheckbox = document.getElementById('select_all_capture');
                            if (selectAllCheckbox) {
                                selectAllCheckbox.checked = false;
                                selectAllCheckbox.indeterminate = false;
                            }
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

        // Toggle select all rows
        function toggleSelectAllRows(source) {
            const rowCheckboxes = document.querySelectorAll('.maintenance-row-checkbox');
            const targetState = !!source.checked;
            rowCheckboxes.forEach(cb => {
                if (!cb.disabled) {
                    cb.checked = targetState;
                }
            });
            updateDeleteButtonState();
        }

        // Confirm delete modal functions
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

        // Date range picker (same as dashboard) - uses date-range-picker.js and hidden #date_from, #date_to
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
                .then(() => {
                    loadPermissionButtons();
                    return loadProcesses()
                        .catch(() => {})
                        .finally(() => {
                            // Initialize custom select
                            initProcessSelect();
                            searchData();
                        });
                });
            
            // Initialize delete button state
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
