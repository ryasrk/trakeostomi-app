(() => {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        const csrfToken = (() => {
            try { return window.sessionStorage.getItem('csrfToken') || window.localStorage.getItem('csrfToken') || ''; } catch { return ''; }
        })();

        fetch('/api/logout', {
            method: 'POST',
            headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        }).finally(() => {
            window.location.href = '/login.html';
        });
    });

    // Wire actions previously handled by inline onclick attributes
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
        window.exportCsvFromServer?.();
    });
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        window.prevPage?.();
    });
    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        window.nextPage?.();
    });
    document.getElementById('resetBtn')?.addEventListener('click', () => {
        window.clearFilter?.();
    });
    document.getElementById('editCancelBtn')?.addEventListener('click', () => {
        window.closeEditModal?.();
    });
    document.getElementById('imageCloseBtn')?.addEventListener('click', () => {
        window.closeImageModal?.();
    });

    // Backwards compat for existing code
    window.showToast = (text, type) => window.UI?.showToast?.(text, type);
    window.confirmUi = (title, text) => window.UI?.confirmUi?.(title, text);

    // Keep the rest of the original inline admin logic working by leaving it in admin.html for now.
})();
