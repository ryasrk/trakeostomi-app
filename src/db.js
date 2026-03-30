const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'trakeostomi.db');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

let db;

// Helper function to ensure consistent ISO 8601 date format
function normalizeIsoDate(dateInput) {
    if (!dateInput) return new Date().toISOString();
    
    // If already a valid ISO string, return as-is
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(dateInput)) {
        return dateInput;
    }
    
    // Convert to Date and then to ISO string
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) {
            return new Date().toISOString();
        }
        return date.toISOString();
    } catch {
        return new Date().toISOString();
    }
}

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initSchema();
    }
    return db;
}

function initSchema() {
    const conn = db;
    conn.exec(`
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            pasien TEXT NOT NULL,
            asisten_perawat TEXT NOT NULL,
            nomor_alat TEXT NOT NULL,
            pemakaian_alat TEXT NOT NULL,
            diagnosa TEXT NOT NULL,
            nomor_reka_medik TEXT NOT NULL,
            nama_pengirim TEXT NOT NULL,
            tanggal_input TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS report_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id TEXT NOT NULL,
            image_path TEXT NOT NULL,
            image_data BLOB,
            mime_type TEXT,
            original_name TEXT,
            FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_reports_tanggal ON reports(tanggal_input);
        CREATE INDEX IF NOT EXISTS idx_reports_tanggal_date ON reports(DATE(tanggal_input));
        CREATE INDEX IF NOT EXISTS idx_reports_tanggal_month ON reports(strftime('%Y-%m', tanggal_input));
        CREATE INDEX IF NOT EXISTS idx_reports_pasien ON reports(pasien);
        CREATE INDEX IF NOT EXISTS idx_reports_nomor_reka_medik ON reports(nomor_reka_medik);
        CREATE INDEX IF NOT EXISTS idx_report_images_report_id ON report_images(report_id);
    `);

    // Migrate: add image_data, mime_type, original_name columns if they don't exist
    try {
        const cols = conn.prepare("PRAGMA table_info(report_images)").all().map(c => c.name);
        if (!cols.includes('image_data')) {
            conn.exec('ALTER TABLE report_images ADD COLUMN image_data BLOB');
        }
        if (!cols.includes('mime_type')) {
            conn.exec('ALTER TABLE report_images ADD COLUMN mime_type TEXT');
        }
        if (!cols.includes('original_name')) {
            conn.exec('ALTER TABLE report_images ADD COLUMN original_name TEXT');
        }
    } catch {}
}

function getAllReports() {
    const conn = getDb();
    const reports = conn.prepare('SELECT * FROM reports ORDER BY tanggal_input DESC').all();

    const imgStmt = conn.prepare('SELECT id, image_path FROM report_images WHERE report_id = ?');
    return reports.map(r => ({
        ...r,
        tindakan_gambar: imgStmt.all(r.id).map(i => `/api/images/${i.id}`),
    }));
}

function getReportById(id) {
    const conn = getDb();
    const report = conn.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!report) return null;

    const images = conn.prepare('SELECT id, image_path FROM report_images WHERE report_id = ?').all(id);
    return { ...report, tindakan_gambar: images.map(i => `/api/images/${i.id}`) };
}

function createReport(report) {
    const conn = getDb();
    const insertReport = conn.prepare(`
        INSERT INTO reports (id, pasien, asisten_perawat, nomor_alat, pemakaian_alat, diagnosa, nomor_reka_medik, nama_pengirim, tanggal_input)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertImage = conn.prepare('INSERT INTO report_images (report_id, image_path, image_data, mime_type, original_name) VALUES (?, ?, ?, ?, ?)');

    const txn = conn.transaction(() => {
        insertReport.run(
            report.id,
            report.pasien,
            report.asisten_perawat,
            report.nomor_alat,
            report.pemakaian_alat,
            report.diagnosa,
            report.nomor_reka_medik,
            report.nama_pengirim,
            normalizeIsoDate(report.tanggal_input)
        );
        for (const img of (report.images || [])) {
            insertImage.run(report.id, img.path, img.data, img.mimeType, img.originalName);
        }
    });

    txn();
    return getReportById(report.id);
}

function updateReport(id, data) {
    const conn = getDb();
    const existing = conn.prepare('SELECT * FROM reports WHERE id = ?').get(id);
    if (!existing) return null;

    const merged = {
        pasien: data.pasien ?? existing.pasien,
        nomor_reka_medik: data.nomor_reka_medik ?? existing.nomor_reka_medik,
        asisten_perawat: data.asisten_perawat ?? existing.asisten_perawat,
        diagnosa: data.diagnosa ?? existing.diagnosa,
        nomor_alat: data.nomor_alat ?? existing.nomor_alat,
        pemakaian_alat: data.pemakaian_alat ?? existing.pemakaian_alat,
    };

    conn.prepare(`
        UPDATE reports SET pasien = ?, nomor_reka_medik = ?, asisten_perawat = ?, diagnosa = ?, nomor_alat = ?, pemakaian_alat = ?
        WHERE id = ?
    `).run(merged.pasien, merged.nomor_reka_medik, merged.asisten_perawat, merged.diagnosa, merged.nomor_alat, merged.pemakaian_alat, id);

    return getReportById(id);
}

function deleteReport(id) {
    const conn = getDb();
    const report = getReportById(id);
    if (!report) return null;

    // CASCADE will handle report_images deletion
    conn.prepare('DELETE FROM reports WHERE id = ?').run(id);
    return report;
}

function getImagesByReportId(reportId) {
    const conn = getDb();
    return conn.prepare('SELECT image_path FROM report_images WHERE report_id = ?').all(reportId).map(i => i.image_path);
}

function getImageById(imageId) {
    const conn = getDb();
    return conn.prepare('SELECT id, report_id, image_data, mime_type, original_name FROM report_images WHERE id = ?').get(imageId);
}

function migrateFilesToDb() {
    const conn = getDb();
    const rows = conn.prepare('SELECT id, image_path FROM report_images WHERE image_data IS NULL').all();
    let migrated = 0;
    for (const row of rows) {
        const filename = row.image_path.replace('/uploads/', '');
        const filePath = path.join(UPLOADS_DIR, filename);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath);
                const ext = path.extname(filename).toLowerCase();
                const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
                const mime = mimeMap[ext] || 'image/jpeg';
                conn.prepare('UPDATE report_images SET image_data = ?, mime_type = ?, original_name = ? WHERE id = ?')
                    .run(data, mime, filename, row.id);
                migrated++;
            }
        } catch (err) {
            console.warn('Failed to migrate image to DB:', filename, err.message);
        }
    }
    return migrated;
}

function migrateFromJson(jsonPath) {
    if (!fs.existsSync(jsonPath)) return 0;

    const conn = getDb();
    const existingCount = conn.prepare('SELECT COUNT(*) as count FROM reports').get().count;
    if (existingCount > 0) return 0; // Already has data, skip migration

    let data;
    try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        data = JSON.parse(raw);
    } catch {
        return 0;
    }

    if (!Array.isArray(data) || data.length === 0) return 0;

    const insertReport = conn.prepare(`
        INSERT OR IGNORE INTO reports (id, pasien, asisten_perawat, nomor_alat, pemakaian_alat, diagnosa, nomor_reka_medik, nama_pengirim, tanggal_input)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertImage = conn.prepare('INSERT INTO report_images (report_id, image_path) VALUES (?, ?)');

    const txn = conn.transaction(() => {
        for (const r of data) {
            insertReport.run(
                r.id || Date.now().toString(),
                r.pasien || '',
                r.asisten_perawat || '',
                r.nomor_alat || '',
                r.pemakaian_alat || '',
                r.diagnosa || '',
                r.nomor_reka_medik || '',
                r.nama_pengirim || '',
                r.tanggal_input || new Date().toISOString()
            );
            for (const img of (r.tindakan_gambar || [])) {
                insertImage.run(r.id, img);
            }
        }
    });

    txn();
    return data.length;
}

function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}

