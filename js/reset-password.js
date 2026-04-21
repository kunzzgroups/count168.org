/**
 * reset-password.php - 重置密码页逻辑
 */
(function() {
    const currentLang = (window.__RESET_LANG__ === 'zh') ? 'zh' : 'en';
    const i18n = {
        en: {
            pageTitle: 'Reset Password',
            companyPlaceholder: 'Company / Group ID (or Owner Code)',
            emailPlaceholder: 'Enter your email address',
            tacPlaceholder: 'TAC',
            sendBtn: 'SEND',
            sendingBtn: 'Sending...',
            newPasswordPlaceholder: 'New Password',
            confirmPasswordPlaceholder: 'Confirm New Password',
            resetBtn: 'Reset Password',
            resettingBtn: 'Resetting...',
            backToLogin: 'Back to Login',
            noticeTitle: 'Notice',
            successTitle: 'Success',
            confirmBtn: 'Confirm',
            msgEnterCompanyFirst: 'Please enter Company ID first',
            msgEnterEmailFirst: 'Please enter your email address first',
            msgTacSent: 'TAC code has been sent to your email',
            msgTacCodePrefix: 'Your verification code: ',
            msgSendTacFailed: 'Failed to send TAC. Please try again.',
            msgNetworkError: 'Network error. Please try again.',
            msgPasswordsNotMatch: 'Passwords do not match',
            msgEnterTac: 'Please enter the TAC code',
            msgCompanyEmailRequired: 'Company ID and email are required',
            msgResetSuccess: 'Password reset successful! Redirecting to login...',
            msgResetFailed: 'Failed to reset password. Please try again.'
        },
        zh: {
            pageTitle: '重置密码',
            companyPlaceholder: '公司 / 群组 ID（或 Owner Code）',
            emailPlaceholder: '请输入邮箱地址',
            tacPlaceholder: '验证码',
            sendBtn: '发送',
            sendingBtn: '发送中...',
            newPasswordPlaceholder: '新密码',
            confirmPasswordPlaceholder: '确认新密码',
            resetBtn: '重置密码',
            resettingBtn: '重置中...',
            backToLogin: '返回登录',
            noticeTitle: '提示',
            successTitle: '成功',
            confirmBtn: '确认',
            msgEnterCompanyFirst: '请先输入公司 ID',
            msgEnterEmailFirst: '请先输入邮箱地址',
            msgTacSent: '验证码已发送到你的邮箱',
            msgTacCodePrefix: '你的验证码：',
            msgSendTacFailed: '发送验证码失败，请稍后重试。',
            msgNetworkError: '网络异常，请稍后重试。',
            msgPasswordsNotMatch: '两次输入的密码不一致',
            msgEnterTac: '请输入验证码',
            msgCompanyEmailRequired: '公司 ID 和邮箱是必填项',
            msgResetSuccess: '密码重置成功，正在跳转登录页...',
            msgResetFailed: '重置密码失败，请稍后重试。'
        }
    };

    function t(key) {
        return (i18n[currentLang] && i18n[currentLang][key]) || (i18n.en[key] || key);
    }

    function applyTranslations() {
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            el.textContent = t(key);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = t(key);
        });
    }

    function localizeBackendMessage(message) {
        if (currentLang !== 'zh' || !message) {
            return message;
        }

        const map = {
            'Company ID is required': '公司 ID 为必填',
            'Email is required': '邮箱为必填',
            'TAC code is required': '验证码为必填',
            'New password is required': '新密码为必填',
            'Invalid TAC code': '验证码无效',
            'TAC code has expired': '验证码已过期',
            'Company ID, email, and new password are required': '公司 ID、邮箱和新密码是必填项',
            'Password reset successfully': '密码重置成功',
            'Failed to reset password': '重置密码失败',
            'Email not found for this company/group': '该公司/群组下找不到此邮箱',
            'Invalid request method': '请求方式无效',
            'Invalid JSON data': 'JSON 数据无效'
        };
        return map[message] || message;
    }

    applyTranslations();

    // 自定义弹窗（替代原生 alert，风格与确认删除弹窗一致）
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
            titleEl.textContent = title || t('noticeTitle');
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

    const companyIdInput = document.getElementById('company-id');
    if (companyIdInput) {
        companyIdInput.addEventListener('input', function() {
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.toUpperCase();
            this.setSelectionRange(start, end);
        });
    }

    const newPassword = document.getElementById('new-password');
    const confirmPassword = document.getElementById('confirm-password');

    function validatePassword() {
        const password = newPassword.value;
        const confirm = confirmPassword.value;

        if (confirm && password !== confirm) {
            confirmPassword.style.borderColor = '#dc3545';
            return false;
        } else {
            confirmPassword.style.borderColor = '#e1e5e9';
            return true;
        }
    }

    if (newPassword) newPassword.addEventListener('input', validatePassword);
    if (confirmPassword) confirmPassword.addEventListener('input', validatePassword);

    const getTacBtn = document.getElementById('get-tac-btn');
    const emailField = document.getElementById('email');

    if (getTacBtn && emailField) {
        getTacBtn.addEventListener('click', async function() {
            const companyIdEl = document.getElementById('company-id');
            const companyId = companyIdEl ? companyIdEl.value.trim() : '';
            const email = emailField.value.trim();

            if (!companyId) {
                showAlertModal(t('noticeTitle'), t('msgEnterCompanyFirst'));
                return;
            }
            if (!email) {
                showAlertModal(t('noticeTitle'), t('msgEnterEmailFirst'));
                return;
            }

            getTacBtn.disabled = true;
            getTacBtn.textContent = t('sendingBtn');

            try {
                const res = await fetch('api/users/send_reset_tac_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: companyId, email: email })
                });
                const data = await res.json().catch(() => ({}));
                if (data.success) {
                    let msg = currentLang === 'zh' ? localizeBackendMessage(data.message) : data.message;
                    if (!msg) {
                        msg = t('msgTacSent');
                    }
                    if (data.tac) {
                        msg += '\n\n' + t('msgTacCodePrefix') + data.tac;
                        const tacField = document.getElementById('tac-field');
                        if (tacField) {
                            tacField.value = data.tac;
                            tacField.focus();
                        }
                    }
                    await showAlertModal(t('successTitle'), msg);
                    if (!data.tac) {
                        const tacField = document.getElementById('tac-field');
                        if (tacField) tacField.focus();
                    }
                } else {
                    const backendMsg = currentLang === 'zh' ? localizeBackendMessage(data.message) : data.message;
                    await showAlertModal(t('noticeTitle'), backendMsg || t('msgSendTacFailed'));
                }
            } catch (err) {
                console.error('Send TAC error:', err);
                await showAlertModal(t('noticeTitle'), t('msgNetworkError'));
            }
            getTacBtn.disabled = false;
            getTacBtn.textContent = t('sendBtn');
        });
    }

    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (!validatePassword()) {
                showAlertModal(t('noticeTitle'), t('msgPasswordsNotMatch'));
                return;
            }

            const tac = document.getElementById('tac-field').value.trim();
            if (!tac) {
                showAlertModal(t('noticeTitle'), t('msgEnterTac'));
                return;
            }

            const companyIdEl = document.getElementById('company-id');
            const companyId = companyIdEl ? companyIdEl.value.trim() : '';
            const emailVal = emailField ? emailField.value.trim() : '';
            const newPasswordVal = newPassword ? newPassword.value : '';

            if (!companyId || !emailVal) {
                showAlertModal(t('noticeTitle'), t('msgCompanyEmailRequired'));
                return;
            }

            const btn = resetForm.querySelector('button[type="submit"]');
            if (btn) {
                btn.disabled = true;
                btn.textContent = t('resettingBtn');
            }

            try {
                const res = await fetch('api/users/reset_password_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        company_id: companyId,
                        email: emailVal,
                        tac: tac,
                        new_password: newPasswordVal
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (data.success) {
                    await showAlertModal(t('successTitle'), t('msgResetSuccess'));
                    setTimeout(() => {
                        window.location.href = 'index.php?lang=' + currentLang;
                    }, 1500);
                } else {
                    const backendMsg = currentLang === 'zh' ? localizeBackendMessage(data.message) : data.message;
                    await showAlertModal(t('noticeTitle'), backendMsg || t('msgResetFailed'));
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = t('resetBtn');
                    }
                }
            } catch (err) {
                console.error('Reset password error:', err);
                await showAlertModal(t('noticeTitle'), t('msgNetworkError'));
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = t('resetBtn');
                }
            }
        });
    }

    document.querySelectorAll('.input-group input').forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
        });
        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
        });
    });
})();