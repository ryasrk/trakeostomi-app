const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_only_change_me_change_me_change_me_32chars';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

if (!process.env.ADMIN_PASS) {
    console.warn('[SECURITY] ADMIN_PASS belum di-set. Menggunakan default dev password.');
}

if (!process.env.SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.warn('[SECURITY] SESSION_SECRET belum di-set/kurang kuat. Menggunakan default dev secret.');
}

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const safeRandomName = (originalName) => {
    const ext = path.extname(originalName || '').toLowerCase();
    const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const finalExt = allowedExt.has(ext) ? ext : '';
    const id = crypto.randomBytes(16).toString('hex');
    return `${Date.now()}-${id}${finalExt}`;
};

// Konfigurasi Multer untuk upload gambar
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, safeRandomName(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB per file
        files: 10
    },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipe file tidak didukung. Hanya JPG/PNG/WEBP.'), false);
        }
    }
});

app.use(bodyParser.json());

if (TRUST_PROXY) {
    app.set('trust proxy', 1);
}

app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", "blob:"],
            "style-src": ["'self'", "https:"],
            "font-src": ["'self'", "https:", "data:"],
        }
    }
}));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false
}));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: 'Terlalu banyak percobaan login. Coba lagi nanti.' }
});

app.use(session({
    name: 'trakeo.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        maxAge: 8 * 60 * 60 * 1000
    }
}));

const createCsrfToken = () => crypto.randomBytes(24).toString('hex');

const requireCsrf = (req, res, next) => {
    if (!req.session || req.session.isAdmin !== true) {
        return res.status(401).json({ error: 'Akses ditolak.' });
    }

    const headerToken = String(req.get('x-csrf-token') || '').trim();
    const sessionToken = String(req.session.csrfToken || '').trim();
    if (!headerToken || !sessionToken || headerToken !== sessionToken) {
        return res.status(403).json({ error: 'CSRF token tidak valid.' });
    }
    return next();
};

// Serve static assets, but do NOT serve uploads directly (those are patient-linked)
app.use(express.static('public', {
    etag: true,
    maxAge: '1h',
    index: ['index.html']
}));


// API Login
app.post('/api/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        req.session.isAdmin = true;
        req.session.csrfToken = createCsrfToken();
        res.json({ success: true, csrfToken: req.session.csrfToken });
    } else {
        res.status(401).json({ success: false, error: 'Username atau password salah!' });
    }
});

app.post('/api/logout', requireCsrf, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('trakeo.sid');
        res.json({ success: true });
    });
});

const requireAdmin = (req, res, next) => {
    if (req.session && req.session.isAdmin === true) return next();
    return res.status(401).json({ error: 'Akses ditolak.' });
};

app.get('/uploads/:filename', requireAdmin, (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return res.status(400).json({ error: 'Nama file tidak valid.' });
    }

    const fullPath = path.resolve(UPLOADS_DIR, filename);
    const uploadsRoot = path.resolve(UPLOADS_DIR) + path.sep;
    if (!fullPath.startsWith(uploadsRoot)) {
        return res.status(400).json({ error: 'Path tidak valid.' });
    }

    fs.stat(fullPath, (err, stat) => {
        if (err || !stat.isFile()) return res.status(404).json({ error: 'File tidak ditemukan.' });
        return res.sendFile(fullPath);
    });
});

// Inisialisasi file data jika belum ada
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

const readReports = () => {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeReports = (reports) => {
    const tmpPath = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(reports, null, 2));
    fs.renameSync(tmpPath, DATA_FILE);
};

const normalizeTextField = (value, { maxLen }) => {
    const v = String(value ?? '').trim();
    if (!v) return null;
    if (maxLen && v.length > maxLen) return null;
    return v;
};

// Mendapatkan semua laporan (Admin Only - contains sensitive patient data)
app.get('/api/reports', requireAdmin, (req, res) => {
    try {
        return res.json(readReports());
    } catch {
        return res.status(500).json({ error: 'Gagal membaca data.' });
    }
});