async function findOrphanImages() {
    try {
        // Ensure uploads directory exists
        if (!fs.existsSync(UPLOADS_DIR)) {
            console.warn('Uploads directory does not exist:', UPLOADS_DIR);
            return [];
        }

        // Get all files in uploads directory
        const filesInUploads = await fs.promises.readdir(UPLOADS_DIR);
        const imageFiles = [];
        
        // Filter for actual image files (not directories or non-image files) 
        for (const filename of filesInUploads) {
            const filePath = path.join(UPLOADS_DIR, filename);
            try {
                const stats = await fs.promises.stat(filePath);
                if (stats.isFile() && /\.(jpg|jpeg|png|webp)$/i.test(filename)) {
                    imageFiles.push(filename);
                }
            } catch (statError) {
                console.warn('Could not stat file:', filename, statError.message);
                continue;
            }
        }

        // Get all image paths from database
        const conn = module.exports.getDb();
        const dbImages = conn.prepare('SELECT DISTINCT image_path FROM report_images').all();
        const dbFilenames = new Set(dbImages.map(img => {
            const filename = img.image_path.replace('/uploads/', '');
            return filename;
        }));

        // Find orphans - files in uploads but not in database
        const orphans = imageFiles.filter(filename => !dbFilenames.has(filename));
        return orphans;
    } catch (error) {
        console.error('Error finding orphan images:', error);
        return [];
    }
}

function getReportStats() {
    const conn = getDb();
    
    // Get total count
    const totalResult = conn.prepare('SELECT COUNT(*) as total FROM reports').get();
    const total = totalResult.total;

    // Get today's count using SQLite DATE() function
    const todayResult = conn.prepare(`
        SELECT COUNT(*) as count 
        FROM reports 
        WHERE DATE(tanggal_input) = DATE('now', 'localtime')
    `).get();
    const todayCount = todayResult.count;

    // Get this month's count using proper date functions
    const monthResult = conn.prepare(`
        SELECT COUNT(*) as count 
        FROM reports 
        WHERE strftime('%Y-%m', tanggal_input) = strftime('%Y-%m', 'now', 'localtime')
    `).get();
    const monthCount = monthResult.count;

    // Get top diagnoses using SQL aggregation
    const topDiagnoses = conn.prepare(`
        SELECT 
            COALESCE(diagnosa, 'Tidak diketahui') as name, 
            COUNT(*) as count
        FROM reports 
        GROUP BY diagnosa 
        ORDER BY count DESC 
        LIMIT 5
    `).all();

    // Get top petugas using SQL aggregation
    const topPetugas = conn.prepare(`
        SELECT 
            COALESCE(asisten_perawat, 'Tidak diketahui') as name, 
            COUNT(*) as count
        FROM reports 
        GROUP BY asisten_perawat 
        ORDER BY count DESC 
        LIMIT 5
    `).all();

    return {
        total,
        todayCount,
        monthCount,
        topDiagnoses,
        topPetugas
    };
}

module.exports = {
    getDb,
    getAllReports,
    getReportById,
    createReport,
    updateReport,
    deleteReport,
    getImagesByReportId,
    getImageById,
    migrateFilesToDb,
    findOrphanImages,
    getReportStats,
    migrateFromJson,
    closeDb,
};
