const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const db = require('./src/db');
const { setupSecurity } = require('./src/middleware');
const { router } = require('./src/routes');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Production security validations
if (process.env.NODE_ENV === 'production') {
    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
    const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_only_change_me_change_me_change_me_32chars';
    
    // Validate admin credentials
    if (ADMIN_USER === 'admin') {
        throw new Error('Server refused to start: Weak admin username detected in production');
    }
    if (ADMIN_PASS === 'admin123') {
        throw new Error('Server refused to start: Weak admin password detected in production');
    }
    
    // Validate session secret
    if (SESSION_SECRET === 'dev_only_change_me_change_me_change_me_32chars' || SESSION_SECRET.length < 32) {
        throw new Error('Server refused to start: Default or weak session secret detected in production');
    }
}

// Get session secret dynamically for testing
const getSessionSecret = () => process.env.SESSION_SECRET || 'dev_only_change_me_change_me_change_me_32chars';

if (!process.env.SESSION_SECRET || (getSessionSecret()).length < 32) {
    console.warn('[SECURITY] SESSION_SECRET belum di-set/kurang kuat. Menggunakan default dev secret.');
}

// Auto-migrate data.json → SQLite on first run
const DATA_FILE = path.join(__dirname, 'data.json');
const migrated = db.migrateFromJson(DATA_FILE);
if (migrated > 0) {
    console.log(`[DB] Migrated ${migrated} reports from data.json to SQLite.`);
}

// Auto-migrate existing filesystem images → SQLite BLOBs
const imgMigrated = db.migrateFilesToDb();
if (imgMigrated > 0) {
    console.log(`[DB] Migrated ${imgMigrated} images from filesystem to database.`);
}

app.use(bodyParser.json());

// Security middleware (helmet, rate-limit, session)
setupSecurity(app);

// Serve static assets (no longer serves uploads — images served from DB via /api/images/:id)
app.use(express.static('public', {
    etag: true,
    maxAge: '1h',
    index: ['index.html'],
}));

// All API routes
app.use(router);

// Handle Multer upload errors
app.use((err, req, res, next) => {
    if (err && err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Ukuran file terlalu besar. Maks 5MB per file.' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: 'Jumlah file terlalu banyak. Maks 10 file.' });
        }
        return res.status(400).json({ error: 'Upload gagal.' });
    }
    if (err) {
        // File filter validation errors are client errors (400)
        if (err.message && err.message.includes('Tipe file tidak didukung')) {
            return res.status(400).json({ error: err.message });
        }
        // Unexpected errors are server errors (500)
        return res.status(500).json({ error: 'Request gagal.' });
    }
    next();
});

const HOST = '0.0.0.0';

if (require.main === module) {
    app.listen(PORT, HOST, () => {
        console.log(`Server berjalan di http://${HOST}:${PORT}`);
        console.log('Akses dari perangkat lain gunakan: http://<IP-LAN-PC>:' + PORT);
    });
}

module.exports = app;

// Graceful shutdown
process.on('SIGTERM', () => {
    db.closeDb();
    process.exit(0);
});
process.on('SIGINT', () => {
    db.closeDb();
    process.exit(0);
});
