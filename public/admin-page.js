(() => {
    let currentReports = [];
    let filteredReports = [];
    let currentPage = 1;
    let pageSize = 10;
    let sortColumn = 'tanggal_input';
    let sortDirection = 'desc';
    const selectedIds = new Set();

    // Centralized fetch wrapper: redirects to login on 401 (expired session)
    async function authFetch(url, options = {}) {
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.showToast?.('Sesi telah berakhir. Silakan login kembali.', 'error');
            setTimeout(() => { window.location.href = '/login.html'; }, 500);
            return null;
        }
        return response;
    }

    const filterInput = document.getElementById('filterInput');
    const filterField = document.getElementById('filterField');
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    const detailModal = document.getElementById('detailModal');
    const pageSizeSelect = document.getElementById('pageSize');
    const bulkBar = document.getElementById('bulkBar');
    const bulkCount = document.getElementById('bulkCount');
    const selectAllChk = document.getElementById('selectAllChk');

    function updateBulkBar() {
        if (!bulkBar) return;
        const count = selectedIds.size;
        if (count > 0) {
            bulkBar.classList.add('visible');
            if (bulkCount) bulkCount.textContent = count + ' dipilih';
        } else {
            bulkBar.classList.remove('visible');
            if (bulkCount) bulkCount.textContent = '0 dipilih';
        }
    }

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
        showTableLoading(true);
        try {
            const response = await authFetch('/api/reports');
            if (!response) return;
            if (!response.ok) {
                const txt = await response.text().catch(() => '');
                window.showToast?.(txt || 'Gagal memuat laporan.', 'error');
                renderTable([]);
                return;
            }

            const reports = await response.json();
            currentReports = reports;
            applyFilters();
            loadStats();
        } catch (error) {
            window.showToast?.('Gagal memuat laporan.', 'error');
            renderTable([]);
        } finally {
            showTableLoading(false);
        }
    }

    async function loadStats() {
        try {
            const csrfToken = getCsrfToken();
            const response = await authFetch('/api/reports/stats', {
                headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
            });
            if (!response || !response.ok) return;
            const stats = await response.json();

            const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            el('statTotal', stats.total ?? 0);
            el('statToday', stats.todayCount ?? 0);
            el('statMonth', stats.monthCount ?? 0);
            el('statTopDiag', stats.topDiagnoses?.[0]?.name ?? '-');

            renderDiagChart(stats.topDiagnoses || []);
            renderTrendChart(currentReports);
        } catch {}
    }

    function renderDiagChart(diagnoses) {
        const container = document.getElementById('diagChart');
        if (!container) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        if (diagnoses.length === 0) {
            container.textContent = 'Belum ada data';
            container.style.color = 'var(--text-muted)';
            container.style.textAlign = 'center';
            container.style.padding = '20px';
            return;
        }
        const max = Math.max(...diagnoses.map(d => d.count));
        for (const d of diagnoses) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
            const label = document.createElement('span');
            label.style.cssText = 'min-width:120px;font-size:0.85rem;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            label.textContent = d.name;
            label.title = d.name;
            const barWrap = document.createElement('div');
            barWrap.style.cssText = 'flex:1;height:20px;background:var(--border-color);border-radius:4px;overflow:hidden;';
            const bar = document.createElement('div');
            const pct = max > 0 ? (d.count / max) * 100 : 0;
            bar.style.cssText = `width:${pct}%;height:100%;background:var(--primary-color);border-radius:4px;transition:width 0.4s ease;`;
            barWrap.appendChild(bar);
            const count = document.createElement('span');
            count.style.cssText = 'min-width:30px;font-size:0.85rem;font-weight:600;color:var(--text-heading);text-align:right;';
            count.textContent = d.count;
            row.appendChild(label);
            row.appendChild(barWrap);
            row.appendChild(count);
            container.appendChild(row);
        }
    }

    function renderTrendChart(reports) {
        const container = document.getElementById('trendChart');
        if (!container) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        const months = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.toISOString().slice(0, 7);
            months[key] = 0;
        }
        for (const r of reports) {
            const key = (r.tanggal_input || '').slice(0, 7);
            if (key in months) months[key]++;
        }
        const entries = Object.entries(months);
        if (entries.length === 0) {
            container.textContent = 'Belum ada data';
            container.style.color = 'var(--text-muted)';
            container.style.textAlign = 'center';
            container.style.padding = '20px';
            return;
        }
        const max = Math.max(...entries.map(e => e[1]), 1);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:flex;align-items:flex-end;justify-content:space-around;height:120px;gap:8px;';
        for (const [month, count] of entries) {
            const col = document.createElement('div');
            col.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;';
            const bar = document.createElement('div');
            const pct = (count / max) * 100;
            bar.style.cssText = `width:100%;max-width:40px;height:${Math.max(pct, 4)}%;background:var(--primary-color);border-radius:4px 4px 0 0;transition:height 0.4s ease;`;
            const lbl = document.createElement('span');
            lbl.style.cssText = 'font-size:0.7rem;color:var(--text-muted);margin-top:4px;';
            lbl.textContent = month.slice(5);
            const val = document.createElement('span');
            val.style.cssText = 'font-size:0.75rem;font-weight:600;color:var(--text-heading);margin-bottom:2px;';
            val.textContent = count;
            col.appendChild(val);
            col.appendChild(bar);
            col.appendChild(lbl);
            grid.appendChild(col);
        }
        container.appendChild(grid);
    }

    function getCsrfToken() {
        try {
            return window.sessionStorage.getItem('csrfToken') || '';
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
            td.colSpan = 9;
            td.style.textAlign = 'center';
            td.style.padding = '30px';
            td.style.color = 'var(--text-muted)';
            td.textContent = 'Tidak ada data yang cocok.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            updateBulkBar();
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
            const rid = String(report.id || '');
            if (selectedIds.has(rid)) tr.classList.add('row-selected');

            // Checkbox column
            const tdChk = document.createElement('td');
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = selectedIds.has(rid);
            chk.setAttribute('aria-label', 'Pilih laporan ' + String(report.pasien || ''));
            chk.style.cssText = 'width:18px;height:18px;cursor:pointer;';
            chk.addEventListener('change', () => {
                if (chk.checked) {
                    selectedIds.add(rid);
                    tr.classList.add('row-selected');
                } else {
                    selectedIds.delete(rid);
                    tr.classList.remove('row-selected');
                }
                updateBulkBar();
                // Sync selectAll checkbox state
                if (selectAllChk) {
                    const allChecked = tbody.querySelectorAll('input[type="checkbox"]');
                    const checkedCount = Array.from(allChecked).filter(c => c.checked).length;
                    selectAllChk.checked = checkedCount > 0 && checkedCount === allChecked.length;
                }
            });
            tdChk.appendChild(chk);

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
            alatSpan.style.background = 'var(--border-color)';
            alatSpan.style.padding = '2px 6px';
            alatSpan.style.borderRadius = '4px';
            alatSpan.style.fontSize = '0.85em';
            alatSpan.textContent = String(report.nomor_alat || '');
            tdAlat.appendChild(alatSpan);

            const tdImages = document.createElement('td');
            const urls = Array.isArray(report.tindakan_gambar) ? report.tindakan_gambar : [];
            if (urls.length > 0) {
                for (let idx = 0; idx < urls.length; idx++) {
                    const safeUrl = safeImageUrl(urls[idx]);
                    if (!safeUrl) continue;

                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.title = 'Preview';
                    btn.setAttribute('aria-label', 'Preview gambar ' + (idx + 1));
                    btn.style.border = 'none';
                    btn.style.background = 'transparent';
                    btn.style.padding = '0';
                    btn.style.cursor = 'pointer';
                    btn.addEventListener('click', () => openImageModal(safeUrl));

                    const img = document.createElement('img');
                    img.src = safeUrl;
                    img.alt = 'Gambar tindakan ' + (idx + 1);
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
                    none.style.color = 'var(--text-muted)';
                    none.style.fontSize = '0.8em';
                    none.textContent = 'Tidak ada';
                    tdImages.appendChild(none);
                }
            } else {
                const none = document.createElement('span');
                none.style.color = 'var(--text-muted)';
                none.style.fontSize = '0.8em';
                none.textContent = 'Tidak ada';
                tdImages.appendChild(none);
            }

            const tdActions = document.createElement('td');
            const actionsWrap = document.createElement('div');
            actionsWrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

            const detailBtn = document.createElement('button');
            detailBtn.type = 'button';
            detailBtn.className = 'btn btn-secondary';
            detailBtn.style.padding = '5px 10px';
            detailBtn.style.fontSize = '12px';
            detailBtn.textContent = 'Detail';
            detailBtn.addEventListener('click', () => openDetailModal(rid));

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-secondary';
            editBtn.style.padding = '5px 10px';
            editBtn.style.fontSize = '12px';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => openEditModal(rid));

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-danger';
            deleteBtn.style.padding = '5px 10px';
            deleteBtn.style.fontSize = '12px';
            deleteBtn.textContent = 'Hapus';
            deleteBtn.addEventListener('click', () => deleteReport(rid));

            actionsWrap.appendChild(detailBtn);
            actionsWrap.appendChild(editBtn);
            actionsWrap.appendChild(deleteBtn);
            tdActions.appendChild(actionsWrap);

            tr.appendChild(tdChk);
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

        updateBulkBar();
    }

    function safeImageUrl(input) {
        const s = String(input || '');
        // New format: /api/images/:id
        if (s.startsWith('/api/images/')) {
            const id = s.slice('/api/images/'.length);
            if (/^\d+$/.test(id)) return s;
            return null;
        }
        // Legacy: /uploads/filename
        if (s.startsWith('/uploads/')) {
            const filename = s.slice('/uploads/'.length);
            if (/^[a-zA-Z0-9._-]+$/.test(filename)) return s;
        }
        return null;
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

    // ===== LOADING STATES =====
    function showTableLoading(show) {
        const overlay = document.getElementById('tableLoadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }

    function setButtonLoading(button, isLoading, originalContent = null) {
        if (!button) return originalContent;
        
        if (isLoading) {
            if (!originalContent) {
                originalContent = button.innerHTML;
            }
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
            return originalContent;
        } else {
            button.disabled = false;
            if (originalContent) {
                button.innerHTML = originalContent;
            }
            return null;
        }
    }

    // ===== TABLE SORTING =====
    function sortTable(column, direction) {
        sortColumn = column;
        sortDirection = direction;
        
        currentReports.sort((a, b) => {
            let aVal = a[column] || '';
            let bVal = b[column] || '';
            
            // Handle dates
            if (column === 'tanggal_input') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }
            
            // Handle strings
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return direction === 'asc' ? comparison : -comparison;
        });
        
        applyFilters();
        updateSortIcons();
    }

    function updateSortIcons() {
        document.querySelectorAll('.sortable i').forEach(icon => {
            icon.className = 'fa-solid fa-sort';
        });
        
        const currentHeader = document.querySelector(`[data-sort="${sortColumn}"] i`);
        if (currentHeader) {
            currentHeader.className = sortDirection === 'asc' 
                ? 'fa-solid fa-sort-up' 
                : 'fa-solid fa-sort-down';
        }
    }

    async function deleteReport(id) {
        const report = currentReports.find(r => String(r.id) === String(id));
        const patientName = report?.pasien || 'Unknown';
        
        const confirmed = await window.confirmUi?.(
            'Hapus Laporan', 
            `Yakin ingin menghapus laporan pasien "${patientName}"? Tindakan ini tidak dapat dibatalkan dan akan menghapus semua gambar terkait.`
        );
        if (!confirmed) return;

        // Find the delete button for this row and show loading
        const deleteBtn = document.querySelector(`button[onclick*="${id}"]`) || 
                         Array.from(document.querySelectorAll('button')).find(btn => 
                             btn.textContent.trim() === 'Hapus' && 
                             btn.closest('tr')?.querySelector('td')?.textContent.includes(id)
                         );

        const originalContent = setButtonLoading(deleteBtn, true);
        
        try {
            const csrfToken = getCsrfToken();
            const response = await authFetch(`/api/reports/${id}`, {
                method: 'DELETE',
                headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
            });
            if (!response) return;

            if (response.ok) {
                await loadReports();
                window.showToast?.(`Laporan pasien "${patientName}" berhasil dihapus.`, 'success');
            } else {
                const res = await response.json().catch(() => ({}));
                window.showToast?.(res.error || 'Gagal menghapus laporan.', 'error');
            }
        } catch (e) {
            window.showToast?.('Kesalahan server saat menghapus.', 'error');
        } finally {
            setButtonLoading(deleteBtn, false, originalContent);
        }
    }

    async function exportCsvFromServer() {
        const exportBtn = document.getElementById('exportCsvBtn');
        const originalContent = setButtonLoading(exportBtn, true);

        try {
            const csrfToken = getCsrfToken();
            const response = await authFetch('/api/reports/export.csv', {
                headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
            });
            if (!response) return;

            if (!response.ok) {
                const res = await response.json().catch(() => ({}));
                window.showToast?.('Gagal export: ' + (res.error || response.status), 'error');
                return;
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Laporan_Trakeostomi_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            window.showToast?.('File CSV berhasil diunduh.', 'success');
        } catch (e) {
            window.showToast?.('Gagal export dari server.', 'error');
        } finally {
            setButtonLoading(exportBtn, false, originalContent);
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

    // --- Detail Modal ---
    function openDetailModal(id) {
        const report = currentReports.find((r) => String(r.id) === String(id));
        if (!report) return;

        rememberFocus();

        const body = document.getElementById('detailBody');
        const images = document.getElementById('detailImages');
        if (!body) return;

        const fields = [
            { label: 'ID Laporan', value: report.id },
            { label: 'Waktu Input', value: report.tanggal_input ? new Date(report.tanggal_input).toLocaleString('id-ID') : '-' },
            { label: 'Nama Pasien', value: report.pasien },
            { label: 'No Rekam Medik', value: report.nomor_reka_medik },
            { label: 'Asisten Perawat', value: report.asisten_perawat },
            { label: 'Diagnosa', value: report.diagnosa },
            { label: 'No Alat', value: report.nomor_alat },
            { label: 'Pemakaian Alat', value: report.pemakaian_alat },
            { label: 'Nama Pengirim', value: report.nama_pengirim || '-' },
        ];

        while (body.firstChild) body.removeChild(body.firstChild);
        for (const f of fields) {
            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-weight:600;color:var(--text-muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.03em;padding:8px 0 4px;';
            lbl.textContent = f.label;
            const val = document.createElement('div');
            val.style.cssText = 'color:var(--text-heading);padding:0 0 8px;border-bottom:1px solid var(--border-color);word-break:break-word;';
            val.textContent = f.value || '-';
            body.appendChild(lbl);
            body.appendChild(val);
        }

        // Images section
        if (images) {
            while (images.firstChild) images.removeChild(images.firstChild);
            const urls = Array.isArray(report.tindakan_gambar) ? report.tindakan_gambar : [];
            if (urls.length > 0) {
                const title = document.createElement('div');
                title.style.cssText = 'font-weight:600;color:var(--text-muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:0.03em;margin-bottom:10px;';
                title.textContent = 'Gambar Tindakan';
                images.appendChild(title);
                const grid = document.createElement('div');
                grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;';
                for (const u of urls) {
                    const safe = safeImageUrl(u);
                    if (!safe) continue;
                    const wrap = document.createElement('div');
                    wrap.style.cssText = 'cursor:pointer;border:2px solid var(--border-color);border-radius:var(--radius-sm);overflow:hidden;height:100px;';
                    const img = document.createElement('img');
                    img.src = safe;
                    img.alt = 'Gambar tindakan';
                    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                    wrap.appendChild(img);
                    wrap.addEventListener('click', () => openImageModal(safe));
                    grid.appendChild(wrap);
                }
                images.appendChild(grid);
            }
        }

        detailModal.classList.add('active');
        detailModal.setAttribute('aria-hidden', 'false');
        setTimeout(() => document.getElementById('detailCloseBtn')?.focus(), 0);
    }

    function closeDetailModal() {
        restoreFocus();
        detailModal.classList.remove('active');
        detailModal.setAttribute('aria-hidden', 'true');
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

        // Update character counters after setting values
        EDIT_FIELDS.forEach(id => {
            const el = document.getElementById(id);
            const maxLength = EDIT_FIELD_LIMITS[id];
            if (el) {
                updateEditCharCounter(id, el.value.length, maxLength);
            }
        });

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
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

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
            const response = await authFetch(`/api/reports/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
                },
                body: JSON.stringify(data),
            });
            if (!response) return;

            if (response.ok) {
                closeEditModal();
                await loadReports();
                window.showToast?.('Data berhasil diupdate!', 'success');
            } else {
                const res = await response.json().catch(() => ({}));
                window.showToast?.(res.error || 'Gagal update', 'error');
            }
        } catch (e) {
            window.showToast?.('Kesalahan server.', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    // Wire buttons that were previously inline handlers
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportCsvFromServer);
    document.getElementById('prevPageBtn')?.addEventListener('click', () => {
        currentPage = Math.max(1, currentPage - 1);
        renderTable(filteredReports);
    });
    document.getElementById('nextPageBtn')?.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
        if (currentPage < totalPages) {
            currentPage += 1;
            renderTable(filteredReports);
        }
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
    document.getElementById('detailCloseBtn')?.addEventListener('click', closeDetailModal);

    // --- Print button ---
    document.getElementById('printAllBtn')?.addEventListener('click', () => {
        window.print();
    });

    // --- Select All checkbox ---
    selectAllChk?.addEventListener('change', () => {
        const checked = selectAllChk.checked;
        const total = Math.max(1, Math.ceil(filteredReports.length / pageSize));
        const clampedPage = Math.min(currentPage, total);
        const start = (clampedPage - 1) * pageSize;
        const pageItems = filteredReports.slice(start, start + pageSize);
        pageItems.forEach(r => {
            const rid = String(r.id || '');
            if (checked) selectedIds.add(rid);
            else selectedIds.delete(rid);
        });
        // Update visible checkboxes and row highlights
        const tbody = document.getElementById('reportTableBody');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(row => {
                const chk = row.querySelector('input[type="checkbox"]');
                if (chk) {
                    chk.checked = checked;
                    if (checked) row.classList.add('row-selected');
                    else row.classList.remove('row-selected');
                }
            });
        }
        updateBulkBar();
    });

    // --- Bulk Delete ---
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', async () => {
        if (selectedIds.size === 0) return;
        const confirmed = await window.confirmUi?.(
            'Hapus Terpilih',
            `Yakin ingin menghapus ${selectedIds.size} laporan terpilih? Tindakan ini tidak dapat dibatalkan.`
        );
        if (!confirmed) return;
        const csrfToken = getCsrfToken();
        let successCount = 0;
        for (const id of [...selectedIds]) {
            try {
                const response = await authFetch(`/api/reports/${id}`, {
                    method: 'DELETE',
                    headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
                });
                if (response && response.ok) successCount++;
            } catch {}
        }
        selectedIds.clear();
        if (selectAllChk) selectAllChk.checked = false;
        updateBulkBar();
        await loadReports();
        window.showToast?.(`${successCount} laporan berhasil dihapus.`, 'success');
    });

    // --- Bulk Export ---
    document.getElementById('bulkExportBtn')?.addEventListener('click', () => {
        if (selectedIds.size === 0) return;
        const selected = currentReports.filter(r => selectedIds.has(String(r.id || '')));
        if (selected.length === 0) return;

        const headers = ['id', 'tanggal_input', 'pasien', 'nomor_reka_medik', 'asisten_perawat', 'diagnosa', 'nomor_alat', 'pemakaian_alat'];
        const escapeCsv = (value) => {
            let s = value == null ? '' : String(value);
            if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
            if (/[\n\r,"]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        };
        const rows = [headers.join(',')];
        for (const r of selected) {
            rows.push(headers.map(h => escapeCsv(r[h])).join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Laporan_Terpilih_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        window.showToast?.(`${selected.length} laporan berhasil di-export.`, 'success');
    });

    // --- Bulk Clear ---
    document.getElementById('bulkClearBtn')?.addEventListener('click', () => {
        selectedIds.clear();
        if (selectAllChk) selectAllChk.checked = false;
        updateBulkBar();
        // Uncheck all visible checkboxes and remove row highlights
        const tbody = document.getElementById('reportTableBody');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(row => {
                const chk = row.querySelector('input[type="checkbox"]');
                if (chk) chk.checked = false;
                row.classList.remove('row-selected');
            });
        }
    });

    // --- Modal backdrop click to close ---
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeEditModal();
    });
    imageModal?.addEventListener('click', (e) => {
        if (e.target === imageModal) closeImageModal();
    });
    detailModal?.addEventListener('click', (e) => {
        if (e.target === detailModal) closeDetailModal();
    });

    // --- Global Escape key for modals ---
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (modal?.classList.contains('active')) { closeEditModal(); return; }
        if (imageModal?.classList.contains('active')) { closeImageModal(); return; }
        if (detailModal?.classList.contains('active')) { closeDetailModal(); return; }
    });

    // ===== NEW EVENT LISTENERS =====

    // Table sorting
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            if (!column) return;
            
            const newDirection = (sortColumn === column && sortDirection === 'desc') ? 'asc' : 'desc';
            sortTable(column, newDirection);
        });
        
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
    });

    // Initialize sorting icons
    updateSortIcons();

    // Load initial data
    loadReports();

    // Initialize character counters for edit modal
    const EDIT_FIELDS = ['edit_pasien', 'edit_nomor_reka_medik', 'edit_asisten_perawat', 'edit_diagnosa', 'edit_nomor_alat', 'edit_pemakaian_alat'];
    const EDIT_FIELD_LIMITS = {
        'edit_pasien': 120,
        'edit_nomor_reka_medik': 60,
        'edit_asisten_perawat': 120,
        'edit_diagnosa': 160,
        'edit_nomor_alat': 60,
        'edit_pemakaian_alat': 120
    };

    function updateEditCharCounter(fieldId, length, maxLength) {
        const counter = document.getElementById('counter_' + fieldId);
        if (!counter) return;
        
        counter.textContent = `${length} / ${maxLength}`;
        counter.className = 'char-counter';
        
        if (length >= maxLength - 10) {
            counter.classList.add('warning');
        }
        if (length >= maxLength) {
            counter.classList.add('limit');
        }
    }

    function handleEditPaste(fieldId, event) {
        const maxLength = EDIT_FIELD_LIMITS[fieldId];
        if (!maxLength) return;
        
        event.preventDefault();
        const paste = (event.clipboardData || window.clipboardData).getData('text');
        const input = event.target;
        const currentValue = input.value;
        const cursorStart = input.selectionStart;
        const cursorEnd = input.selectionEnd;
        
        // Replace selected text with pasted content
        const beforeCursor = currentValue.substring(0, cursorStart);
        const afterCursor = currentValue.substring(cursorEnd);
        let newValue = beforeCursor + paste + afterCursor;
        
        // Truncate if exceeds maxlength
        const wasTruncated = newValue.length > maxLength;
        if (wasTruncated) {
            newValue = newValue.substring(0, maxLength);
            window.showToast?.(`Teks dipotong. Maksimal ${maxLength} karakter.`, 'warning');
        }
        
        input.value = newValue;
        
        // Update counter
        updateEditCharCounter(fieldId, newValue.length, maxLength);
        
        // Set cursor position
        const newCursorPos = Math.min(cursorStart + paste.length, newValue.length);
        input.setSelectionRange(newCursorPos, newCursorPos);
    }

    EDIT_FIELDS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        const maxLength = EDIT_FIELD_LIMITS[id];
        
        // Initialize character counter
        updateEditCharCounter(id, el.value.length, maxLength);
        
        el.addEventListener('input', () => {
            updateEditCharCounter(id, el.value.length, maxLength);
        });
        
        // Handle paste events  
        el.addEventListener('paste', (event) => {
            handleEditPaste(id, event);
        });
    });

    // Auto-refresh data (no full page reload). Skip while modals are open.
    const AUTO_REFRESH_MS = 60 * 1000;
    setInterval(() => {
        const editOpen = modal.classList.contains('active');
        const imageOpen = imageModal.classList.contains('active');
        const detailOpen = detailModal?.classList.contains('active');
        if (editOpen || imageOpen || detailOpen) return;
        loadReports();
    }, AUTO_REFRESH_MS);
})();
