(() => {
    // Check session on page load — redirect to login if expired
    fetch('/api/csrf-token').then(res => {
        if (res.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        if (res.ok) {
            res.json().then(data => {
                if (data?.csrfToken) {
                    try { window.sessionStorage.setItem('csrfToken', String(data.csrfToken)); } catch {}
                }
            }).catch(() => {});
        }
    }).catch(() => {});

    document.getElementById('logoutBtn').addEventListener('click', () => {
        const csrfToken = (() => {
            try { return window.sessionStorage.getItem('csrfToken') || ''; } catch { return ''; }
        })();

        fetch('/api/logout', {
            method: 'POST',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        }).finally(() => {
            window.location.href = '/login.html';
        });
    });

    // Backwards compat for existing code
    window.showToast = (text, type) => window.UI?.showToast?.(text, type);
    window.confirmUi = (title, text) => window.UI?.confirmUi?.(title, text);
})();
