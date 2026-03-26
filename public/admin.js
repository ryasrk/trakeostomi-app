(() => {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        fetch('/api/logout', { method: 'POST' }).finally(() => {
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

    function showToast(text, type) {
        const toast = document.getElementById('toast');
        toast.textContent = text;
        toast.classList.remove('success', 'error', 'hidden');
        if (type) toast.classList.add(type);
        setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    function confirmUi(title, text) {
        const dialog = document.getElementById('confirmDialog');
        const titleEl = document.getElementById('confirmTitle');
        const textEl = document.getElementById('confirmText');
        const ok = document.getElementById('confirmOk');
        const cancel = document.getElementById('confirmCancel');

        titleEl.textContent = title;
        textEl.textContent = text;
        dialog.classList.add('active');
        dialog.setAttribute('aria-hidden', 'false');
        setTimeout(() => cancel.focus(), 0);

        return new Promise((resolve) => {
            const cleanup = () => {
                ok.removeEventListener('click', onOk);
                cancel.removeEventListener('click', onCancel);
                dialog.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeydown);
                dialog.classList.remove('active');
                dialog.setAttribute('aria-hidden', 'true');
            };

            const onOk = () => {
                cleanup();
                resolve(true);
            };
            const onCancel = () => {
                cleanup();
                resolve(false);
            };
            const onBackdrop = (e) => {
                if (e.target === dialog) onCancel();
            };
            const onKeydown = (e) => {
                if (e.key === 'Escape') onCancel();
            };

            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            dialog.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKeydown);
        });
    }

    // Expose helpers expected by existing code
    window.showToast = showToast;
    window.confirmUi = confirmUi;

    // Keep the rest of the original inline admin logic working by leaving it in admin.html for now.
})();
