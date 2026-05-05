/**
 * transaction.js - from transaction.php
 */
(function () {
    'use strict';
    let lastSearchData = null;
    let currentCompanyId = (typeof window.TRANSACTION_PAGE !== 'undefined' && window.TRANSACTION_PAGE.currentCompanyId !== undefined) ? window.TRANSACTION_PAGE.currentCompanyId : null;
    const viewerRole = (typeof window.TRANSACTION_PAGE !== 'undefined' && window.TRANSACTION_PAGE.viewerRole !== undefined) ? window.TRANSACTION_PAGE.viewerRole : '';
    const canApproveContra = (typeof window.TRANSACTION_PAGE !== 'undefined' && window.TRANSACTION_PAGE.canApproveContra !== undefined) ? window.TRANSACTION_PAGE.canApproveContra : false;
    let selectedCurrencies = []; let showAllCurrencies = false; let ownerCompanies = []; let currencyList = []; let currentDisplayData = { left_table: [], right_table: [] };
    let lastSearchCommitMs = 0;
    let externalRefreshRetryTimer = null;
    const showDescriptionColumn = (typeof window.TRANSACTION_PAGE !== 'undefined' && window.TRANSACTION_PAGE.showDescriptionColumn !== undefined) ? window.TRANSACTION_PAGE.showDescriptionColumn : false;
    const RATE_TYPE_VALUE = 'RATE';
    let isSubmittingTx = false;
    let activeSearchController = null;
    let isSearchInFlight = false;
    let activeSearchKey = '';
    let lastCompletedSearchKey = '';
    let lastCompletedSearchTs = 0;

    function syncSubmitButtonState() {
        const confirmCheckbox = document.getElementById('confirm_submit');
        const submitBtn = document.getElementById('submit_btn');
        if (!submitBtn) return;
        if (isSubmittingTx) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            return;
        }
        submitBtn.textContent = 'Submit';
        submitBtn.disabled = !(confirmCheckbox && confirmCheckbox.checked);
    }

    function isRateTypeSelected() {
        const typeSel = document.getElementById('transaction_type');
        return typeSel && typeSel.value === RATE_TYPE_VALUE;
    }

    // ==================== 数字格式化函数 ====================
    function formatNumber(num) {
        try {
            return MoneyDecimal.formatThousands(num, 2);
        } catch (_) {
            return '0.00';
        }
    }

    /**
     * Payment History 专用：history_api 已给两位小数时直接加千分位，避免 parseFloat(-40.80)+Math.trunc 变成 -40.79。
     * 非标准两位时：与 datacapture 一致 epsilon + 向 0 截断再 toLocaleString。
     */
    function formatPaymentHistoryMoney(value) {
        if (value === '-' || value === null || value === undefined) return '-';
        const cleaned = String(value).replace(/,/g, '').trim();
        if (cleaned === '' || cleaned === '-') return '0.00';
        try {
            return MoneyDecimal.formatThousands(cleaned, 2);
        } catch (_) {
            return '0.00';
        }
    }

    // ==================== 文本转大写显示 ====================
    function toUpperDisplay(value) {
        if (value === null || value === undefined) {
            return '-';
        }
        const str = String(value).trim();
        return str ? str.toUpperCase() : '-';
    }

    // ==================== RATE 计算（支持乘法/除法） ====================
    function parseRateExpression(rawValue) {
        const raw = String(rawValue ?? '').trim();
        if (!raw) {
            return { valid: false, value: 0 };
        }

        const normalized = raw.replace(/÷/g, '/').replace(/\s+/g, '');
        if (!normalized) {
            return { valid: false, value: 0 };
        }

        // 兼容 "/3" 语法，表示除以 3（即乘以 1/3）
        if (/^\/\d*\.?\d+$/.test(normalized)) {
            let divisor;
            try {
                divisor = MoneyDecimal.toDecimal(normalized.slice(1));
            } catch (_) {
                return { valid: false, value: 0 };
            }
            if (divisor.lte(0)) return { valid: false, value: 0 };
            return { valid: true, value: MoneyDecimal.div('1', divisor).toString() };
        }

        // 仅允许数字、小数点、*、/；不允许其他字符
        if (!/^[0-9.*/]+$/.test(normalized)) {
            return { valid: false, value: 0 };
        }
        // 防止连续运算符或首尾运算符
        if (/^[*/]|[*/]$|[*/]{2,}/.test(normalized)) {
            return { valid: false, value: 0 };
        }

        const tokens = normalized.split(/([*/])/).filter(Boolean);
        if (tokens.length === 0) {
            return { valid: false, value: 0 };
        }
        if (!/^\d*\.?\d+$/.test(tokens[0])) {
            return { valid: false, value: 0 };
        }

        let result;
        try {
            result = MoneyDecimal.toDecimal(tokens[0]);
        } catch (_) {
            return { valid: false, value: 0 };
        }
        if (result.lte(0)) return { valid: false, value: 0 };

        for (let i = 1; i < tokens.length; i += 2) {
            const op = tokens[i];
            const numToken = tokens[i + 1];
            if (!numToken || !/^\d*\.?\d+$/.test(numToken)) {
                return { valid: false, value: 0 };
            }
            let value;
            try {
                value = MoneyDecimal.toDecimal(numToken);
            } catch (_) {
                return { valid: false, value: 0 };
            }
            if (op === '*') {
                result = result.times(value);
            } else if (op === '/') {
                if (value.isZero()) {
                    return { valid: false, value: 0 };
                }
                result = result.div(value);
            } else {
                return { valid: false, value: 0 };
            }
        }

        if (result.lte(0)) {
            return { valid: false, value: 0 };
        }
        return { valid: true, value: result.toString() };
    }

    function formatRateAmount(value) {
        return MoneyDecimal.formatFixedHalfUp(value || '0', 2);
    }

    /** Win/Loss 合计累加用 win_loss_full（与 search_api calculateTotals 一致），再 ROUND_DOWN 到 2 位；勿逐行 trunc2 累加，否则左右脚轧差（如 -0.37）。 */
    function winLossFullForTotal(row) {
        const raw = row && row.win_loss_full !== undefined && row.win_loss_full !== null && String(row.win_loss_full).trim() !== ''
            ? row.win_loss_full
            : (row && row.win_loss != null && row.win_loss !== '-' ? row.win_loss : '0');
        const cleaned = String(raw).replace(/,/g, '').trim();
        if (cleaned === '' || cleaned === '-') return '0';
        return cleaned;
    }

    // ==================== Contra Inbox（Manager+） ====================
    function isContraInboxOpen() {
        const pop = document.getElementById('contraInboxPopover');
        return !!pop && pop.style.display !== 'none';
    }
    function openContraInbox() {
        const pop = document.getElementById('contraInboxPopover');
        if (!pop) return;
        pop.style.display = 'block';
    }
    function closeContraInbox() {
        const pop = document.getElementById('contraInboxPopover');
        if (!pop) return;
        pop.style.display = 'none';
    }

    function renderContraInbox(items) {
        const tbody = document.getElementById('contraInboxTbody');
        const countEl = document.getElementById('contraInboxCount');
        const countEl2 = document.getElementById('contraInboxCount2');
        if (!tbody || !countEl) return;

        const count = Array.isArray(items) ? items.length : 0;
        countEl.textContent = String(count);
        if (countEl2) countEl2.textContent = String(count);

        if (count === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="padding:10px 8px; color:#6b7280;">No pending contra.</td></tr>';
            return;
        }
        tbody.innerHTML = items.map(row => {
            const safeDesc = (row.description || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `
            <tr>
                <td>${row.transaction_date || '-'}</td>
                <td>${(row.from_account_code || '-')}${row.from_account_name ? ' - ' + row.from_account_name : ''}</td>
                <td>${(row.to_account_code || '-')}${row.to_account_name ? ' - ' + row.to_account_name : ''}</td>
                <td>${(row.currency || '-')}</td>
                <td>${formatNumber(row.amount || 0)}</td>
                <td>${row.submitted_by || '-'}</td>
                <td>${safeDesc || '-'}</td>
                <td>
                    <button type="button" class="contra-inbox-btn contra-inbox-approve" onclick="approveContra(${row.id})">Approve</button>
                    <button type="button" class="contra-inbox-btn contra-inbox-reject" onclick="rejectContra(${row.id})">Reject</button>
                </td>
            </tr>
        `;
        }).join('');
    }

    function buildContraInboxUrl() {
        let url = '/api/transactions/contra_inbox_api.php';
        if (currentCompanyId) {
            url += `?company_id=${currentCompanyId}`;
        }
        return url;
    }

    function loadContraInbox() {
        if (!canApproveContra) return Promise.resolve();

        return fetch(buildContraInboxUrl(), { method: 'GET', cache: 'no-cache' })
            .then(r => r.json())
            .then(data => {
                if (data && data.success) {
                    renderContraInbox(data.data || []);
                } else {
                    renderContraInbox([]);
                }
            })
            .catch(err => {
                console.error('❌ Contra inbox load failed:', err);
                // 不弹出 error，避免干扰主流程
            })
            .finally(() => { });
    }

    function approveContra(transactionId) {
        if (!canApproveContra) return;
        const id = parseInt(transactionId, 10);
        if (!id) return;

        const form = new FormData();
        form.append('transaction_id', String(id));
        if (currentCompanyId) {
            form.append('company_id', String(currentCompanyId));
        }

        fetch('/api/transactions/contra_approve_api.php', {
            method: 'POST',
            body: form
        })
            .then(r => r.json())
            .then(data => {
                if (data && data.success) {
                    showNotification('Approved', 'success');
                    // 刷新 inbox + 刷新表格（未批准的 contra 之前被排除，批准后要立即生效）
                    return Promise.all([loadContraInbox(), searchTransactions()]);
                }
                showNotification((data && (data.error || data.message)) || 'Approve failed', 'error');
            })
            .catch(err => {
                console.error('❌ Approve contra failed:', err);
                showNotification('Approve failed: ' + err.message, 'error');
            });
    }

    function rejectContra(transactionId) {
        if (!canApproveContra) return;
        const id = parseInt(transactionId, 10);
        if (!id) return;

        if (!confirm('确定要拒绝这条 Contra 交易吗？拒绝后数据将被永久删除。')) {
            return;
        }

        const form = new FormData();
        form.append('transaction_id', String(id));
        if (currentCompanyId) {
            form.append('company_id', String(currentCompanyId));
        }

        fetch('/api/transactions/contra_reject_api.php', {
            method: 'POST',
            body: form
        })
            .then(r => r.json())
            .then(data => {
                if (data && data.success) {
                    showNotification('Rejected', 'success');
                    // 刷新 inbox（拒绝后数据已删除，不需要刷新表格）
                    return loadContraInbox();
                }
                showNotification((data && (data.error || data.message)) || 'Reject failed', 'error');
            })
            .catch(err => {
                console.error('❌ Reject contra failed:', err);
                showNotification('Reject failed: ' + err.message, 'error');
            });
    }

    // ==================== 获取 Role 对应的 CSS Class ====================
    function getRoleClass(role) {
        if (!role) return '';
        const roleLower = String(role).toLowerCase().trim();
        // 返回对应的 CSS class 名称
        const roleMap = {
            'capital': 'transaction-role-capital',
            'bank': 'transaction-role-bank',
            'cash': 'transaction-role-cash',
            'profit': 'transaction-role-profit',
            'expenses': 'transaction-role-expenses',
            'company': 'transaction-role-company',
            'partner': 'transaction-role-partner',
            'staff': 'transaction-role-staff',
            'upline': 'transaction-role-upline',
            'agent': 'transaction-role-agent',
            'member': 'transaction-role-member',
            'debtor': 'transaction-role-debtor',
            'none': 'transaction-role-none'
        };
        return roleMap[roleLower] || '';
    }

    function getSingleSelectedCategoryRoleClass() {
        const selectedCategories = getSelectedCategories();
        if (!Array.isArray(selectedCategories) || selectedCategories.length !== 1) return '';
        const selected = selectedCategories[0];
        if (selected) {
            return getRoleClass(selected);
        }

        const selectedTags = document.querySelectorAll('#category_selected_tags .category-tag[data-category-value]');
        if (selectedTags.length === 1) {
            const tagValue = selectedTags[0].getAttribute('data-category-value') || '';
            if (tagValue) return getRoleClass(tagValue);
        }

        return '';
    }

    // ==================== 获取 Role 的排序优先级 ====================
    function getRoleSortOrder(role) {
        if (!role) return 999; // 没有 role 的排在最后
        const roleLower = String(role).toLowerCase().trim();
        // 定义 role 的排序顺序（与下拉菜单顺序一致）
        const roleOrder = {
            'capital': 1,
            'bank': 2,
            'cash': 3,
            'profit': 4,
            'expenses': 5,
            'company': 6,
            'staff': 7,
            'upline': 8,
            'agent': 9,
            'member': 10,
            'none': 11
        };
        return roleOrder[roleLower] || 999; // 未知 role 排在最后
    }

    // ==================== 按 Role 排序数据 ====================
    function sortByRole(data) {
        return [...data].sort((a, b) => {
            const roleA = getRoleSortOrder(a.role);
            const roleB = getRoleSortOrder(b.role);

            // 先按 role 排序
            if (roleA !== roleB) {
                return roleA - roleB;
            }

            // 如果 role 相同，按 account_id 排序
            return (a.account_id || '').localeCompare(b.account_id || '');
        });
    }

    // ==================== Remark 显示控制 ====================
    function getHistoryRemark(row) {
        // 优先使用 remark，如果没有则使用 sms
        if (row.remark && row.remark.trim() !== '') {
            return toUpperDisplay(row.remark);
        }
        return toUpperDisplay(row.sms || '-');
    }

    // ==================== 页面初始化 ====================
    document.addEventListener('DOMContentLoaded', function () {
        console.log('Transaction Payment 页面已加载');

        // 初始化日期选择器
        initDatePickers();

        // 初始化确认提交功能
        handleConfirmSubmit();

        // 初始化 Excel 复制样式功能
        initExcelCopyWithStyles();

        // 绑定类型切换
        const typeSel = document.getElementById('transaction_type');
        if (typeSel) {
            typeSel.addEventListener('change', handleTypeToggle);
            handleTypeToggle();
        }

        // 绑定复选框
        const showNameCk = document.getElementById('show_name');
        if (showNameCk) {
            showNameCk.addEventListener('change', toggleShowName);
            // 如果复选框默认选中，初始化显示 Name 列
            if (showNameCk.checked) {
                toggleShowName();
            }
        }

        const showCaptureOnlyCk = document.getElementById('show_capture_only');
        if (showCaptureOnlyCk) {
            // show_capture_only 需要在后端处理，所以重新搜索
            showCaptureOnlyCk.addEventListener('change', () => {
                if (document.getElementById('date_from').value && document.getElementById('date_to').value) {
                    searchTransactions();
                }
            });
        }

        const showInactiveCk = document.getElementById('show_inactive');
        if (showInactiveCk) {
            // Show Payment Only 改为每次勾选/取消都重新搜索，
            // 由后端 + applyZeroBalanceFilterAndRender 一起决定最终显示的数据
            showInactiveCk.addEventListener('change', () => {
                const dateFrom = document.getElementById('date_from').value;
                const dateTo = document.getElementById('date_to').value;
                if (dateFrom && dateTo) {
                    searchTransactions();
                }
            });
        }

        const showZeroCk = document.getElementById('show_zero_balance');
        if (showZeroCk) {
            // Show 0 balance 影响后端返回的 (account,currency) 范围（只返回 active 货币），勾选/取消时需重新搜索
            showZeroCk.addEventListener('change', handleCheckboxChange);
        }

        // 绑定关闭弹窗
        const modalClose = document.getElementById('modal_close');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                document.getElementById('historyModal').style.display = 'none';
            });
        }

        // Maintenance / Post 对交易有变更后，回到本页自动静默重搜，清掉残留 Win/Loss 展示。
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            refreshTransactionDataFromExternalChange();
        });
        // Other tabs write invalidate timestamp to localStorage; this tab should refresh immediately.
        window.addEventListener('storage', (e) => {
            if (!e || e.key !== TX_LIST_INVALIDATE_LS_KEY) return;
            refreshTransactionDataFromExternalChange();
        });
        // Same-tab updates (custom event) for flows that don't trigger storage in current document.
        window.addEventListener(TX_DATA_CHANGED_EVENT, () => {
            refreshTransactionDataFromExternalChange();
        });
        // Fallback: if browser throttles/drops events, poll invalidate mark while visible.
        setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            refreshTransactionDataFromExternalChange();
        }, 5000);

        // 绑定右侧工作区的 Search 按钮：执行完整日期搜索（不受右侧 Type 选择影响）
        const actionSearchBtn = document.getElementById('action_search_btn');
        if (actionSearchBtn) {
            actionSearchBtn.addEventListener('click', searchTransactions);
        }

        const reverseBtn = document.getElementById('account_reverse_btn');
        if (reverseBtn) {
            reverseBtn.addEventListener('click', handleReverseAccounts);
        }
        const rateReverseBtn = document.getElementById('rate_account_reverse_btn');
        if (rateReverseBtn) {
            rateReverseBtn.addEventListener('click', handleReverseAccounts);
        }
        const rateTransferReverseBtn = document.getElementById('rate_transfer_reverse_btn');
        if (rateTransferReverseBtn) {
            rateTransferReverseBtn.addEventListener('click', handleReverseAccounts);
        }

        // 绑定 Middle-Man Amount 自动计算
        initMiddleManAmountCalculation();

        // 🆕 加载分类列表和 company 列表 → 先加载 currency（再搜，保证带 currency 参数）→ 账户与搜索
        Promise.all([
            loadCategories()
        ]).then(() => {
            console.log('🔍 init 完成，currentCompanyId:', currentCompanyId);
            ensureDefaultDates();

            if (!currentCompanyId) {
                console.warn('⚠️ currentCompanyId 为 null，短暂延迟后加载 currency');
                return new Promise(resolve => {
                    setTimeout(() => loadCompanyCurrencies().then(resolve), 50);
                });
            }
            return loadCompanyCurrencies();
        }).then(() => {
            if (currencyList.length === 0) {
                showNotification('No currency available for current company', 'info');
                return loadAccounts().then(() => { initCustomSelects(); });
            }
            // 首次进入：先恢复同一会话内的列表缓存（秒开），再优先请求 search_api；账户下拉延后一帧，避免与列表抢库
            const hadSessionReplay = tryRestoreTxListSearchFromSession();
            searchTransactions(true, { silent: hadSessionReplay });
            setTimeout(() => {
                loadAccounts().then(() => {
                    initCustomSelects();
                    bindContraCurrencyAutoSync();
                });
            }, 0);
        }).catch(error => {
            console.error('❌ 初始数据加载失败:', error);
            showNotification('Failed to load initial data', 'error');
        });

        // Contra Inbox：一个按钮，点击才展开整行（展开时自动刷新）
        const inboxBtn = document.getElementById('contraInboxBtn');
        if (inboxBtn) {
            inboxBtn.addEventListener('click', () => {
                const willOpen = !isContraInboxOpen();
                if (willOpen) {
                    openContraInbox();
                    loadContraInbox();
                } else {
                    closeContraInbox();
                }
            });
        }

        const inboxRefresh = document.getElementById('contraInboxRefreshBtn');
        if (inboxRefresh) {
            inboxRefresh.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                loadContraInbox();
            });
        }

        // 页面初始化时先拉一次 pending 数量，避免未点开前角标一直显示 0
        if (canApproveContra) {
            loadContraInbox();
        }

        // 点击外部关闭 Popover
        document.addEventListener('click', (e) => {
            if (!canApproveContra) return;
            const wrap = document.getElementById('contraInboxWrap');
            if (!wrap) return;
            if (!wrap.contains(e.target)) {
                closeContraInbox();
            }
        });
    });

    // ==================== 加载分类列表 ====================
    function loadCategories() {
        return fetch('/api/transactions/get_categories_api.php')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const categoryOptionsContainer = document.getElementById('category_options_container');
                    categoryOptionsContainer.innerHTML = ''; // 清空现有选项

                    data.data.forEach(role => {
                        const optionDiv = document.createElement('div');
                        optionDiv.className = 'category-option';

                        const label = document.createElement('label');
                        label.className = 'category-checkbox-label';

                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'category-checkbox';
                        checkbox.value = role;

                        const span = document.createElement('span');
                        span.textContent = role.toUpperCase(); // 确保显示为大写

                        label.appendChild(checkbox);
                        label.appendChild(span);
                        optionDiv.appendChild(label);
                        categoryOptionsContainer.appendChild(optionDiv);
                    });

                    // 添加事件监听器
                    setupCategoryDropdown();
                    console.log('✅ 分类列表加载成功');
                }
                return data;
            })
            .catch(error => {
                console.error(' 加载分类列表失败:', error);
                showNotification('Failed to load category list', 'error');
                throw error;
            });
    }

    // ==================== 分类多选下拉框功能 ====================
    function setupCategoryDropdown() {
        const dropdownButton = document.getElementById('category_dropdown_button');
        const dropdownMenu = document.getElementById('category_dropdown_menu');
        const categoryAllCheckbox = document.getElementById('category_all');
        const categoryCheckboxes = document.querySelectorAll('.category-checkbox:not(#category_all)');

        // 切换下拉菜单显示
        dropdownButton.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });

        // 点击外部关闭下拉菜单
        document.addEventListener('click', function (e) {
            if (!dropdownButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('show');
            }
        });

        // "Select All" 复选框逻辑
        categoryAllCheckbox.addEventListener('change', function () {
            const isChecked = this.checked;
            categoryCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            updateCategoryDisplay();
            searchTransactions(); // 触发搜索
        });

        // 单个分类复选框逻辑
        categoryCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                updateCategoryDisplay();
                updateSelectAllCheckbox();
                searchTransactions(); // 触发搜索
            });
        });
    }

    // 更新分类显示文本
    function updateCategoryDisplay() {
        const selectedTagsContainer = document.getElementById('category_selected_tags');
        const categoryAllCheckbox = document.getElementById('category_all');
        const categoryCheckboxes = document.querySelectorAll('.category-checkbox:not(#category_all)');

        if (categoryAllCheckbox.checked) {
            selectedTagsContainer.innerHTML = '<span class="category-placeholder">--Select All--</span>';
            return;
        }

        const selectedCategories = [];
        categoryCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selectedCategories.push({
                    value: checkbox.value,
                    display: checkbox.value.toUpperCase()
                });
            }
        });

        console.log(' 选中的分类:', selectedCategories); // 调试信息

        if (selectedCategories.length === 0) {
            selectedTagsContainer.innerHTML = '<span class="category-placeholder">--Select All--</span>';
        } else {
            // 生成标签HTML
            const tagsHTML = selectedCategories.map(category => `
            <div class="category-tag" data-category-value="${category.value}">
                <span>${category.display}</span>
                <span class="category-tag-remove" data-category-value="${category.value}">×</span>
            </div>
        `).join('');

            selectedTagsContainer.innerHTML = tagsHTML;

            // 使用事件委托方式处理删除按钮点击
            selectedTagsContainer.addEventListener('click', function (e) {
                if (e.target.classList.contains('category-tag-remove')) {
                    e.preventDefault();  // 阻止默认行为
                    e.stopPropagation(); // 阻止事件冒泡
                    const categoryValue = e.target.getAttribute('data-category-value');
                    removeCategory(categoryValue);
                }
            });
        }
    }

    // 删除单个分类
    function removeCategory(categoryValue) {
        const categoryAllCheckbox = document.getElementById('category_all');
        const categoryCheckboxes = document.querySelectorAll('.category-checkbox:not(#category_all)');

        // 如果是全选状态，先取消全选
        if (categoryAllCheckbox.checked) {
            categoryAllCheckbox.checked = false;
        }

        // 取消对应复选框的选中状态
        categoryCheckboxes.forEach(checkbox => {
            if (checkbox.value === categoryValue) {
                checkbox.checked = false;
            }
        });

        // 更新显示和搜索
        updateCategoryDisplay();
        updateSelectAllCheckbox();
        searchTransactions();
    }

    // 更新 "Select All" 复选框状态
    function updateSelectAllCheckbox() {
        const categoryAllCheckbox = document.getElementById('category_all');
        const categoryCheckboxes = document.querySelectorAll('.category-checkbox:not(#category_all)');
        const checkedCount = Array.from(categoryCheckboxes).filter(cb => cb.checked).length;

        categoryAllCheckbox.checked = checkedCount === categoryCheckboxes.length;
        categoryAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < categoryCheckboxes.length;
    }

    // 获取选中的分类值
    function getSelectedCategories() {
        const categoryAllCheckbox = document.getElementById('category_all');
        const categoryCheckboxes = document.querySelectorAll('.category-checkbox:not(#category_all)');

        if (categoryAllCheckbox.checked) {
            return ['']; // 空字符串表示全部
        }

        const selectedCategories = [];
        categoryCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selectedCategories.push(checkbox.value);
            }
        });

        return selectedCategories;
    }

    // ==================== 账户数据存储 ====================
    let accountDataMap = new Map(); // 存储 account display_text -> {id, account_id, currency}
    let allAccountOptions = []; // 存储所有账号选项的完整列表（用于过滤）

    function parseBalanceValue(rawBalance) {
        try {
            return MoneyDecimal.toDecimal(String(rawBalance ?? '').replace(/,/g, '').trim()).toString();
        } catch (_) {
            return null;
        }
    }

    function normalizeRateRowsByCrDr(leftRows, rightRows) {
        if (!(typeof isRateTypeSelected === 'function' && isRateTypeSelected())) {
            return {
                leftRows: Array.isArray(leftRows) ? leftRows : [],
                rightRows: Array.isArray(rightRows) ? rightRows : []
            };
        }

        const normalizedLeft = [];
        const normalizedRight = [];
        const safeLeft = Array.isArray(leftRows) ? leftRows : [];
        const safeRight = Array.isArray(rightRows) ? rightRows : [];

        safeLeft.forEach(row => {
            const crDr = parseBalanceValue(row && row.cr_dr);
            if (crDr === null || MoneyDecimal.toDecimal(crDr).abs().lt('0.00001')) {
                normalizedLeft.push(row);
                return;
            }
            if (MoneyDecimal.cmp(crDr, '0') > 0) {
                normalizedLeft.push(row);
            } else {
                normalizedRight.push(row);
            }
        });

        safeRight.forEach(row => {
            const crDr = parseBalanceValue(row && row.cr_dr);
            if (crDr === null || MoneyDecimal.toDecimal(crDr).abs().lt('0.00001')) {
                normalizedRight.push(row);
                return;
            }
            if (MoneyDecimal.cmp(crDr, '0') > 0) {
                normalizedLeft.push(row);
            } else {
                normalizedRight.push(row);
            }
        });

        return { leftRows: normalizedLeft, rightRows: normalizedRight };
    }

    function getProfitAccountSignSets() {
        const positiveIds = new Set();
        const negativeIds = new Set();

        const collect = (rows) => {
            (rows || []).forEach(row => {
                const accountId = row && (row.account_db_id ?? row.id);
                const numericBalance = parseBalanceValue(row && row.balance);
                if (!accountId || numericBalance === null) return;

                if (MoneyDecimal.cmp(numericBalance, '0') >= 0) {
                    positiveIds.add(String(accountId));
                }
                if (MoneyDecimal.cmp(numericBalance, '0') < 0) {
                    negativeIds.add(String(accountId));
                }
            });
        };

        // 使用最近一次搜索的原始数据做 PROFIT 正负校验，避免受前端展示过滤（Show Payment / Show 0）影响
        const sourceLeft = (lastSearchData && Array.isArray(lastSearchData.left_table))
            ? lastSearchData.left_table
            : currentDisplayData.left_table;
        const sourceRight = (lastSearchData && Array.isArray(lastSearchData.right_table))
            ? lastSearchData.right_table
            : currentDisplayData.right_table;

        collect(sourceLeft);
        collect(sourceRight);

        return { positiveIds, negativeIds };
    }

    function isProfitSignFilterEnabled(selectId) {
        const typeSel = document.getElementById('transaction_type');
        const type = typeSel ? typeSel.value : '';
        return type === 'PROFIT' && (selectId === 'action_account_id' || selectId === 'action_account_from');
    }

    function isAccountAllowedForProfitSign(selectId, accountId) {
        if (!isProfitSignFilterEnabled(selectId)) return true;
        if (!accountId) return false;

        // 业务规则：balance 正负只用于表格左右展示，不作为 PROFIT 提交限制
        return true;
    }

    // 下拉列表里的显示：为了方便选择，不再按正负号过滤，全部账号都显示
    function isAccountVisibleInDropdown(selectId, accountId) {
        // PROFIT 也返回 true，只在提交校验时用 isAccountAllowedForProfitSign 限制
        return true;
    }

    // ==================== 加载账户列表 ====================
    function loadAccounts() {
        const params = new URLSearchParams();

        // 账户下拉现在不再根据 currency 过滤，始终加载全部账号
        if (currentCompanyId) {
            params.append('company_id', currentCompanyId);
        }

        const url = params.toString()
            ? `/api/transactions/get_accounts_api.php?${params.toString()}`
            : '/api/transactions/get_accounts_api.php';

        return fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 清空数据映射
                    accountDataMap.clear();
                    allAccountOptions = [];

                    // 保存所有账号选项的完整列表
                    data.data.forEach(account => {
                        allAccountOptions.push({
                            display_text: account.display_text,
                            id: account.id,
                            account_id: account.account_id,
                            currency: account.currency || null
                        });

                        // 存储映射：display_text -> {id, account_id, currency}
                        accountDataMap.set(account.display_text, {
                            id: account.id,
                            account_id: account.account_id,
                            currency: account.currency || null
                        });
                    });

                    // 获取所有 account 自定义下拉选单
                    const accountSelectIds = [
                        'action_account_id',
                        'action_account_from',
                        'rate_account_from',
                        'rate_account_to',
                        'rate_middleman_account',
                        'rate_transfer_from_account',
                        'rate_transfer_to_account'
                    ];

                    // 保存之前选中的值（account ID）
                    const previousValues = new Map();
                    accountSelectIds.forEach(selectId => {
                        const button = document.getElementById(selectId);
                        if (!button) return;
                        previousValues.set(selectId, button.getAttribute('data-value') || '');
                    });

                    // 填充所有自定义下拉选单
                    accountSelectIds.forEach(selectId => {
                        const button = document.getElementById(selectId);
                        if (!button) return;

                        const dropdown = document.getElementById(selectId + '_dropdown');
                        const optionsContainer = dropdown?.querySelector('.custom-select-options');
                        if (!dropdown || !optionsContainer) return;

                        // 保存当前选中的值
                        const currentValue = previousValues.get(selectId) || '';

                        // 清空选项
                        optionsContainer.innerHTML = '';

                        // 追加“清空/取消选择”
                        const clearOpt = document.createElement('div')
                        clearOpt.className = 'custom-select-option'
                        clearOpt.textContent = button.getAttribute('data-placeholder') || '--Select Account--'
                        clearOpt.setAttribute('data-clear', '1')
                        optionsContainer.appendChild(clearOpt)

                        // 添加所有账户选项
                        data.data.forEach(account => {
                            const option = document.createElement('div');
                            option.className = 'custom-select-option';
                            option.textContent = account.display_text;
                            option.setAttribute('data-value', account.id);
                            option.setAttribute('data-account-code', account.account_id);
                            if (account.currency) {
                                option.setAttribute('data-currency', account.currency);
                            }

                            // 如果当前值匹配，标记为选中
                            if (currentValue && account.id === currentValue) {
                                option.classList.add('selected');
                                button.textContent = account.display_text;
                                button.setAttribute('data-value', account.id);
                            }

                            optionsContainer.appendChild(option);
                        });

                        // 如果没有选中值，显示 placeholder
                        if (!currentValue) {
                            button.textContent = button.getAttribute('data-placeholder') || '--Select Account--';
                            button.removeAttribute('data-value');
                        }
                    });

                    console.log('✅ 账户列表加载成功，共', data.data.length, '个账户');
                }
                return data;
            })
            .catch(error => {
                console.error('❌ 加载账户列表失败:', error);
                showNotification('Failed to load account list', 'error');
                throw error;
            });
    }
    // ==================== 初始化自定义下拉选单 ====================
    function initCustomSelects() {
        const accountSelectIds = [
            'action_account_id',
            'action_account_from',
            'rate_account_from',
            'rate_account_to',
            'rate_middleman_account',
            'rate_transfer_from_account',
            'rate_transfer_to_account'
        ];

        accountSelectIds.forEach(selectId => {
            const button = document.getElementById(selectId);
            const dropdown = document.getElementById(selectId + '_dropdown');
            const searchInput = dropdown?.querySelector('.custom-select-search input');
            const optionsContainer = dropdown?.querySelector('.custom-select-options');

            if (!button || !dropdown || !searchInput || !optionsContainer) return;

            let isOpen = false;
            let filteredOptions = [];

            // 更新选项列表
            function updateOptions(filterText = '') {
                const filterLower = filterText.toLowerCase().trim();
                const allOptions = Array.from(optionsContainer.querySelectorAll('.custom-select-option'));

                filteredOptions = allOptions.filter(option => {
                    const text = option.textContent.toLowerCase();
                    const optionAccountId = option.getAttribute('data-value') || '';
                    const matchesText = !filterLower || text.includes(filterLower);
                    const matchesSign = isAccountVisibleInDropdown(selectId, optionAccountId);
                    const matches = matchesText && matchesSign;
                    option.style.display = matches ? '' : 'none';
                    return matches;
                });

                // 清除所有选中状态
                allOptions.forEach(opt => opt.classList.remove('selected'));

                // 如果有可见选项，选中第一个
                const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
                if (visibleOptions.length > 0) {
                    visibleOptions[0].classList.add('selected');
                }

                // 显示/隐藏"无结果"消息
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

            function clearSelection() {
                const placeholder = button.getAttribute('data-placeholder') || '--Select Account--'
                button.textContent = placeholder
                button.title = placeholder
                button.removeAttribute('data-value')
                button.removeAttribute('data-account-code')
                button.removeAttribute('data-currency')

                // 清除选中状态
                optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
                    opt.classList.remove('selected')
                })

                button.dispatchEvent(new Event('change', { bubbles: true }))
                toggleDropdown()
            }

            // 打开/关闭下拉选单
            function toggleDropdown() {
                isOpen = !isOpen;
                if (isOpen) {
                    // 先关闭其他已打开的下拉（同一页面的所有 custom select），避免多个一起展开
                    document.querySelectorAll('.custom-select-dropdown.show').forEach(otherDropdown => {
                        if (otherDropdown === dropdown) return;
                        otherDropdown.classList.remove('show');
                        const otherBtn = otherDropdown.closest('.custom-select-wrapper')?.querySelector('.custom-select-button');
                        if (otherBtn) {
                            otherBtn.classList.remove('open');
                        }
                    });
                    dropdown.classList.add('show');
                    button.classList.add('open');
                    searchInput.value = '';
                    updateOptions('');
                    setTimeout(() => searchInput.focus(), 10);
                } else {
                    dropdown.classList.remove('show');
                    button.classList.remove('open');
                }
            }

            // 选择选项
            function selectOption(option) {
                const value = option.getAttribute('data-value');
                const text = option.textContent;
                const accountCode = option.getAttribute('data-account-code');
                const currency = option.getAttribute('data-currency');

                button.textContent = text;
                // 显示不完时，用 title 提示完整账号（不改现有布局）
                button.title = text || (button.getAttribute('data-placeholder') || '--Select Account--');
                button.setAttribute('data-value', value);
                button.setAttribute('data-account-code', accountCode || '');
                if (currency) {
                    button.setAttribute('data-currency', currency);
                } else {
                    button.removeAttribute('data-currency');
                }

                // 更新选中状态
                optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');

                // 触发 change 事件
                button.dispatchEvent(new Event('change', { bubbles: true }));

                toggleDropdown();
            }

            // 按钮点击事件
            button.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleDropdown();
            });

            // 搜索输入事件
            searchInput.addEventListener('input', function () {
                updateOptions(this.value);
            });

            // 选项点击事件
            optionsContainer.addEventListener('click', function (e) {
                const option = e.target.closest('.custom-select-option');
                if (option && option.style.display !== 'none') {
                    if (option.getAttribute('data-clear') === '1') {
                        clearSelection()
                    } else {
                        selectOption(option);
                    }
                }
            });

            // 点击外部关闭
            document.addEventListener('click', function (e) {
                if (!button.contains(e.target) && !dropdown.contains(e.target)) {
                    if (isOpen) {
                        toggleDropdown();
                    }
                }
            });

            // 键盘事件
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    toggleDropdown();
                } else if (e.key === 'Backspace' && !this.value) {
                    // 空搜索框下 Backspace 直接清空选择（不影响输入时的 Backspace）
                    clearSelection()
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const visibleOptions = filteredOptions.filter(opt => opt.style.display !== 'none');
                    // 选择当前高亮的选项（带有 selected 类的），如果没有则选择第一个
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
        });
    }

    function syncContraCurrencyFromButton(buttonEl) {
        if (!buttonEl) return;
        const type = document.getElementById('transaction_type')?.value || '';
        if (type !== 'CONTRA') return;
        // 只允许“系统自动填充账号（例如点击表格行）”触发一次性币种同步；
        // 手动在下拉里更换账号时，不应自动改 Currency（对齐你的截图诉求）
        const autoSync = buttonEl.getAttribute('data-auto-currency-sync') === '1';
        if (!autoSync) return;
        buttonEl.removeAttribute('data-auto-currency-sync');
        const currency = (buttonEl.getAttribute('data-currency') || '').trim().toUpperCase();
        if (!currency) return;
        const currencySelect = document.getElementById('transaction_currency');
        if (!currencySelect) return;
        const opt = currencySelect.querySelector(`option[value="${currency}"]`);
        if (!opt) return;
        currencySelect.value = currency;
    }

    function bindContraCurrencyAutoSync() {
        if (window.__contraCurrencyAutoSyncBound) return;
        window.__contraCurrencyAutoSyncBound = true;

        ['action_account_from', 'action_account_id'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('change', () => syncContraCurrencyFromButton(btn));
        });
    }

    // ==================== 获取账户ID（从自定义下拉选单的data-value获取）====================
    function getAccountId(buttonElement) {
        if (!buttonElement) return '';

        // 自定义下拉选单的 data-value 就是 account ID
        return buttonElement.getAttribute('data-value') || '';
    }


    // ==================== 切换 Company ====================
    async function switchCompany(companyId, companyCode) {
        const normalizedCompanyId = (function (raw) {
            if (raw === null || raw === undefined) return null;
            const str = String(raw).trim();
            if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'undefined') return null;
            return str;
        })(companyId);

        // Group 取消选择后的空状态：不刷新整页，不带 company_id=null，直接清空当前页数据
        if (!normalizedCompanyId) {
            currentCompanyId = null;
            selectedCurrencies = [];
            showAllCurrencies = false;
            currencyList = [];
            lastSearchData = null;
            currentDisplayData = { left_table: [], right_table: [] };

            const currencyWrapper = document.getElementById('currency-buttons-wrapper');
            const currencyContainer = document.getElementById('currency-buttons-container');
            if (currencyContainer) currencyContainer.innerHTML = '';
            if (currencyWrapper) currencyWrapper.style.display = 'none';

            renderTables([], []);
            return;
        }

        // 先更新 session
        try {
            const response = await fetch(`/api/session/update_company_session_api.php?company_id=${normalizedCompanyId}`);
            const result = await response.json();
            if (!result.success) {
                const blocked = (typeof window.handleCompanySwitchDenied === 'function')
                    ? await window.handleCompanySwitchDenied(result)
                    : false;
                if (blocked) return;
                console.error('更新 session 失败:', result.error);
                // 非到期/未设置类错误：保持原行为
            } else if (typeof window.updateSidebarDataCaptureVisibility === 'function' && result.data) {
                window.updateSidebarDataCaptureVisibility(result.data.has_gambling, result.data.has_bank);
            }
        } catch (error) {
            console.error('更新 session 时出错:', error);
            // 即使 API 失败，也继续更新前端状态
        }

        // 立即刷新整页，让 sidebar 按新 company 的 session 状态重渲染
        const url = new URL(window.location.href);
        url.searchParams.set('company_id', normalizedCompanyId);
        window.location.href = url.toString();
        return;

        currentCompanyId = companyId;

        // 更新按钮状态
        const buttons = document.querySelectorAll('.transaction-company-btn');
        buttons.forEach(btn => {
            if (parseInt(btn.dataset.companyId) === parseInt(companyId)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        console.log('✅ 切换到 Company:', companyCode, 'ID:', companyId);

        // 重新加载 currency 列表和账户列表
        Promise.all([
            loadCompanyCurrencies(),
            loadAccounts()
        ]).then(() => {
            // 初始化自定义下拉选单
            initCustomSelects();
            // 如果有搜索结果，重新搜索
            const dateFrom = document.getElementById('date_from').value;
            const dateTo = document.getElementById('date_to').value;
            if (dateFrom && dateTo) {
                loadContraInbox();
                searchTransactions();
            }
        });
    }

    const TRANSACTION_CURRENCY_FILTER_KEY_PREFIX = 'transaction_currency_filter_v1_';

    function readTransactionCurrencyFilterState(companyId) {
        if (!companyId) return null;
        try {
            const raw = localStorage.getItem(TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + companyId);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return null;
            const showAll = !!o.showAll;
            const currencies = Array.isArray(o.currencies)
                ? o.currencies.map(c => String(c || '').trim()).filter(Boolean)
                : [];
            return { showAll, currencies };
        } catch (e) {
            return null;
        }
    }

    function persistTransactionCurrencyFilterState() {
        if (!currentCompanyId) return;
        try {
            localStorage.setItem(
                TRANSACTION_CURRENCY_FILTER_KEY_PREFIX + currentCompanyId,
                JSON.stringify({
                    showAll: showAllCurrencies,
                    currencies: [...selectedCurrencies]
                })
            );
        } catch (e) { /* ignore */ }
    }

    /** 同标签页内：用 sessionStorage 按筛选条件缓存列表，再次进入页面先秒开旧数据再静默拉新 */
    const TX_LIST_SESSION_PREFIX = 'count168_txlist_v1_';
    const TX_LIST_INVALIDATE_LS_KEY = 'count168_tx_invalidate_ts';
    const TX_DATA_CHANGED_EVENT = 'tx-data-changed';

    function queueExternalRefreshRetry() {
        if (externalRefreshRetryTimer) return;
        externalRefreshRetryTimer = setTimeout(() => {
            externalRefreshRetryTimer = null;
            refreshTransactionDataFromExternalChange();
        }, 650);
    }

    function refreshTransactionDataFromExternalChange() {
        const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || '0', 10) || 0;
        if (!invalidateTs || invalidateTs <= lastSearchCommitMs) return;
        const dateFrom = document.getElementById('date_from')?.value;
        const dateTo = document.getElementById('date_to')?.value;
        if (!dateFrom || !dateTo) {
            queueExternalRefreshRetry();
            return;
        }
        if (!showAllCurrencies && selectedCurrencies.length === 0) {
            queueExternalRefreshRetry();
            return;
        }
        const hm = document.getElementById('historyModal');
        if (hm && (hm.style.display === 'flex' || hm.style.display === 'block')) {
            hm.style.display = 'none';
        }
        const key = buildTxListSessionKey();
        if (key) {
            try {
                sessionStorage.removeItem(key);
            } catch (e2) { /* ignore */ }
        }
        searchTransactions(false, { silent: true });
    }

    function buildTxListSessionKey() {
        const dateFrom = document.getElementById('date_from') && document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to') && document.getElementById('date_to').value;
        if (!dateFrom || !dateTo) return null;
        const selectedCategories = getSelectedCategories();
        const showInactive = document.getElementById('show_inactive').checked ? '1' : '0';
        const showCaptureOnly = document.getElementById('show_capture_only').checked ? '1' : '0';
        const showZero = document.getElementById('show_zero_balance').checked ? '1' : '0';
        const hideZero = showZero === '1' ? '0' : '1';
        let cat = '';
        if (selectedCategories.length > 0 && !selectedCategories.includes('')) {
            cat = selectedCategories.slice().sort().join(',');
        }
        let cur = '';
        if (!showAllCurrencies && selectedCurrencies.length > 0) {
            cur = selectedCurrencies.slice().sort().join(',');
        }
        const cid = currentCompanyId != null ? String(currentCompanyId) : '';
        return TX_LIST_SESSION_PREFIX + [cid, dateFrom, dateTo, cat, showInactive, showCaptureOnly, hideZero, cur, showAllCurrencies ? '1' : '0'].join('|');
    }

    function saveTxListSearchToSession(data) {
        try {
            const key = buildTxListSessionKey();
            if (!key || !data) return;
            const ts = Date.now();
            const wrap = JSON.stringify({ v: 2, savedAt: ts, data: data });
            if (wrap.length > 1800000) return;
            sessionStorage.setItem(key, wrap);
            lastSearchCommitMs = ts;
        } catch (e) { /* quota or private mode */ }
    }

    function tryRestoreTxListSearchFromSession() {
        try {
            const key = buildTxListSessionKey();
            if (!key) return false;
            const raw = sessionStorage.getItem(key);
            if (!raw) return false;
            const o = JSON.parse(raw);
            if (!o || !o.data) return false;
            if (o.v !== 1 && o.v !== 2) return false;
            if (!Array.isArray(o.data.left_table) && !Array.isArray(o.data.right_table)) return false;
            const invalidateTs = parseInt(localStorage.getItem(TX_LIST_INVALIDATE_LS_KEY) || '0', 10) || 0;
            const savedAt = (o.v === 2 && typeof o.savedAt === 'number') ? o.savedAt : 0;
            if (invalidateTs > savedAt) {
                try {
                    sessionStorage.removeItem(key);
                } catch (e2) { /* ignore */ }
                return false;
            }
            lastSearchData = o.data;
            lastSearchCommitMs = savedAt || Date.now();
            applyZeroBalanceFilterAndRender();
            return true;
        } catch (e) {
            return false;
        }
    }

    // ==================== 加载 Company Currencies ====================
    function loadCompanyCurrencies() {
        // 构建 URL，如果指定了 company_id 则添加参数
        let url = '/api/transactions/get_company_currencies_api.php';
        if (currentCompanyId) {
            url += `?company_id=${currentCompanyId}`;
        }

        console.log('🔍 加载 Currency，URL:', url, 'currentCompanyId:', currentCompanyId);

        return Promise.all([
            fetch(url).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            }),
            fetch(`/api/transactions/user_currency_order_api.php?_t=${Date.now()}`).then(res => res.json()).catch(() => null)
        ])
            .then(([data, orderData]) => {
                console.log('🔍 Currency API 返回:', {
                    success: data.success,
                    dataLength: data.data?.length || 0,
                    error: data.error || null
                });

                if (data.success && data.data.length > 0) {
                    // 应用保存的拖动顺序（公司级优先，全局兜底）
                    const savedOrderKey = 'transaction_currency_order_' + (currentCompanyId || 0);
                    const savedGlobalOrderKey = 'transaction_currency_order_global';
                    let orderedData = [...data.data];
                    try {
                        let saved = null;
                        if (orderData && orderData.success && Array.isArray(orderData.data?.order) && orderData.data.order.length > 0) {
                            saved = JSON.stringify(orderData.data.order);
                        } else {
                            saved = localStorage.getItem(savedOrderKey)
                                || localStorage.getItem(savedGlobalOrderKey)
                                || localStorage.getItem('dashboard_currency_order_global');
                        }
                        if (saved) {
                            const order = JSON.parse(saved);
                            if (Array.isArray(order) && order.length > 0) {
                                const normalized = [];
                                order.forEach(code => {
                                    const upper = String(code || '').trim().toUpperCase();
                                    if (!upper || upper === 'ALL') return;
                                    if (!normalized.includes(upper)) normalized.push(upper);
                                });
                                const byCode = new Map(orderedData.map(c => [String(c.code || '').trim().toUpperCase(), c]));
                                const ordered = [];
                                normalized.forEach(upper => {
                                    if (byCode.has(upper)) {
                                        ordered.push(byCode.get(upper));
                                        byCode.delete(upper);
                                    }
                                });
                                byCode.forEach(c => ordered.push(c));
                                orderedData = ordered;
                            }
                        }
                    } catch (e) { /* ignore */ }

                    // 保存 currency 列表（按显示顺序）
                    currencyList = [...orderedData];

                    const wrapper = document.getElementById('currency-buttons-wrapper');
                    const container = document.getElementById('currency-buttons-container');

                    if (!wrapper || !container) {
                        console.error('❌ Currency wrapper 或 container 元素不存在');
                        return data;
                    }

                    // 立即显示 wrapper（在清空和创建按钮之前）
                    wrapper.style.display = 'flex';

                    container.innerHTML = '';

                    console.log('✅ 开始加载 Currency 按钮，数据量:', orderedData.length);

                    // 保存之前的状态
                    const previousSelected = [...selectedCurrencies];
                    const previousShowAll = showAllCurrencies;

                    // 创建 "All" 按钮
                    const allBtn = document.createElement('button');
                    allBtn.className = 'transaction-company-btn';
                    allBtn.textContent = 'All';
                    allBtn.dataset.currencyCode = 'ALL';
                    if (previousShowAll) {
                        allBtn.classList.add('active');
                    }
                    allBtn.addEventListener('click', function () {
                        toggleAllCurrencies();
                    });
                    container.appendChild(allBtn);

                    // 先确定要选中的 currency：每家公司独立本地记忆；无则与原先一致（拖动默认 / 列表第一个）
                    let currenciesToSelect = [];
                    let preferredDefault = null;
                    try {
                        const defaultKey = 'transaction_default_currency_' + (currentCompanyId || 0);
                        preferredDefault = String(localStorage.getItem(defaultKey) || '').trim().toUpperCase() || null;
                    } catch (e) { /* ignore */ }
                    let appliedSavedFilter = false;
                    if (previousSelected.length === 0 && !previousShowAll) {
                        const saved = readTransactionCurrencyFilterState(currentCompanyId);
                        if (saved) {
                            if (saved.showAll) {
                                showAllCurrencies = true;
                                currenciesToSelect = [];
                                appliedSavedFilter = true;
                            } else {
                                const valid = saved.currencies.filter(code =>
                                    orderedData.some(c => String(c.code) === String(code)));
                                if (valid.length > 0) {
                                    showAllCurrencies = false;
                                    currenciesToSelect = valid;
                                    appliedSavedFilter = true;
                                }
                            }
                        }
                    }
                    if (!appliedSavedFilter) {
                        if (previousSelected.length === 0 && !previousShowAll) {
                            const firstCurrency = preferredDefault
                                ? orderedData.find(c => String(c.code || '').toUpperCase() === preferredDefault)
                                : orderedData[0];
                            if (firstCurrency) currenciesToSelect = [firstCurrency.code];
                            showAllCurrencies = false;
                        } else {
                            currenciesToSelect = previousSelected.filter(code =>
                                orderedData.some(c => c.code === code)
                            );
                            if (currenciesToSelect.length === 0 && !previousShowAll) {
                                const firstCurrency = preferredDefault
                                    ? orderedData.find(c => String(c.code || '').toUpperCase() === preferredDefault)
                                    : orderedData[0];
                                if (firstCurrency) currenciesToSelect = [firstCurrency.code];
                            }
                        }
                    }
                    selectedCurrencies = currenciesToSelect;

                    if (wrapper) {
                        wrapper.style.display = 'flex';
                    }

                    // 创建各个 currency 按钮（可多选、可拖动）
                    orderedData.forEach(currency => {
                        const btn = document.createElement('button');
                        btn.className = 'transaction-company-btn';
                        btn.textContent = currency.code;
                        btn.dataset.currencyCode = currency.code;

                        if (selectedCurrencies.includes(currency.code)) {
                            btn.classList.add('active');
                        }

                        btn.addEventListener('click', function () {
                            toggleCurrency(currency.code);
                        });
                        container.appendChild(btn);
                    });

                    initCurrencyDragDrop();
                    updateCurrencyButtonsState();

                    console.log('✅ Currency 按钮已创建并显示:', {
                        currencyCount: data.data.length,
                        selectedCurrencies: selectedCurrencies,
                        wrapperDisplay: wrapper ? wrapper.style.display : 'N/A'
                    });

                    // 填充右侧添加区域的 Currency 下拉框
                    const currencySelect = document.getElementById('transaction_currency');
                    const rateCurrencyFromSelect = document.getElementById('rate_currency_from');
                    const rateCurrencyToSelect = document.getElementById('rate_currency_to');

                    const currencySelects = [
                        { element: currencySelect, placeholder: '--Select Currency--' },
                        { element: rateCurrencyFromSelect, placeholder: 'Currency' },
                        { element: rateCurrencyToSelect, placeholder: 'Currency' }
                    ];

                    const previousCurrencyValues = new Map();
                    currencySelects.forEach(sel => {
                        if (!sel.element) return;
                        previousCurrencyValues.set(sel.element.id, sel.element.value);
                        sel.element.innerHTML = `<option value="">${sel.placeholder}</option>`;
                    });

                    orderedData.forEach(currency => {
                        currencySelects.forEach(sel => {
                            if (!sel.element) return;
                            const option = document.createElement('option');
                            option.value = currency.code;
                            option.textContent = currency.code;
                            sel.element.appendChild(option);
                        });
                    });

                    const defaultCurrency = preferredDefault
                        ? (orderedData.find(c => String(c.code || '').toUpperCase() === preferredDefault) || orderedData[0])
                        : orderedData[0];

                    currencySelects.forEach(sel => {
                        if (!sel.element) return;
                        const previousValue = previousCurrencyValues.get(sel.element.id);
                        if (previousValue && sel.element.querySelector(`option[value="${previousValue}"]`)) {
                            sel.element.value = previousValue;
                            return;
                        }
                        if (defaultCurrency) {
                            sel.element.value = defaultCurrency.code;
                        }
                    });

                    // RATE：右侧 Currency（rate_currency_to）固定默认 MYR，不参与自动选择
                    if (rateCurrencyToSelect && rateCurrencyToSelect.querySelector('option[value="MYR"]')) {
                        rateCurrencyToSelect.value = 'MYR';
                    }

                    console.log('✅ Currency 按钮加载成功:', orderedData, '选中的:', selectedCurrencies);
                } else {
                    // 没有 currency 数据
                    const wrapper = document.getElementById('currency-buttons-wrapper');
                    if (wrapper) {
                        wrapper.style.display = 'none';
                    }
                    selectedCurrencies = [];
                    showAllCurrencies = false;
                    currencyList = [];

                    // 清空下拉框
                    const currencySelect = document.getElementById('transaction_currency');
                    if (currencySelect) {
                        currencySelect.innerHTML = '<option value="">--Select Currency--</option>';
                    }

                    console.log('⚠️ 没有 currency 数据');

                    // 返回数据，但标记为没有 currency
                    return {
                        ...data,
                        _hasNoCurrency: true
                    };
                }
            })
            .catch(error => {
                console.error('❌ 加载 Currency 列表失败:', error);
                return { success: true, data: [] };
            });
    }

    // ==================== Currency 拖动排序（与 Member Win/Loss 一致） ====================
    function initCurrencyDragDrop() {
        const container = document.getElementById('currency-buttons-container');
        if (!container) return;
        let draggedCode = null;
        container.querySelectorAll('.transaction-company-btn[data-currency-code]').forEach(btn => {
            if (btn.dataset.currencyCode === 'ALL') return;
            btn.setAttribute('draggable', 'true');
            btn.addEventListener('dragstart', function (e) {
                draggedCode = btn.getAttribute('data-currency-code');
                e.dataTransfer.setData('text/plain', draggedCode);
                e.dataTransfer.effectAllowed = 'move';
                btn.classList.add('transaction-currency-dragging');
            });
            btn.addEventListener('dragend', function () {
                btn.classList.remove('transaction-currency-dragging');
                draggedCode = null;
            });
        });
        container.addEventListener('dragover', function (e) {
            if (!draggedCode) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.transaction-company-btn[data-currency-code]');
            if (target && target.dataset.currencyCode !== 'ALL' && target !== document.querySelector('.transaction-currency-dragging')) {
                target.classList.add('transaction-currency-drag-over');
            }
        });
        container.addEventListener('dragleave', function (e) {
            if (!e.currentTarget.contains(e.relatedTarget)) {
                container.querySelectorAll('.transaction-currency-drag-over').forEach(el => el.classList.remove('transaction-currency-drag-over'));
            }
        });
        container.addEventListener('drop', function (e) {
            e.preventDefault();
            container.querySelectorAll('.transaction-currency-drag-over').forEach(el => el.classList.remove('transaction-currency-drag-over'));
            if (!draggedCode) return;
            const target = e.target.closest('.transaction-company-btn[data-currency-code]');
            if (!target || target.dataset.currencyCode === 'ALL') return;
            const allButtons = [...container.querySelectorAll('.transaction-company-btn[data-currency-code]')];
            const fromIndex = allButtons.findIndex(b => b.getAttribute('data-currency-code') === draggedCode);
            const toIndex = allButtons.indexOf(target);
            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
            const moved = allButtons[fromIndex];
            if (toIndex < fromIndex) {
                container.insertBefore(moved, allButtons[toIndex]);
            } else {
                container.insertBefore(moved, allButtons[toIndex].nextSibling);
            }
            const newOrder = [...container.querySelectorAll('.transaction-company-btn[data-currency-code]')]
                .map(b => String(b.getAttribute('data-currency-code') || '').trim().toUpperCase())
                .filter(Boolean)
                .filter(code => code !== 'ALL')
                .filter((code, idx, arr) => arr.indexOf(code) === idx);
            try {
                const key = 'transaction_currency_order_' + (currentCompanyId || 0);
                localStorage.setItem(key, JSON.stringify(newOrder));
                localStorage.setItem('transaction_currency_order_global', JSON.stringify(newOrder));
                const defaultKey = 'transaction_default_currency_' + (currentCompanyId || 0);
                localStorage.setItem(defaultKey, String(newOrder[0] || '').trim().toUpperCase());

                // 同时永久保存到数据库
                fetch('/api/transactions/user_currency_order_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order: newOrder })
                }).catch(err => console.error('Failed to save currency order to DB:', err));
            } catch (err) { /* ignore */ }
        });
    }

    // ==================== 切换 All Currencies ====================
    function toggleAllCurrencies() {
        showAllCurrencies = !showAllCurrencies;

        if (showAllCurrencies) {
            selectedCurrencies = [];
        }

        updateCurrencyButtonsState();

        const dateFrom = document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to').value;
        if (dateFrom && dateTo) {
            searchTransactions();
        }
        persistTransactionCurrencyFilterState();
    }

    // ==================== 切换 Currency (Toggle) ====================
    function toggleCurrency(currencyCode) {
        if (showAllCurrencies) {
            showAllCurrencies = false;
        }

        const index = selectedCurrencies.indexOf(currencyCode);
        if (index > -1) {
            selectedCurrencies.splice(index, 1);
        } else {
            selectedCurrencies.push(currencyCode);
        }

        updateCurrencyButtonsState();

        const dateFrom = document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to').value;
        if (dateFrom && dateTo) {
            searchTransactions();
        }
        persistTransactionCurrencyFilterState();
    }

    // ==================== 更新 Currency 按钮状态 ====================
    function updateCurrencyButtonsState() {
        const buttons = document.querySelectorAll('#currency-buttons-container .transaction-company-btn');
        buttons.forEach(btn => {
            const currencyCode = btn.dataset.currencyCode;
            if (currencyCode === 'ALL') {
                // All 按钮
                if (showAllCurrencies) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            } else {
                // 具体 currency 按钮
                if (selectedCurrencies.includes(currencyCode)) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
        });

        // RATE：不要让左侧 Currency 按钮影响右侧表单币种（币种应由点击表格行的账户决定，行为对齐 CLAIM）
    }

    // ==================== 搜索功能 ====================
    // isInitialLoad: 首次进入页面自动搜当天数据时传 true（预留）
    // opts.silent: 为 true 时不盖掉已有表格、不显示全屏 Loading，且不弹出「搜索完成」类提示（用于 session 回放后的后台刷新）
    // opts.forceRefresh: 为 true 时跳过「同条件 1200ms 内不重复搜 / 同条件 in-flight 不重发」，用于提交成功后必须见库内最新余额
    function searchTransactions(isInitialLoad, opts) {
        opts = opts || {};
        const silent = opts.silent === true;
        // 提交成功后必须拉最新列表：否则与「同条件 1200ms 内不重复搜」冲突，主表会停在某次旧数据
        const forceRefresh = opts.forceRefresh === true;
        const dateFrom = document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to').value;
        const selectedCategories = getSelectedCategories(); // 使用新的多选函数
        const showInactive = document.getElementById('show_inactive').checked ? '1' : '0';
        const showCaptureOnly = document.getElementById('show_capture_only').checked ? '1' : '0';
        const showZero = document.getElementById('show_zero_balance').checked ? '1' : '0';
        const hideZero = showZero === '1' ? '0' : '1';

        // 验证日期
        if (!dateFrom || !dateTo) {
            showNotification('Please select date range', 'error');
            return;
        }

        // 没有选 currency 时不发起搜索（首次进入会先等 loadCompanyCurrencies 再搜，保证带 currency）
        if (!showAllCurrencies && selectedCurrencies.length === 0) {
            const tablesSection = document.querySelector('.transaction-tables-section');
            const summarySection = document.querySelector('.transaction-summary-section');
            if (tablesSection) tablesSection.style.display = 'none';
            if (summarySection) summarySection.style.display = 'none';
            showNotification('Please select at least one Currency or select All', 'info');
            return;
        }

        // 构建 URL，处理多选分类
        let url = `/api/transactions/search_api.php?date_from=${dateFrom}&date_to=${dateTo}&show_inactive=${showInactive}&show_capture_only=${showCaptureOnly}&hide_zero_balance=${hideZero}`;

        // 处理分类参数：如果是全选则不传参数，否则传递多个分类
        if (selectedCategories.length > 0 && !selectedCategories.includes('')) {
            url += `&category=${selectedCategories.join(',')}`;
        }

        if (currentCompanyId) {
            url += `&company_id=${currentCompanyId}`;
        }
        // 如果选择了具体 currency，则添加参数；如果选择 All，则不添加（显示全部）
        if (!showAllCurrencies && selectedCurrencies.length > 0) {
            url += `&currency=${selectedCurrencies.join(',')}`;
        }

        console.log('🔍 搜索参数:', { dateFrom, dateTo, categories: selectedCategories, showInactive, showCaptureOnly, hideZero, companyId: currentCompanyId, currencies: selectedCurrencies, showAll: showAllCurrencies });

        // 添加时间戳防止缓存
        url += '&_t=' + Date.now();

        const tablesSection = document.querySelector('.transaction-tables-section');
        const loadingEl = document.getElementById('transaction-tables-loading');
        const defaultTables = document.getElementById('default-tables-container');
        const groupedTables = document.getElementById('currency-grouped-tables-container');
        const summarySection = document.querySelector('.transaction-summary-section');

        // silent：已有 session 回放内容时，不整页 Loading、不隐藏表格，减少「空白等待」感
        if (!silent) {
            if (tablesSection) {
                tablesSection.style.display = 'flex';
                tablesSection.style.flexDirection = 'column';
            }
            if (loadingEl) {
                loadingEl.textContent = 'Loading data';
                loadingEl.style.display = 'flex';
            }
            if (defaultTables) defaultTables.style.display = 'none';
            if (groupedTables) groupedTables.style.display = 'none';
            if (summarySection) summarySection.style.display = 'none';
        }

        const commitSearchData = (searchData, commitOpts) => {
            commitOpts = commitOpts || {};
            const quiet = commitOpts.quiet === true;
            lastSearchData = searchData;
            const totalAccounts = (searchData.left_table?.length || 0) + (searchData.right_table?.length || 0);

            if (totalAccounts === 0) {
                if (tablesSection) {
                    tablesSection.style.display = 'flex';
                    tablesSection.style.flexDirection = '';
                }
                if (summarySection) summarySection.style.display = 'flex';
                applyZeroBalanceFilterAndRender();
                saveTxListSearchToSession(searchData);
                lastCompletedSearchKey = requestKey;
                lastCompletedSearchTs = Date.now();
                if (!quiet) {
                    showNotification('Search completed but no data found. Please check date range, Currency filter, or confirm data has been submitted', 'info');
                }
                return;
            }

            if (tablesSection) {
                tablesSection.style.display = 'flex';
                tablesSection.style.flexDirection = '';
            }
            if (summarySection) summarySection.style.display = 'flex';

            applyZeroBalanceFilterAndRender();
            const displayedCount =
                (currentDisplayData.left_table?.length || 0) +
                (currentDisplayData.right_table?.length || 0);
            if (!quiet) {
                if (displayedCount === 0 && totalAccounts > 0) {
                    showNotification(
                        `Search returned ${totalAccounts} row(s), but none match current display filters (e.g. zero balance hidden when "Show 0 balance" is off, or "Show Payment Only" / "Show Win/Loss Only"). Enable "Show 0 balance" or adjust filters.`,
                        'info'
                    );
                } else {
                    showNotification(`Search completed, found ${displayedCount} record(s)`, 'success');
                }
            }
            saveTxListSearchToSession(searchData);
            lastCompletedSearchKey = requestKey;
            lastCompletedSearchTs = Date.now();
        };

        const singleSelectedCurrency = (!showAllCurrencies && selectedCurrencies.length === 1)
            ? String(selectedCurrencies[0] || '').toUpperCase()
            : '';
        const categoryParam = (selectedCategories.length > 0 && !selectedCategories.includes(''))
            ? selectedCategories.join(',')
            : '';
        const requestKey = JSON.stringify({
            dateFrom,
            dateTo,
            categoryParam,
            showInactive,
            showCaptureOnly,
            hideZero,
            companyId: currentCompanyId || '',
            showAllCurrencies: !!showAllCurrencies,
            currencies: [...selectedCurrencies].sort().join(',')
        });

        if (!forceRefresh && isSearchInFlight && activeSearchKey === requestKey) {
            return;
        }
        if (!forceRefresh && !isInitialLoad && lastCompletedSearchKey === requestKey && (Date.now() - lastCompletedSearchTs) < 1200) {
            return;
        }

        // 新的搜索发起前，取消尚未完成的旧请求，避免慢请求回写覆盖新结果
        if (activeSearchController) {
            try { activeSearchController.abort(); } catch (e) { /* ignore */ }
        }
        activeSearchController = new AbortController();
        const { signal } = activeSearchController;
        isSearchInFlight = true;
        activeSearchKey = requestKey;

        fetch(url, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache'
            },
            signal
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // 大量 console 在数据多时会明显拖慢主线程；需要时在控制台执行: window.DEBUG_TRANSACTION_SEARCH = true
                    if (typeof window !== 'undefined' && window.DEBUG_TRANSACTION_SEARCH) {
                        console.log('✅ 搜索成功:', data.data);
                        console.log('📊 行数:', (data.data.left_table?.length || 0) + (data.data.right_table?.length || 0));
                    }
                    const currentSearchData = data.data || {};
                    const leftRows = Array.isArray(currentSearchData.left_table) ? currentSearchData.left_table : [];
                    const rightRows = Array.isArray(currentSearchData.right_table) ? currentSearchData.right_table : [];
                    const totalAccounts = leftRows.length + rightRows.length;

                    // 兜底修复：单选币别时若后端返回空行，则自动重查全部币别并在前端按该币别过滤
                    if (singleSelectedCurrency && totalAccounts === 0) {
                        let fallbackUrl = `/api/transactions/search_api.php?date_from=${dateFrom}&date_to=${dateTo}&show_inactive=${showInactive}&show_capture_only=${showCaptureOnly}&hide_zero_balance=${hideZero}`;
                        if (categoryParam) {
                            fallbackUrl += `&category=${encodeURIComponent(categoryParam)}`
                        }
                        if (currentCompanyId) {
                            fallbackUrl += `&company_id=${currentCompanyId}`;
                        }
                        fallbackUrl += '&_t=' + Date.now();
                        if (loadingEl && !silent) {
                            loadingEl.textContent = 'Loading data';
                            loadingEl.style.display = 'flex';
                        }

                        return fetch(fallbackUrl, {
                            method: 'GET',
                            cache: 'no-cache',
                            headers: {
                                'Cache-Control': 'no-cache'
                            },
                            signal
                        })
                            .then(resp => resp.json())
                            .then(fallback => {
                                if (loadingEl) loadingEl.style.display = 'none';
                                if (!fallback.success || !fallback.data) {
                                    commitSearchData(currentSearchData, { quiet: silent });
                                    return;
                                }

                                const fallbackLeft = (Array.isArray(fallback.data.left_table) ? fallback.data.left_table : [])
                                    .filter(row => String(row?.currency || '').toUpperCase() === singleSelectedCurrency);
                                const fallbackRight = (Array.isArray(fallback.data.right_table) ? fallback.data.right_table : [])
                                    .filter(row => String(row?.currency || '').toUpperCase() === singleSelectedCurrency);

                                const rebuiltData = {
                                    ...fallback.data,
                                    left_table: fallbackLeft,
                                    right_table: fallbackRight,
                                    totals: {
                                        left: calculateTotals(fallbackLeft),
                                        right: calculateTotals(fallbackRight),
                                        summary: calculateTotals([...fallbackLeft, ...fallbackRight])
                                    }
                                };

                                commitSearchData(rebuiltData, { quiet: silent });
                            })
                            .catch(error => {
                                if (error && error.name === 'AbortError') return;
                                if (loadingEl) loadingEl.style.display = 'none';
                                console.error('❌ 单币别兜底搜索失败:', error);
                                commitSearchData(currentSearchData, { quiet: silent });
                            });
                    }

                    // 兜底修复：勾选 Show Win/Loss Only 且无明细时，保留空表行，但 totals 使用“同条件去掉 Win/Loss 过滤”结果
                    if (showCaptureOnly && totalAccounts === 0) {
                        let fallbackUrl = `/api/transactions/search_api.php?date_from=${dateFrom}&date_to=${dateTo}&show_inactive=${showInactive}&show_capture_only=0&hide_zero_balance=${hideZero}`;
                        if (categoryParam) {
                            fallbackUrl += `&category=${encodeURIComponent(categoryParam)}`
                        }
                        if (currentCompanyId) {
                            fallbackUrl += `&company_id=${currentCompanyId}`;
                        }
                        if (!showAllCurrencies && selectedCurrencies.length > 0) {
                            fallbackUrl += `&currency=${selectedCurrencies.join(',')}`;
                        }
                        fallbackUrl += '&_t=' + Date.now();

                        if (loadingEl && !silent) {
                            loadingEl.textContent = 'Loading data';
                            loadingEl.style.display = 'flex';
                        }

                        return fetch(fallbackUrl, {
                            method: 'GET',
                            cache: 'no-cache',
                            headers: {
                                'Cache-Control': 'no-cache'
                            },
                            signal
                        })
                            .then(resp => resp.json())
                            .then(fallback => {
                                if (loadingEl) loadingEl.style.display = 'none';
                                if (!fallback.success || !fallback.data || !fallback.data.totals) {
                                    commitSearchData(currentSearchData, { quiet: silent });
                                    return;
                                }

                                const rebuiltData = {
                                    ...currentSearchData,
                                    totals: fallback.data.totals
                                };
                                commitSearchData(rebuiltData, { quiet: silent });
                            })
                            .catch(error => {
                                if (error && error.name === 'AbortError') return;
                                if (loadingEl) loadingEl.style.display = 'none';
                                console.error('❌ Win/Loss 空结果 totals 兜底失败:', error);
                                commitSearchData(currentSearchData, { quiet: silent });
                            });
                    }

                    if (loadingEl) loadingEl.style.display = 'none';
                    commitSearchData(currentSearchData, { quiet: silent });
                } else {
                    if (loadingEl) loadingEl.style.display = 'none';
                    console.error('❌ 搜索失败:', data.error);
                    if (!silent && tablesSection) tablesSection.style.display = 'none';
                    showNotification(data.error || 'Search failed', 'error');
                }
            })
            .catch(error => {
                if (error && error.name === 'AbortError') return;
                if (loadingEl) loadingEl.style.display = 'none';
                if (!silent && tablesSection) tablesSection.style.display = 'none';
                console.error('❌ 搜索失败:', error);
                showNotification('Search failed: ' + error.message, 'error');
            })
            .finally(() => {
                if (activeSearchKey === requestKey) {
                    isSearchInFlight = false;
                    activeSearchKey = '';
                }
            });
    }

    // ==================== 渲染表格与总计 ====================
    // 可选第三个参数 totalsFromApi：仅当 left/right 与本次展示行完全一致时使用，跳过前端合计
    function renderTables(leftRows, rightRows, totalsFromApi) {
        const normalizedRows = normalizeRateRowsByCrDr(leftRows, rightRows);
        // 按 role 排序数据
        const sortedLeftRows = sortByRole(normalizedRows.leftRows);
        const sortedRightRows = sortByRole(normalizedRows.rightRows);

        currentDisplayData = {
            left_table: [...sortedLeftRows],
            right_table: [...sortedRightRows]
        };

        // 如果选择 All 或选择了多个 currency，按 currency 分组显示
        if (showAllCurrencies || selectedCurrencies.length > 1) {
            const showZero = document.getElementById('show_zero_balance')?.checked || false;
            const activeCurrencyCodes = (lastSearchData && lastSearchData.active_currency_codes && lastSearchData.active_currency_codes.length) ? lastSearchData.active_currency_codes : null;
            renderCurrencyGroupedTables(sortedLeftRows, sortedRightRows, { showZero, activeCurrencyCodes });
        } else {
            // 只选择了一个 currency，显示默认表格
            document.getElementById('default-tables-container').style.display = 'flex';
            document.getElementById('currency-grouped-tables-container').style.display = 'none';

            // 显示 currency 标题
            const currencyTitle = document.getElementById('default-currency-title');
            if (currencyTitle && selectedCurrencies.length === 1) {
                currencyTitle.textContent = `Currency: ${selectedCurrencies[0]}`;
                currencyTitle.style.display = 'block';
            } else {
                currencyTitle.style.display = 'none';
            }

            fillTable('tbody_left', 'table_left', sortedLeftRows);
            fillTable('tbody_right', 'table_right', sortedRightRows);

            let leftTotals;
            let rightTotals;
            let summaryTotals;
            if (totalsFromApi && totalsFromApi.left && totalsFromApi.right && totalsFromApi.summary) {
                leftTotals = totalsFromApi.left;
                rightTotals = totalsFromApi.right;
                summaryTotals = totalsFromApi.summary;
            } else {
                const ltWl = calculateTotals(sortedLeftRows);
                const rtWl = calculateTotals(sortedRightRows);
                leftTotals = ltWl;
                rightTotals = rtWl;
                summaryTotals = {
                    bf: MoneyDecimal.add(leftTotals.bf, rightTotals.bf).toString(),
                    win_loss: MoneyDecimal.add(leftTotals.win_loss, rightTotals.win_loss).toString(),
                    cr_dr: MoneyDecimal.add(leftTotals.cr_dr, rightTotals.cr_dr).toString(),
                    balance: MoneyDecimal.add(leftTotals.balance, rightTotals.balance).toString()
                };
            }

            updateTotals('left', leftTotals);
            updateTotals('right', rightTotals);
            updateSummary(summaryTotals);
        }
    }

    // ==================== 按 Currency 分组渲染表格 ====================
    // options: { showZero, activeCurrencyCodes } — 当 Show 0 balance 勾选时，只显示 Edit Account 里 active 的货币
    function renderCurrencyGroupedTables(leftRows, rightRows, options) {
        options = options || {};
        // 隐藏默认表格，显示分组表格容器
        document.getElementById('default-tables-container').style.display = 'none';
        const groupedContainer = document.getElementById('currency-grouped-tables-container');
        groupedContainer.style.display = 'block';
        groupedContainer.innerHTML = '';

        // 按 currency 分组
        const groupedByCurrency = {};

        // 左右表格数据已经由后端根据 balance 正负正确分配，前端不需要重新分配
        // 直接按 currency 分组显示即可
        leftRows.forEach(row => {
            const currency = row.currency || 'UNKNOWN';
            if (!groupedByCurrency[currency]) {
                groupedByCurrency[currency] = { left: [], right: [] };
            }
            groupedByCurrency[currency].left.push(row);
        });

        rightRows.forEach(row => {
            const currency = row.currency || 'UNKNOWN';
            if (!groupedByCurrency[currency]) {
                groupedByCurrency[currency] = { left: [], right: [] };
            }
            groupedByCurrency[currency].right.push(row);
        });

        // 为每个 currency 创建表格组
        // 按照 currencyList 的顺序排序（从旧到新），而不是按字母排序
        let currencies = [];
        currencyList.forEach(currencyItem => {
            if (groupedByCurrency[currencyItem.code]) {
                currencies.push(currencyItem.code);
            }
        });
        // 如果有些 currency 不在 currencyList 中（理论上不应该发生），也添加进去
        Object.keys(groupedByCurrency).forEach(code => {
            if (!currencies.includes(code)) {
                currencies.push(code);
            }
        });
        // Show 0 balance 勾选时，只显示 Edit Account 里勾选为 active 的货币
        if (options.showZero && options.activeCurrencyCodes && options.activeCurrencyCodes.length > 0) {
            const activeSet = new Set(options.activeCurrencyCodes.map(c => (c || '').toUpperCase()));
            currencies = currencies.filter(code => activeSet.has((code || '').toUpperCase()));
        }

        let totalSummary = { bf: 0, win_loss: 0, cr_dr: 0, balance: 0 };

        currencies.forEach((currency, index) => {
            const currencyData = groupedByCurrency[currency];
            // 按 role 排序每个 currency 分组内的数据
            const leftRows = sortByRole(currencyData.left);
            const rightRows = sortByRole(currencyData.right);

            // 创建 currency 标题
            const currencyTitle = document.createElement('h3');
            currencyTitle.style.cssText = 'margin: 20px 0 10px 0; font-size: clamp(14px, 1.2vw, 18px); font-weight: bold; color: #1f2937;';
            currencyTitle.textContent = `Currency: ${currency}`;
            groupedContainer.appendChild(currencyTitle);

            // 创建表格容器
            const tablesWrapper = document.createElement('div');
            tablesWrapper.style.cssText = 'display: flex; gap: 20px; margin-bottom: 20px;';

            // 左表
            const leftWrapper = document.createElement('div');
            leftWrapper.className = 'transaction-table-wrapper';
            const leftTable = createCurrencyTable(`currency_${currency}_left`, leftRows);
            leftWrapper.appendChild(leftTable);
            tablesWrapper.appendChild(leftWrapper);

            // 右表
            const rightWrapper = document.createElement('div');
            rightWrapper.className = 'transaction-table-wrapper';
            const rightTable = createCurrencyTable(`currency_${currency}_right`, rightRows);
            rightWrapper.appendChild(rightTable);
            tablesWrapper.appendChild(rightWrapper);

            groupedContainer.appendChild(tablesWrapper);

            // 计算该 currency 的汇总
            const leftTotals = calculateTotals(leftRows);
            const rightTotals = calculateTotals(rightRows);
            const currencySummary = {
                bf: MoneyDecimal.add(leftTotals.bf, rightTotals.bf).toString(),
                win_loss: MoneyDecimal.add(leftTotals.win_loss, rightTotals.win_loss).toString(),
                cr_dr: MoneyDecimal.add(leftTotals.cr_dr, rightTotals.cr_dr).toString(),
                balance: MoneyDecimal.add(leftTotals.balance, rightTotals.balance).toString()
            };

            // 累加到总汇总
            totalSummary.bf = MoneyDecimal.add(totalSummary.bf, currencySummary.bf).toString();
            totalSummary.win_loss = MoneyDecimal.add(totalSummary.win_loss, currencySummary.win_loss).toString();
            totalSummary.cr_dr = MoneyDecimal.add(totalSummary.cr_dr, currencySummary.cr_dr).toString();
            totalSummary.balance = MoneyDecimal.add(totalSummary.balance, currencySummary.balance).toString();

            // 为该 currency 创建 Summary Table
            const summaryWrapper = document.createElement('div');
            // summaryWrapper.style.cssText = 'margin-bottom: 30px;';
            const summaryTable = createCurrencySummaryTable(`currency_${currency}_summary`, currencySummary);
            summaryWrapper.appendChild(summaryTable);
            groupedContainer.appendChild(summaryWrapper);
        });

        // 隐藏全局的 summary section（只显示每个 currency 的 summary）
        document.querySelector('.transaction-summary-section').style.display = 'none';
    }

    // ==================== 创建 Currency Summary Table ====================
    function createCurrencySummaryTable(tableId, totals) {
        const table = document.createElement('table');
        table.className = 'transaction-summary-table';
        table.id = tableId;
        table.style.cssText = 'margin: 0 auto; max-width: 400px;';

        // 表头
        const thead = document.createElement('thead');
        thead.innerHTML = `
        <tr class="transaction-table-header">
            <th colspan="2">Total</th>
        </tr>
    `;
        table.appendChild(thead);

        // 表体
        const tbody = document.createElement('tbody');
        tbody.innerHTML = `
        <tr class="transaction-table-row">
            <td class="transaction-summary-label">B/F</td>
            <td>${formatPaymentHistoryMoney(totals.bf)}</td>
        </tr>
        <tr class="transaction-table-row">
            <td class="transaction-summary-label">Win/Loss</td>
            <td>${formatPaymentHistoryMoney(totals.win_loss)}</td>
        </tr>
        <tr class="transaction-table-row">
            <td class="transaction-summary-label">Cr/Dr</td>
            <td>${formatPaymentHistoryMoney(totals.cr_dr)}</td>
        </tr>
        <tr class="transaction-table-row">
            <td class="transaction-summary-label">Balance</td>
            <td>${formatPaymentHistoryMoney(totals.balance)}</td>
        </tr>
    `;
        table.appendChild(tbody);

        return table;
    }

    // ==================== 创建 Currency 表格 ====================
    function createCurrencyTable(tableId, rows) {
        const table = document.createElement('table');
        table.className = 'transaction-table';
        table.id = tableId;

        // 检查是否显示名称
        const showName = document.getElementById('show_name')?.checked || false;

        // 表头
        const thead = document.createElement('thead');
        thead.innerHTML = `
        <tr class="transaction-table-header">
            <th>Account</th>
            <th class="transaction-name-column" style="display: ${showName ? '' : 'none'};">Name</th>
            <th>B/F</th>
            <th>Win/Loss</th>
            <th>Cr/Dr</th>
            <th>Balance</th>
        </tr>
    `;
        table.appendChild(thead);

        // 表体
        const tbody = document.createElement('tbody');
        tbody.id = `tbody_${tableId}`;

        if (rows && rows.length > 0) {
            const fallbackRoleClass = getSingleSelectedCategoryRoleClass();

            // 判断是左边还是右边的表格（根据 tableId 判断）
            const isLeftTable = tableId.includes('_left');

            rows.forEach(row => {
                const tr = document.createElement('tr');
                // 如果 is_alert 为 true，添加 alert class
                const alertClass = (row.is_alert == 1 || row.is_alert === true) ? ' transaction-alert-row' : '';
                tr.className = 'transaction-table-row' + alertClass;

                // 获取 role 对应的 CSS class
                const roleClass = getRoleClass(row.role || '') || fallbackRoleClass;
                const accountCellClass = roleClass
                    ? `transaction-account-cell ${roleClass}`
                    : 'transaction-account-cell';

                // Win/Loss、Cr/Dr、Balance 一律沿用后端符号，不在前端 Math.abs 强转正负（与 Payment History / 合计一致）
                const winLossValue = row.win_loss;
                const crDrValue = row.cr_dr;
                const balanceValue = row.balance;

                tr.innerHTML = `
                <td class="${accountCellClass}" data-account-id="${row.account_db_id}" data-account-code="${row.account_id}" data-account-name="${row.account_name}" data-currency="${row.currency || ''}" style="cursor:pointer;">
                    ${row.account_id}
                </td>
                <td class="transaction-name-column" style="display: ${showName ? '' : 'none'};">${toUpperDisplay(row.account_name)}</td>
                <td>${formatPaymentHistoryMoney(row.bf)}</td>
                <td>${formatPaymentHistoryMoney(winLossValue)}</td>
                <td>${formatPaymentHistoryMoney(crDrValue)}</td>
                <td class="transaction-balance-cell" data-account-id="${row.account_db_id}" data-account-code="${row.account_id}" data-balance="${balanceValue}" data-crdr="${row.cr_dr}" data-currency="${row.currency || ''}" style="cursor:pointer;">${formatPaymentHistoryMoney(balanceValue)}</td>
            `;

                // 点击账户单元格打开历史记录
                tr.querySelector('.transaction-account-cell').addEventListener('click', function () {
                    openHistoryModal(
                        this.getAttribute('data-account-id'),
                        this.getAttribute('data-account-code'),
                        this.getAttribute('data-account-name'),
                        this.getAttribute('data-currency')
                    );
                });

                // 点击 balance 单元格同步数据到表单
                tr.querySelector('.transaction-balance-cell').addEventListener('click', function () {
                    handleBalanceClick(this, isLeftTable);
                });

                tbody.appendChild(tr);
            });
        }

        table.appendChild(tbody);

        // 表脚
        const tfoot = document.createElement('tfoot');
        const totals = calculateTotals(rows);
        tfoot.innerHTML = `
        <tr class="transaction-table-footer">
            <td>Total</td>
            <td class="transaction-name-column" style="display: ${showName ? '' : 'none'};"></td>
            <td>${formatPaymentHistoryMoney(totals.bf)}</td>
            <td>${formatPaymentHistoryMoney(totals.win_loss)}</td>
            <td>${formatPaymentHistoryMoney(totals.cr_dr)}</td>
            <td>${formatPaymentHistoryMoney(totals.balance)}</td>
        </tr>
    `;
        table.appendChild(tfoot);

        return table;
    }

    function calculateTotals(rows) {
        const acc = rows.reduce((totals, row) => {
            totals.bf = MoneyDecimal.add(totals.bf, row.bf || '0').toString();
            totals.win_loss = MoneyDecimal.add(totals.win_loss, winLossFullForTotal(row)).toString();
            totals.cr_dr = MoneyDecimal.add(totals.cr_dr, row.cr_dr || '0').toString();
            return totals;
        }, { bf: '0', win_loss: '0', cr_dr: '0' });
        acc.win_loss = MoneyDecimal.formatFixed(acc.win_loss, 2);
        acc.balance = MoneyDecimal.formatFixed(
            MoneyDecimal.add(MoneyDecimal.add(acc.bf, acc.win_loss), acc.cr_dr),
            2
        );
        return acc;
    }

    // ==================== 处理 Balance 点击事件 ====================
    function handleBalanceClick(balanceCell, isLeftTable) {
        const accountId = balanceCell.getAttribute('data-account-id');
        const accountCode = balanceCell.getAttribute('data-account-code') || '';
        const balance = balanceCell.getAttribute('data-balance');
        const rowCrDr = balanceCell.getAttribute('data-crdr');
        const currency = balanceCell.getAttribute('data-currency');
        const rowCurrency = (currency && String(currency).trim()) ? String(currency).trim().toUpperCase() : '';

        const isRateView = isRateTypeSelected();
        const currentType = document.getElementById('transaction_type')?.value || '';
        const isProfitType = !isRateView && currentType === 'PROFIT';
        const parsedBalanceForSide = parseBalanceValue(balance);
        const numericCrDr = parseBalanceValue(rowCrDr);
        // RATE 场景：按你要求用“点左表/点右表”决定落点
        const treatAsPositiveRow = isRateView
            ? isLeftTable
            : (isProfitType ? (parsedBalanceForSide === null ? isLeftTable : MoneyDecimal.cmp(parsedBalanceForSide, '0') >= 0) : isLeftTable);

        // 获取表单元素
        // RATE 页面：
        // - rate_account_from 显示 "Select To Account"
        // - rate_account_to   显示 "Select From Account"
        // RATE（按你要求）：
        // - 点左表：第2行填左边 Select To（rate_account_from）；第4行填右边 Select From（rate_transfer_to_account）
        // - 点右表：第2行填右边 Select From（rate_account_to）；第4行填左边 Select To（rate_transfer_from_account）
        const rateSelectToBtn = document.getElementById('rate_account_from');   // UI: Select To Account
        const rateSelectFromBtn = document.getElementById('rate_account_to');  // UI: Select From Account
        const positiveAccountSelect = isRateView
            ? (isLeftTable ? rateSelectToBtn : rateSelectFromBtn)
            : document.getElementById('action_account_from');
        const negativeAccountSelect = isRateView
            ? (isLeftTable ? rateSelectToBtn : rateSelectFromBtn)
            : document.getElementById('action_account_id');
        const rateTransferAmountInput = document.getElementById('rate_transfer_amount');
        const rateTransferFromSelect = document.getElementById('rate_transfer_from_account');
        const rateTransferToSelect = document.getElementById('rate_transfer_to_account');
        const amountInput = isRateView
            ? rateTransferAmountInput
            : document.getElementById('action_amount');
        const currencySelect = isRateView
            ? (treatAsPositiveRow ? document.getElementById('rate_currency_to') : document.getElementById('rate_currency_from'))
            : document.getElementById('transaction_currency');
        const currencyAmountInput = isRateView
            ? (treatAsPositiveRow ? document.getElementById('rate_currency_to_amount') : document.getElementById('rate_currency_from_amount'))
            : null;

        let accountSet = false;
        let accountCurrency = null; // 从账户列表中获取的 currency
        // 同步币种优先用表格行币种（与当前余额行口径一致），没有再用账户主币种
        let syncCurrency = rowCurrency || null;

        // 根据 account_db_id 找到对应的 display_text
        // 首先尝试通过 ID 匹配（支持字符串和数字类型）
        let accountDisplayText = '';
        let foundAccountCode = accountCode;

        // 将 accountId 转换为字符串和数字两种格式进行比较
        const accountIdStr = String(accountId);
        const accountIdNum = parseInt(accountId, 10);

        for (let [displayText, data] of accountDataMap.entries()) {
            // 尝试多种匹配方式：严格相等、字符串比较、数字比较
            if (data.id == accountId ||
                String(data.id) === accountIdStr ||
                parseInt(data.id, 10) === accountIdNum ||
                data.account_id === accountCode) {
                accountDisplayText = displayText;
                accountCurrency = data.currency;
                if (!syncCurrency && data.currency) {
                    syncCurrency = String(data.currency).trim().toUpperCase();
                }
                foundAccountCode = data.account_id || accountCode;
                break;
            }
        }

        // 如果通过 ID 找不到，尝试通过 account_code 查找
        if (!accountDisplayText && accountCode) {
            for (let [displayText, data] of accountDataMap.entries()) {
                if (data.account_id === accountCode) {
                    accountDisplayText = displayText;
                    accountCurrency = data.currency;
                    if (!syncCurrency && data.currency) {
                        syncCurrency = String(data.currency).trim().toUpperCase();
                    }
                    foundAccountCode = data.account_id || accountCode;
                    break;
                }
            }
        }

        // 如果仍然找不到，使用 accountCode 作为 display_text（fallback）
        if (!accountDisplayText) {
            console.warn('⚠️ 账户未在 accountDataMap 中找到，使用 accountCode 作为 fallback:', {
                accountId: accountId,
                accountCode: accountCode,
                accountDataMapSize: accountDataMap.size
            });
            // 使用 accountCode 作为 display_text，这样至少可以填充账户代码
            accountDisplayText = accountCode || 'Unknown Account';
            foundAccountCode = accountCode;
            // 不返回错误，继续执行，让用户至少能看到账户代码被填充
        }

        // 根据是左边还是右边的表格，填充到对应的账户字段
        // RATE：第一组按点左/点右决定落点
        if (treatAsPositiveRow) {
            // 左边表格（正数）
            if (positiveAccountSelect) {
                positiveAccountSelect.textContent = accountDisplayText;
                positiveAccountSelect.setAttribute('data-value', accountId);
                positiveAccountSelect.setAttribute('data-account-code', foundAccountCode);
                if (syncCurrency) {
                    positiveAccountSelect.setAttribute('data-currency', syncCurrency);
                } else {
                    positiveAccountSelect.removeAttribute('data-currency');
                }
                // CONTRA：点击表格行属于“系统自动填充”，允许一次性把 Currency 跟随该账户
                if (!isRateView && currentType === 'CONTRA') {
                    positiveAccountSelect.setAttribute('data-auto-currency-sync', '1');
                }
                accountSet = true;
                // RATE：点左表 -> 第4行填右边 Select From（rate_transfer_to_account）
                const rateTransferTargetBtn = isRateView ? document.getElementById('rate_transfer_to_account') : null;
                if (isRateView && rateTransferTargetBtn) {
                    rateTransferTargetBtn.textContent = accountDisplayText;
                    rateTransferTargetBtn.setAttribute('data-value', accountId);
                    rateTransferTargetBtn.setAttribute('data-account-code', foundAccountCode);
                    if (syncCurrency) {
                        rateTransferTargetBtn.setAttribute('data-currency', syncCurrency);
                    } else {
                        rateTransferTargetBtn.removeAttribute('data-currency');
                    }
                }
            }
        } else {
            // 右边表格（负数）
            if (negativeAccountSelect) {
                negativeAccountSelect.textContent = accountDisplayText;
                negativeAccountSelect.setAttribute('data-value', accountId);
                negativeAccountSelect.setAttribute('data-account-code', foundAccountCode);
                if (syncCurrency) {
                    negativeAccountSelect.setAttribute('data-currency', syncCurrency);
                } else {
                    negativeAccountSelect.removeAttribute('data-currency');
                }
                // CONTRA：点击表格行属于“系统自动填充”，允许一次性把 Currency 跟随该账户
                if (!isRateView && currentType === 'CONTRA') {
                    negativeAccountSelect.setAttribute('data-auto-currency-sync', '1');
                }
                accountSet = true;
                // RATE：点右表 -> 第4行填左边 Select To（rate_transfer_from_account）
                const rateTransferTargetBtn = isRateView ? document.getElementById('rate_transfer_from_account') : null;
                if (isRateView && rateTransferTargetBtn) {
                    rateTransferTargetBtn.textContent = accountDisplayText;
                    rateTransferTargetBtn.setAttribute('data-value', accountId);
                    rateTransferTargetBtn.setAttribute('data-account-code', foundAccountCode);
                    if (syncCurrency) {
                        rateTransferTargetBtn.setAttribute('data-currency', syncCurrency);
                    } else {
                        rateTransferTargetBtn.removeAttribute('data-currency');
                    }
                }
            }
        }

        // 填充金额（使用原始 balance 值，去除格式化）
        let amountSet = false;
        if (amountInput && balance) {
            // 确保 balance 是数字格式（去除逗号等格式化字符）
            const numericBalance = parseBalanceValue(balance);
            if (numericBalance !== null) {
                const absBalance = MoneyDecimal.abs(numericBalance).toString();
                amountInput.value = MoneyDecimal.formatFixed(absBalance, 2);
                if (currencyAmountInput) {
                    if (isRateView) {
                        // RATE 模式（按你的要求）：
                        // Select From -> 正数；Select To -> 负数
                        // 这里维持原本左右字段映射，只调整符号方向
                        currencyAmountInput.value = treatAsPositiveRow
                            ? MoneyDecimal.formatFixed(absBalance, 2)
                            : MoneyDecimal.formatFixed(MoneyDecimal.toDecimal(absBalance).neg(), 2);
                    } else {
                        currencyAmountInput.value = MoneyDecimal.formatFixed(absBalance, 2);
                    }
                }
                amountSet = true;
            }
        }

        // 设置 currency：余额列数字以表格行币种为准（与筛选/展示一致），无行币种再用账户主币种
        let currencySet = false;
        let currencyToSet = null;
        currencyToSet = syncCurrency || (accountCurrency ? String(accountCurrency).trim().toUpperCase() : null);
        if (currencyToSet) {
            // RATE：币种跟随点击的账户（对齐 CLAIM），只同步 rate_currency_from；rate_currency_to 仍由系统默认（例如 MYR）
            const currencySelectForSync = isRateView ? document.getElementById('rate_currency_from') : currencySelect
            if (currencySelectForSync) {
                const currencyOption = Array.from(currencySelectForSync.options).find(opt => opt.value === currencyToSet)
                if (currencyOption && currencySelectForSync.value !== currencyToSet) {
                    currencySelectForSync.value = currencyToSet
                    currencySet = true
                }
            }
        }

        console.log('✅ Balance 点击同步:', {
            accountId,
            accountCode,
            balance,
            numericBalance,
            currency,
            accountCurrency,
            type: currentType,
            targetSide: treatAsPositiveRow ? 'positive' : 'negative',
            accountSet,
            amountSet,
            currencySet
        });

        // 构建通知消息
        const parts = [];
        if (accountSet) {
            if (isProfitType) {
                parts.push(`${treatAsPositiveRow ? 'From' : 'To'} Account: ${accountCode}`);
            } else {
                parts.push(`${treatAsPositiveRow ? 'From' : 'To'} Account: ${accountCode}`);
            }
        }
        if (amountSet) {
            parts.push(`Amount: ${formatNumber(balance)}`);
        }
        if (currencySet && currencyToSet) {
            parts.push(`Currency: ${currencyToSet}`);
        }

        if (parts.length > 0) {
            showNotification(`Synced ${parts.join(', ')}`, 'success');
        } else if (amountSet) {
            showNotification(`Synced Amount: ${formatNumber(balance)}`, 'success');
        }
    }

    // ==================== 填充表格（首屏优先渲染，其余渐进追加，实现「直接显示」）====================
    var FILL_TABLE_FIRST_PAINT_ROWS = 40;
    var FILL_TABLE_CHUNK_ROWS = 30;

    function fillTable(tbodyId, tableId, data) {
        const tbody = document.getElementById(tbodyId);
        const table = document.getElementById(tableId);
        tbody.innerHTML = '';

        const showName = document.getElementById('show_name')?.checked || false;
        const isLeftTable = tableId === 'table_left';
        const fallbackRoleClass = getSingleSelectedCategoryRoleClass();

        const nameHeader = table.querySelector('thead th.transaction-name-column');
        const nameFooter = table.querySelector('tfoot td.transaction-name-column');
        if (nameHeader) nameHeader.style.display = showName ? '' : 'none';
        if (nameFooter) nameFooter.style.display = showName ? '' : 'none';

        if (!data || data.length === 0) return;

        function buildRow(row) {
            const tr = document.createElement('tr');
            const alertClass = (row.is_alert == 1 || row.is_alert === true) ? ' transaction-alert-row' : '';
            tr.className = 'transaction-table-row' + alertClass;
            const roleClass = getRoleClass(row.role || '') || fallbackRoleClass;
            const accountCellClass = roleClass ? `transaction-account-cell ${roleClass}` : 'transaction-account-cell';
            tr.innerHTML = `
            <td class="${accountCellClass}" data-account-id="${row.account_db_id}" data-account-code="${row.account_id}" data-account-name="${row.account_name}" data-currency="${row.currency || ''}" style="cursor:pointer;">${row.account_id}</td>
            <td class="transaction-name-column" style="display: ${showName ? '' : 'none'};">${toUpperDisplay(row.account_name)}</td>
            <td>${formatPaymentHistoryMoney(row.bf)}</td>
            <td>${formatPaymentHistoryMoney(row.win_loss)}</td>
            <td>${formatPaymentHistoryMoney(row.cr_dr)}</td>
            <td class="transaction-balance-cell" data-account-id="${row.account_db_id}" data-account-code="${row.account_id}" data-balance="${row.balance}" data-crdr="${row.cr_dr}" data-currency="${row.currency || ''}" style="cursor:pointer;">${formatPaymentHistoryMoney(row.balance)}</td>
        `;
            tr.querySelector('.transaction-account-cell').addEventListener('click', function () {
                openHistoryModal(this.getAttribute('data-account-id'), this.getAttribute('data-account-code'), this.getAttribute('data-account-name'), this.getAttribute('data-currency'));
            });
            tr.querySelector('.transaction-balance-cell').addEventListener('click', function () {
                handleBalanceClick(this, isLeftTable);
            });
            return tr;
        }

        function appendRangeToFragment(frag, from, to) {
            for (var i = from; i < to; i++) {
                frag.appendChild(buildRow(data[i]));
            }
        }

        var total = data.length;
        if (total <= FILL_TABLE_FIRST_PAINT_ROWS) {
            var fragAll = document.createDocumentFragment();
            appendRangeToFragment(fragAll, 0, total);
            tbody.appendChild(fragAll);
            return;
        }
        // 先渲染首屏行，DocumentFragment 一次挂载，减少多次 reflow
        var fragFirst = document.createDocumentFragment();
        appendRangeToFragment(fragFirst, 0, FILL_TABLE_FIRST_PAINT_ROWS);
        tbody.appendChild(fragFirst);
        var index = FILL_TABLE_FIRST_PAINT_ROWS;
        function chunk() {
            var end = Math.min(index + FILL_TABLE_CHUNK_ROWS, total);
            var fragChunk = document.createDocumentFragment();
            appendRangeToFragment(fragChunk, index, end);
            tbody.appendChild(fragChunk);
            index = end;
            if (index < total) requestAnimationFrame(chunk);
        }
        requestAnimationFrame(chunk);
    }

    // ==================== 更新总和 ====================
    function updateTotals(side, totals) {
        document.getElementById(`${side}_total_bf`).textContent = formatPaymentHistoryMoney(totals.bf);
        document.getElementById(`${side}_total_winloss`).textContent = formatPaymentHistoryMoney(totals.win_loss);
        document.getElementById(`${side}_total_crdr`).textContent = formatPaymentHistoryMoney(totals.cr_dr);
        document.getElementById(`${side}_total_balance`).textContent = formatPaymentHistoryMoney(totals.balance);
    }

    // ==================== 更新汇总 ====================
    function updateSummary(totals) {
        document.getElementById('sum_total_bf').textContent = formatPaymentHistoryMoney(totals.bf);
        document.getElementById('sum_total_winloss').textContent = formatPaymentHistoryMoney(totals.win_loss);
        document.getElementById('sum_total_crdr').textContent = formatPaymentHistoryMoney(totals.cr_dr);
        document.getElementById('sum_total_balance').textContent = formatPaymentHistoryMoney(totals.balance);
    }

    // ==================== Show Name 切换 ====================
    function toggleShowName() {
        const showName = document.getElementById('show_name')?.checked || false;

        // 切换所有表格的 Name 列显示状态
        const tables = document.querySelectorAll('.transaction-table');
        tables.forEach(table => {
            // 切换表头
            const nameHeaders = table.querySelectorAll('thead th.transaction-name-column');
            nameHeaders.forEach(header => {
                header.style.display = showName ? '' : 'none';
            });

            // 切换表脚
            const nameFooters = table.querySelectorAll('tfoot td.transaction-name-column');
            nameFooters.forEach(footer => {
                footer.style.display = showName ? '' : 'none';
            });

            // 切换表体中的 Name 列
            const nameCells = table.querySelectorAll('tbody td.transaction-name-column');
            nameCells.forEach(cell => {
                cell.style.display = showName ? '' : 'none';
            });
        });

        console.log('✅ Show Name 已切换:', showName);
    }

    // 未勾选 Show 0 balance：Balance≈0 且四列≈0 时保留条件：本期 Cr/Dr、本期非零金额 W/L，或本期 Data Capture 带 id_product 的明细（金额可为 0，与 Payment History 一致）。
    function rowPassesHideZeroBalanceFilter(showZero, row) {
        if (showZero) return true;
        const num = parseBalanceValue(row.balance);
        if (num === null) return true;
        if (MoneyDecimal.toDecimal(num).abs().gt('0.00001')) return true;
        const flagToBool = (v) => {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v !== 0;
            return parseInt(v || '0', 10) !== 0;
        };
        const absVal = (v) => {
            try {
                return MoneyDecimal.toDecimal(v || '0').abs();
            } catch (_) {
                return MoneyDecimal.toDecimal('0');
            }
        };
        const eps = '0.00001';
        const hasAnyMoneyColumn =
            absVal(row.bf).gt(eps) ||
            absVal(row.win_loss).gt(eps) ||
            absVal(row.cr_dr).gt(eps);
        if (hasAnyMoneyColumn) return true;
        const hasTxnFlag =
            flagToBool(row.has_win_loss_transactions) ||
            flagToBool(row.has_crdr_transactions) ||
            flagToBool(row.has_period_id_product_rows);
        return hasTxnFlag;
    }

    // ==================== 根据 Show 0 balance 过滤前端行并渲染 ====================
    function applyZeroBalanceFilterAndRender() {
        if (!lastSearchData) {
            return;
        }
        const showZero = document.getElementById('show_zero_balance')?.checked || false;
        const showPaymentOnly = document.getElementById('show_inactive')?.checked || false;
        const showWinLossOnly = document.getElementById('show_capture_only')?.checked || false;
        const rawLeft = lastSearchData.left_table || [];
        const rawRight = lastSearchData.right_table || [];

        // 先应用 Show Payment Only / Show Win/Loss 过滤（如有）
        // 双勾选时：显示有 Cr/Dr 或有 Win/Loss 的行；仅勾选 Show Payment：只显示有 Cr/Dr 的行
        let filteredLeft = rawLeft;
        let filteredRight = rawRight;

        if (showPaymentOnly) {
            const eps = 0.00001;
            const hasCrdr = row => {
                const byFlag = (typeof row.has_crdr_transactions === 'boolean')
                    ? row.has_crdr_transactions
                    : ((typeof row.has_crdr_transactions === 'number')
                        ? row.has_crdr_transactions !== 0
                        : parseInt(row.has_crdr_transactions || '0', 10) !== 0);
                // Fallback: if backend flag is missing/inconsistent, trust numeric Cr/Dr value.
                const crdr = parseBalanceValue(row.cr_dr);
                const byValue = crdr !== null && MoneyDecimal.toDecimal(crdr).abs().gt('0.00001');
                return byFlag || byValue;
            };
            const hasWinLoss = row => {
                const byFlag = (typeof row.has_win_loss_transactions === 'boolean')
                    ? row.has_win_loss_transactions
                    : ((typeof row.has_win_loss_transactions === 'number')
                        ? row.has_win_loss_transactions !== 0
                        : parseInt(row.has_win_loss_transactions || '0', 10) !== 0);
                const wl = parseBalanceValue(row.win_loss);
                const byValue = wl !== null && MoneyDecimal.toDecimal(wl).abs().gt('0.00001');
                return byFlag || byValue;
            };
            const shouldShow = showWinLossOnly
                ? (row) => hasCrdr(row) || hasWinLoss(row)
                : hasCrdr;
            filteredLeft = rawLeft.filter(shouldShow);
            filteredRight = rawRight.filter(shouldShow);

            // 不做回退：Show Payment Only 为空时应保持空结果，避免误判为筛选失效
        }

        // 再应用 Show 0 balance 过滤
        const filterFn = (row) => rowPassesHideZeroBalanceFilter(showZero, row);

        filteredLeft = filteredLeft.filter(filterFn);
        filteredRight = filteredRight.filter(filterFn);

        // 可见行与本次搜索原始行一致时，底部合计用后端 totals（与 PHP money_add 链一致）；部分隐藏行时仅累加可见行，底部可能非零属预期。
        const fullRowset =
            filteredLeft.length === rawLeft.length &&
            filteredRight.length === rawRight.length;
        const totalsFromApi = (fullRowset && lastSearchData.totals) ? lastSearchData.totals : null;
        renderTables(filteredLeft, filteredRight, totalsFromApi);
    }

    // ==================== 处理复选框变化（改为前端重新渲染） ====================
    function handleCheckboxChange() {
        // Show 0 balance 勾选时后端只返回 account 的 active 货币；取消时返回全公司货币。需重新搜索以拿到正确数据
        if (lastSearchData) {
            searchTransactions();
        } else {
            applyZeroBalanceFilterAndRender();
        }
    }

    // ==================== 过滤无 Cr/Dr 交易的账号 ====================
    function filterCrDrAccounts() {
        if (!lastSearchData) {
            showNotification('Please perform search first', 'error');
            return;
        }

        const hasTxn = row => {
            if (typeof row.has_crdr_transactions === 'boolean') {
                return row.has_crdr_transactions;
            }
            if (typeof row.has_crdr_transactions === 'number') {
                return row.has_crdr_transactions !== 0;
            }
            return parseInt(row.has_crdr_transactions || '0', 10) !== 0;
        };

        const filteredLeft = lastSearchData.left_table.filter(hasTxn);
        const filteredRight = lastSearchData.right_table.filter(hasTxn);

        if (filteredLeft.length === 0 && filteredRight.length === 0) {
            showNotification('No PAYMENT/RECEIVE/CONTRA/CLAIM transactions in current date range', 'info');
            return;
        }

        renderTables(filteredLeft, filteredRight);
        showNotification('Hidden accounts without PAYMENT/RECEIVE/CONTRA/CLAIM transactions', 'success');
    }

    // ==================== 处理 Show Payment Only 过滤（与 Search 按钮功能相同）====================
    function handlePaymentOnlyFilter() {
        if (!lastSearchData) {
            showNotification('Please perform search first', 'error');
            return;
        }

        const showPaymentOnly = document.getElementById('show_inactive')?.checked || false;

        if (!showPaymentOnly) {
            applyZeroBalanceFilterAndRender();
            return;
        }

        const hasCrdr = row => {
            const byFlag = (typeof row.has_crdr_transactions === 'boolean')
                ? row.has_crdr_transactions
                : ((typeof row.has_crdr_transactions === 'number')
                    ? row.has_crdr_transactions !== 0
                    : parseInt(row.has_crdr_transactions || '0', 10) !== 0);
            const crdr = parseBalanceValue(row.cr_dr);
            const byValue = crdr !== null && MoneyDecimal.toDecimal(crdr).abs().gt('0.00001');
            return byFlag || byValue;
        };
        const hasWinLoss = row => {
            const wl = parseBalanceValue(row.win_loss);
            return wl !== null && MoneyDecimal.toDecimal(wl).abs().gt('0.00001');
        };
        const showWinLossOnly = document.getElementById('show_capture_only')?.checked || false;
        const shouldShow = showWinLossOnly
            ? (row) => hasCrdr(row) || hasWinLoss(row)
            : hasCrdr;

        let filteredLeft = lastSearchData.left_table.filter(shouldShow);
        let filteredRight = lastSearchData.right_table.filter(shouldShow);

        // 再应用 show_zero_balance 过滤（如果启用）
        const showZero = document.getElementById('show_zero_balance')?.checked || false;
        if (!showZero) {
            const filterFn = (row) => rowPassesHideZeroBalanceFilter(showZero, row);
            filteredLeft = filteredLeft.filter(filterFn);
            filteredRight = filteredRight.filter(filterFn);
        }

        if (filteredLeft.length === 0 && filteredRight.length === 0) {
            showNotification('No PAYMENT/RECEIVE/CONTRA/CLAIM transactions in current date range', 'info');
            return;
        }

        renderTables(filteredLeft, filteredRight);
    }

    // 提交成功后清空右侧表单（保留 Remark，便于连续多笔填同一备注）
    function clearTransactionFormAfterSuccessfulSubmit() {
        const byId = (id) => document.getElementById(id);
        const setVal = (node, v) => {
            if (node) node.value = v;
        };
        setVal(byId('action_amount'), '');
        setVal(byId('action_description'), '');
        const confirmCk = byId('confirm_submit');
        if (confirmCk) confirmCk.checked = false;
    }

    // ==================== 提交功能 ====================
    function submitAction() {
        if (isSubmittingTx) {
            console.log('Submission already in progress, ignoring duplicate click');
            return;
        }

        const type = document.getElementById('transaction_type').value;
        let effectiveType = (type === 'PROFIT') ? (document.querySelector('input[name="win_lose_side"]:checked')?.value || 'WIN') : type;
        const isRate = type === RATE_TYPE_VALUE;
        const isAdjustment = type === 'ADJUSTMENT';

        const standardToAccountInput = document.getElementById('action_account_id');
        const standardFromAccountInput = document.getElementById('action_account_from');
        const rateToAccountInput = document.getElementById('rate_account_to');
        const rateFromAccountInput = document.getElementById('rate_account_from');

        // PROFIT：第一个下拉为 To、第二个为 From；CONTRA/PAYMENT/RECEIVE/CLAIM/CLEAR 与 RATE：第一个为 To、第二个为 From，与 UI 标签一致
        const needsFromTo = ['CONTRA', 'PAYMENT', 'RECEIVE', 'CLAIM', 'CLEAR'].includes(effectiveType);
        const accountId = isRate ? getAccountId(rateFromAccountInput) : ((type === 'PROFIT' || isAdjustment) ? getAccountId(standardFromAccountInput) : (needsFromTo ? getAccountId(standardFromAccountInput) : getAccountId(standardToAccountInput)));
        const fromAccountId = isRate ? getAccountId(rateToAccountInput) : (isAdjustment ? '' : (type === 'PROFIT' ? getAccountId(standardToAccountInput) : (needsFromTo ? getAccountId(standardToAccountInput) : getAccountId(standardFromAccountInput))));

        const standardAmountInput = document.getElementById('action_amount');
        const rateCurrencyFromAmountInput = document.getElementById('rate_currency_from_amount');
        let amount = isRate
            ? (rateCurrencyFromAmountInput ? rateCurrencyFromAmountInput.value : '')
            : (standardAmountInput ? standardAmountInput.value : '');

        const standardDateInput = document.getElementById('transaction_date');
        const rateDateInput = document.getElementById('rate_transaction_date');
        const transactionDate = isRate
            ? (rateDateInput ? rateDateInput.value : '')
            : (standardDateInput ? standardDateInput.value : '');

        const description = document.getElementById('action_description').value;
        const sms = document.getElementById('action_sms').value;
        const rateCurrencyFromSelect = document.getElementById('rate_currency_from');
        const rateCurrencyToSelect = document.getElementById('rate_currency_to');
        const rateCurrencyFromAmount = rateCurrencyFromAmountInput ? rateCurrencyFromAmountInput.value : '';
        const rateCurrencyToAmount = document.getElementById('rate_currency_to_amount')?.value || '';
        const rateExchangeRateRaw = document.getElementById('rate_exchange_rate')?.value || '';
        const parsedRateExchange = parseRateExpression(rateExchangeRateRaw);
        const rateExchangeRate = parsedRateExchange.valid ? parsedRateExchange.value : 0;
        const rateTransferFromAccountInput = document.getElementById('rate_transfer_from_account');
        const rateTransferToAccountInput = document.getElementById('rate_transfer_to_account');
        const rateTransferAmount = document.getElementById('rate_transfer_amount')?.value || '';
        const rateMiddlemanAccountInput = document.getElementById('rate_middleman_account');
        const rateTransferFromAccount = getAccountId(rateTransferFromAccountInput);
        const rateTransferToAccount = getAccountId(rateTransferToAccountInput);
        const rateMiddlemanAccount = getAccountId(rateMiddlemanAccountInput);
        const rateMiddlemanRate = document.getElementById('rate_middleman_rate')?.value || '';
        const rateMiddlemanAmount = document.getElementById('rate_middleman_amount')?.value || '';

        // 验证
        if (!type) {
            showNotification('Please select transaction type', 'error');
            return;
        }
        if (!accountId) {
            showNotification('Please select To Account', 'error');
            return;
        }

        if (type === 'PROFIT') {
            const profitToAccountId = getAccountId(standardFromAccountInput);   // UI: Select To Account
            const profitFromAccountId = getAccountId(standardToAccountInput);   // UI: Select From Account

            if (!profitFromAccountId) {
                showNotification('PROFIT: Please select From Account', 'error');
                return;
            }

            // PROFIT 不做余额正负校验，仅限制 To / From 不能同一账户
            if (profitToAccountId && profitFromAccountId && String(profitToAccountId) === String(profitFromAccountId)) {
                showNotification('PROFIT: Select To Account and Select From Account cannot be the same', 'error');
                return;
            }
        }
        if (!transactionDate) {
            showNotification('Please select transaction date', 'error');
            return;
        }

        let currency = '';
        let fromAccountDescription = '';
        let toAccountDescription = '';
        let transferFromAccountDescription = '';
        let transferToAccountDescription = '';
        let middlemanDescription = '';
        let transferToAmount = 0;
        let middlemanAmount = 0;

        if (isRate) {
            const rateCurrencyFrom = rateCurrencyFromSelect ? rateCurrencyFromSelect.value : '';
            const rateCurrencyTo = rateCurrencyToSelect ? rateCurrencyToSelect.value : '';

            if (!fromAccountId) {
                showNotification('Rate transaction requires From Account', 'error');
                return;
            }
            if (!rateCurrencyFrom || !rateCurrencyTo) {
                showNotification('Please select both currencies', 'error');
                return;
            }
            if (!rateCurrencyFromAmount || rateCurrencyFromAmount <= 0 || !rateCurrencyToAmount || rateCurrencyToAmount <= 0) {
                showNotification('Please enter valid currency amounts', 'error');
                return;
            }
            if (!parsedRateExchange.valid) {
                showNotification('Please enter a valid rate value (supports * and /)', 'error');
                return;
            }

            // 获取 From Account 和 To Account 的账户 ID
            const rateFromAccountInput = document.getElementById('rate_account_from');
            const rateToAccountInput = document.getElementById('rate_account_to');
            const fromAccountIdValue = getAccountId(rateFromAccountInput);
            const toAccountIdValue = getAccountId(rateToAccountInput);

            // 获取 account_code（显示名称）用于 description
            // 从自定义下拉选单的 button 中获取 data-account-code
            let fromAccountCode = '';
            let toAccountCode = '';
            if (rateFromAccountInput) {
                fromAccountCode = rateFromAccountInput.getAttribute('data-account-code') || '';
            }
            if (rateToAccountInput) {
                toAccountCode = rateToAccountInput.getAttribute('data-account-code') || '';
            }

            // 生成两条记录的 description（添加汇率信息）
            // rate_account_from 显示 Select To；rate_account_to 显示 Select From
            // From 记录应指向对手方（Select To），To 记录应指向对手方（Select From）
            fromAccountDescription = `Transaction to ${fromAccountCode} (Rate: ${rateExchangeRateRaw})`;
            toAccountDescription = `Transaction from ${toAccountCode} (Rate: ${rateExchangeRateRaw})`;

            // 处理第二个 Account 和 Middle-Man 的逻辑
            // 如果填写了第二个 account 行，就创建相应的记录
            const rateTransferFromAccountInput = document.getElementById('rate_transfer_from_account');
            const rateTransferToAccountInput = document.getElementById('rate_transfer_to_account');
            const rateMiddlemanAccountInput = document.getElementById('rate_middleman_account');
            const rateTransferFromAccountId = getAccountId(rateTransferFromAccountInput);
            const rateTransferToAccountId = getAccountId(rateTransferToAccountInput);
            const rateMiddlemanAccountId = getAccountId(rateMiddlemanAccountInput);

            if (rateTransferFromAccountId && rateTransferToAccountId) {
                // 获取 account_code（显示名称）用于 description
                // 从自定义下拉选单的 button 中获取 data-account-code
                const transferFromAccountCode = rateTransferFromAccountInput?.getAttribute('data-account-code') || '';
                const transferToAccountCode = rateTransferToAccountInput?.getAttribute('data-account-code') || '';

                // 计算金额：使用 rate_currency_to_amount 作为 transfer amount（如果 rate_transfer_amount 未填写）
                let transferAmount = null;
                try {
                    transferAmount = MoneyDecimal.toDecimal(rateTransferAmount, 0);
                } catch (_) {
                    transferAmount = MoneyDecimal.toDecimal('0');
                }
                if (transferAmount.lte(0)) {
                    // 如果没有填写 rate_transfer_amount，使用转换后的金额
                    try {
                        transferAmount = MoneyDecimal.toDecimal(rateCurrencyToAmount, 0);
                    } catch (_) {
                        transferAmount = MoneyDecimal.toDecimal('0');
                    }
                }

                // 验证 transferAmount 必须大于 0
                if (transferAmount.lte(0)) {
                    showNotification('Please enter currency amounts or transfer amount', 'error');
                    return;
                }

                // Middle-Man Amount 是自动计算的：currency_from_amount * middle_man_rate
                // 从输入框读取自动计算的值
                try {
                    middlemanAmount = MoneyDecimal.toDecimal(rateMiddlemanAmount, 0).toString();
                } catch (_) {
                    middlemanAmount = '0';
                }

                // 如果有填写 middle-man 信息，验证是否完整
                if (rateMiddlemanAccount || rateMiddlemanRate) {
                    // 如果填写了其中一个，必须填写完整
                    if (!rateMiddlemanAccount) {
                        showNotification('Please select Middle-Man account', 'error');
                        return;
                    }
                    if (!rateMiddlemanRate || rateMiddlemanRate <= 0) {
                        showNotification('Please enter Middle-Man rate multiplier', 'error');
                        return;
                    }
                    // 根据用户需求：第四条记录（PROFIT）使用完整金额 318.40，不扣除手续费
                    // 手续费通过第五条记录单独处理
                    transferToAmount = transferAmount.toString(); // 使用完整金额，不扣除手续费
                } else {
                    // 如果没有 middle-man，transferToAmount 等于 transferAmount
                    transferToAmount = transferAmount.toString();
                    middlemanAmount = '0';
                }

                // 生成记录的 description（对手方账号）：
                // From 记录显示 "to {To code}"，To 记录显示 "from {From code}"
                transferFromAccountDescription = `Transaction to ${transferToAccountCode} (Rate: ${rateExchangeRateRaw})`;
                transferToAccountDescription = `Transaction from ${transferFromAccountCode} (Rate: ${rateExchangeRateRaw})`;
                // Middle-Man: Rate charge (x{rate}) from {currency_from} {base_amount}
                // base_amount = currency_from_amount（例如 100），显示来源本金，不是手续费金额
                if (MoneyDecimal.cmp(middlemanAmount, '0') > 0) {
                    const currencyFromAmount = MoneyDecimal.toDecimal(rateCurrencyFromAmount, 0).toString();
                    const currencyFromCode = rateCurrencyFromSelect?.value || '';
                    middlemanDescription = `Rate charge (x${rateMiddlemanRate}) from ${currencyFromCode} ${MoneyDecimal.formatFixed(currencyFromAmount, 2)}`;
                }
            }

            currency = rateCurrencyFrom;
        } else {
            // amount 来自 input.value（字符串）；Number.isFinite 仅对 number 为 true，否则会误判为无效
            const amountNormalized = String(amount).trim().replace(/,/g, '');
            let amountNum;
            try {
                amountNum = MoneyDecimal.toDecimal(amountNormalized);
            } catch (_) {
                amountNum = null;
            }
            if (!amountNum || (!isAdjustment && amountNum.lt(0)) || (isAdjustment && amountNum.isZero())) {
                showNotification(isAdjustment ? 'Please enter a non-zero adjustment amount' : 'Please enter a valid amount (>= 0)', 'error');
                return;
            }
            amount = amountNormalized;
            const currencySelect = document.getElementById('transaction_currency');
            currency = currencySelect ? currencySelect.value : '';
            if (!currency) {
                showNotification('Please select Currency', 'error');
                return;
            }
            if (['PAYMENT', 'RECEIVE', 'CONTRA', 'CLAIM', 'CLEAR'].includes(effectiveType) && !fromAccountId) {
                showNotification('This transaction type requires From Account', 'error');
                return;
            }
        }

        console.log('📤 提交数据:', {
            type,
            accountId,
            fromAccountId,
            amount,
            transactionDate,
            description,
            sms,
            currency,
            rateDetails: isRate ? {
                rateCurrencyFrom: rateCurrencyFromSelect?.value || '',
                rateCurrencyTo: rateCurrencyToSelect?.value || '',
                rateCurrencyFromAmount,
                rateCurrencyToAmount,
                rateExchangeRate,
                rateExchangeRateRaw,
                fromAccountDescription,
                toAccountDescription,
                transferDetails: (rateTransferFromAccount && rateTransferToAccount && rateTransferAmount && rateTransferAmount > 0) ? {
                    rateTransferFromAccount,
                    rateTransferToAccount,
                    rateTransferAmount,
                    transferToAmount: MoneyDecimal.formatFixed(transferToAmount || '0', 2),
                    middlemanAmount: MoneyDecimal.formatFixed(middlemanAmount || '0', 2),
                    transferFromAccountDescription,
                    transferToAccountDescription,
                    middlemanDescription,
                    rateMiddlemanAccount,
                    rateMiddlemanRate,
                    rateMiddlemanAmount
                } : undefined
            } : undefined
        });

        const formData = new FormData();
        formData.append('transaction_type', effectiveType);
        formData.append('account_id', accountId);
        formData.append('from_account_id', fromAccountId);
        formData.append('amount', amount);
        formData.append('transaction_date', transactionDate);
        formData.append('description', description);
        formData.append('sms', sms);
        formData.append('currency', currency);
        if (isRate) {
            // Rate 交易需要两条记录（第一个 Account 和 Currency）
            // From Account 记录：使用第一个 currency，扣除第一个 amount
            formData.append('rate_from_account_id', fromAccountId);
            formData.append('rate_from_currency', rateCurrencyFromSelect?.value || '');
            formData.append('rate_from_amount', formatRateAmount(rateCurrencyFromAmount));
            formData.append('rate_from_description', fromAccountDescription);

            // To Account 记录：使用第二个 currency，增加第二个 amount
            formData.append('rate_to_account_id', accountId);
            formData.append('rate_to_currency', rateCurrencyToSelect?.value || '');
            formData.append('rate_to_amount', formatRateAmount(rateCurrencyToAmount));
            formData.append('rate_to_description', toAccountDescription);

            // 第二行按当前下拉直接提交：
            // 第一个下拉（Select To） -> rate_transfer_from_account_id
            // 第二个下拉（Select From） -> rate_transfer_to_account_id
            const rateTransferFromAccountId = rateTransferFromAccount;
            const rateTransferToAccountId = rateTransferToAccount;
            const rateMiddlemanAccountId = rateMiddlemanAccount;

            // 第二个 Account 和 Middle-Man 的交易记录（如果填写了第二个 account 行）
            if (rateTransferFromAccount && rateTransferToAccount) {
                // 计算 transfer amount：如果没有填写 rate_transfer_amount，使用 rate_currency_to_amount
                let transferAmountValue;
                try {
                    transferAmountValue = MoneyDecimal.toDecimal(rateTransferAmount, 0);
                } catch (_) {
                    transferAmountValue = MoneyDecimal.toDecimal('0');
                }
                if (transferAmountValue.lte(0)) {
                    try {
                        transferAmountValue = MoneyDecimal.toDecimal(rateCurrencyToAmount, 0);
                    } catch (_) {
                        transferAmountValue = MoneyDecimal.toDecimal('0');
                    }
                }

                // 🔧 修复：Transfer To Account 使用完整金额，不扣除手续费
                // 根据用户需求：第四条记录（PROFIT）应该增加完整金额 318.40，手续费通过第五条记录单独处理
                let transferToAmountValue = transferAmountValue; // 使用完整金额，不扣除手续费

                const originalTransferFromAmount = MoneyDecimal.mul(rateCurrencyFromAmount || '0', rateExchangeRate || '0');
                formData.append('rate_transfer_from_account_id', rateTransferFromAccountId);
                formData.append('rate_transfer_from_currency', rateCurrencyToSelect?.value || '');
                formData.append('rate_transfer_from_amount', formatRateAmount(originalTransferFromAmount));
                formData.append('rate_transfer_from_description', transferFromAccountDescription);

                // Transfer To Account 记录：增加完整金额（不扣除手续费）
                // 第二个 account 行使用转换后的货币（rate_to_currency，即 MYR）
                formData.append('rate_transfer_to_account_id', rateTransferToAccountId);
                formData.append('rate_transfer_to_currency', rateCurrencyToSelect?.value || '');
                formData.append('rate_transfer_to_amount', formatRateAmount(transferToAmountValue));
                formData.append('rate_transfer_to_description', transferToAccountDescription);

                // Middle-Man Account 记录：如果有 middle-man，增加手续费金额
                // Middle-Man 也使用转换后的货币（rate_to_currency，即 MYR）
                if (rateMiddlemanAccountId && MoneyDecimal.cmp(middlemanAmount || '0', '0') > 0) {
                    formData.append('rate_middleman_account_id', rateMiddlemanAccountId);
                    formData.append('rate_middleman_currency', rateCurrencyToSelect?.value || '');
                    formData.append('rate_middleman_amount', formatRateAmount(middlemanAmount));
                    formData.append('rate_middleman_description', middlemanDescription);
                }
            }

            // 其他 Rate 相关参数
            formData.append('rate_currency_from', rateCurrencyFromSelect?.value || '');
            formData.append('rate_currency_from_amount', formatRateAmount(rateCurrencyFromAmount));
            formData.append('rate_currency_to', rateCurrencyToSelect?.value || '');
            formData.append('rate_currency_to_amount', formatRateAmount(rateCurrencyToAmount));
            formData.append('rate_exchange_rate', String(rateExchangeRate));
            formData.append('rate_transfer_from_account', rateTransferFromAccountId);
            formData.append('rate_transfer_to_account', rateTransferToAccountId);
            formData.append('rate_transfer_amount', rateTransferAmount);
            // backward compatibility
            formData.append('rate_account_from_amount', rateTransferAmount);
            formData.append('rate_account_to_amount', rateTransferAmount);
            formData.append('rate_middleman_account', rateMiddlemanAccountId);
            formData.append('rate_middleman_rate', rateMiddlemanRate);
            formData.append('rate_middleman_amount', rateMiddlemanAmount ? formatRateAmount(rateMiddlemanAmount) : '');
        }
        if (currentCompanyId) {
            formData.append('company_id', currentCompanyId);
        }
        const clientRequestId = (window.crypto && typeof window.crypto.randomUUID === 'function')
            ? window.crypto.randomUUID()
            : ('tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
        formData.append('client_request_id', clientRequestId);

        isSubmittingTx = true;
        syncSubmitButtonState();

        fetch('/api/transactions/submit_api.php', {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ 提交成功:', data.data);
                    // Manager 以下提交“当天及之前”的 CONTRA：需要等待批准（后端会返回 approval_status = PENDING）
                    const approvalStatus = data?.data?.approval_status ? String(data.data.approval_status).toUpperCase() : '';
                    if (approvalStatus === 'PENDING') {
                        showNotification('Submitted. Waiting for Manager+ approval to take effect.', 'info');
                    } else {
                        showNotification(data.message, 'success');
                    }
                    // 如果是待审批的 CONTRA，或当前用户是 Manager+，刷新信箱
                    loadContraInbox();

                    // 清空表单（不清空 Remark）
                    clearTransactionFormAfterSuccessfulSubmit();
                    isSubmittingTx = false;
                    syncSubmitButtonState();
                    if (isRateTypeSelected()) {
                        [
                            'rate_currency_from_amount',
                            'rate_currency_to_amount',
                            'rate_transfer_amount',
                            'rate_middleman_rate',
                            'rate_middleman_amount'
                        ].forEach(id => {
                            const el = document.getElementById(id);
                            if (el) el.value = '';
                        });
                        ['rate_transfer_from_account', 'rate_transfer_to_account', 'rate_middleman_account'].forEach(id => {
                            const selectEl = document.getElementById(id);
                            if (selectEl) selectEl.value = '';
                        });
                    }

                    // 重新搜索刷新数据：提交成功后立即刷新 Transaction List
                    // 若日期范围为空，则先帮用户填上默认日期（今天），保证可以刷新列表
                    const dateFromInput = document.getElementById('date_from');
                    const dateToInput = document.getElementById('date_to');
                    const hasDateRange = dateFromInput && dateToInput &&
                        (dateFromInput.value || '').trim() &&
                        (dateToInput.value || '').trim();

                    if (!hasDateRange && typeof ensureDefaultDates === 'function') {
                        ensureDefaultDates();
                    }

                    // 保持用户在 Show 0 balance 上的勾选状态，不再强制勾选
                    console.log('🔄 提交成功后立即刷新 Transaction List（保持当前 Show 0 balance 状态）');
                    if (typeof searchTransactions === 'function') {
                        searchTransactions(false, { forceRefresh: true });
                    }
                } else {
                    isSubmittingTx = false;
                    syncSubmitButtonState();
                    showNotification(data.error || 'Submit failed', 'error');
                }
            })
            .catch(error => {
                isSubmittingTx = false;
                syncSubmitButtonState();
                console.error('❌ 提交失败:', error);
                showNotification('Submit failed: ' + error.message, 'error');
            });
    }

    // ==================== 打开历史记录弹窗 ====================
    function openHistoryModal(accountId, accountCode, accountName, rowCurrency) {
        const aid = parseInt(accountId, 10);
        const virtualCompanyCode = String(accountCode || '').trim().toUpperCase();
        const isVirtualCompanyRow = (!aid || aid <= 0) && virtualCompanyCode !== '';
        if ((!aid || aid <= 0) && !isVirtualCompanyRow) {
            showNotification('Invalid account for history', 'error');
            return;
        }
        const dateFrom = document.getElementById('date_from').value;
        const dateTo = document.getElementById('date_to').value;

        if (!dateFrom || !dateTo) {
            showNotification('Please search first to set date range', 'error');
            return;
        }

        // 构建 URL，仅请求当前行的账户数据（使用数字 id，避免关联账户混入）
        let url = `/api/transactions/history_api.php?account_id=${aid}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`;
        if (isVirtualCompanyRow) {
            url += `&virtual_company_code=${encodeURIComponent(virtualCompanyCode)}`;
        }
        // 优先使用该行的 currency
        if (rowCurrency) {
            url += `&currency=${rowCurrency}`;
        } else if (selectedCurrencies.length > 0) {
            url += `&currency=${selectedCurrencies.join(',')}`;
        }
        if (currentCompanyId) {
            url += `&company_id=${currentCompanyId}`;
        }

        // 添加时间戳防止缓存
        url += '&_t=' + Date.now();

        console.log('📜 打开历史记录:', { accountId, accountCode, accountName, rowCurrency, currencies: selectedCurrencies });

        fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-store'
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('✅ 历史记录加载成功:', data.data);
                    // 标题使用 API 返回的账户信息，确保与表格数据一致（避免单向连接时显示错误账户）
                    const acc = data.data && data.data.account;
                    const titleCode = acc ? (acc.account_id || accountCode) : accountCode;
                    const titleName = acc ? (acc.name || accountName) : accountName;
                    document.getElementById('modal_title').textContent =
                        `Payment History - ${titleCode} (${titleName})`;

                    // 填充表格
                    const tbody = document.getElementById('modal_tbody');
                    tbody.innerHTML = '';

                    data.data.history.forEach(row => {
                        const tr = document.createElement('tr');
                        tr.className = row.row_type === 'bf' ? 'transaction-bf-row' : 'transaction-table-row';
                        if (row.row_type === 'bf') {
                            tr.style.fontWeight = 'bold';
                            tr.style.backgroundColor = '#f0f0f0';
                        }

                        // 格式化数字列（如果不是 '-'）；须用 formatPaymentHistoryMoney，勿用 formatNumber(Math.trunc) 否则 -40.80 变 -40.79
                        const winLoss = row.win_loss === '-' ? '-' : formatPaymentHistoryMoney(row.win_loss);
                        const crDr = row.cr_dr === '-' ? '-' : formatPaymentHistoryMoney(row.cr_dr);
                        const balance = row.balance === '-' ? '-' : formatPaymentHistoryMoney(row.balance);
                        const remarkValue = getHistoryRemark(row);
                        const descriptionDisplay = toUpperDisplay(row.description);
                        const descriptionCells = showDescriptionColumn
                            ? `<td class="transaction-history-col-description text-uppercase">${descriptionDisplay}</td>
                           <td class="transaction-history-col-remark text-uppercase">${remarkValue}</td>`
                            : `<td class="transaction-history-col-remark text-uppercase">${remarkValue}</td>`;
                        // Id Product 列：仅 bank process 交易显示 Card Owner；datacapturesummary 提交及其他均显示 id product
                        const idProductDisplay = row.is_bank_process_transaction ? (row.card_owner || '-') : (row.product || '-');

                        const createdByDisplay = (row.created_by === null || row.created_by === undefined || String(row.created_by).trim() === '' || String(row.created_by).toLowerCase() === 'null')
                            ? '-'
                            : String(row.created_by);
                        tr.innerHTML = `
                        <td class="transaction-history-col-date">${row.date}</td>
                        <td class="transaction-history-col-product">${String(idProductDisplay).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</td>
                        <td class="transaction-history-col-currency">${row.currency || '-'}</td>
                        <td class="transaction-history-col-rate">${row.rate || '-'}</td>
                        <td class="transaction-history-col-winloss">${winLoss}</td>
                        <td class="transaction-history-col-crdr">${crDr}</td>
                        <td class="transaction-history-col-balance">${balance}</td>
                        ${descriptionCells}
                        <td class="transaction-history-col-created">${createdByDisplay}</td>
                    `;
                        tbody.appendChild(tr);
                    });

                    // 显示弹窗
                    document.getElementById('historyModal').style.display = 'flex';
                } else {
                    showNotification(data.error || 'Failed to load history', 'error');
                }
            })
            .catch(error => {
                console.error('❌ 加载历史记录失败:', error);
                showNotification('Failed to load history: ' + error.message, 'error');
            });
    }

    // ==================== 类型切换 ====================
    function handleTypeToggle() {
        const typeSel = document.getElementById('transaction_type');
        const reverseBtn = document.getElementById('account_reverse_btn');
        const standardFields = document.getElementById('standard-transaction-fields');
        const rateFields = document.getElementById('rate-transaction-fields');
        const remarkGroup = document.getElementById('remark_form_group');
        if (!typeSel) return;

        const isRate = typeSel.value === RATE_TYPE_VALUE;
        const wasRate = !!window.__lastTransactionTypeWasRate;
        window.__lastTransactionTypeWasRate = isRate;

        if (standardFields) {
            standardFields.style.display = isRate ? 'none' : 'block';
        }
        if (rateFields) {
            rateFields.style.display = isRate ? 'flex' : 'none';
        }
        if (remarkGroup) {
            remarkGroup.style.display = isRate ? 'none' : '';
        }

        // 保持日期同步
        const standardDateInput = document.getElementById('transaction_date');
        const rateDateInput = document.getElementById('rate_transaction_date');
        if (standardDateInput && rateDateInput) {
            // 只在 standard <-> RATE 切换时同步日期，避免切换普通 type 时覆盖日期
            if (isRate) {
                rateDateInput.value = standardDateInput.value;
            } else if (wasRate) {
                standardDateInput.value = rateDateInput.value;
            }
        }

        // 控制「From Account」与「Reverse」的显示（不隐藏 To Account，保证排版一致）
        const accountInputs = document.querySelector('.transaction-account-inputs');
        const fromAccountWrapper = document.getElementById('action_account_id')?.closest('.custom-select-wrapper');
        const needsFrom = ['CONTRA', 'PAYMENT', 'RECEIVE', 'CLAIM', 'PROFIT', 'CLEAR'].includes(typeSel.value);
        const showFromAndReverse = !isRate && needsFrom;
        if (fromAccountWrapper) {
            fromAccountWrapper.style.display = showFromAndReverse ? '' : 'none';
        }
        if (reverseBtn) {
            reverseBtn.style.display = showFromAndReverse ? '' : 'none';
        }
        if (!showFromAndReverse) {
            const fromBtn = document.getElementById('action_account_id');
            if (fromBtn) {
                fromBtn.textContent = fromBtn.getAttribute('data-placeholder') || '--Select From Account--';
                fromBtn.removeAttribute('data-value');
                fromBtn.removeAttribute('data-account-code');
                fromBtn.removeAttribute('data-currency');
            }
        }
    }

    // ==================== 对调账户 ====================
    function handleReverseAccounts(event) {
        const triggerId = event?.currentTarget?.id || '';

        // 交换两个自定义下拉选单按钮的值（包括 textContent、data-value、data-account-code、data-currency）
        function swapAccountButtons(button1, button2) {
            if (!button1 || !button2) return;
            const value1 = button1.getAttribute('data-value') || '';
            const value2 = button2.getAttribute('data-value') || '';

            // 规则：
            // - 两边都有账号：互换
            // - 只有一边有账号：把该账号“搬移”到另一边，placeholder 文案不对换
            if (!value1 && !value2) return;

            // 保存 button1 的值
            const text1 = button1.textContent || '';
            const accountCode1 = button1.getAttribute('data-account-code') || '';
            const currency1 = button1.getAttribute('data-currency') || '';

            // 保存 button2 的值
            const text2 = button2.textContent || '';
            const accountCode2 = button2.getAttribute('data-account-code') || '';
            const currency2 = button2.getAttribute('data-currency') || '';

            // 只有一边有值：做“搬移”
            if (!value1 || !value2) {
                const srcBtn = value1 ? button1 : button2;
                const dstBtn = value1 ? button2 : button1;
                const srcValue = value1 ? value1 : value2;
                const srcText = value1 ? text1 : text2;
                const srcCode = value1 ? accountCode1 : accountCode2;
                const srcCurrency = value1 ? currency1 : currency2;

                // 目标设置为源账号
                dstBtn.textContent = srcText || dstBtn.getAttribute('data-placeholder') || '--Select Account--';
                dstBtn.setAttribute('data-value', srcValue);
                if (srcCode) dstBtn.setAttribute('data-account-code', srcCode);
                else dstBtn.removeAttribute('data-account-code');
                if (srcCurrency) dstBtn.setAttribute('data-currency', srcCurrency);
                else dstBtn.removeAttribute('data-currency');

                // 源清空回 placeholder
                srcBtn.textContent = srcBtn.getAttribute('data-placeholder') || '--Select Account--';
                srcBtn.removeAttribute('data-value');
                srcBtn.removeAttribute('data-account-code');
                srcBtn.removeAttribute('data-currency');

                updateSelectedOption(srcBtn, '');
                updateSelectedOption(dstBtn, srcValue);
                return;
            }

            // 交换 button1 和 button2 的值
            button1.textContent = text2 || button1.getAttribute('data-placeholder') || '--Select Account--';
            if (value2) {
                button1.setAttribute('data-value', value2);
            } else {
                button1.removeAttribute('data-value');
            }
            if (accountCode2) {
                button1.setAttribute('data-account-code', accountCode2);
            } else {
                button1.removeAttribute('data-account-code');
            }
            if (currency2) {
                button1.setAttribute('data-currency', currency2);
            } else {
                button1.removeAttribute('data-currency');
            }

            button2.textContent = text1 || button2.getAttribute('data-placeholder') || '--Select Account--';
            if (value1) {
                button2.setAttribute('data-value', value1);
            } else {
                button2.removeAttribute('data-value');
            }
            if (accountCode1) {
                button2.setAttribute('data-account-code', accountCode1);
            } else {
                button2.removeAttribute('data-account-code');
            }
            if (currency1) {
                button2.setAttribute('data-currency', currency1);
            } else {
                button2.removeAttribute('data-currency');
            }

            // 更新下拉选单中的选中状态
            updateSelectedOption(button1, value2);
            updateSelectedOption(button2, value1);
        }

        // 更新下拉选单中的选中状态
        function updateSelectedOption(button, accountId) {
            if (!button) return;
            const dropdown = document.getElementById(button.id + '_dropdown');
            if (!dropdown) return;
            const optionsContainer = dropdown.querySelector('.custom-select-options');
            if (!optionsContainer) return;

            // 清除所有选中状态
            optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
                opt.classList.remove('selected');
            });

            if (!accountId) return;

            // 设置新的选中状态
            const option = optionsContainer.querySelector(`.custom-select-option[data-value="${accountId}"]`);
            if (option) {
                option.classList.add('selected');
            }
        }

        if (triggerId === 'rate_transfer_reverse_btn') {
            const transferFromBtn = document.getElementById('rate_transfer_from_account');
            const transferToBtn = document.getElementById('rate_transfer_to_account');
            swapAccountButtons(transferFromBtn, transferToBtn);
            return;
        }

        // RATE 类型下 Account 旁的 Reverse：只对调两个 Account 下拉，不动货币/金额/Transfer 账户
        if (triggerId === 'rate_account_reverse_btn') {
            const rateFromBtn = document.getElementById('rate_account_from');
            const rateToBtn = document.getElementById('rate_account_to');
            if (rateFromBtn && rateToBtn) swapAccountButtons(rateFromBtn, rateToBtn);
            return;
        }

        if (isRateTypeSelected()) {
            const rateFromBtn = document.getElementById('rate_account_from');
            const rateToBtn = document.getElementById('rate_account_to');
            swapAccountButtons(rateFromBtn, rateToBtn);

            // RATE：rate_currency_to 固定 MYR，不参与 reverse 自动交换

            // 交换货币金额
            const rateCurrencyFromAmount = document.getElementById('rate_currency_from_amount');
            const rateCurrencyToAmount = document.getElementById('rate_currency_to_amount');
            if (rateCurrencyFromAmount && rateCurrencyToAmount) {
                const tmpCurrencyAmount = rateCurrencyFromAmount.value;
                rateCurrencyFromAmount.value = rateCurrencyToAmount.value;
                rateCurrencyToAmount.value = tmpCurrencyAmount;
            }

            // 交换第二个账户行的按钮
            const rateTransferFromBtn = document.getElementById('rate_transfer_from_account');
            const rateTransferToBtn = document.getElementById('rate_transfer_to_account');
            if (rateTransferFromBtn && rateTransferToBtn) {
                swapAccountButtons(rateTransferFromBtn, rateTransferToBtn);
            }
            return;
        }

        // 标准交易类型的 reverse
        const fromBtn = document.getElementById('action_account_from');
        const toBtn = document.getElementById('action_account_id');
        if (!fromBtn || !toBtn || fromBtn.closest('.transaction-form-group')?.style.display === 'none') return;

        swapAccountButtons(fromBtn, toBtn);
        syncContraCurrencyFromButton(fromBtn);
    }

    // ==================== 确认提交 ====================
    function handleConfirmSubmit() {
        const confirmCheckbox = document.getElementById('confirm_submit');
        const submitBtn = document.getElementById('submit_btn');

        if (confirmCheckbox && submitBtn) {
            // 根据复选框初始状态设置按钮是否可点
            syncSubmitButtonState();
            confirmCheckbox.addEventListener('change', function () {
                syncSubmitButtonState();
            });
            submitBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (!submitBtn.disabled && !isSubmittingTx) {
                    submitAction();
                }
            });
        }
    }

    // ==================== 日期选择器 ====================
    // 若 Capture Date 未填，则默认设为今天（保证首次进入页面自动搜「当天」）
    function ensureDefaultDates() {
        const df = document.getElementById('date_from');
        const dt = document.getElementById('date_to');
        if (!df || !dt) return;
        if ((df.value || '').trim() && (dt.value || '').trim()) return;
        const today = new Date();
        const d = today.getDate();
        const m = today.getMonth() + 1;
        const y = today.getFullYear();
        const str = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
        if (!(df.value || '').trim()) df.value = str;
        if (!(dt.value || '').trim()) dt.value = str;
    }

    function initDatePickers() {
        if (typeof flatpickr === 'undefined') {
            console.error('Flatpickr library not loaded');
            return;
        }

        // Transaction Date（单日）
        flatpickr("#transaction_date", {
            dateFormat: "d/m/Y",
            allowInput: false,
            defaultDate: new Date()
        });

        // Rate Transaction Date（单日）
        flatpickr("#rate_transaction_date", {
            dateFormat: "d/m/Y",
            allowInput: false,
            defaultDate: new Date()
        });

        // Capture Date：使用与 Dashboard / Maintenance 相同的共享日期范围组件
        if (window.MaintenanceDateRangePicker) {
            window.MaintenanceDateRangePicker.init({
                dateFromId: 'date_from',
                dateToId: 'date_to',
                onChange: function () {
                    if (typeof searchTransactions === 'function') {
                        searchTransactions();
                    }
                }
            });
        } else {
            console.warn('MaintenanceDateRangePicker not found. Ensure js/date-range-picker.js is loaded before transaction.js.');
        }
        ensureDefaultDates();
    }

    // ==================== Middle-Man Amount 和 Currency To Amount 自动计算 ====================
    function initMiddleManAmountCalculation() {
        const currencyFromAmountInput = document.getElementById('rate_currency_from_amount');
        const exchangeRateInput = document.getElementById('rate_exchange_rate');
        const middleManRateInput = document.getElementById('rate_middleman_rate');
        const middleManAmountInput = document.getElementById('rate_middleman_amount');
        const currencyToAmountInput = document.getElementById('rate_currency_to_amount');

        if (!currencyFromAmountInput || !exchangeRateInput || !middleManRateInput || !middleManAmountInput || !currencyToAmountInput) {
            return;
        }

        // 计算 Middle-Man Amount 函数
        function calculateMiddleManAmount() {
            const currencyFromAmount = MoneyDecimal.toDecimal(currencyFromAmountInput.value || '0', 0);
            const middleManRate = MoneyDecimal.toDecimal(middleManRateInput.value || '0', 0);

            // 公式: currency_from_amount * middle_man_rate
            if (currencyFromAmount.gt(0) && middleManRate.gt(0)) {
                const result = currencyFromAmount.times(middleManRate);
                middleManAmountInput.value = formatRateAmount(result);
            } else {
                middleManAmountInput.value = '';
            }

            // 计算完成后，触发 Currency To Amount 的计算
            calculateCurrencyToAmount();
        }

        // 计算 Currency To Amount 函数
        function calculateCurrencyToAmount() {
            const currencyFromAmount = MoneyDecimal.toDecimal(currencyFromAmountInput.value || '0', 0);
            const parsedRate = parseRateExpression(exchangeRateInput.value);
            const exchangeRate = parsedRate.valid ? MoneyDecimal.toDecimal(parsedRate.value) : MoneyDecimal.toDecimal('0');

            // 与提交入账保持一致：换算金额显示完整 from * rate，middle-man fee 另行显示并单独入账。
            if (currencyFromAmount.gt(0) && exchangeRate.gt(0)) {
                const result = currencyFromAmount.times(exchangeRate);
                currencyToAmountInput.value = formatRateAmount(result);
            } else {
                currencyToAmountInput.value = '';
            }
        }

        // 绑定事件监听器 - Middle-Man Amount 计算
        // 当这些字段改变时，会先计算 Middle-Man Amount，然后自动计算 Currency To Amount
        currencyFromAmountInput.addEventListener('input', calculateMiddleManAmount);
        currencyFromAmountInput.addEventListener('change', calculateMiddleManAmount);
        exchangeRateInput.addEventListener('input', calculateMiddleManAmount);
        exchangeRateInput.addEventListener('change', calculateMiddleManAmount);
        middleManRateInput.addEventListener('input', calculateMiddleManAmount);
        middleManRateInput.addEventListener('change', calculateMiddleManAmount);
    }

    // ==================== 复制表格到 Excel 时保留样式 ====================
    function initExcelCopyWithStyles() {
        function elementFromRangeNode(node) {
            if (!node) return null;
            return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        }

        /** #text 没有 closest；跨左右两表选择时不劫持，交给浏览器默认复制 */
        function rangeOwnerTable(range) {
            const a = elementFromRangeNode(range.startContainer);
            const b = elementFromRangeNode(range.endContainer);
            const t1 = a && a.closest ? a.closest('table') : null;
            const t2 = b && b.closest ? b.closest('table') : null;
            if (t1 && t2 && t1 !== t2) return null;
            return t1 || t2;
        }

        function isCellVisibleForExport(cell) {
            const st = window.getComputedStyle(cell);
            if (st.display === 'none') return false;
            if (st.visibility === 'collapse') return false;
            return true;
        }

        // 监听复制事件
        document.addEventListener('copy', function (e) {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const range = selection.getRangeAt(0);
            const table = rangeOwnerTable(range);

            // 只处理 transaction-table 和 transaction-summary-table
            if (!table || (!table.classList.contains('transaction-table') && !table.classList.contains('transaction-summary-table'))) {
                return;
            }

            // Payment History 弹窗内表格走浏览器默认复制，避免与主表逻辑冲突
            if (table.closest('#historyModal')) {
                return;
            }

            // 选区仅在单个单元格内：不劫持，否则会把同一行所有列拼成 TSV 粘贴到 Excel
            const startEl = elementFromRangeNode(range.startContainer);
            const endEl = elementFromRangeNode(range.endContainer);
            const startCell = startEl && startEl.closest ? startEl.closest('td, th') : null;
            const endCell = endEl && endEl.closest ? endEl.closest('td, th') : null;
            if (startCell && endCell && startCell === endCell && table.contains(startCell)) {
                return;
            }

            // 获取选中的单元格
            const selectedRows = [];

            // 检查是否选中了表格的一部分
            const startContainer = range.startContainer;
            const endContainer = range.endContainer;

            // 找到选中的行和单元格
            let startRow = startContainer.nodeType === Node.TEXT_NODE
                ? startContainer.parentElement.closest('tr')
                : startContainer.closest('tr');
            let endRow = endContainer.nodeType === Node.TEXT_NODE
                ? endContainer.parentElement.closest('tr')
                : endContainer.closest('tr');

            if (startRow && !table.contains(startRow)) startRow = null;
            if (endRow && !table.contains(endRow)) endRow = null;

            if (!startRow && !endRow) {
                // 如果没有找到行，尝试从选中的单元格构建
                const cells = table.querySelectorAll('td, th');
                cells.forEach(cell => {
                    if (range.intersectsNode(cell)) {
                        const row = cell.closest('tr');
                        if (row && table.contains(row) && !selectedRows.includes(row)) {
                            selectedRows.push(row);
                        }
                    }
                });
            } else {
                // 确定行的顺序
                const allRows = Array.from(table.querySelectorAll('tr'));
                const startIndex = startRow ? allRows.indexOf(startRow) : 0;
                const endIndex = endRow ? allRows.indexOf(endRow) : allRows.length - 1;
                if (startIndex < 0 || endIndex < 0) {
                    return;
                }
                const minIndex = Math.min(startIndex, endIndex);
                const maxIndex = Math.max(startIndex, endIndex);

                // 获取选中范围内的所有行
                for (let i = minIndex; i <= maxIndex; i++) {
                    const row = allRows[i];
                    if (row) {
                        selectedRows.push(row);
                    }
                }
            }

            if (selectedRows.length === 0) return;

            // 仅在有可写入内容时再拦截，避免误 preventDefault 导致复制为空
            e.preventDefault();

            // 构建 HTML 表格（Excel 期望的格式）
            let html = '<html><body><table style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; font-size: small;">';

            selectedRows.forEach(row => {
                html += '<tr>';
                const cells = Array.from(row.querySelectorAll('td, th')).filter(isCellVisibleForExport);
                cells.forEach(cell => {
                    const isHeader = cell.tagName === 'TH';
                    const isFooter = row.closest('tfoot') !== null;
                    const isAlertRow = row.classList.contains('transaction-alert-row');

                    // 获取单元格样式
                    const computedStyle = window.getComputedStyle(cell);
                    let bgColor = computedStyle.backgroundColor;
                    let textColor = computedStyle.color;
                    const fontWeight = computedStyle.fontWeight;
                    const textAlign = computedStyle.textAlign;
                    const border = computedStyle.border || '1px solid #d0d7de';
                    const padding = computedStyle.padding || '4px 8px';

                    // 检查是否有 role 相关的 class（优先级高于普通背景色）
                    const accountCell = cell.classList.contains('transaction-account-cell');
                    if (accountCell) {
                        // 检查 role class
                        const roleClasses = [
                            'transaction-role-capital', 'transaction-role-bank', 'transaction-role-cash',
                            'transaction-role-profit', 'transaction-role-expenses', 'transaction-role-company',
                            'transaction-role-staff', 'transaction-role-upline', 'transaction-role-agent',
                            'transaction-role-member', 'transaction-role-none'
                        ];
                        for (const roleClass of roleClasses) {
                            if (cell.classList.contains(roleClass)) {
                                // 使用计算后的样式（已经应用了 role 颜色）
                                bgColor = computedStyle.backgroundColor;
                                textColor = computedStyle.color;
                                break;
                            }
                        }
                    }

                    // 特殊处理：表头样式（最高优先级）
                    if (isHeader) {
                        bgColor = '#002C49';
                        textColor = '#ffffff';
                    }

                    // 特殊处理：表脚样式
                    if (isFooter) {
                        bgColor = '#f6f8fa';
                        // 保持原有的文字颜色
                    }

                    // 特殊处理：Alert 行样式（最高优先级，覆盖其他样式）
                    if (isAlertRow) {
                        bgColor = '#dc2626';
                        textColor = '#ffffff';
                    }

                    // 处理 RGB/RGBA 颜色格式，转换为 Excel 可识别的格式
                    // 将 rgb/rgba 转换为十六进制
                    function rgbToHex(rgb) {
                        if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') {
                            return '#ffffff';
                        }
                        const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
                        if (match) {
                            const r = parseInt(match[1]);
                            const g = parseInt(match[2]);
                            const b = parseInt(match[3]);
                            return '#' + [r, g, b].map(x => {
                                const hex = x.toString(16);
                                return hex.length === 1 ? '0' + hex : hex;
                            }).join('');
                        }
                        return rgb;
                    }

                    const bgColorHex = rgbToHex(bgColor);
                    const textColorHex = rgbToHex(textColor);

                    // 构建样式字符串
                    const cellStyle = `background-color: ${bgColorHex}; color: ${textColorHex}; font-weight: ${fontWeight}; text-align: ${textAlign}; border: ${border}; padding: ${padding};`;

                    // 获取单元格文本内容
                    const cellText = (cell.textContent || cell.innerText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                    const tag = isHeader ? 'th' : 'td';
                    html += `<${tag} style="${cellStyle}">${cellText}</${tag}>`;
                });
                html += '</tr>';
            });

            html += '</table></body></html>';

            // 构建纯文本版本：只含当前可见列，与 Excel 粘贴行/列一致（\r\n 为 Windows Excel 换行）
            let text = '';
            selectedRows.forEach((row, rowIndex) => {
                const cells = Array.from(row.querySelectorAll('td, th')).filter(isCellVisibleForExport);
                const rowText = cells.map(cell => (cell.innerText != null ? cell.innerText : (cell.textContent || ''))
                    .replace(/\r?\n/g, ' ')
                    .trim())
                    .join('\t');
                text += rowText;
                if (rowIndex < selectedRows.length - 1) {
                    text += '\r\n';
                }
            });

            // 设置剪贴板数据
            const clipboardData = e.clipboardData || window.clipboardData;
            if (clipboardData) {
                clipboardData.setData('text/html', html);
                clipboardData.setData('text/plain', text);
            }
        });
    }

    // ==================== 通知系统 ====================
    function showNotification(message, type = 'success') {
        const container = document.getElementById('notificationContainer');

        // 检查容器是否存在
        if (!container) {
            console.error('Notification container not found!');
            console.log('Message:', message, 'Type:', type);
            return;
        }

        // 检查消息是否为空
        if (!message || message.trim() === '') {
            console.error('Empty notification message!');
            return;
        }

        // 检查现有通知，最多保留2个
        const existingNotifications = container.querySelectorAll('.transaction-notification');
        if (existingNotifications.length >= 2) {
            // 立即移除最旧的通知，不等待动画
            const oldestNotification = existingNotifications[0];
            oldestNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = `transaction-notification transaction-notification-${type}`;
        notification.textContent = message;

        console.log('Creating notification:', message, type);

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

    window.approveContra = approveContra;
    window.rejectContra = rejectContra;
    window.switchCompany = switchCompany;
})();