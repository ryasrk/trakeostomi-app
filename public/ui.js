(() => {
    // -------------------------------------------------------
    // Theme (dark mode) — runs immediately to prevent flash
    // -------------------------------------------------------
    (function initTheme() {
        const saved = (() => { try { return localStorage.getItem('theme'); } catch { return null; } })();
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = saved || (prefersDark ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
    })();

    function getRequiredEl(id) {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Missing required element #${id}`);
        return el;
    }

    async function readResponseBodySafe(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try { return await response.json(); } catch {}
        }
        try {
            const text = await response.text();
            return { error: text || 'Response tidak valid.' };
        } catch {
            return { error: 'Response tidak valid.' };
        }
    }

    function setButtonLoading(button, isLoading, opts) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            if (opts?.htmlLoading != null) button.innerHTML = opts.htmlLoading;
            else button.textContent = opts?.labelLoading || 'Memproses...';
            return;
        }
        button.disabled = false;
        if (opts?.htmlIdle != null) button.innerHTML = opts.htmlIdle;
        else button.textContent = opts?.labelIdle || '';
    }

    function showToast(text, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = text;
        toast.classList.remove('success', 'error', 'hidden');
        if (type) toast.classList.add(type);
        window.clearTimeout(showToast._t);
        showToast._t = window.setTimeout(() => toast.classList.add('hidden'), 3500);
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
            const onOk = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };
            const onBackdrop = (e) => { if (e.target === dialog) onCancel(); };
            const onKeydown = (e) => { if (e.key === 'Escape') onCancel(); };
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
        dialog.setAttribute('aria-hidden', 'false');
        input.value = '';
        setTimeout(() => input.focus(), 0);
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
                const v = (input.value || '').trim();
                if (!v) { showToast(opts.emptyError || 'Wajib diisi.', 'error'); input.focus(); return; }
                if (opts.maxLength && v.length > opts.maxLength) {
                    showToast(opts.tooLongError || `Maks ${opts.maxLength} karakter.`, 'error');
                    input.focus(); return;
                }
                cleanup(); resolve(v);
            };
            const onCancel = () => { cleanup(); resolve(null); };
            const onBackdrop = (e) => { if (e.target === dialog) onCancel(); };
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

    // -------------------------------------------------------
    // Theme toggle (wires button after DOM ready)
    // -------------------------------------------------------
    function wireThemeToggle() {
        const btn = document.getElementById('themeToggle');
        const icon = document.getElementById('themeIcon');
        if (!btn) return;

        function applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            try { localStorage.setItem('theme', theme); } catch {}
            if (icon) {
                icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            }
        }

        // Sync icon on load
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        if (icon) icon.className = current === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

        btn.addEventListener('click', () => {
            const is = document.documentElement.getAttribute('data-theme') === 'dark';
            applyTheme(is ? 'light' : 'dark');
        });
    }

    // Wire after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireThemeToggle);
    } else {
        wireThemeToggle();
    }

    window.UI = {
        readResponseBodySafe,
        setButtonLoading,
        showToast,
        confirmUi,
        askTextDialog,
    };
})();
