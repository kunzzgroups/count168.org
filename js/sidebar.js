/**
 * Sidebar 逻辑：本文件由 sidebar.php 使用，需在主页面 <head> 或 </body> 前引入。
 * 依赖：主页面需先引入 css/sidebar.css；包含 sidebar 的页面需在引入本脚本前或后执行 sidebar 的 PHP 初始化脚本（设置 window.SIDEBAR_*）。
 */

(function () {
    'use strict';

    var sidebar = null;
    var overlay = null;
    var userAvatar = null;
    var sidebarToggle = null;

    // 头像图片映射（与 PHP $avatarImages 一致）
    var avatarImages = {
        male1: 'images/avatar1.png', male2: 'images/avatar2.png', male3: 'images/avatar3.png',
        male4: 'images/avatar4.png', male5: 'images/avatar5.png', male6: 'images/avatar6.png',
        male7: 'images/avatar7.png', male8: 'images/avatar8.png', male9: 'images/avatar9.png',
        female1: 'images/female1.png', female2: 'images/female2.png', female3: 'images/female3.png',
        female4: 'images/female4.png', female5: 'images/female5.png', female6: 'images/female6.png',
        female7: 'images/female7.png', female8: 'images/female8.png', female9: 'images/female9.png'
    };
    var currentAvatarId = 'male1';

    function closeSidebar() {
        if (!sidebar) sidebar = document.querySelector('.informationmenu');
        if (!overlay) overlay = document.querySelector('.informationmenu-overlay');
        if (sidebar) sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        document.querySelectorAll('.dropdown-menu-items').forEach(function (dropdown) {
            dropdown.classList.remove('show');
        });
        document.querySelectorAll('.informationmenu-section-title').forEach(function (title) {
            title.classList.remove('active');
        });
    }

    function getCurrentPageName() {
        var path = window.location.pathname;
        return path.split('/').pop();
    }

    function setCurrentPageHighlight() {
        var currentPage = getCurrentPageName();
        document.querySelectorAll('.informationmenu-section-title').forEach(function (title) {
            title.classList.remove('current-page');
        });
        document.querySelectorAll('.submenu-item').forEach(function (item) {
            item.classList.remove('current-page');
        });
        var maintenancePages = ['capture_maintenance.php', 'transaction_maintenance.php', 'payment_maintenance.php', 'formula_maintenance.php'];
        if (maintenancePages.indexOf(currentPage) !== -1) {
            var maintenanceTitle = document.querySelector('.informationmenu-section-title[data-section="maintenance"]');
            if (maintenanceTitle) maintenanceTitle.classList.add('current-page');
        }
        var reportPages = ['customer_report.php', 'domain_report.php'];
        if (reportPages.indexOf(currentPage) !== -1) {
            var reportTitle = document.querySelector('.informationmenu-section-title[data-section="report"]');
            if (reportTitle) reportTitle.classList.add('current-page');
        }
        var processPages = ['games_process_list.php', 'bank_process_list.php', 'processlist.php'];
        if (processPages.indexOf(currentPage) !== -1) {
            var processTitle = document.querySelector('.informationmenu-section-title[data-page="processlist.php"]');
            if (processTitle) processTitle.classList.add('current-page');
        }
        document.querySelectorAll('.informationmenu-section-title').forEach(function (title) {
            var pageName = title.getAttribute('data-page');
            if (pageName === currentPage) title.classList.add('current-page');
        });
        document.querySelectorAll('.submenu-item').forEach(function (item) {
            var pageName = item.getAttribute('data-page');
            if (pageName === currentPage) item.classList.add('current-page');
        });
    }

    function positionSubmenu(wrapper) {
        var title = wrapper.querySelector('.informationmenu-section-title');
        var submenu = wrapper.querySelector('.submenu');
        if (!title || !submenu) return;
        var titleRect = title.getBoundingClientRect();
        var sidebarEl = document.querySelector('.informationmenu');
        var sidebarRect = sidebarEl ? sidebarEl.getBoundingClientRect() : { right: 0 };
        submenu.style.left = sidebarRect.right + 'px';
        submenu.style.top = titleRect.top + 'px';
    }

    function toggleAvatarOptions() {
        var options = document.getElementById('avatarOptions');
        if (!options) return;
        var isShowing = options.classList.contains('show');
        if (!isShowing) backToGenderSelection();
        options.classList.toggle('show');
        updateSelectedAvatar();
    }

    function selectGender(gender) {
        var maleList = document.getElementById('maleAvatarList');
        var femaleList = document.getElementById('femaleAvatarList');
        var genderBtns = document.querySelectorAll('.gender-btn');
        genderBtns.forEach(function (btn) {
            btn.classList.remove('active');
            if (btn.textContent.toLowerCase() === gender) btn.classList.add('active');
        });
        if (gender === 'male') {
            if (maleList) maleList.classList.add('show');
            if (femaleList) femaleList.classList.remove('show');
        } else {
            if (femaleList) femaleList.classList.add('show');
            if (maleList) maleList.classList.remove('show');
        }
    }

    function backToGenderSelection() {
        var maleList = document.getElementById('maleAvatarList');
        var femaleList = document.getElementById('femaleAvatarList');
        var genderBtns = document.querySelectorAll('.gender-btn');
        genderBtns.forEach(function (btn) {
            btn.classList.remove('active');
            if (btn.textContent.toLowerCase() === 'male') btn.classList.add('active');
        });
        if (maleList) maleList.classList.add('show');
        if (femaleList) femaleList.classList.remove('show');
    }

    function selectAvatar(avatarId) {
        if (!avatarImages[avatarId]) return;
        currentAvatarId = avatarId;
        var currentAvatarImg = document.getElementById('currentAvatarImg');
        var options = document.getElementById('avatarOptions');
        if (currentAvatarImg) {
            currentAvatarImg.src = avatarImages[avatarId];
            currentAvatarImg.setAttribute('data-avatar-id', avatarId);
        }
        if (options) options.classList.remove('show');
        try {
            localStorage.setItem('selectedAvatar', avatarId);
        } catch (e) { }
        document.cookie = 'selectedAvatar=' + encodeURIComponent(avatarId) + '; path=/; max-age=31536000; SameSite=Lax';
        updateSelectedAvatar();
    }

    function updateSelectedAvatar() {
        document.querySelectorAll('.avatar-option').forEach(function (option) {
            option.classList.remove('selected');
        });
        var selectedOption = document.querySelector('.avatar-option[data-avatar-id="' + currentAvatarId + '"]');
        if (selectedOption) selectedOption.classList.add('selected');
    }

    function goDashboard() {
        var u =
            (typeof window.EAZYCOUNT_SPA_DASHBOARD === 'string' && window.EAZYCOUNT_SPA_DASHBOARD) || 'dashboard.php';
        if (window.top !== window.self) {
            window.top.location.assign(u);
        } else {
            window.location.assign(u);
        }
    }

    function handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            var u = 'dashboard.php?logout=1';
            if (window.top !== window.self) {
                window.top.location.assign(u);
            } else {
                window.location.assign(u);
            }
        }
    }

    function toggleLanguageDropdown() {
        var dropdown = document.getElementById('languageDropdown');
        var button = document.querySelector('.language-btn');
        if (dropdown) dropdown.classList.toggle('show');
        if (button) button.classList.toggle('active');
    }

    function selectLanguage(lang) {
        var dropdown = document.getElementById('languageDropdown');
        var button = document.querySelector('.language-btn');
        var currentFlag = document.getElementById('current-flag');
        var currentLang = document.getElementById('current-lang');
        if (lang === 'en') {
            if (currentFlag) { currentFlag.src = 'images/uk.png'; currentFlag.alt = 'English'; }
            if (currentLang) currentLang.textContent = 'English';
        } else if (lang === 'zh') {
            if (currentFlag) { currentFlag.src = 'images/china.png'; currentFlag.alt = '中文'; }
            if (currentLang) currentLang.textContent = '中文';
        }
        if (dropdown) dropdown.classList.remove('show');
        if (button) button.classList.remove('active');
        try { localStorage.setItem('selectedLanguage', lang); } catch (e) { }
    }

    function toggleNotificationPanel(event) {
        var panel = document.getElementById('notificationPanel');
        var overlayEl = document.getElementById('notificationOverlay');
        if (!panel || !overlayEl) return;
        if (panel.classList.contains('show')) {
            closeNotificationPanel();
        } else {
            panel.classList.add('show');
            overlayEl.classList.add('show');
            loadAnnouncements();
        }
        if (event) { event.preventDefault(); event.stopPropagation(); }
    }

    function closeNotificationPanel() {
        var panel = document.getElementById('notificationPanel');
        var overlayEl = document.getElementById('notificationOverlay');
        if (panel) panel.classList.remove('show');
        if (overlayEl) overlayEl.classList.remove('show');
    }

    function escapeHtml(text) {
        if (text == null) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function loadAnnouncements() {
        var contentContainer = document.getElementById('notificationContent');
        if (!contentContainer) return;
        fetch('/api/announcements/announcement_get_dashboard_api.php').then(function (response) {
            return response.json();
        }).then(function (result) {
            if (result.success && result.data && result.data.length > 0) {
                contentContainer.innerHTML = result.data.map(function (announcement) {
                    return '<div class="notification-item unread">' +
                        '<div class="notification-title">' + escapeHtml(announcement.title) + '</div>' +
                        '<div class="notification-message">' + escapeHtml(announcement.content) + '</div>' +
                        '<div class="notification-time">' + escapeHtml(announcement.created_at) + '</div></div>';
                }).join('');
                contentContainer.querySelectorAll('.notification-item').forEach(function (item) {
                    item.addEventListener('click', function () { this.classList.remove('unread'); });
                });
            } else {
                contentContainer.innerHTML = '<div class="notification-empty">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>' +
                    '</svg><p>No announcements</p></div>';
            }
        }).catch(function (error) {
            console.error('Failed to load announcements:', error);
            contentContainer.innerHTML = '<div class="notification-empty"><p>Failed to load announcements</p></div>';
        });
    }

    // 公司到期倒计时：使用 window.SIDEBAR_EXPIRATION_DATE（由 sidebar.php 初始化脚本注入）
    function calculateCountdown(expirationDate) {
        if (!expirationDate) return null;
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var exp = new Date(expirationDate);
        exp.setHours(0, 0, 0, 0);
        var diffTime = exp - today;
        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { text: 'Expired', days: diffDays, status: 'expired' };
        if (diffDays === 0) return { text: 'Expires today', days: 0, status: 'warning' };
        if (diffDays <= 7) return { text: diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' left', days: diffDays, status: 'warning' };
        if (diffDays <= 30) return { text: diffDays + ' days left', days: diffDays, status: 'normal' };
        var months = Math.floor(diffDays / 30);
        var days = diffDays % 30;
        if (days === 0) return { text: months + ' month' + (months > 1 ? 's' : '') + ' left', days: diffDays, status: 'normal' };
        return { text: months + 'm ' + days + 'd left', days: diffDays, status: 'normal' };
    }

    function updateExpirationCountdown() {
        var expirationDate = (typeof window.SIDEBAR_EXPIRATION_DATE !== 'undefined') ? window.SIDEBAR_EXPIRATION_DATE : '';
        var countdownContainer = document.getElementById('companyExpirationCountdown');
        var countdownText = document.getElementById('expirationCountdownText');
        if (!expirationDate || expirationDate.trim() === '' || !countdownText || !countdownContainer) {
            if (countdownText) {
                countdownText.textContent = 'No expiration date';
                countdownText.className = 'expiration-countdown-text normal';
            }
            if (countdownContainer) countdownContainer.className = 'company-expiration-countdown normal';
            return;
        }
        var countdown = calculateCountdown(expirationDate);
        if (countdown) {
            countdownText.textContent = countdown.text;
            countdownText.className = 'expiration-countdown-text ' + countdown.status;
            countdownContainer.className = 'company-expiration-countdown ' + countdown.status;
        } else {
            countdownText.textContent = 'No expiration date';
            countdownText.className = 'expiration-countdown-text normal';
            countdownContainer.className = 'company-expiration-countdown normal';
        }
    }

    function getSidebarCompanyCodeForPermissionStorage() {
        var c = '';
        if (typeof window.SIDEBAR_COMPANY_CODE !== 'undefined' && window.SIDEBAR_COMPANY_CODE) {
            c = String(window.SIDEBAR_COMPANY_CODE);
        }
        if (!c && typeof window.PROCESSLIST_COMPANY_CODE !== 'undefined' && window.PROCESSLIST_COMPANY_CODE) {
            c = String(window.PROCESSLIST_COMPANY_CODE);
        }
        return c;
    }

    function isMaintenanceCategoryBankFromStorage() {
        var code = getSidebarCompanyCodeForPermissionStorage();
        if (!code) return false;
        var raw = localStorage.getItem('selectedPermission_' + code);
        if (raw === 'Gambling') raw = 'Games';
        return raw === 'Bank';
    }

    // 切换公司后由各页调用，即时显示/隐藏：
    // - 侧边栏 Data Capture
    // - Maintenance 子菜单里 Games 才能用的项
    // - Category 为 Bank（localStorage）时隐藏 Maintenance > Data Capture / Transaction / Formula
    // - 侧边栏 Report 区块（仅 Games 可见）
    // - Maintenance > Process：公司需含 Bank 权限；无 Games 时始终显示（若 has_bank）；有 Games 时仅 Category=Bank（localStorage）显示
    // hasBank 由 session 切换 API 或 sidebar.php 注入；未传第二参时不覆盖 window.SIDEBAR_COMPANY_HAS_BANK
    function updateSidebarDataCaptureVisibility(hasGambling, hasBank) {
        if (typeof hasBank === 'boolean') {
            window.SIDEBAR_COMPANY_HAS_BANK = hasBank;
        }
        var bankPerm = typeof window.SIDEBAR_COMPANY_HAS_BANK !== 'undefined' ? !!window.SIDEBAR_COMPANY_HAS_BANK : false;
        var isBankCategory = isMaintenanceCategoryBankFromStorage();

        var dcSection = document.getElementById('sidebar-datacapture-section');
        if (dcSection) dcSection.style.display = hasGambling ? '' : 'none';

        var maintCapture = document.getElementById('maintenance-capture-link');
        if (maintCapture) {
            if (isBankCategory) {
                maintCapture.style.display = 'none';
            } else {
                maintCapture.style.display = hasGambling ? '' : 'none';
            }
        }

        var maintTransaction = document.getElementById('maintenance-transaction-link');
        if (maintTransaction) {
            if (isBankCategory) {
                maintTransaction.style.display = 'none';
            } else {
                maintTransaction.style.display = hasGambling ? '' : 'none';
            }
        }

        var maintFormula = document.getElementById('maintenance-formula-link');
        if (maintFormula) {
            if (isBankCategory) {
                maintFormula.style.display = 'none';
            } else {
                maintFormula.style.display = hasGambling ? '' : 'none';
            }
        }

        var maintProcess = document.getElementById('maintenance-process-link');
        if (maintProcess) {
            if (!bankPerm) {
                maintProcess.style.display = 'none';
            } else if (hasGambling) {
                maintProcess.style.display = isBankCategory ? '' : 'none';
            } else {
                maintProcess.style.display = '';
            }
        }

        var reportSection = document.getElementById('sidebar-report-section');
        if (reportSection) {
            if (isBankCategory) {
                reportSection.style.display = 'none';
            } else {
                reportSection.style.display = hasGambling ? '' : 'none';
            }
        }
    }

    function ensureCompanyAccessModal() {
        var overlay = document.getElementById('globalCompanyAccessModalOverlay');
        if (overlay) return overlay;

        var styleId = 'global-company-access-modal-style';
        if (!document.getElementById(styleId)) {
            var style = document.createElement('style');
            style.id = styleId;
            style.textContent =
                '.global-company-access-modal-overlay{position:fixed;inset:0;z-index:13000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);opacity:0;visibility:hidden;transition:opacity .25s ease,visibility .25s ease;}' +
                '.global-company-access-modal-overlay.is-open{opacity:1;visibility:visible;}' +
                '.global-company-access-modal-box{background:#fff;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.2);max-width:480px;width:100%;padding:36px 32px;text-align:center;transform:scale(.95);transition:transform .25s ease;}' +
                '.global-company-access-modal-overlay.is-open .global-company-access-modal-box{transform:scale(1);}' +
                '.global-company-access-modal-icon-wrap{width:80px;height:80px;margin:0 auto 20px;background:rgba(220,53,69,.12);border-radius:50%;display:flex;align-items:center;justify-content:center;}' +
                '.global-company-access-modal-icon{width:42px;height:42px;color:#dc3545;display:block;}' +
                '.global-company-access-modal-title{font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:16px;line-height:1.3;}' +
                '.global-company-access-modal-message{font-size:16px;color:#444;line-height:1.55;margin-bottom:28px;white-space:pre-line;}' +
                '.global-company-access-modal-btn{min-width:120px;padding:12px 24px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:background .2s,transform .1s;background:linear-gradient(135deg,#56ccf2,#004ff9);color:#fff;}' +
                '.global-company-access-modal-btn:active{transform:scale(.98);}' +
                '.global-company-access-modal-btn:hover{background:linear-gradient(135deg,#45b8e0,#003dd4);}';
            document.head.appendChild(style);
        }

        overlay = document.createElement('div');
        overlay.id = 'globalCompanyAccessModalOverlay';
        overlay.className = 'global-company-access-modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML =
            '<div class="global-company-access-modal-box" role="dialog" aria-labelledby="globalCompanyAccessModalTitle" aria-describedby="globalCompanyAccessModalMessage">' +
            '<div class="global-company-access-modal-icon-wrap">' +
            '<svg class="global-company-access-modal-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
            '<path d="M12 3.5L21 19.5a1 1 0 0 1-.87 1.5H3.87A1 1 0 0 1 3 19.5l9-16a1 1 0 0 1 1.74 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>' +
            '<path d="M12 8.2v5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>' +
            '<circle cx="12" cy="17.2" r="1.1" fill="currentColor"></circle>' +
            '</svg>' +
            '</div>' +
            '<h3 id="globalCompanyAccessModalTitle" class="global-company-access-modal-title">Notice</h3>' +
            '<p id="globalCompanyAccessModalMessage" class="global-company-access-modal-message"></p>' +
            '<button type="button" id="globalCompanyAccessModalConfirmBtn" class="global-company-access-modal-btn">Confirm</button>' +
            '</div>';
        document.body.appendChild(overlay);
        return overlay;
    }

    function showCompanyAccessModal(message) {
        return new Promise(function (resolve) {
            var overlay = ensureCompanyAccessModal();
            var messageEl = document.getElementById('globalCompanyAccessModalMessage');
            var confirmBtn = document.getElementById('globalCompanyAccessModalConfirmBtn');
            if (!overlay || !messageEl || !confirmBtn) {
                alert(message || 'Company access denied.');
                resolve();
                return;
            }
            messageEl.textContent = message || 'Company access denied.';
            overlay.classList.add('is-open');
            overlay.setAttribute('aria-hidden', 'false');

            function close() {
                overlay.classList.remove('is-open');
                overlay.setAttribute('aria-hidden', 'true');
                confirmBtn.removeEventListener('click', onConfirm);
                overlay.removeEventListener('click', onOverlayClick);
                document.removeEventListener('keydown', onEscape);
                resolve();
            }
            function onConfirm() { close(); }
            function onOverlayClick(e) { if (e.target === overlay) close(); }
            function onEscape(e) { if (e.key === 'Escape') close(); }

            confirmBtn.addEventListener('click', onConfirm);
            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onEscape);
        });
    }

    function getCompanyBlockedMessage(result) {
        var reason = '';
        if (result && result.data && result.data.reason) reason = String(result.data.reason).toLowerCase();
        var text = String((result && (result.error || result.message)) || '').toLowerCase();
        if (reason === 'expired' || text.indexOf('expired') !== -1) {
            return 'This company since login has expired. Please contact the Customer Service.';
        }
        if (reason === 'no_set' || text.indexOf('not set') !== -1 || text.indexOf('date is not set') !== -1) {
            return 'Please contact the Customer Service to set the expiration date.';
        }
        return '';
    }

    async function handleCompanySwitchDenied(result) {
        var message = getCompanyBlockedMessage(result);
        if (!message) return false;
        await showCompanyAccessModal(message);
        return true;
    }

    // 暴露给 HTML onclick 和 PHP 初始化脚本
    window.closeSidebar = closeSidebar;
    window.toggleSidebar = closeSidebar;
    window.toggleAvatarOptions = toggleAvatarOptions;
    window.selectGender = selectGender;
    window.selectAvatar = selectAvatar;
    window.goDashboard = goDashboard;
    window.handleLogout = handleLogout;
    window.toggleLanguageDropdown = toggleLanguageDropdown;
    window.selectLanguage = selectLanguage;
    window.toggleNotificationPanel = toggleNotificationPanel;
    window.closeNotificationPanel = closeNotificationPanel;
    window.updateExpirationCountdown = updateExpirationCountdown;
    window.updateSidebarDataCaptureVisibility = updateSidebarDataCaptureVisibility;
    window.showCompanyAccessModal = showCompanyAccessModal;
    window.handleCompanySwitchDenied = handleCompanySwitchDenied;

    function init() {
        sidebar = document.querySelector('.informationmenu');
        overlay = document.querySelector('.informationmenu-overlay');
        userAvatar = document.getElementById('user-avatar');
        sidebarToggle = document.getElementById('sidebarToggle');

        if (userAvatar) {
            userAvatar.addEventListener('click', function () {
                sidebar.classList.add('show');
                overlay.classList.add('show');
            });
        }
        if (overlay) overlay.addEventListener('click', closeSidebar);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeSidebar();
        });

        document.querySelectorAll('.informationmenu-section-title').forEach(function (title) {
            var middleClickHandled = false;
            var ctrlClickHandled = false;
            title.addEventListener('mousedown', function (e) {
                var isMiddleClick = e.button === 1 || e.which === 2;
                var isCtrlClick = e.ctrlKey || e.metaKey;
                var pageUrl = this.getAttribute('data-page');
                if (pageUrl && isMiddleClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    middleClickHandled = true;
                    var originalOnclick = this.onclick;
                    this.onclick = null;
                    window.open(pageUrl, '_blank');
                    setTimeout(function () { this.onclick = originalOnclick; middleClickHandled = false; }.bind(this), 100);
                    return false;
                }
                if (pageUrl && isCtrlClick && (e.button === 0 || e.button === 2)) {
                    e.preventDefault();
                    e.stopPropagation();
                    ctrlClickHandled = true;
                    var orig = this.onclick;
                    this.onclick = null;
                    window.open(pageUrl, '_blank');
                    setTimeout(function () { this.onclick = orig; ctrlClickHandled = false; }.bind(this), 100);
                    return false;
                }
                middleClickHandled = false;
                ctrlClickHandled = false;
            }, true);

            title.addEventListener('click', function (e) {
                if (middleClickHandled || ctrlClickHandled) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                var isCtrlClick = e.ctrlKey || e.metaKey;
                var pageUrl = this.getAttribute('data-page');
                if (pageUrl && isCtrlClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    var orig = this.onclick;
                    this.onclick = null;
                    window.open(pageUrl, '_blank');
                    setTimeout(function () { this.onclick = orig; }.bind(this), 100);
                    return false;
                }
                var isMiddleClick = e.button === 1 || e.which === 2;
                if (pageUrl && isMiddleClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(pageUrl, '_blank');
                    return false;
                }
                if (isMiddleClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                var targetId = this.getAttribute('data-target');
                var section = this.getAttribute('data-section');
                if (section === 'report' || section === 'maintenance') return;
                var targetDropdown = document.getElementById(targetId);
                document.querySelectorAll('.dropdown-menu-items').forEach(function (dropdown) {
                    if (dropdown.id !== targetId) dropdown.classList.remove('show');
                });
                document.querySelectorAll('.informationmenu-section-title').forEach(function (t) {
                    if (t !== title) t.classList.remove('active');
                });
                this.classList.toggle('active');
                if (targetDropdown) targetDropdown.classList.toggle('show');
            });
        });

        document.querySelectorAll('.submenu-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                var href = this.getAttribute('href');
                var isCtrlClick = e.ctrlKey || e.metaKey;
                if (isCtrlClick && href && href !== '#' && href.indexOf('javascript:') !== 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(href, '_blank');
                    return false;
                }
                var isMiddleClick = e.button === 1 || e.which === 2;
                if (isMiddleClick && href && href !== '#' && href.indexOf('javascript:') !== 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(href, '_blank');
                    return false;
                }
            });
        });

        document.querySelectorAll('.informationmenu-item').forEach(function (item) {
            var middleClickHandled = false;
            item.addEventListener('mousedown', function (e) {
                var isMiddleClick = e.button === 1 || e.which === 2;
                var href = this.getAttribute('href');
                if (isMiddleClick && href && href !== '#' && href.indexOf('javascript:') !== 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    middleClickHandled = true;
                    window.open(href, '_blank');
                    return false;
                }
                middleClickHandled = false;
            }, true);
            item.addEventListener('click', function (e) {
                if (middleClickHandled) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                var isCtrlClick = e.ctrlKey || e.metaKey;
                var href = this.getAttribute('href');
                if (isCtrlClick && href && href !== '#' && href.indexOf('javascript:') !== 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(href, '_blank');
                    return false;
                }
                var isMiddleClick = e.button === 1 || e.which === 2;
                if (isMiddleClick && href && href !== '#' && href.indexOf('javascript:') !== 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(href, '_blank');
                    return false;
                }
                if (href && href !== '#' && href.indexOf('javascript:') !== 0) {
                    window.location.href = href;
                    return;
                }
                e.preventDefault();
                document.querySelectorAll('.informationmenu-item').forEach(function (i) { i.classList.remove('active'); });
                this.classList.add('active');
            });
        });

        document.addEventListener('click', function (e) {
            var languageDropdown = document.querySelector('.language-dropdown');
            var dropdown = document.getElementById('languageDropdown');
            var button = document.querySelector('.language-btn');
            if (languageDropdown && !languageDropdown.contains(e.target)) {
                if (dropdown) dropdown.classList.remove('show');
                if (button) button.classList.remove('active');
            }
        });

        var currentLang = window.location.pathname.indexOf('/cn/') !== -1 ? 'zh' : 'en';
        var currentFlag = document.getElementById('current-flag');
        var currentLangText = document.getElementById('current-lang');
        if (currentLang === 'zh') {
            if (currentFlag) { currentFlag.src = 'images/china.png'; currentFlag.alt = '中文'; }
            if (currentLangText) currentLangText.textContent = '中文';
        } else {
            if (currentFlag) { currentFlag.src = 'images/uk.png'; currentFlag.alt = 'English'; }
            if (currentLangText) currentLangText.textContent = 'English';
        }
        try { localStorage.setItem('selectedLanguage', currentLang); } catch (e) { }

        var savedAvatar = null;
        try { savedAvatar = localStorage.getItem('selectedAvatar'); } catch (e) { }
        var currentAvatarImg = document.getElementById('currentAvatarImg');
        if (savedAvatar && avatarImages[savedAvatar]) {
            currentAvatarId = savedAvatar;
            document.cookie = 'selectedAvatar=' + encodeURIComponent(savedAvatar) + '; path=/; max-age=31536000; SameSite=Lax';
        } else {
            currentAvatarId = 'male1';
        }
        if (currentAvatarImg) {
            var renderedId = currentAvatarImg.getAttribute('data-avatar-id');
            if (renderedId !== currentAvatarId) {
                currentAvatarImg.src = avatarImages[currentAvatarId];
                currentAvatarImg.setAttribute('data-avatar-id', currentAvatarId);
            }
        }
        updateSelectedAvatar();
        if (currentAvatarId.indexOf('female') === 0) selectGender('female');
        else selectGender('male');

        document.addEventListener('click', function (e) {
            var avatarContainer = document.querySelector('.avatar-selector-container');
            var avatarOptions = document.getElementById('avatarOptions');
            if (avatarContainer && avatarOptions && !avatarContainer.contains(e.target) && !avatarOptions.contains(e.target)) {
                avatarOptions.classList.remove('show');
            }
        });

        setCurrentPageHighlight();

        document.querySelectorAll('.menu-item-wrapper').forEach(function (wrapper) {
            var submenu = wrapper.querySelector('.submenu');
            if (!submenu) return;
            var hideTimeout = null;
            function clearHideTimeout() {
                if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            }
            function showSubmenu() {
                clearHideTimeout();
                positionSubmenu(wrapper);
                submenu.style.opacity = '1';
                submenu.style.visibility = 'visible';
                submenu.style.transform = 'translateX(0)';
                submenu.style.pointerEvents = 'auto';
            }
            function hideSubmenu() {
                clearHideTimeout();
                hideTimeout = setTimeout(function () {
                    submenu.style.opacity = '0';
                    submenu.style.visibility = 'hidden';
                    submenu.style.transform = 'translateX(-10px)';
                    submenu.style.pointerEvents = 'none';
                }, 100);
            }
            wrapper.addEventListener('mouseenter', showSubmenu);
            wrapper.addEventListener('mouseleave', hideSubmenu);
            submenu.addEventListener('mouseenter', showSubmenu);
            submenu.addEventListener('mouseleave', hideSubmenu);
            wrapper.addEventListener('mousemove', function () { positionSubmenu(wrapper); });
        });

        document.addEventListener('click', function (e) {
            var bell = document.querySelector('.notification-bell');
            var panel = document.getElementById('notificationPanel');
            var overlayN = document.getElementById('notificationOverlay');
            if (bell && panel && !bell.contains(e.target) && !panel.contains(e.target) && panel.classList.contains('show')) {
                closeNotificationPanel();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();