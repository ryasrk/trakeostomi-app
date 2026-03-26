document.addEventListener('DOMContentLoaded', () => {
    // Logout handling
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            fetch('/api/logout', { method: 'POST' }).finally(() => {
                window.location.href = '/login.html';
            });
        });
    }

    loadReports();

    const form = document.getElementById('trakeostomiForm');
    const messageDiv = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form values
        const data = {
            pasien: document.getElementById('pasien').value,
            asisten_perawat: document.getElementById('asisten_perawat').value,
            nomor_reka_medik: document.getElementById('nomor_reka_medik').value,
            diagnosa: document.getElementById('diagnosa').value,
            nomor_alat: document.getElementById('nomor_alat').value,
            pemakaian_alat: document.getElementById('pemakaian_alat').value
        };

        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showMessage('Laporan berhasil disimpan!', 'success');
                form.reset();
                loadReports();
            } else {
                showMessage(result.error || 'Terjadi kesalahan saat menyimpan data.', 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage('Gagal terhubung ke server.', 'error');
        }
    });

    async function loadReports() {
        try {
            const response = await fetch('/api/reports');
            const reports = await response.json();
            
            const tbody = document.getElementById('reportTableBody');
            tbody.innerHTML = ''; // Clear table
            
            if (reports.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="7" style="text-align:center;">Belum ada laporan yang tercatat.</td>`;
                tbody.appendChild(tr);
                return;
            }

            // Sort by tanggal_input descending (newest first)
            reports.sort((a, b) => new Date(b.tanggal_input) - new Date(a.tanggal_input));

            reports.forEach(report => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(report.tanggal_input).toLocaleString('id-ID')}</td>
                    <td><span style="font-weight:600; color:var(--primary-color)">${report.nomor_reka_medik}</span></td>
                    <td>${report.pasien}</td>
                    <td>${report.asisten_perawat}</td>
                    <td>${report.diagnosa}</td>
                    <td><span style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:0.85em;">${report.nomor_alat}</span></td>
                    <td>${report.pemakaian_alat}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error('Error fetching reports:', error);
            showMessage('Gagal memuat daftar laporan terbaru.', 'error');
        }
    }

    function showMessage(text, type) {
        messageDiv.innerHTML = type === 'success' ? 
            `<i class="fa-solid fa-check-circle"></i> ${text}` : 
            `<i class="fa-solid fa-triangle-exclamation"></i> ${text}`;
        messageDiv.className = `message ${type}`;
        messageDiv.classList.remove('hidden');

        // Hide message after 5 seconds
        setTimeout(() => {
            messageDiv.classList.add('hidden');
        }, 5000);
    }
});
