(() => {
    const form = document.getElementById('loginForm');
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');

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
            showToast('Username dan password wajib diisi.', 'error');
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const contentType = res.headers.get('content-type') || '';
            const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};

            if (res.ok) {
                window.location.href = '/admin.html';
                return;
            }

            showToast(data.error || 'Login gagal.', 'error');
        } catch (err) {
            console.error(err);
            showToast('Gagal terhubung ke server.', 'error');
        }
    });

    function showToast(text, type) {
        const toast = document.getElementById('toast');
        toast.textContent = text;
        toast.classList.remove('success', 'error', 'hidden');
        if (type) toast.classList.add(type);
        setTimeout(() => toast.classList.add('hidden'), 3500);
    }
})();
