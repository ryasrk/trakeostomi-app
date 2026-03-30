const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcrypt');
const db = require('./db');
const { loginLimiter, createCsrfToken, requireAdmin, requireCsrf, reportSubmitLimiter } = require('./middleware');

const router = express.Router();
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

// Dynamic credential loading for testing
const getAdminCredentials = () => ({
    ADMIN_USER: process.env.ADMIN_USER || 'admin',
    ADMIN_PASS: process.env.ADMIN_PASS || 'admin123'
});

if (!process.env.ADMIN_PASS) {
    console.warn('[SECURITY] ADMIN_PASS belum di-set. Menggunakan default dev password.');
}

// Cache bcrypt hash to avoid expensive re-hashing on every login attempt
let _cachedPassHash = null;
let _cachedPassSource = null;

function getAdminPassHash() {
    const { ADMIN_PASS } = getAdminCredentials();
    if (_cachedPassHash && _cachedPassSource === ADMIN_PASS) {
        return _cachedPassHash;
    }
    _cachedPassHash = bcrypt.hashSync(ADMIN_PASS, 12);
    _cachedPassSource = ADMIN_PASS;
    return _cachedPassHash;
}

// --- File upload config (memory storage — stored to DB as BLOBs) ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 10 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Tipe file tidak didukung. Hanya JPG/PNG/WEBP.'), false);
    },
});

// --- Field validation ---
const sanitizeHtml = (str) => str.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;',
}[c]));

const normalizeTextField = (value, { maxLen }) => {
    const v = String(value ?? '').trim();
    if (!v) return null;
    if (maxLen && v.length > maxLen) return null;
    return sanitizeHtml(v);
};

// --- Auth Routes ---
router.post('/api/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    const { ADMIN_USER, ADMIN_PASS } = getAdminCredentials();
    
    const usernameMatch = username === ADMIN_USER;
    const passwordMatch = await bcrypt.compare(password || '', getAdminPassHash());
    
    if (usernameMatch && passwordMatch) {
        req.session.isAdmin = true;
        // Generate fresh CSRF token after login
        req.session.csrfToken = createCsrfToken();
        res.json({ success: true, csrfToken: req.session.csrfToken });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    }
});

// Fresh CSRF token endpoint (admin only)
router.get('/api/csrf-token', requireAdmin, (req, res) => {
    // Generate and store fresh CSRF token
    req.session.csrfToken = createCsrfToken();
    res.json({ csrfToken: req.session.csrfToken });
});

router.post('/api/logout', requireCsrf, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('trakeo.sid');
        res.json({ success: true });
    });
});

// --- Serve images from database (admin only) ---
router.get('/api/images/:id', requireAdmin, (req, res) => {
    const imageId = Number(req.params.id);
    if (!Number.isInteger(imageId) || imageId <= 0) {
        return res.status(400).json({ error: 'ID gambar tidak valid.' });
    }
    try {
        const image = db.getImageById(imageId);
        if (!image || !image.image_data) {
            return res.status(404).json({ error: 'Gambar tidak ditemukan.' });
        }
        res.set('Content-Type', image.mime_type || 'image/jpeg');
        res.set('Cache-Control', 'private, max-age=3600');
        return res.send(image.image_data);
    } catch (error) {
        console.error('Error serving image:', imageId, error);
        return res.status(500).json({ error: 'Gagal mengambil gambar.' });
    }
});

// --- Health check ---
router.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// --- Analytics (Admin Only) ---
router.get('/api/reports/stats', requireAdmin, (req, res) => {
    try {
        const stats = db.getReportStats();
        return res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        return res.status(500).json({ error: 'Gagal mengambil statistik.' });
    }
});

// --- Report CRUD ---
router.get('/api/reports', requireAdmin, (req, res) => {
    try {
        return res.json(db.getAllReports());
    } catch {
        return res.status(500).json({ error: 'Gagal membaca data.' });
    }
});

