(() => {
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
            showToast(`Maksimal ${MAX_FILES} gambar.`, 'error');
            fileInput.value = '';
            return;
        }

        for (const file of files) {
            if (!ALLOWED.has(file.type)) {
                showToast('Ada file dengan tipe tidak didukung (JPG/PNG/WEBP saja).', 'error');
                fileInput.value = '';
                while (preview.firstChild) preview.removeChild(preview.firstChild);
                return;
            }
            if (file.size > MAX_SIZE) {
                showToast('Ada file melebihi 5MB.', 'error');
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

        const senderName = await askSenderName();
        if (!senderName) {
            showToast('Nama pengirim wajib diisi sebelum menyimpan.', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

        const formData = new FormData(form);
        formData.append('nama_pengirim', senderName);

        const selectedFiles = Array.from(fileInput.files || []);
        if (selectedFiles.length > MAX_FILES) {
            showToast(`Maksimal ${MAX_FILES} gambar.`, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan';
            return;
        }
        for (const f of selectedFiles) {
            if (!ALLOWED.has(f.type) || f.size > MAX_SIZE) {
                showToast('Validasi gambar gagal. Periksa tipe/ukuran file.', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan';
                return;
            }
        }

        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                body: formData,
            });

            const result = await readResponseBodySafe(response);

            if (response.ok) {
                showToast('Laporan berhasil disimpan!', 'success');
                form.reset();
                while (preview.firstChild) preview.removeChild(preview.firstChild);
            } else {
                showToast(result.error || 'Terjadi kesalahan saat menyimpan data.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showToast('Gagal terhubung ke server.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Laporan';
        }
    });

    async function readResponseBodySafe(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            } catch {
                // fall back
            }
        }

        try {
            const text = await response.text();
            return { error: text || 'Response JSON tidak valid.' };
        } catch {
            return { error: 'Response JSON tidak valid.' };
        }
    }

    function showToast(text, type) {
        const toast = document.getElementById('toast');
        toast.textContent = text;
        toast.classList.remove('success', 'error', 'hidden');
        if (type) toast.classList.add(type);
        setTimeout(() => toast.classList.add('hidden'), 3500);
    }

    function askSenderName() {
        const dialog = document.getElementById('senderDialog');
        const input = document.getElementById('senderNameInput');
        const ok = document.getElementById('senderOk');
        const cancel = document.getElementById('senderCancel');

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
                    showToast('Nama pengirim wajib diisi.', 'error');
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
})();
