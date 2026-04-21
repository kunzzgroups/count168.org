/**
 * reset-password.php - 重置密码页逻辑
 */
(function() {
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
                showAlertModal('Notice', 'Please enter Company ID first');
                return;
            }
            if (!email) {
                showAlertModal('Notice', 'Please enter your email address first');
                return;
            }

            getTacBtn.disabled = true;
            getTacBtn.textContent = 'Sending...';

            try {
                const res = await fetch('api/users/send_reset_tac_api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company_id: companyId, email: email })
                });
                const data = await res.json().catch(() => ({}));
                if (data.success) {
                    let msg = data.message || 'TAC code has been sent to your email';
                    if (data.tac) {
                        msg += '\n\nYour verification code: ' + data.tac;
                        const tacField = document.getElementById('tac-field');
                        if (tacField) {
                            tacField.value = data.tac;
                            tacField.focus();
                        }
                    }
                    await showAlertModal('Success', msg);
                    if (!data.tac) {
                        const tacField = document.getElementById('tac-field');
                        if (tacField) tacField.focus();
                    }
                } else {
                    await showAlertModal('Notice', data.message || 'Failed to send TAC. Please try again.');
                }
            } catch (err) {
                console.error('Send TAC error:', err);
                await showAlertModal('Notice', 'Network error. Please try again.');
            }
            getTacBtn.disabled = false;
            getTacBtn.textContent = 'SEND';
        });
    }

    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (!validatePassword()) {
                showAlertModal('Notice', 'Passwords do not match');
                return;
            }

            const tac = document.getElementById('tac-field').value.trim();
            if (!tac) {
                showAlertModal('Notice', 'Please enter the TAC code');
                return;
            }

            const companyIdEl = document.getElementById('company-id');
            const companyId = companyIdEl ? companyIdEl.value.trim() : '';
            const emailVal = emailField ? emailField.value.trim() : '';
            const newPasswordVal = newPassword ? newPassword.value : '';

            if (!companyId || !emailVal) {
                showAlertModal('Notice', 'Company ID and email are required');
                return;
            }

            const btn = resetForm.querySelector('button[type="submit"]');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Resetting...';
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
                    await showAlertModal('Success', 'Password reset successful! Redirecting to login...');
                    setTimeout(() => {
                        window.location.href = 'index.php';
                    }, 1500);
                } else {
                    await showAlertModal('Notice', data.message || 'Failed to reset password. Please try again.');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Reset Password';
                    }
                }
            } catch (err) {
                console.error('Reset password error:', err);
                await showAlertModal('Notice', 'Network error. Please try again.');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Reset Password';
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