router.post('/api/reports', reportSubmitLimiter, upload.array('tindakan_gambar', 10), (req, res) => {
    const newReport = req.body;

    const pasien = normalizeTextField(newReport.pasien, { maxLen: 120 });
    const asistenPerawat = normalizeTextField(newReport.asisten_perawat, { maxLen: 120 });
    const nomorAlat = normalizeTextField(newReport.nomor_alat, { maxLen: 60 });
    const pemakaianAlat = normalizeTextField(newReport.pemakaian_alat, { maxLen: 120 });
    const diagnosa = normalizeTextField(newReport.diagnosa, { maxLen: 160 });
    const nomorRekamMedik = normalizeTextField(newReport.nomor_reka_medik, { maxLen: 60 });

    if (!pasien || !asistenPerawat || !nomorAlat || !pemakaianAlat || !diagnosa || !nomorRekamMedik) {
        return res.status(400).json({ error: 'Semua field utama harus diisi.' });
    }

    const senderName = normalizeTextField(newReport.nama_pengirim, { maxLen: 60 });
    if (!senderName) {
        return res.status(400).json({ error: 'Nama pengirim wajib diisi.' });
    }

    const images = req.files ? req.files.map(f => ({
        path: `/uploads/${f.originalname}`,
        data: f.buffer,
        mimeType: f.mimetype,
        originalName: f.originalname,
    })) : [];

    const reportToSave = {
        id: crypto.randomUUID(),
        pasien,
        asisten_perawat: asistenPerawat,
        nomor_alat: nomorAlat,
        pemakaian_alat: pemakaianAlat,
        diagnosa,
        nomor_reka_medik: nomorRekamMedik,
        nama_pengirim: senderName,
        tanggal_input: new Date().toISOString(),
        images,
    };

    try {
        const saved = db.createReport(reportToSave);
        return res.status(201).json({ message: 'Laporan berhasil disimpan.', report: saved });
    } catch (error) {
        console.error('Failed to create report:', error);
        return res.status(500).json({ error: 'Gagal menyimpan data.' });
    }
});

router.put('/api/reports/:id', requireAdmin, requireCsrf, (req, res) => {
    const reportId = req.params.id;
    const updateData = req.body;

    try {
        const existing = db.getReportById(reportId);
        if (!existing) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
        }

        const safeUpdate = {
            pasien: normalizeTextField(updateData?.pasien, { maxLen: 120 }),
            nomor_reka_medik: normalizeTextField(updateData?.nomor_reka_medik, { maxLen: 60 }),
            asisten_perawat: normalizeTextField(updateData?.asisten_perawat, { maxLen: 120 }),
            diagnosa: normalizeTextField(updateData?.diagnosa, { maxLen: 160 }),
            nomor_alat: normalizeTextField(updateData?.nomor_alat, { maxLen: 60 }),
            pemakaian_alat: normalizeTextField(updateData?.pemakaian_alat, { maxLen: 120 }),
        };

        const updated = db.updateReport(reportId, safeUpdate);
        return res.json({ message: 'Laporan berhasil diupdate.', report: updated });
    } catch (error) {
        console.error('Failed to update report:', reportId, error);
        return res.status(500).json({ error: 'Gagal menyimpan data.' });
    }
});

router.delete('/api/reports/:id', requireAdmin, requireCsrf, (req, res) => {
    const reportId = req.params.id;
    try {
        const deleted = db.deleteReport(reportId);
        if (!deleted) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
        }

        return res.json({ message: 'Laporan berhasil dihapus.' });
    } catch (error) {
        console.error('Failed to delete report:', reportId, error);
        return res.status(500).json({ error: 'Gagal menghapus data.' });
    }
});

// --- CSV Export ---
router.get('/api/reports/export.csv', requireAdmin, requireCsrf, (req, res) => {
    try {
        const reports = db.getAllReports();

        const headers = [
            'id', 'tanggal_input', 'pasien', 'nomor_reka_medik',
            'asisten_perawat', 'diagnosa', 'nomor_alat', 'pemakaian_alat', 'tindakan_gambar',
        ];

        const escapeCsv = (value) => {
            let s = value == null ? '' : String(value);
            // Prevent CSV formula injection in spreadsheet applications
            if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
                s = "'" + s;
            }
            if (/[\n\r,"]/.test(s)) {
                return '"' + s.replaceAll('"', '""') + '"';
            }
            return s;
        };

        const rows = [headers.join(',')];
        for (const r of reports) {
            const line = [
                escapeCsv(r.id),
                escapeCsv(r.tanggal_input),
                escapeCsv(r.pasien),
                escapeCsv(r.nomor_reka_medik),
                escapeCsv(r.asisten_perawat),
                escapeCsv(r.diagnosa),
                escapeCsv(r.nomor_alat),
                escapeCsv(r.pemakaian_alat),
                escapeCsv((r.tindakan_gambar || []).join(' ')),
            ].join(',');
            rows.push(line);
        }

        const csv = rows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Laporan_Trakeostomi_${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Failed to export CSV:', error);
        return res.status(500).json({ error: 'Gagal membaca data.' });
    }
});

// --- Image migration endpoint (Admin Only) ---
router.post('/api/migrate-images', requireAdmin, requireCsrf, (req, res) => {
    try {
        const migrated = db.migrateFilesToDb();
        return res.json({ message: `${migrated} gambar berhasil dimigrasikan ke database.`, migrated });
    } catch (error) {
        console.error('Error migrating images:', error);
        return res.status(500).json({ error: 'Gagal migrasi gambar.' });
    }
});

module.exports = { router, upload };
