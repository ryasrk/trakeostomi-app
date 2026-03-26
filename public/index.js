(() => {
    const UI = window.UI || {
        showToast: (text) => {
            // Minimal fallback; keep UX functional even if ui.js fails
            try { window.alert(text); } catch {}
        },
        setButtonLoading: (btn, isLoading, opts) => {
            if (!btn) return;
            btn.disabled = Boolean(isLoading);
            if (!isLoading && opts?.htmlIdle != null) btn.innerHTML = opts.htmlIdle;
            if (isLoading && opts?.htmlLoading != null) btn.innerHTML = opts.htmlLoading;
        },
        readResponseBodySafe: async (response) => {
            try { return await response.json(); } catch { return { error: 'Response JSON tidak valid.' }; }
        },
        askTextDialog: async () => {
            const v = (window.prompt('Nama pengirim:') || '').trim();
            return v || null;
        },
    };

    const form = document.getElementById('trakeostomiForm');
    const submitBtn = document.getElementById('submitBtn');
    const fileInput = document.getElementById('tindakan_gambar');
    const preview = document.getElementById('imagePreview');

    // Toggle menu based on admin session (best-effort)
    const adminLoginLink = document.getElementById('adminLoginLink');
    const adminDashboardLink = document.getElementById('adminDashboardLink');
    const adminLogoutBtn = document.getElementById('adminLogoutBtn');

    fetch('/api/reports', { method: 'GET' })
        .then((r) => {
            if (r.ok) {
                adminLoginLink.classList.add('hidden');
                adminDashboardLink.classList.remove('hidden');
                adminLogoutBtn.classList.remove('hidden');
            }
        })
        .catch(() => {});

    adminLogoutBtn.addEventListener('click', () => {
        fetch('/api/logout', { method: 'POST' }).finally(() => window.location.reload());
    });

    const MAX_FILES = 10;
    const MAX_SIZE = 5 * 1024 * 1024;
    const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

    fileInput.addEventListener('change', () => {
        while (preview.firstChild) preview.removeChild(preview.firstChild);
        const files = Array.from(fileInput.files || []);

        if (files.length > MAX_FILES) {
            UI.showToast(`Maksimal ${MAX_FILES} gambar.`, 'error');
            fileInput.value = '';
            return;
        }

        for (const file of files) {
            if (!ALLOWED.has(file.type)) {
                UI.showToast('Ada file dengan tipe tidak didukung (JPG/PNG/WEBP saja).', 'error');
                fileInput.value = '';
                while (preview.firstChild) preview.removeChild(preview.firstChild);
                return;
            }
            if (file.size > MAX_SIZE) {
                UI.showToast('Ada file melebihi 5MB.', 'error');
                fileInput.value = '';
                while (preview.firstChild) preview.removeChild(preview.firstChild);
                return;
            }

            const url = URL.createObjectURL(file);
            const wrap = document.createElement('div');
            wrap.style.width = '80px';
            wrap.style.height = '80px';
            wrap.style.borderRadius = '8px';
            wrap.style.overflow = 'hidden';
            wrap.style.border = '1px solid var(--border-color)';
            wrap.style.background = '#fff';

            const img = document.createElement('img');
            img.src = url;
            img.alt = file.name;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';

            wrap.appendChild(img);
            preview.appendChild(wrap);
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const senderName = await UI.askTextDialog({
            dialogId: 'senderDialog',
            inputId: 'senderNameInput',
            okId: 'senderOk',
            cancelId: 'senderCancel',
            fallbackPrompt: 'Nama pengirim:',
            emptyError: 'Nama pengirim wajib diisi.',
            maxLength: 60,
            tooLongError: 'Nama pengirim terlalu panjang (maks 60 karakter).',
        });
        if (!senderName) {
            UI.showToast('Nama pengirim wajib diisi sebelum menyimpan.', 'error');
            return;
        }

        UI.setButtonLoading(submitBtn, true, {
            htmlLoading: '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...'
        });

        const formData = new FormData(form);
        formData.append('nama_pengirim', senderName);

        const selectedFiles = Array.from(fileInput.files || []);
        if (selectedFiles.length > MAX_FILES) {
            UI.showToast(`Maksimal ${MAX_FILES} gambar.`, 'error');
            UI.setButtonLoading(submitBtn, false, {
                htmlIdle: '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan'
            });
            return;
        }
        for (const f of selectedFiles) {
            if (!ALLOWED.has(f.type) || f.size > MAX_SIZE) {
                UI.showToast('Validasi gambar gagal. Periksa tipe/ukuran file.', 'error');
                UI.setButtonLoading(submitBtn, false, {
                    htmlIdle: '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan'
                });
                return;
            }
        }

        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                body: formData,
            });

            const result = await UI.readResponseBodySafe(response);

            if (response.ok) {
                UI.showToast('Laporan berhasil disimpan!', 'success');
                form.reset();
                while (preview.firstChild) preview.removeChild(preview.firstChild);
            } else {
                UI.showToast(result?.error || 'Terjadi kesalahan saat menyimpan data.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            UI.showToast('Gagal terhubung ke server.', 'error');
        } finally {
            UI.setButtonLoading(submitBtn, false, {
                htmlIdle: '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan'
            });
        }
    });
})();
