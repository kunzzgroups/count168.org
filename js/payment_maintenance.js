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

        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // Format number function
        function formatNumber(num) {
            const number = parseFloat(num);
            if (isNaN(number)) return '0.00';
            return number.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        // 从 PHP session 中获取 company_id（用于跨页面同步）
        let currentCompanyId = typeof window.currentCompanyId !== 'undefined' ? window.currentCompanyId : null;
        let currentCompanyCode = typeof window.currentCompanyCode !== 'undefined' ? (window.currentCompanyCode || '') : '';
        let ownerCompanies = [];
        let selectedCurrency = null; // 单选，只保存一个货币代码
        let selectedPermission = null;



        async function loadPermissionButtons() {
            const filterEl = document.getElementById('maintenance-permission-filter');
            const containerEl = document.getElementById('maintenance-permission-buttons');
            if (!filterEl || !containerEl) return;
            const code = currentCompanyCode || (typeof window.currentCompanyCode !== 'undefined' ? window.currentCompanyCode : '');
            if (!code) {
                filterEl.style.display = 'none';
                return;
            }
            if (String(code).trim().toUpperCase() === 'C168') {
                containerEl.innerHTML = '';
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
            const newCompanyId = parseInt(companyId, 10);
            if (currentCompanyId === newCompanyId) return;
            
            // 立即更新本地状态并清空表格，避免显示上一家公司的数据
            currentCompanyId = newCompanyId;
            currentCompanyCode = companyCode || '';
            if (typeof window !== 'undefined') {
                window.SIDEBAR_COMPANY_CODE = currentCompanyCode;
            }
            loadPermissionButtons();
            clearTableAndShowLoading();
            
            // 再更新 session
            try {
                const response = await fetch(`api/session/update_company_session_api.php?company_id=${newCompanyId}`);
                const result = await response.json();
                if (!result.success) {
                    console.error('更新 session 失败:', result.error);
                    window.location.href = 'dashboard.php';
                    return;
                }
                if (typeof window.updateSidebarDataCaptureVisibility === 'function' && result.data) {
                    window.updateSidebarDataCaptureVisibility(result.data.has_gambling, result.data.has_bank);
                }
            } catch (error) {
                console.error('更新 session 时出错:', error);
                window.location.href = 'dashboard.php';
                return;
            }
            
            loadCompanyCurrencies()
                .then(() => {
                    const dateFrom = document.getElementById('date_from').value.trim();
                    const dateTo = document.getElementById('date_to').value.trim();
                    // 只要有日期范围就重新请求当前公司的数据（不依赖 selectedCurrency，避免新公司无货币时不刷新）
                    if (dateFrom && dateTo) {
                        searchData();
                    } else {
                        showEmptyState();
                    }
                });
        }
        
        function clearTableAndShowLoading() {
            const tbody = document.getElementById('dataTableBody');
            const emptyState = document.getElementById('emptyState');
            const tableContainer = document.getElementById('tableContainer');
            tbody.innerHTML = '<tr class="maintenance-row-empty"><td class="maintenance-table-cell" colspan="11" style="text-align: center; padding: 20px;">Loading...</td></tr>';
            emptyState.style.display = 'none';
            tableContainer.style.display = 'block';
        }
        
        function showEmptyState() {
            document.getElementById('tableContainer').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            document.getElementById('dataTableBody').innerHTML = '';
        }

        function loadCompanyCurrencies() {
            const container = document.getElementById('currency-buttons-container');
            const wrapper = document.getElementById('currency-buttons-wrapper');
            let url = 'api/transactions/get_company_currencies_api.php';
            if (currentCompanyId) {
                url += `?company_id=${currentCompanyId}`;
            }
            
            return fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.data.length > 0) {
                        const previousSelected = selectedCurrency;
                        container.innerHTML = '';
                        
                        data.data.forEach(currency => {
                            const btn = document.createElement('button');
                            btn.className = 'maintenance-company-btn';
                            btn.textContent = currency.code;
                            btn.dataset.currencyCode = currency.code;
                            if (previousSelected === currency.code) {
                                btn.classList.add('active');
                            }
                            btn.addEventListener('click', () => selectCurrency(currency.code));
                            container.appendChild(btn);
                        });
                        
                        // 如果没有已选中的货币，默认选择第一个（优先选择MYR）
                        if (!previousSelected || !data.data.some(currency => currency.code === previousSelected)) {
                            const defaultCurrency = data.data.find(currency => currency.code === 'MYR') || data.data[0];
                            selectedCurrency = defaultCurrency ? defaultCurrency.code : null;
                        } else {
                            selectedCurrency = previousSelected;
                        }
                        updateCurrencyButtonsState();
                        
                        wrapper.style.display = 'flex';
                    } else {
                        wrapper.style.display = 'none';
                        selectedCurrency = null;
                    }
                })
                .catch(error => {
                    console.warn('加载 Currency 列表失败:', error);
                    wrapper.style.display = 'none';
                    selectedCurrency = null;
                });
        }

        function selectCurrency(currencyCode) {
            // 单选：直接设置为当前选中的货币
            selectedCurrency = currencyCode;
            updateCurrencyButtonsState();
            
            const dateFrom = document.getElementById('date_from').value.trim();
            const dateTo = document.getElementById('date_to').value.trim();
            if (dateFrom && dateTo) {
                searchData();
            }
        }

        function updateCurrencyButtonsState() {
            const buttons = document.querySelectorAll('#currency-buttons-container .maintenance-company-btn');
            buttons.forEach(btn => {
                const code = btn.dataset.currencyCode;
                if (selectedCurrency === code) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        // Search function
        function searchData() {
            const transactionType = document.getElementById('filter_transaction_type').value;
            const dateFrom = document.getElementById('date_from').value.trim();
            const dateTo = document.getElementById('date_to').value.trim();
            
            // 验证日期
            if (!dateFrom || !dateTo) {
                showNotification('Please select date range', 'error');
                return;
            }
            
            console.log('🔍 搜索参数:', { transactionType, dateFrom, dateTo, companyId: currentCompanyId, currency: selectedCurrency });
            
            // 构建URL
            let url = `api/payment_maintenance/search_api.php?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
            if (transactionType) {
                url += `&transaction_type=${encodeURIComponent(transactionType)}`;
            }
            if (currentCompanyId) {
                url += `&company_id=${encodeURIComponent(currentCompanyId)}`;
            }
            if (selectedCurrency) {
                url += `&currency=${encodeURIComponent(selectedCurrency)}`;
            }
            
            // 显示加载状态
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '<div class="maintenance-list-card"><div class="maintenance-list-card-item" style="text-align: center; padding: 20px; grid-column: 1 / -1;">Loading...</div></div>';
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('tableContainer').style.display = 'block';
            
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        console.log('✅ 搜索成功:', data.data);
                        
                        // 填充表格
                        fillTable(data.data);
                        
                        // 重置 Select All 复选框状态
                        const selectAllCheckbox = document.getElementById('select_all_payment');
                        if (selectAllCheckbox) {
                            selectAllCheckbox.checked = false;
                        }
                        
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
                        showNotification(data.message || 'Search failed', 'error');
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

        // Bank Process 入账 description 存库为 "Process: ..."，本页仅展示时去掉前缀（不影响 DB / Win-Loss 等依赖 Process: 的逻辑）
        function stripBankProcessDescriptionPrefix(text) {
            const s = String(text || '');
            const m = s.match(/^\s*process:\s*(.*)$/i);
            return m ? m[1].trim() : s;
        }

        // 针对手动 PROFIT（WIN/LOSE）账目：Maintenance - Payment 只显示一行，To=客户 From=PROFIT，Description=PROFIT FROM {Account(To)}
        function mergeProfitRows(data) {
            if (!Array.isArray(data) || data.length === 0) return data || [];
            const type = (row) => (row.transaction_type || '').toUpperCase();
            const acc = (row) => (row.account || '').toString().toUpperCase();
            const isProfitRow = (row) => (type(row) === 'WIN' || type(row) === 'LOSE') && acc(row).startsWith('PROFIT');
            const isWinLoseRow = (row) => type(row) === 'WIN' || type(row) === 'LOSE';
            const key = (row) => [row.dts_created, String(row.amount || ''), (row.currency || '').toUpperCase()].join('\t');
            const profitByKey = {};
            data.forEach(row => {
                if (!isProfitRow(row)) return;
                const k = key(row);
                if (!profitByKey[k]) profitByKey[k] = [];
                profitByKey[k].push(row.account || 'PROFIT');
            });
            return data.filter(row => {
                if (isProfitRow(row)) return false;
                if (isWinLoseRow(row)) {
                    const k = key(row);
                    const fromCandidates = profitByKey[k];
                    if (fromCandidates && fromCandidates.length > 0) {
                        row.from_account = fromCandidates[0];
                        // 如果是 PROFIT 配对行且当前 Description 为空或为占位符，则自动生成
                        const desc = (row.description || '').trim();
                        if (!desc || desc === '-' || desc === 'PROFIT' || desc.toUpperCase() === 'WIN' || desc.toUpperCase() === 'LOSE') {
                            const toAccountLabel = row.account || '';
                            row.description = toAccountLabel
                                ? `PROFIT FROM ${toAccountLabel}`
                                : 'PROFIT';
                        }
                        fromCandidates.shift();
                    }
                }
                return true;
            });
        }

        // Fill list function
        function fillTable(data) {
            data = mergeProfitRows(data);
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '';
            
            if (!data || data.length === 0) {
                const emptyRow = document.createElement('tr');
                emptyRow.className = 'maintenance-row-empty';
                emptyRow.innerHTML = `
                    <td class="maintenance-table-cell" colspan="11" style="text-align: center; padding: 16px;">
                        No data
                    </td>
                `;
                tbody.appendChild(emptyRow);
                return;
            }
            
            data.forEach((row, index) => {
                const tr = document.createElement('tr');
                tr.className = 'maintenance-row';
                
                const dateDisplay = row.dts_created ? escapeHtml(row.dts_created) : '-';
                const accountDisplay = row.account ? escapeHtml(row.account) : '-';
                const fromDisplay = row.from_account && row.from_account !== '-' ? escapeHtml(row.from_account) : '-';
                const currencyDisplay = row.currency ? escapeHtml(row.currency) : '-';
                const rawDescription = row.description || '';
                const displayDescription = stripBankProcessDescriptionPrefix(rawDescription);
                const safeDescription = escapeHtml(displayDescription);
                const remarkUpper = row.remark ? row.remark.toUpperCase() : '';
                const safeRemark = escapeHtml(remarkUpper);
                const createdByDisplay = row.created_by ? escapeHtml(row.created_by) : '-';
                const isDeleted = row.is_deleted === 1 || row.is_deleted === '1' || row.is_deleted === true;
                const deletedBy = row.deleted_by ? escapeHtml(row.deleted_by) : '';
                const dtsDeleted = row.dts_deleted ? escapeHtml(row.dts_deleted) : '';
                const deletedDisplay = isDeleted && deletedBy
                    ? `${deletedBy} (${dtsDeleted || '-'})`
                    : (isDeleted ? (dtsDeleted || '-') : '-');
                
                if (isDeleted) {
                    tr.classList.add('maintenance-row-deleted');
                }
                
                tr.setAttribute('data-transaction-id', row.transaction_id);
                
                const amountDisplay = formatNumber(row.amount);
                tr.innerHTML = `
                    <td class="maintenance-table-cell">${index + 1}</td>
                    <td class="maintenance-table-cell">${dateDisplay}</td>
                    <td class="maintenance-table-cell">${accountDisplay}</td>
                    <td class="maintenance-table-cell">${fromDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-amount">${currencyDisplay} ${amountDisplay}</td>
                    <td class="maintenance-table-cell" title="${displayDescription ? escapeHtml(displayDescription) : '-'}">${safeDescription || '-'}</td>
                    <td class="maintenance-table-cell">${safeRemark || '-'}</td>
                    <td class="maintenance-table-cell">${createdByDisplay}</td>
                    <td class="maintenance-table-cell">${deletedDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-checkbox">
                        <input type="checkbox" class="maintenance-row-checkbox" data-transaction-id="${row.transaction_id}" onchange="updateDeleteButtonState()" ${isDeleted ? 'disabled' : ''}>
                    </td>
                `;
                
                tbody.appendChild(tr);
            });
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

        // Update delete button state based on checked checkboxes
        function updateDeleteButtonState() {
            const checkboxes = document.querySelectorAll('.maintenance-row-checkbox');
            const checkedCheckboxes = document.querySelectorAll('.maintenance-row-checkbox:checked');
            const deleteBtn = document.getElementById('deleteBtn');
            const confirmCheckbox = document.getElementById('confirmDelete');
            const selectAllCheckbox = document.getElementById('select_all_payment');
            
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
            
            // Get all checked account IDs
            const checkboxes = document.querySelectorAll('.maintenance-row-checkbox:checked');
            if (checkboxes.length === 0) {
                showNotification('Please select at least one record', 'error');
                return;
            }
            
            const transactionIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-transaction-id'));
            
            showConfirmDelete(
                `Are you sure you want to delete the selected ${transactionIds.length} record(s)? This action cannot be undone.`,
                function() {
                    fetch('api/payment_maintenance/delete_api.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ transaction_ids: transactionIds })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showNotification(data.message || `Deleted ${transactionIds.length} record(s)`, 'success');
                            checkboxes.forEach(cb => cb.checked = false);
                            confirmCheckbox.checked = false;
                            // 重置 Select All 复选框
                            const selectAllCheckbox = document.getElementById('select_all_payment');
                            if (selectAllCheckbox) {
                                selectAllCheckbox.checked = false;
                            }
                            updateDeleteButtonState();
                            setTimeout(() => {
                                searchData();
                            }, 300);
                        } else {
                            showNotification(data.message || 'Delete failed', 'error');
                        }
                    })
                    .catch(error => {
                        console.error('删除失败:', error);
                        showNotification('Delete failed: ' + error.message, 'error');
                    });
                }
            );
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

        // Date range picker (same as dashboard)
        function initDatePickers() {
            if (typeof window.MaintenanceDateRangePicker !== 'undefined') {
                window.MaintenanceDateRangePicker.init({ onChange: searchData });
            }
        }

        function initAutoSearchFilters() {
            const transactionTypeSelect = document.getElementById('filter_transaction_type');
            if (transactionTypeSelect) {
                transactionTypeSelect.addEventListener('change', () => {
                    searchData();
                });
            }
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

        // Initialize page (Payment maintenance is valid for Bank-only companies; do not gate on Games.)
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize date pickers
            initDatePickers();
            initMaintenanceDropdownHover();
            initAutoSearchFilters();
            
            // Initialize delete button state
            updateDeleteButtonState();
            
            
            Promise.resolve()
                .then(() => (typeof loadPermissionButtons === 'function' ? loadPermissionButtons() : Promise.resolve()))
                .catch(() => {})
                .then(() => loadCompanyCurrencies())
                .catch(() => {})
                .then(() => {
                    const dateFrom = document.getElementById('date_from').value.trim();
                    const dateTo = document.getElementById('date_to').value.trim();
                    if (dateFrom && dateTo && selectedCurrency) {
                        searchData();
                    }
                })
                .catch(error => {
                    console.error('初始化筛选器失败:', error);
                    const dateFrom = document.getElementById('date_from').value.trim();
                    const dateTo = document.getElementById('date_to').value.trim();
                    if (dateFrom && dateTo && selectedCurrency) {
                        searchData();
                    }
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
window.switchCompany = switchCompany;
