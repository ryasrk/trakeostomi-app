const session = require('express-session');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Dynamic session secret for testing
const getSessionSecret = () => process.env.SESSION_SECRET || 'dev_only_change_me_change_me_change_me_32chars';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

function setupSecurity(app) {
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
                "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
                "font-src": ["'self'", "https://cdnjs.cloudflare.com", "data:"],
            }
        }
    }));

    app.use(rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 300,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
    }));

    app.use(session({
        name: 'trakeo.sid',
        secret: getSessionSecret(),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'strict',
            secure: 'auto',
            maxAge: 8 * 60 * 60 * 1000,
        },
    }));
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
});

const reportSubmitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak pengiriman laporan. Coba lagi nanti.' },
});

const createCsrfToken = () => crypto.randomBytes(24).toString('hex');

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin === true) return next();
    return res.status(401).json({ error: 'Akses ditolak.' });
}

function requireCsrf(req, res, next) {
    if (!req.session || req.session.isAdmin !== true) {
        return res.status(401).json({ error: 'Akses ditolak.' });
    }
    const headerToken = String(req.get('x-csrf-token') || '').trim();
    const sessionToken = String(req.session.csrfToken || '').trim();
    if (!headerToken || !sessionToken || headerToken.length !== sessionToken.length) {
        return res.status(403).json({ error: 'CSRF token tidak valid.' });
    }
    const bufA = Buffer.from(headerToken);
    const bufB = Buffer.from(sessionToken);
    if (!crypto.timingSafeEqual(bufA, bufB)) {
        return res.status(403).json({ error: 'CSRF token tidak valid.' });
    }
    return next();
}

module.exports = {
    setupSecurity,
    loginLimiter,
    reportSubmitLimiter,
    createCsrfToken,
    requireAdmin,
    requireCsrf,
};
