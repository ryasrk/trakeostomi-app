(() => {
    const UI = window.UI || {
        showToast: (text) => { try { window.alert(text); } catch {} },
        setButtonLoading: (btn, isLoading, opts) => {
            if (!btn) return;
            btn.disabled = Boolean(isLoading);
            if (!isLoading && opts?.htmlIdle != null) btn.innerHTML = opts.htmlIdle;
            if (isLoading && opts?.htmlLoading != null) btn.innerHTML = opts.htmlLoading;
        },
        readResponseBodySafe: async (response) => { try { return await response.json(); } catch { return {}; } },
    };

    const form = document.getElementById('loginForm');
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Create and show inline error messages
    function showFieldError(fieldId, message) {
        let errorEl = document.getElementById('error_' + fieldId);
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'error_' + fieldId;
            errorEl.className = 'error-message show';
            errorEl.style.cssText = 'display:block;font-size:0.8rem;color:var(--error-color);margin-top:6px;padding:6px 12px;background:var(--error-light);border-radius:var(--radius-sm);border-left:3px solid var(--error-color);';
            
            const field = document.getElementById(fieldId);
            if (field && field.parentNode) {
                field.parentNode.appendChild(errorEl);
            }
        }
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    function hideFieldError(fieldId) {
        const errorEl = document.getElementById('error_' + fieldId);
        if (errorEl) {
            errorEl.style.display = 'none';
        }
    }

    function validateField(field, showError = false) {
        const value = field.value.trim();
        const fieldId = field.id;
        let isValid = true;
        let errorMessage = '';

        if (fieldId === 'username') {
            if (value.length === 0) {
                isValid = false;
                errorMessage = 'Username wajib diisi.';
            } else if (value.length < 3) {
                isValid = false;
                errorMessage = 'Username minimal 3 karakter.';
            }
        } else if (fieldId === 'password') {
            if (value.length === 0) {
                isValid = false;
                errorMessage = 'Password wajib diisi.';
            } else if (value.length < 6) {
                isValid = false;
                errorMessage = 'Password minimal 6 karakter.';
            }
        }

        // Update field styling
        field.classList.remove('valid', 'invalid');
        if (value.length > 0) {
            field.classList.add(isValid ? 'valid' : 'invalid');
        }

        if (showError) {
            if (isValid) {
                hideFieldError(fieldId);
            } else {
                showFieldError(fieldId, errorMessage);
            }
        }

        return isValid;
    }

    // Add real-time validation
    [usernameEl, passwordEl].forEach(field => {
        field.addEventListener('input', () => {
            validateField(field, false);  // Don't show errors while typing
        });
        
        field.addEventListener('blur', () => {
            validateField(field, true);   // Show errors on blur
        });
    });

    // Password visibility toggle
    const togglePasswordBtn = document.getElementById('togglePassword');
    const eyeIcon = document.getElementById('eyeIcon');
    togglePasswordBtn?.addEventListener('click', () => {
        const isText = passwordEl.type === 'text';
        passwordEl.type = isText ? 'password' : 'text';
        if (eyeIcon) eyeIcon.className = isText ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = (usernameEl.value || '').trim();
        const password = passwordEl.value || '';

        // Validate all fields before submitting
        const usernameValid = validateField(usernameEl, true);
        const passwordValid = validateField(passwordEl, true);

        if (!usernameValid || !passwordValid) {
            UI.showToast('Harap perbaiki kesalahan pada form.', 'error');
            return;
        }

        UI.setButtonLoading(submitBtn, true, {
            htmlLoading: '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...'
        });

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const data = await UI.readResponseBodySafe(res);

            if (res.ok) {
                try {
                    if (data?.csrfToken) window.sessionStorage.setItem('csrfToken', String(data.csrfToken));
                } catch {}
                window.location.href = '/admin.html';
                return;
            }

            UI.showToast(data?.error || 'Login gagal.', 'error');
        } catch (err) {
            console.error(err);
            UI.showToast('Gagal terhubung ke server.', 'error');
        } finally {
            UI.setButtonLoading(submitBtn, false, {
                htmlIdle: '<i class="fa-solid fa-right-to-bracket"></i> Login Masuk'
            });
        }
    });
})();
