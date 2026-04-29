        // Notification functions
        function showNotification(message, type = 'success') {
            const container = document.getElementById('notificationContainer');
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
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }, 2000);
        }

        function toggleDeleteButton() {
            updateDeleteButtonState();
        }

        function notifyTransactionDataChanged() {
            const ts = String(Date.now());
            try {
                localStorage.setItem('count168_tx_invalidate_ts', ts);
            } catch (eInv) { /* ignore */ }
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                try {
                    window.dispatchEvent(new CustomEvent('tx-data-changed', { detail: { ts: ts, source: 'bankprocess_maintenance_delete' } }));
                } catch (eEvt) { /* ignore */ }
            }
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

        // 与 transaction history 一致：description 转大写显示
        function toUpperDisplay(value) {
            if (value === null || value === undefined) {
                return '-';
            }
            const str = String(value).trim();
            return str ? str.toUpperCase() : '-';
        }

        function formatNumber(num) {
            try {
                return MoneyDecimal.formatThousands(num || '0', 2);
            } catch (e) {
                return '0.00';
            }
        }

        /** One column: "MYR 1,200.00" */
        function formatCurrencyAmountCell(currency, amount) {
            const cur = currency ? String(currency).trim() : '';
            const hasAmount = amount !== null && amount !== undefined && String(amount).trim() !== '';
            if (!cur && !hasAmount) return '-';
            if (!cur) return formatNumber(amount);
            if (!hasAmount) return escapeHtml(cur);
            return escapeHtml(cur) + ' ' + formatNumber(amount);
        }

        let currentCompanyId = typeof window.currentCompanyId !== 'undefined' ? window.currentCompanyId : null;
        let currentCompanyCode = '';
        let ownerCompanies = [];
        let selectedCurrency = null;
        let selectedPermission = null;



        async function switchCompany(companyId, companyCode) {
            const newCompanyId = parseInt(companyId, 10);
            if (currentCompanyId === newCompanyId) return;
            let hasGamblingFromSession = undefined;
            let hasBankFromSession = undefined;
            try {
                const response = await fetch(`api/session/update_company_session_api.php?company_id=${newCompanyId}`);
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
            currentCompanyId = newCompanyId;
            currentCompanyCode = companyCode || '';
            if (typeof window !== 'undefined') {
                window.SIDEBAR_COMPANY_CODE = currentCompanyCode;
            }
            if (typeof window.updateSidebarDataCaptureVisibility === 'function') {
                const hg = hasGamblingFromSession !== undefined
                    ? hasGamblingFromSession
                    : (typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' ? window.SIDEBAR_COMPANY_HAS_GAMBLING : false);
                window.updateSidebarDataCaptureVisibility(hg, hasBankFromSession);
            }
            loadPermissionButtons();
            loadCompanyCurrencies()
                .then(() => {
                    const dateFrom = document.getElementById('date_from').value.trim();
                    const dateTo = document.getElementById('date_to').value.trim();
                    if (dateFrom && dateTo && selectedCurrency) {
                        searchData();
                    }
                });
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

        // Category 权限（与 processlist.php 同步：同一 API + 同一 localStorage 键）
        async function loadPermissionButtons() {
            const filterEl = document.getElementById('bankprocess-permission-filter');
            const containerEl = document.getElementById('bankprocess-permission-buttons');
            if (!filterEl || !containerEl) return;
            if (!currentCompanyCode) {
                filterEl.style.display = 'none';
                return;
            }
            try {
                const response = await fetch('api/domain/domain_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'get_company_permissions',
                        company_id: currentCompanyCode
                    })
                });
                const result = await response.json();
                let permissions = result.success && result.data && result.data.permissions
                    ? result.data.permissions
                    : ['Bank', 'Loan', 'Rate', 'Money'];
                // 本页不显示 Games（Process 维护页只显示 Bank/Loan/Rate/Money 等）
                permissions = permissions.filter(p => p !== 'Games');
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
                    const savedPermission = localStorage.getItem(`selectedPermission_${currentCompanyCode}`);
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
            const buttons = document.querySelectorAll('#bankprocess-permission-buttons .maintenance-company-btn');
            buttons.forEach(btn => {
                if (btn.dataset.permission === permission) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            const titleEl = document.getElementById('maintenance-page-title');
            if (titleEl) {
                titleEl.textContent = 'Maintenance - ' + (permission || 'Process');
            }
            if (typeof window.updateSidebarDataCaptureVisibility === 'function' && typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined') {
                window.updateSidebarDataCaptureVisibility(window.SIDEBAR_COMPANY_HAS_GAMBLING);
            }
        }

        function searchData(options = {}) {
            const { silent = false } = options || {};
            const dateFrom = document.getElementById('date_from').value.trim();
            const dateTo = document.getElementById('date_to').value.trim();
            if (!dateFrom || !dateTo) {
                if (!silent) {
                    showNotification('Please select date range', 'error');
                }
                return;
            }
            let url = `api/bankprocess_maintenance/search_api.php?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
            if (currentCompanyId) {
                url += `&company_id=${encodeURIComponent(currentCompanyId)}`;
            }
            if (selectedCurrency) {
                url += `&currency=${encodeURIComponent(selectedCurrency)}`;
            }
            const fromSearchEl = document.getElementById('filter_from_search');
            if (fromSearchEl && fromSearchEl.value.trim()) {
                url += `&q=${encodeURIComponent(fromSearchEl.value.trim())}`;
            }
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = '<tr><td class="maintenance-table-cell" colspan="9" style="text-align: center; padding: 20px;">Loading...</td></tr>';
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('tableContainer').style.display = 'block';
            fetch(url)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        fillTable(data.data);
                        const selectAllCheckbox = document.getElementById('select_all_bankprocess');
                        if (selectAllCheckbox) {
                            selectAllCheckbox.checked = false;
                        }
                        updateDeleteButtonState();
                        if (data.data.length === 0) {
                            document.getElementById('emptyState').style.display = 'block';
                            document.getElementById('tableContainer').style.display = 'none';
                            if (!silent) {
                                showNotification('No bank process transactions found', 'info');
                            }
                        } else {
                            if (!silent) {
                                showNotification(`Found ${data.data.length} record(s)`, 'success');
                            }
                        }
                    } else {
                        if (!silent) {
                            showNotification(data.message || 'Search failed', 'error');
                        }
                        document.getElementById('emptyState').style.display = 'block';
                        document.getElementById('tableContainer').style.display = 'none';
                    }
                })
                .catch(error => {
                    console.error('搜索失败:', error);
                    if (!silent) {
                        showNotification('Search failed: ' + error.message, 'error');
                    }
                    document.getElementById('emptyState').style.display = 'block';
                    document.getElementById('tableContainer').style.display = 'none';
                });
        }

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
                const isDeleted = !!row.is_deleted;
                tr.className = 'maintenance-row' + (isDeleted ? ' maintenance-row-deleted' : '');
                const dateDisplay = row.dts_created ? escapeHtml(row.dts_created) : '-';
                const accountDisplay = row.account ? escapeHtml(row.account) : '-';
                const fromDisplay = escapeHtml(toUpperDisplay(row.from_account));
                const currencyAmountDisplay = formatCurrencyAmountCell(row.currency, row.amount);
                const descriptionDisplay = escapeHtml(
                    row.description != null && String(row.description).trim() !== '' ? String(row.description) : '-'
                );
                const remarkDisplay = escapeHtml(toUpperDisplay(row.remark));
                const submitterDisplay = row.created_by ? escapeHtml(row.created_by) : '-';
                const rowCheckboxHtml = isDeleted
                    ? '<input type="checkbox" class="maintenance-row-checkbox" disabled title="Already deleted">'
                    : `<input type="checkbox" class="maintenance-row-checkbox" data-transaction-id="${row.transaction_id}" onchange="updateDeleteButtonState()">`;
                tr.setAttribute('data-transaction-id', row.transaction_id);
                tr.setAttribute('data-is-deleted', isDeleted ? '1' : '0');
                tr.innerHTML = `
                    <td class="maintenance-table-cell">${index + 1}</td>
                    <td class="maintenance-table-cell">${dateDisplay}</td>
                    <td class="maintenance-table-cell">${accountDisplay}</td>
                    <td class="maintenance-table-cell">${fromDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-currency-amount">${currencyAmountDisplay}</td>
                    <td class="maintenance-table-cell">${descriptionDisplay}</td>
                    <td class="maintenance-table-cell text-uppercase">${remarkDisplay}</td>
                    <td class="maintenance-table-cell">${submitterDisplay}</td>
                    <td class="maintenance-table-cell maintenance-cell-checkbox">
                        ${rowCheckboxHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function toggleSelectAllRows(source) {
            const rowCheckboxes = document.querySelectorAll('.maintenance-row-checkbox:not(:disabled)');
            const targetState = !!source.checked;
            rowCheckboxes.forEach(cb => {
                cb.checked = targetState;
            });
            updateDeleteButtonState();
        }

        function updateDeleteButtonState() {
            const checkboxes = document.querySelectorAll('.maintenance-row-checkbox:not(:disabled)');
            const checkedCheckboxes = document.querySelectorAll('.maintenance-row-checkbox:not(:disabled):checked');
            const deleteBtn = document.getElementById('deleteBtn');
            const confirmCheckbox = document.getElementById('confirmDelete');
            const selectAllCheckbox = document.getElementById('select_all_bankprocess');
            if (selectAllCheckbox && checkboxes.length > 0) {
                const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
                selectAllCheckbox.checked = checkedCount === checkboxes.length;
                selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
            }
            if (checkedCheckboxes.length > 0 && confirmCheckbox.checked) {
                deleteBtn.disabled = false;
            } else {
                deleteBtn.disabled = true;
            }
        }

        function deleteData() {
            const confirmCheckbox = document.getElementById('confirmDelete');
            if (!confirmCheckbox.checked) {
                showNotification('Please confirm deletion by checking the checkbox', 'error');
                return;
            }
            const checkboxes = document.querySelectorAll('.maintenance-row-checkbox:checked');
            if (checkboxes.length === 0) {
                showNotification('Please select at least one record', 'error');
                return;
            }
            const transactionIds = Array.from(checkboxes).map(cb => cb.getAttribute('data-transaction-id'));
            showConfirmDelete(
                `Are you sure you want to delete the selected ${transactionIds.length} Bank process transaction(s)? This action cannot be undone.`,
                function() {
                    fetch('api/bankprocess_maintenance/delete_api.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ transaction_ids: transactionIds })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            notifyTransactionDataChanged();
                            showNotification(data.message || `Deleted ${transactionIds.length} record(s)`, 'success');
                            checkboxes.forEach(cb => cb.checked = false);
                            confirmCheckbox.checked = false;
                            const selectAllCheckbox = document.getElementById('select_all_bankprocess');
                            if (selectAllCheckbox) {
                                selectAllCheckbox.checked = false;
                            }
                            updateDeleteButtonState();
                            setTimeout(() => {
                                searchData({ silent: true });
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

        function initDatePickers() {
            if (typeof window.MaintenanceDateRangePicker !== 'undefined') {
                window.MaintenanceDateRangePicker.init({ onChange: searchData });
            }
        }

        function bindFromSearchControls() {
            const input = document.getElementById('filter_from_search');
            const btn = document.getElementById('filter_from_search_apply');
            const runIfReady = () => {
                const dateFrom = document.getElementById('date_from').value.trim();
                const dateTo = document.getElementById('date_to').value.trim();
                if (dateFrom && dateTo && selectedCurrency) {
                    searchData();
                }
            };
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        runIfReady();
                    }
                });
            }
            // Bank Process List search bar has no explicit search button; keep click support only if present.
            if (btn) btn.addEventListener('click', runIfReady);
        }

        document.addEventListener('DOMContentLoaded', function() {
            initDatePickers();
            bindFromSearchControls();
            updateDeleteButtonState();
            Promise.resolve()
                .then(() => {
                    loadPermissionButtons();
                    return loadCompanyCurrencies();
                })
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
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('success') === '1') {
                showNotification('Operation completed successfully!', 'success');
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (urlParams.get('error') === '1') {
                showNotification('Operation failed. Please try again.', 'error');
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        });
window.switchCompany = switchCompany;
