(() => {
    let currentReports = [];
    let filteredReports = [];
    let currentPage = 1;
    let pageSize = 10;

    const filterInput = document.getElementById('filterInput');
    const filterField = document.getElementById('filterField');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const pageSizeSelect = document.getElementById('pageSize');

    pageSizeSelect.addEventListener('change', () => {
        pageSize = Number(pageSizeSelect.value || 10);
        currentPage = 1;
        renderTable(filteredReports);
    });

    [filterInput, filterField, dateFrom, dateTo].forEach((el) => {
        el.addEventListener('input', () => {
            currentPage = 1;
            applyFilters();
        });
        el.addEventListener('change', () => {
            currentPage = 1;
            applyFilters();
        });
    });

    async function loadReports() {
        try {
            const response = await fetch('/api/reports');
            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/login.html';
                    return;
                }
                const txt = await response.text().catch(() => '');
                window.showToast?.(txt || 'Gagal memuat laporan.', 'error');
                return;
            }

            const reports = await response.json();
            currentReports = reports;
            applyFilters();
        } catch (error) {
            console.error('Error:', error);
            window.showToast?.('Gagal memuat laporan.', 'error');
        }
    }

    function getCsrfToken() {
        try {
            return window.sessionStorage.getItem('csrfToken') || window.localStorage.getItem('csrfToken') || '';
        } catch {
            return '';
        }
    }

    function renderTable(reports) {
        const tbody = document.getElementById('reportTableBody');
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        if (!reports || reports.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 8;
            td.style.textAlign = 'center';
            td.textContent = 'Tidak ada data yang cocok.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        const sorted = [...reports].sort((a, b) => new Date(b.tanggal_input) - new Date(a.tanggal_input));

        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        currentPage = Math.min(currentPage, totalPages);
        const start = (currentPage - 1) * pageSize;
        const pageItems = sorted.slice(start, start + pageSize);

        document.getElementById('pageInfo').textContent = `Halaman ${currentPage} / ${totalPages} (Total ${total})`;

        pageItems.forEach((report) => {
            const tr = document.createElement('tr');

            const tdTanggal = document.createElement('td');
            tdTanggal.textContent = report.tanggal_input ? new Date(report.tanggal_input).toLocaleString('id-ID') : '';

            const tdRm = document.createElement('td');
            const rmSpan = document.createElement('span');
            rmSpan.style.fontWeight = '600';
            rmSpan.style.color = 'var(--primary-color)';
            rmSpan.textContent = String(report.nomor_reka_medik || '');
            tdRm.appendChild(rmSpan);

            const tdPasien = document.createElement('td');
            tdPasien.textContent = String(report.pasien || '');

            const tdPetugas = document.createElement('td');
            tdPetugas.textContent = String(report.asisten_perawat || '');

            const tdDiagnosa = document.createElement('td');
            tdDiagnosa.textContent = String(report.diagnosa || '');

            const tdAlat = document.createElement('td');
            const alatSpan = document.createElement('span');
            alatSpan.style.background = '#e2e8f0';
            alatSpan.style.padding = '2px 6px';
            alatSpan.style.borderRadius = '4px';
            alatSpan.style.fontSize = '0.85em';
            alatSpan.textContent = String(report.nomor_alat || '');
            tdAlat.appendChild(alatSpan);

            const tdImages = document.createElement('td');
            const urls = Array.isArray(report.tindakan_gambar) ? report.tindakan_gambar : [];
            if (urls.length > 0) {
                for (const urlRaw of urls) {
                    const safeUrl = safeUploadsUrl(urlRaw);
                    if (!safeUrl) continue;

                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.title = 'Preview';
                    btn.style.border = 'none';
                    btn.style.background = 'transparent';
                    btn.style.padding = '0';
                    btn.style.cursor = 'pointer';
                    btn.addEventListener('click', () => openImageModal(safeUrl));

                    const img = document.createElement('img');
                    img.src = safeUrl;
                    img.alt = 'tindakan';
                    img.style.width = '40px';
                    img.style.height = '40px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '4px';
                    img.style.margin = '2px';
                    img.style.border = '1px solid var(--border-color)';

                    btn.appendChild(img);
                    tdImages.appendChild(btn);
                }

                if (!tdImages.firstChild) {
                    const none = document.createElement('span');
                    none.style.color = '#aaa';
                    none.style.fontSize = '0.8em';
                    none.textContent = 'Tidak ada';
                    tdImages.appendChild(none);
                }
            } else {
                const none = document.createElement('span');
                none.style.color = '#aaa';
                none.style.fontSize = '0.8em';
                none.textContent = 'Tidak ada';
                tdImages.appendChild(none);
            }

            const tdActions = document.createElement('td');
            tdActions.style.display = 'flex';
            tdActions.style.gap = '8px';
            tdActions.style.flexWrap = 'wrap';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-secondary';
            editBtn.style.padding = '5px 10px';
            editBtn.style.fontSize = '12px';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => openEditModal(String(report.id || '')));

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-primary';
            deleteBtn.style.padding = '5px 10px';
            deleteBtn.style.fontSize = '12px';
            deleteBtn.style.backgroundColor = 'var(--error-color)';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => deleteReport(String(report.id || '')));

            tdActions.appendChild(editBtn);
            tdActions.appendChild(deleteBtn);

            tr.appendChild(tdTanggal);
            tr.appendChild(tdRm);
            tr.appendChild(tdPasien);
            tr.appendChild(tdPetugas);
            tr.appendChild(tdDiagnosa);
            tr.appendChild(tdAlat);
            tr.appendChild(tdImages);
            tr.appendChild(tdActions);
            tbody.appendChild(tr);
        });
    }

    function safeUploadsUrl(input) {
        const s = String(input || '');
        if (!s.startsWith('/uploads/')) return null;
        const filename = s.slice('/uploads/'.length);
        if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null;
        return `/uploads/${filename}`;
    }

    function applyFilters() {
        const q = (filterInput.value || '').toLowerCase().trim();
        const field = filterField.value || 'all';
        const from = dateFrom.value ? new Date(dateFrom.value + 'T00:00:00') : null;
        const to = dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;

        filteredReports = (currentReports || []).filter((r) => {
            const dt = r.tanggal_input ? new Date(r.tanggal_input) : null;
            if (from && dt && dt < from) return false;
            if (to && dt && dt > to) return false;

            if (!q) return true;

            const get = (key) => String((r && r[key]) || '').toLowerCase();
            if (field === 'all') {
                const hay = `${get('nomor_reka_medik')} ${get('pasien')} ${get('diagnosa')} ${get('asisten_perawat')} ${get('nomor_alat')}`;
                return hay.includes(q);
            }
            return get(field).includes(q);
        });

        renderTable(filteredReports);
    }

    async function deleteReport(id) {
        const ok = await window.confirmUi?.('Hapus Laporan', 'Yakin ingin menghapus laporan ini?');
        if (!ok) return;
        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(`/api/reports/${id}`, {
                method: 'DELETE',
                headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
            });

            if (response.ok) {
                await loadReports();
                window.showToast?.('Laporan berhasil dihapus.', 'success');
            } else {
                const res = await response.json().catch(() => ({}));
                window.showToast?.(res.error || 'Gagal menghapus', 'error');
            }
        } catch (e) {
            window.showToast?.('Kesalahan server saat menghapus.', 'error');
        }
    }

    async function exportCsvFromServer() {
        try {
            const csrfToken = getCsrfToken();
            const response = await fetch('/api/reports/export.csv', {
                headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
            });

            if (!response.ok) {
                const res = await response.json().catch(() => ({}));
                window.showToast?.('Gagal export: ' + (res.error || response.status), 'error');
                return;
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Laporan_Trakeostomi_${new Date().getTime()}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            window.showToast?.('Gagal export dari server.', 'error');
        }
    }

    const modal = document.getElementById('editModal');
    const imageModal = document.getElementById('imageModal');
    const imageModalImg = document.getElementById('imageModalImg');
    let lastFocusEl = null;

    function rememberFocus() {
        lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }

    function restoreFocus() {
        try {
            if (lastFocusEl && document.contains(lastFocusEl)) lastFocusEl.focus();
        } catch {}
        lastFocusEl = null;
    }

    function openImageModal(url) {
        rememberFocus();
        imageModalImg.src = url;
        imageModal.classList.add('active');
        imageModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('imageCloseBtn')?.focus(), 0);
    }

    function closeImageModal() {
        // Move focus out before hiding from AT
        restoreFocus();
        imageModalImg.src = '';
        imageModal.classList.remove('active');
        imageModal.setAttribute('aria-hidden', 'true');
    }

    function openEditModal(id) {
        const report = currentReports.find((r) => String(r.id) === String(id));
        if (!report) return;

        rememberFocus();

        document.getElementById('edit_id').value = report.id;
        document.getElementById('edit_pasien').value = report.pasien;
        document.getElementById('edit_nomor_reka_medik').value = report.nomor_reka_medik;
        document.getElementById('edit_asisten_perawat').value = report.asisten_perawat;
        document.getElementById('edit_diagnosa').value = report.diagnosa;
        document.getElementById('edit_nomor_alat').value = report.nomor_alat;
        document.getElementById('edit_pemakaian_alat').value = report.pemakaian_alat;

        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('edit_pasien')?.focus(), 0);
    }

    function closeEditModal() {
        restoreFocus();
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }

    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit_id').value;
        const data = {
            pasien: document.getElementById('edit_pasien').value,
            nomor_reka_medik: document.getElementById('edit_nomor_reka_medik').value,
            asisten_perawat: document.getElementById('edit_asisten_perawat').value,
            diagnosa: document.getElementById('edit_diagnosa').value,
            nomor_alat: document.getElementById('edit_nomor_alat').value,
            pemakaian_alat: document.getElementById('edit_pemakaian_alat').value,
        };

        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(`/api/reports/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
                },
                body: JSON.stringify(data),
            });

            if (response.ok) {
                closeEditModal();
                loadReports();
                window.showToast?.('Data berhasil diupdate!', 'success');
            } else {
                const res = await response.json().catch(() => ({}));
                window.showToast?.(res.error || 'Gagal update', 'error');
            }
        } catch (e) {
            window.showToast?.('Kesalahan server.', 'error');
        }
    });

    // Wire buttons that were previously inline handlers
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsvFromServer);
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        currentPage = Math.max(1, currentPage - 1);
        renderTable(filteredReports);
    });
    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        currentPage += 1;
        renderTable(filteredReports);
    });
    document.getElementById('resetBtn')?.addEventListener('click', () => {
        filterInput.value = '';
        filterField.value = 'all';
        dateFrom.value = '';
        dateTo.value = '';
        currentPage = 1;
        filteredReports = currentReports;
        renderTable(filteredReports);
    });
    document.getElementById('editCancelBtn')?.addEventListener('click', closeEditModal);
    document.getElementById('imageCloseBtn')?.addEventListener('click', closeImageModal);

    loadReports();

    // Auto-refresh data (no full page reload). Skip while modals are open.
    const AUTO_REFRESH_MS = 60 * 1000;
    setInterval(() => {
        const editOpen = modal.classList.contains('active');
        const imageOpen = imageModal.classList.contains('active');
        if (editOpen || imageOpen) return;
        loadReports();
    }, AUTO_REFRESH_MS);
})();
