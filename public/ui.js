(() => {
    function getRequiredEl(id) {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Missing required element #${id}`);
        return el;
    }

    async function readResponseBodySafe(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch {
                // fall through
            }
        }

        try {
            const text = await response.text();
            return { error: text || 'Response JSON tidak valid.' };
        } catch {
            return { error: 'Response JSON tidak valid.' };
        }
    }

    function setButtonLoading(button, isLoading, opts) {
        const labelIdle = opts?.labelIdle || '';
        const labelLoading = opts?.labelLoading || 'Memproses...';
        const htmlIdle = opts?.htmlIdle;
        const htmlLoading = opts?.htmlLoading;

        if (!button) return;

        if (isLoading) {
            button.disabled = true;
            if (htmlLoading != null) button.innerHTML = htmlLoading;
            else button.textContent = labelLoading;
            return;
        }

        button.disabled = false;
        if (htmlIdle != null) button.innerHTML = htmlIdle;
        else button.textContent = labelIdle;
    }

    function showToast(text, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = text;
        toast.classList.remove('success', 'error', 'hidden');
        if (type) toast.classList.add(type);

        const timeoutMs = 3500;
        window.clearTimeout(showToast._t);
        showToast._t = window.setTimeout(() => toast.classList.add('hidden'), timeoutMs);
    }

    function confirmUi(title, text) {
        const dialog = document.getElementById('confirmDialog');
        if (!dialog) {
            return Promise.resolve(window.confirm(`${title}\n\n${text}`));
        }

        const titleEl = getRequiredEl('confirmTitle');
        const textEl = getRequiredEl('confirmText');
        const ok = getRequiredEl('confirmOk');
        const cancel = getRequiredEl('confirmCancel');

        titleEl.textContent = title;
        textEl.textContent = text;
        dialog.classList.add('active');
        setTimeout(() => cancel.focus(), 0);

        return new Promise((resolve) => {
            const cleanup = () => {
                ok.removeEventListener('click', onOk);
                cancel.removeEventListener('click', onCancel);
                dialog.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeydown);
                dialog.classList.remove('active');
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

    function askTextDialog(opts) {
        const dialog = document.getElementById(opts.dialogId);
        if (!dialog) {
            return Promise.resolve(window.prompt(opts.fallbackPrompt || 'Masukkan nilai:') || null);
        }

        const input = getRequiredEl(opts.inputId);
        const ok = getRequiredEl(opts.okId);
        const cancel = getRequiredEl(opts.cancelId);

        dialog.classList.add('active');
        input.value = '';
        setTimeout(() => input.focus(), 0);

        return new Promise((resolve) => {
            const cleanup = () => {
                ok.removeEventListener('click', onOk);
                cancel.removeEventListener('click', onCancel);
                dialog.removeEventListener('click', onBackdrop);
                document.removeEventListener('keydown', onKeydown);
                dialog.classList.remove('active');
            };

            const onOk = () => {
                const v = (input.value || '').trim();
                if (!v) {
                    showToast(opts.emptyError || 'Wajib diisi.', 'error');
                    input.focus();
                    return;
                }
                if (opts.maxLength && v.length > opts.maxLength) {
                    showToast(opts.tooLongError || `Maks ${opts.maxLength} karakter.`, 'error');
                    input.focus();
                    return;
                }
                cleanup();
                resolve(v);
            };

            const onCancel = () => {
                cleanup();
                resolve(null);
            };

            const onBackdrop = (e) => {
                if (e.target === dialog) onCancel();
            };

            const onKeydown = (e) => {
                if (e.key === 'Escape') onCancel();
                if (e.key === 'Enter') onOk();
            };

            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            dialog.addEventListener('click', onBackdrop);
            document.addEventListener('keydown', onKeydown);
        });
    }

    window.UI = {
        readResponseBodySafe,
        setButtonLoading,
        showToast,
        confirmUi,
        askTextDialog,
    };
})();
