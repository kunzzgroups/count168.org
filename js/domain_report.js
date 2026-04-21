function showNotification(message, type = 'success') {
    const container = document.getElementById('domainReportNotificationContainer');

    const existingNotifications = container.querySelectorAll('.account-notification');
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
    notification.className = `account-notification account-notification-${type}`;
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
    }, 1500);
}

function formatAmount(amount) {
    let num = Number(amount || 0);
    // 避免出现 -0.00 的情况，接近 0 的负数直接当成 0 处理
    if (Math.abs(num) < 0.005) {
        num = 0;
    }
    return num.toFixed(2);
}

let currentCompanyId = typeof window.DOMAIN_REPORT_COMPANY_ID !== 'undefined' ? window.DOMAIN_REPORT_COMPANY_ID : null;
let loadReportTimeout;

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

// Company filtering is now handled by SSR includes/company_filter.php
async function switchCompany(companyId, companyCode) {
    // 先更新 session
    try {
        const response = await fetch(`api/session/update_company_session_api.php?company_id=${companyId}`);
        const result = await response.json();
        if (!result.success) {
            console.error('更新 session 失败:', result.error);
            // 即使 API 失败，也继续更新前端状态
        } else if (typeof window.updateSidebarDataCaptureVisibility === 'function' && result.data) {
            window.updateSidebarDataCaptureVisibility(result.data.has_gambling, result.data.has_bank);
        }
    } catch (error) {
        console.error('更新 session 时出错:', error);
        // 即使 API 失败，也继续更新前端状态
    }
    
    currentCompanyId = companyId;
    const permissions = await fetchCompanyPermissions(companyCode || '');
    if (isBankOnlyCategoryCompany(permissions)) {
        window.location.href = 'dashboard.php';
        return;
    }

    const buttons = document.querySelectorAll('#company-buttons-container .transaction-company-btn');
    buttons.forEach(btn => {
        if (parseInt(btn.dataset.companyId, 10) === parseInt(companyId, 10)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    Promise.all([
        loadProcesses()
    ]).then(() => {
        loadReport();
    });
}

function debouncedLoadReport() {
    clearTimeout(loadReportTimeout);
    loadReportTimeout = setTimeout(() => {
        loadReport();
    }, 300);
}

async function loadProcesses() {
    try {
        const params = new URLSearchParams();
        params.append('action', 'processes');
        if (currentCompanyId) {
            params.append('company_id', currentCompanyId);
        }
        const response = await fetch(`api/reports/domain_report_api.php?${params.toString()}`);
        const data = await response.json();
        if (data.success) {
            const processButton = document.getElementById('processSelect');
            const dropdown = document.getElementById('processSelect_dropdown');
            const optionsContainer = dropdown?.querySelector('.custom-select-options');
            
            if (!processButton || !dropdown || !optionsContainer) return;
            
            // Save previously selected value
            const previousValue = processButton.getAttribute('data-value') || '';
            
            // Clear options
            optionsContainer.innerHTML = '';
            
            // Add "All Process" option
            const allOption = document.createElement('div');
            allOption.className = 'custom-select-option';
            allOption.textContent = 'All Process';
            allOption.setAttribute('data-value', '');
            if (!previousValue) {
                allOption.classList.add('selected');
                processButton.textContent = 'All Process';
            }
            optionsContainer.appendChild(allOption);
            
            // Add all process options
            data.data.forEach(process => {
                const option = document.createElement('div');
                option.className = 'custom-select-option';
                option.textContent = process.display_text;
                option.setAttribute('data-value', process.id);
                
                // If current value matches, mark as selected
                if (previousValue && process.id === previousValue) {
                    option.classList.add('selected');
                    processButton.textContent = process.display_text;
                    processButton.setAttribute('data-value', process.id);
                }
                
                optionsContainer.appendChild(option);
            });
            
            // If no value selected, show placeholder
            if (!previousValue) {
                processButton.textContent = processButton.getAttribute('data-placeholder') || 'All Process';
                processButton.removeAttribute('data-value');
            }
        }
    } catch (error) {
        console.error('Error loading processes:', error);
    }
}

// Initialize custom select for process
function initProcessSelect() {
    const processButton = document.getElementById('processSelect');
    const dropdown = document.getElementById('processSelect_dropdown');
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

let domainReportDateFrom = '';
let domainReportDateTo = '';

// Convert dd/mm/yyyy (from date-range-picker) to Y-m-d for API
function parseDdMmYyyyToYmd(str) {
    if (!str || typeof str !== 'string') return '';
    const parts = str.trim().split(/[/\-.]/);
    if (parts.length !== 3) return '';
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2];
    if (day.length > 2 || month.length > 2 || year.length !== 4) return '';
    return year + '-' + month + '-' + day;
}

function syncDomainReportDatesFromPicker() {
    const fromEl = document.getElementById('date_from');
    const toEl = document.getElementById('date_to');
    if (fromEl && toEl) {
        domainReportDateFrom = parseDdMmYyyyToYmd(fromEl.value);
        domainReportDateTo = parseDdMmYyyyToYmd(toEl.value);
    }
}

function initDomainReportDateRange() {
    syncDomainReportDatesFromPicker();
    if (typeof window.MaintenanceDateRangePicker !== 'undefined') {
        window.MaintenanceDateRangePicker.init({
            onChange: function() {
                syncDomainReportDatesFromPicker();
                debouncedLoadReport();
            }
        });
    }
}

async function loadReport() {
    const processButton = document.getElementById('processSelect');
    const processId = processButton?.getAttribute('data-value') || '';
    const dateFrom = domainReportDateFrom;
    const dateTo = domainReportDateTo;

    if (!dateFrom || !dateTo) {
        showNotification('Please select start date and end date', 'danger');
        return;
    }

    if (dateFrom > dateTo) {
        showNotification('Start date cannot be greater than end date', 'danger');
        return;
    }

    try {
        const params = new URLSearchParams();
        params.append('date_from', dateFrom);
        params.append('date_to', dateTo);
        if (processId) {
            params.append('process_id', processId);
        }
        if (currentCompanyId) {
            params.append('company_id', currentCompanyId);
        }

        const response = await fetch(`api/reports/domain_report_api.php?${params.toString()}`);
        const result = await response.json();

        if (result.success) {
            renderReport(result.data, result.totals);
        } else {
            showNotification(result.message || result.error || 'Failed to get report data', 'danger');
            renderError(result.message || result.error || 'Failed to get report data');
        }
    } catch (error) {
        console.error('Error loading domain report:', error);
        showNotification('Network connection failed', 'danger');
        renderError('Network connection failed');
    }
}

function renderError(message) {
    const container = document.getElementById('domainReportBody');
    container.innerHTML = `
        <div class="domain-report-card">
            <div class="domain-report-card-item" style="grid-column: 1 / -1; text-align: center; justify-content: center; padding: 20px; color: #ef4444;">
                ${message}
            </div>
        </div>
    `;
    document.getElementById('domainReportTotal').style.display = 'none';
}

function renderReport(data, totals = null) {
    const container = document.getElementById('domainReportBody');
    container.innerHTML = '';

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="domain-report-card">
                <div class="domain-report-card-item" style="grid-column: 1 / -1; text-align: center; justify-content: center; padding: 20px;">
                    No data found
                </div>
            </div>
        `;
        document.getElementById('domainReportTotal').style.display = 'none';
        return;
    }

    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'domain-report-card';
        const label = item.description ? `${item.process} (${item.description})` : item.process;
        const winLoseValue = Number(item.win_lose || 0);
        const winLoseClass = winLoseValue > 0 ? 'domain-report-win-lose-positive' : (winLoseValue < 0 ? 'domain-report-win-lose-negative' : '');
        card.innerHTML = `
            <div class="domain-report-card-item">${label}</div>
            <div class="domain-report-card-item domain-report-amount"><strong>${formatAmount(item.turnover)}</strong></div>
            <div class="domain-report-card-item domain-report-amount"><strong>${formatAmount(item.win)}</strong></div>
            <div class="domain-report-card-item domain-report-amount"><strong>${formatAmount(item.lose)}</strong></div>
            <div class="domain-report-card-item domain-report-amount ${winLoseClass}"><strong>${formatAmount(item.win_lose)}</strong></div>
        `;
        container.appendChild(card);
    });

    const totalTurnover = totals?.turnover ?? data.reduce((sum, item) => sum + Number(item.turnover || 0), 0);
    const totalWin = totals?.win ?? data.reduce((sum, item) => sum + Number(item.win || 0), 0);
    const totalLose = totals?.lose ?? data.reduce((sum, item) => sum + Number(item.lose || 0), 0);
    const totalWinLose = totals?.win_lose ?? (totalWin - totalLose);

    document.getElementById('totalTurnover').innerHTML = '<strong>' + formatAmount(totalTurnover) + '</strong>';
    document.getElementById('totalWin').innerHTML = '<strong>' + formatAmount(totalWin) + '</strong>';
    document.getElementById('totalLose').innerHTML = '<strong>' + formatAmount(totalLose) + '</strong>';
    
    const totalWinLoseElement = document.getElementById('totalWinLose');
    const totalWinLoseClass = totalWinLose > 0 ? 'domain-report-win-lose-positive' : (totalWinLose < 0 ? 'domain-report-win-lose-negative' : '');
    totalWinLoseElement.className = 'domain-report-amount ' + totalWinLoseClass;
    totalWinLoseElement.innerHTML = '<strong>' + formatAmount(totalWinLose) + '</strong>';
    
    document.getElementById('domainReportTotal').style.display = 'grid';
}

document.addEventListener('DOMContentLoaded', async () => {
    let modeCode = typeof window.SIDEBAR_COMPANY_CODE !== 'undefined' ? String(window.SIDEBAR_COMPANY_CODE) : '';
    if (!modeCode && typeof window.DOMAIN_REPORT_COMPANY_ID !== 'undefined') {
        modeCode = String(window.DOMAIN_REPORT_COMPANY_ID);
    }
    if (modeCode) {
        let rawMode = localStorage.getItem('selectedPermission_' + modeCode);
        if (rawMode === 'Gambling') rawMode = 'Games';
        if (rawMode === 'Bank') {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = 'dashboard.php';
            }
            return;
        }
    }

    initDomainReportDateRange();
    // Company filter loaded via SSR
    await loadProcesses();
    
    // Initialize custom select
    initProcessSelect();
    
    await loadReport();

    document.getElementById('processSelect').addEventListener('change', debouncedLoadReport);
});