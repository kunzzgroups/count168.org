/**
 * transaction_maintenance.js - 从 transaction_maintenance.php 提取的逻辑
 * 依赖：页面中需先有 <script> 声明 window.TRANSACTION_MAINTENANCE.currentCompanyId（由 PHP 输出）
 */
(function() {
    'use strict';

    let ownerCompanies = [];
    let currentCompanyId = (typeof window.TRANSACTION_MAINTENANCE !== 'undefined' && window.TRANSACTION_MAINTENANCE.currentCompanyId !== undefined)
        ? window.TRANSACTION_MAINTENANCE.currentCompanyId
        : null;
    let currentCompanyCode = (typeof window.TRANSACTION_MAINTENANCE !== 'undefined' && window.TRANSACTION_MAINTENANCE.currentCompanyCode)
        ? window.TRANSACTION_MAINTENANCE.currentCompanyCode
        : '';
    let selectedPermission = null;
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
        document.getElementById('maintenance_mode_text').textContent = text;

        const items = document.querySelectorAll('.selector-dropdown .dropdown-item');
        items.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-value') === value) {
                item.classList.add('active');
            }
        });

        document.getElementById('maintenance_mode_dropdown').classList.remove('show');

        if (value) {
            window.location.href = value;
        }
    }

    document.addEventListener('click', function(event) {
        const selector = document.querySelector('.restaurant-selector');
        const dropdown = document.getElementById('maintenance_mode_dropdown');
        if (selector && !selector.contains(event.target) && dropdown) {
            dropdown.classList.remove('show');
        }
    });

    function loadOwnerCompanies() {
        return fetch('api/transactions/get_owner_companies_api.php')
            .then(response => response.json())
            .then(data => {
                const wrapper = document.getElementById('companyButtonsWrapper');
                const container = document.getElementById('companyButtonsContainer');

                const companies = data.success && Array.isArray(data.data)
                    ? data.data.filter(company => String(company.company_id || '').trim().toUpperCase() !== 'C168')
                    : []
                if (companies.length > 0 && wrapper && container) {
                    ownerCompanies = companies;
                    container.innerHTML = '';

                    companies.forEach(company => {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'maintenance-company-btn';
                        btn.textContent = company.company_id;
                        btn.dataset.companyId = company.id;
                        btn.addEventListener('click', () => switchCompany(company.id));
                        container.appendChild(btn);
                    });

                    if (!currentCompanyId) {
                        currentCompanyId = companies[0].id;
                    } else {
                        const exists = companies.some(company => parseInt(company.id, 10) === parseInt(currentCompanyId, 10));
                        if (!exists && companies.length > 0) {
                            currentCompanyId = companies[0].id;
                        }
                    }

                    updateCompanyButtonsState();
                    wrapper.style.display = companies.length > 1 ? 'flex' : 'none';
                    const cur = companies.find(c => parseInt(c.id, 10) === parseInt(currentCompanyId, 10));
                    currentCompanyCode = cur ? (cur.company_id || '') : (currentCompanyCode || '');
                    loadPermissionButtons();
                } else if (wrapper) {
                    wrapper.style.display = 'none';
                    ownerCompanies = [];
                    currentCompanyId = null;
                    loadPermissionButtons();
                }
            })
            .catch(error => {
                console.warn('❌ 加载Company列表失败:', error);
                const wrapper = document.getElementById('companyButtonsWrapper');
                if (wrapper) {
                    wrapper.style.display = 'none';
                }
                ownerCompanies = [];
                currentCompanyId = null;
                loadPermissionButtons();
            });
    }

    async function loadPermissionButtons() {
        const filterEl = document.getElementById('maintenance-permission-filter');
        const containerEl = document.getElementById('maintenance-permission-buttons');
        if (!filterEl || !containerEl) return;
        const code = currentCompanyCode || (window.TRANSACTION_MAINTENANCE && window.TRANSACTION_MAINTENANCE.currentCompanyCode) || '';
        if (!code) {
            filterEl.style.display = 'none';
            return;
        }
        try {
            let permissions = await fetchCompanyPermissions(code);
            if (!permissions.length) {
                permissions = ['Games', 'Bank', 'Loan', 'Rate', 'Money'];
            }
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
        if (hasSearched) {
            searchData();
        }
    }

    async function switchCompany(companyId) {
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
        const newCompany = ownerCompanies.find(c => parseInt(c.id, 10) === parseInt(companyId, 10));
        currentCompanyCode = newCompany ? (newCompany.company_id || '') : '';
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
        if (typeof window.updateSidebarDataCaptureVisibility === 'function') {
            const hg = hasGamblingFromSession !== undefined
                ? hasGamblingFromSession
                : (typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' ? window.SIDEBAR_COMPANY_HAS_GAMBLING : false);
            window.updateSidebarDataCaptureVisibility(hg, hasBankFromSession);
        }
        if (window.TRANSACTION_MAINTENANCE) {
            window.TRANSACTION_MAINTENANCE.currentCompanyId = currentCompanyId;
        }
        updateCompanyButtonsState();
        loadPermissionButtons();
        loadProcesses();
        if (hasSearched) {
            searchData();
        }
    }

    function updateCompanyButtonsState() {
        const buttons = document.querySelectorAll('#companyButtonsContainer .maintenance-company-btn');
        buttons.forEach(btn => {
            if (parseInt(btn.dataset.companyId, 10) === parseInt(currentCompanyId, 10)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

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

                    const previousValue = processButton.getAttribute('data-value') || '';

                    optionsContainer.innerHTML = '';

                    const allOption = document.createElement('div');
                    allOption.className = 'custom-select-option';
                    allOption.textContent = '--Select All--';
                    allOption.setAttribute('data-value', '');
                    if (!previousValue) {
                        allOption.classList.add('selected');
                        processButton.textContent = '--Select All--';
                    }
                    optionsContainer.appendChild(allOption);

                    data.data.forEach(process => {
                        const option = document.createElement('div');
                        option.className = 'custom-select-option';
                        const displayText = process.description
                            ? `${process.process_name} (${process.description})`
                            : process.process_name;
                        option.textContent = displayText;
                        option.setAttribute('data-value', process.process_name);

                        if (previousValue && process.process_name === previousValue) {
                            option.classList.add('selected');
                            processButton.textContent = displayText;
                            processButton.setAttribute('data-value', process.process_name);
                        }

                        optionsContainer.appendChild(option);
                    });

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

    function initProcessSelect() {
        const processButton = document.getElementById('filter_process');
        const dropdown = document.getElementById('filter_process_dropdown');
        const searchInput = dropdown?.querySelector('.custom-select-search input');
        const optionsContainer = dropdown?.querySelector('.custom-select-options');

        if (!processButton || !dropdown || !searchInput || !optionsContainer) return;

        let isOpen = false;
        let filteredOptions = [];

        function updateOptions(filterText = '') {
            const filterLower = filterText.toLowerCase().trim();
            const allOptions = Array.from(optionsContainer.querySelectorAll('.custom-select-option'));

            filteredOptions = allOptions.filter(option => {
                const text = option.textContent.toLowerCase();
                const matches = !filterLower || text.includes(filterLower);
                option.style.display = matches ? '' : 'none';
                return matches;
            });

            allOptions.forEach(opt => opt.classList.remove('selected'));

            const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
            if (visibleOptions.length > 0) {
                visibleOptions[0].classList.add('selected');
            }

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

        function selectOption(option) {
            const value = option.getAttribute('data-value');
            const text = option.textContent;

            processButton.textContent = text;
            if (value) {
                processButton.setAttribute('data-value', value);
            } else {
                processButton.removeAttribute('data-value');
            }

            optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            option.classList.add('selected');

            processButton.dispatchEvent(new Event('change', { bubbles: true }));

            toggleDropdown();
        }

        processButton.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleDropdown();
        });

        searchInput.addEventListener('input', function() {
            updateOptions(this.value);
        });

        optionsContainer.addEventListener('click', function(e) {
            const option = e.target.closest('.custom-select-option');
            if (option && option.style.display !== 'none') {
                selectOption(option);
            }
        });

        document.addEventListener('click', function(e) {
            if (!processButton.contains(e.target) && !dropdown.contains(e.target)) {
                if (isOpen) {
                    toggleDropdown();
                }
            }
        });

        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                toggleDropdown();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
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

    function searchData() {
        const processButton = document.getElementById('filter_process');
        const process = processButton?.getAttribute('data-value') || '';
        const dateFrom = document.getElementById('date_from').value.trim();
        const dateTo = document.getElementById('date_to').value.trim();

        if (!dateFrom || !dateTo) {
            showNotification('Please select date range', 'error');
            return;
        }

        let categoryToSend = selectedPermission;
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

    function initDatePickers() {
        if (typeof flatpickr === 'undefined') {
            console.error('Flatpickr library not loaded');
            return;
        }

        flatpickr("#date_from", {
            dateFormat: "d/m/Y",
            allowInput: false,
            defaultDate: new Date(),
            onChange: handleDateFilterChange
        });

        flatpickr("#date_to", {
            dateFormat: "d/m/Y",
            allowInput: false,
            defaultDate: new Date(),
            onChange: handleDateFilterChange
        });
    }

    function handleDateFilterChange() {
        const dateFrom = document.getElementById('date_from');
        const dateTo = document.getElementById('date_to');
        if (dateFrom && dateTo && dateFrom.value && dateTo.value) {
            searchData();
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

    document.addEventListener('DOMContentLoaded', function() {
        if (typeof window.SIDEBAR_COMPANY_HAS_GAMBLING !== 'undefined' && window.SIDEBAR_COMPANY_HAS_GAMBLING === false) {
            window.location.href = 'dashboard.php';
            return;
        }
        initDatePickers();
        initMaintenanceDropdownHover();

        initAutoSearchFilters();

        loadOwnerCompanies()
            .catch(() => {})
            .finally(() => {
                loadProcesses()
                    .catch(() => {})
                    .finally(() => {
                        initProcessSelect();
                        searchData();
                    });
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
})();