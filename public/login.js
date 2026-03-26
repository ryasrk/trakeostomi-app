(() => {
    const UI = window.UI || {
        showToast: (text) => {
            try { window.alert(text); } catch {}
        },
        setButtonLoading: (btn, isLoading, opts) => {
            if (!btn) return;
            btn.disabled = Boolean(isLoading);
            if (!isLoading && opts?.htmlIdle != null) btn.innerHTML = opts.htmlIdle;
            if (isLoading && opts?.htmlLoading != null) btn.innerHTML = opts.htmlLoading;
        },
        readResponseBodySafe: async (response) => {
            try { return await response.json(); } catch { return {}; }
        },
    };

    const form = document.getElementById('loginForm');
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Autofill from querystring if present (and then clean URL)
    const params = new URLSearchParams(window.location.search);
    const u = params.get('username');
    const p = params.get('password');
    if (u) usernameEl.value = u;
    if (p) passwordEl.value = p;
    if (u || p) {
        try {
            history.replaceState({}, '', '/login.html');
        } catch {}
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = (usernameEl.value || '').trim();
        const password = passwordEl.value || '';

        if (!username || !password) {
            UI.showToast('Username dan password wajib diisi.', 'error');
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
                    if (data?.csrfToken) {
                        window.sessionStorage.setItem('csrfToken', String(data.csrfToken));
                        window.localStorage.setItem('csrfToken', String(data.csrfToken));
                    }
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