// Menyimpan laporan baru (Public: Form tanpa login)
app.post('/api/reports', upload.array('tindakan_gambar', 10), (req, res) => {
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

    const reportToSave = {
        pasien,
        asisten_perawat: asistenPerawat,
        nomor_alat: nomorAlat,
        pemakaian_alat: pemakaianAlat,
        diagnosa,
        nomor_reka_medik: nomorRekamMedik,
        nama_pengirim: senderName,
    };

    reportToSave.id = Date.now().toString();
    reportToSave.tanggal_input = new Date().toISOString();
    
    // Menyimpan path gambar
    reportToSave.tindakan_gambar = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

    try {
        const reports = readReports();
        const nextReports = [...reports, reportToSave];
        writeReports(nextReports);
        return res.status(201).json({ message: 'Laporan berhasil disimpan.', report: reportToSave });
    } catch {
        return res.status(500).json({ error: 'Gagal menyimpan data.' });
    }
});

// Mengupdate laporan (Admin Only)
app.put('/api/reports/:id', requireAdmin, requireCsrf, (req, res) => {
    const reportId = req.params.id;
    const updateData = req.body;

    try {
        const reports = readReports();
        const index = reports.findIndex(r => r.id === reportId);
        if (index === -1) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
        }

        const oldReport = reports[index];

        const safeUpdate = {
            pasien: normalizeTextField(updateData?.pasien, { maxLen: 120 }) ?? oldReport.pasien,
            nomor_reka_medik: normalizeTextField(updateData?.nomor_reka_medik, { maxLen: 60 }) ?? oldReport.nomor_reka_medik,
            asisten_perawat: normalizeTextField(updateData?.asisten_perawat, { maxLen: 120 }) ?? oldReport.asisten_perawat,
            diagnosa: normalizeTextField(updateData?.diagnosa, { maxLen: 160 }) ?? oldReport.diagnosa,
            nomor_alat: normalizeTextField(updateData?.nomor_alat, { maxLen: 60 }) ?? oldReport.nomor_alat,
            pemakaian_alat: normalizeTextField(updateData?.pemakaian_alat, { maxLen: 120 }) ?? oldReport.pemakaian_alat,
        };

        const mergedReport = {
            ...oldReport,
            ...safeUpdate,
            id: oldReport.id,
            tanggal_input: oldReport.tanggal_input,
            tindakan_gambar: oldReport.tindakan_gambar
        };

        const nextReports = reports.map((r, i) => (i === index ? mergedReport : r));
        writeReports(nextReports);
        return res.json({ message: 'Laporan berhasil diupdate.', report: mergedReport });
    } catch {
        return res.status(500).json({ error: 'Gagal menyimpan data.' });
    }
});

// Menghapus laporan (Admin Only)
app.delete('/api/reports/:id', requireAdmin, requireCsrf, (req, res) => {
    const reportId = req.params.id;

    try {
        const reports = readReports();

        const existing = reports.some(r => r.id === reportId);
        if (!existing) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
        }

        const filtered = reports.filter(r => r.id !== reportId);
        writeReports(filtered);
        return res.json({ message: 'Laporan berhasil dihapus.' });
    } catch {
        return res.status(500).json({ error: 'Gagal menghapus data.' });
    }
});

// Export CSV (Admin Only)
app.get('/api/reports/export.csv', requireAdmin, requireCsrf, (req, res) => {
    try {
        const reports = readReports();

        const headers = [
            'id',
            'tanggal_input',
            'pasien',
            'nomor_reka_medik',
            'asisten_perawat',
            'diagnosa',
            'nomor_alat',
            'pemakaian_alat',
            'tindakan_gambar'
        ];

        const escapeCsv = (value) => {
            const s = value == null ? '' : String(value);
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
                escapeCsv((r.tindakan_gambar || []).join(' '))
            ].join(',');
            rows.push(line);
        }

        const csv = rows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="Laporan_Trakeostomi_${Date.now()}.csv"`);
        res.send(csv);
    } catch {
        return res.status(500).json({ error: 'Gagal membaca data.' });
    }
});

// Handle error upload (multer) - keep at the end so it won't affect other routes
app.use((err, req, res, next) => {
    if (err && err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Ukuran file terlalu besar. Maks 5MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Jumlah file terlalu banyak. Maks 10 file.' });
        }
        return res.status(400).json({ error: 'Upload gagal: ' + err.message });
    }
    if (err) {
        return res.status(400).json({ error: err.message || 'Request gagal.' });
    }
    next();
});

const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Server berjalan di http://${HOST}:${PORT}`);
    console.log('Akses dari perangkat lain gunakan: http://<IP-LAN-PC>:' + PORT);
});
