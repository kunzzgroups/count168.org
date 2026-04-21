(function() {
    // 自定义弹窗（与重置密码页风格一致，替代原生 alert）
    function showAlertModal(title, message) {
        return new Promise(function(resolve) {
            const overlay = document.getElementById('alertModalOverlay');
            const titleEl = document.getElementById('modalTitle');
            const messageEl = document.getElementById('modalMessage');
            const confirmBtn = document.getElementById('modalConfirmBtn');
            if (!overlay || !titleEl || !messageEl || !confirmBtn) {
                alert(message);
                resolve();
                return;
            }
            titleEl.textContent = title || 'Notice';
            messageEl.textContent = message || '';
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
            function onOverlayClick(e) {
                if (e.target === overlay) close();
            }
            function onEscape(e) {
                if (e.key === 'Escape') close();
            }
            confirmBtn.addEventListener('click', onConfirm);
            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onEscape);
        });
    }

    const adminTab = document.getElementById("admin-tab");
    const memberTab = document.getElementById("member-tab");
    const companyId = document.getElementById("company-id");
    const forgotLink = document.querySelector(".forgot-link");

    let verifyTimeout;
    let companyIdValid = false;

    adminTab.addEventListener("click", () => {
        adminTab.classList.add("active");
        memberTab.classList.remove("active");
        forgotLink.style.display = "block";
        const userInput = document.getElementById("user-id");
        userInput.placeholder = "Username";
        userInput.name = "login_id";
    });

    memberTab.addEventListener("click", () => {
        memberTab.classList.add("active");
        adminTab.classList.remove("active");
        forgotLink.style.display = "none";
        const userInput = document.getElementById("user-id");
        userInput.placeholder = "Account Id";
        userInput.name = "account_id";
    });

    function verifyCompanyId(companyIdValue) {
        if (!companyIdValue || companyIdValue.trim() === '') {
            companyIdValid = false;
            return;
        }

        const formData = new FormData();
        formData.append('company_id', companyIdValue);

        fetch('api/company/verify_api.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                companyIdValid = true;
            } else {
                companyIdValid = false;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            companyIdValid = false;
        });
    }

    companyId.addEventListener('input', function() {
        clearTimeout(verifyTimeout);
        companyIdValid = false;

        if (this.value.trim() === '') {
            return;
        }

        verifyTimeout = setTimeout(() => {
            verifyCompanyId(this.value);
        }, 500);
    });

    companyId.addEventListener('blur', function() {
        clearTimeout(verifyTimeout);
        if (this.value.trim() !== '') {
            verifyCompanyId(this.value);
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const role = urlParams.get('role');

    if (role === 'member') {
        memberTab.classList.add("active");
        adminTab.classList.remove("active");
        forgotLink.style.display = "none";
        const userInput = document.getElementById("user-id");
        userInput.placeholder = "Account Id";
        userInput.name = "account_id";
    } else {
        forgotLink.style.display = "block";
        const userInput = document.getElementById("user-id");
        userInput.placeholder = "Username";
        userInput.name = "login_id";
    }

    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();

        const formData = new FormData(this);
        formData.append('action', 'login');

        const currentRole = memberTab.classList.contains('active') ? 'member' : 'admin';
        formData.append('login_role', currentRole);

        fetch('login_process.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                window.location.href = data.redirect;
            } else {
                showAlertModal('Notice', data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showAlertModal('Notice', 'An error occurred during login');
        });
    });

    document.querySelectorAll('.input-group input').forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
        });

        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
        });
    });

    const companyIdInput = document.getElementById('company-id');
    const userIdInput = document.getElementById('user-id');

    companyIdInput.addEventListener('input', function() {
        const cursorPosition = this.selectionStart;
        this.value = this.value.toUpperCase();
        this.setSelectionRange(cursorPosition, cursorPosition);
    });

    userIdInput.addEventListener('input', function() {
        const cursorPosition = this.selectionStart;
        this.value = this.value.toUpperCase();
        this.setSelectionRange(cursorPosition, cursorPosition);
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async function loadMaintenanceContent() {
        try {
            const response = await fetch('api/maintenance/get_public_api.php');
            const result = await response.json();

            const wrapper = document.getElementById('maintenanceMarqueeWrapper');
            const track = document.getElementById('maintenanceMarqueeTrack');

            if (result.success && result.data && result.data.length > 0) {
                track.innerHTML = '';

                result.data.forEach(maintenance => {
                    const item1 = document.createElement('div');
                    item1.className = 'maintenance-marquee-item';
                    item1.innerHTML = `
                        <span class="maintenance-marquee-dot"></span>
                        <span class="maintenance-marquee-label">系统维护中:</span>
                        <span>${escapeHtml(maintenance.content)}</span>
                    `;
                    track.appendChild(item1);

                    const item2 = document.createElement('div');
                    item2.className = 'maintenance-marquee-item';
                    item2.innerHTML = `
                        <span class="maintenance-marquee-dot"></span>
                        <span class="maintenance-marquee-label">系统维护中:</span>
                        <span>${escapeHtml(maintenance.content)}</span>
                    `;
                    track.appendChild(item2);
                });

                wrapper.style.display = 'block';
            } else {
                wrapper.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to load maintenance content:', error);
            const wrapper = document.getElementById('maintenanceMarqueeWrapper');
            if (wrapper) {
                wrapper.style.display = 'none';
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        loadMaintenanceContent();
    });
})();