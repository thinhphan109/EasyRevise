// server.js — EasyRevise Entry Point
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const helmet = require('helmet');

// ========================
// Crash Guard — H11: log + flush + exit để PM2/Vercel restart cleanly
// ========================
process.on('uncaughtException', (err) => {
    console.error(`[FATAL] ${new Date().toISOString()}:`, err.message);
    console.error(err.stack);
    // Give logs time to flush, then exit so process supervisor restarts
    setTimeout(() => process.exit(1), 1000).unref();
});
process.on('unhandledRejection', (reason) => {
    console.error(`[FATAL] unhandledRejection ${new Date().toISOString()}:`, String(reason));
    if (reason && reason.stack) console.error(reason.stack);
    setTimeout(() => process.exit(1), 1000).unref();
});

const app = express();
const PORT = process.env.PORT || 3000;

// ── H2: Trust proxy header so req.ip = real client IP behind Vercel/CF/Nginx ──
app.set('trust proxy', true);

// ── H3: Security headers (CSP nới cho KaTeX, YouTube, Google Drive proxy) ──
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.jsdelivr.net'],
            // ⚠️  Cho phép inline onclick="" — toàn bộ legacy UI dùng inline handlers.
            //     Sprint UI sẽ refactor sang addEventListener và rút quy này về 'none'.
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
            connectSrc: ["'self'", 'https:'],
            mediaSrc: ["'self'", 'https:', 'blob:'],
            frameSrc: ["'self'", 'https://www.youtube.com', 'https://youtube.com', 'https://drive.google.com']
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Middleware — safe body parser
app.use((req, res, next) => {
    express.json({ limit: '10mb' })(req, res, (err) => {
        if (err && err.type === 'entity.too.large') {
            return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn (tối đa 10MB)' });
        }
        if (err) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        next();
    });
});

// ── C9: Gate /uploads/submissions/* with HMAC-signed URL ──
// Prevents IDOR — chỉ ai có ?sig=...&exp=... hợp lệ mới đọc được file submission.
// Admin token bypass: header Authorization: Bearer <admin-token>.
const { verifySignature } = require('./lib/signed-url');
const { findUserByToken: _findUser } = require('./lib/auth');

// M4: Structured HTTP request logging (pino)
const log = require('./lib/logger');
if (log.httpLogger) app.use(log.httpLogger());

app.use('/uploads/submissions', async (req, res, next) => {
    // Admin bypass — admin can open files directly when reviewing
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const user = await _findUser(authHeader.slice(7));
            if (user && user.role === 'admin') return next();
        } catch { /* fall through to signed-URL gate */ }
    }
    // Otherwise require signed URL
    const filename = req.path.replace(/^\//, '').split('/')[0];
    if (!filename) return res.status(400).end();
    const { sig, exp } = req.query;
    if (!verifySignature(filename, sig, exp)) {
        return res.status(403).json({ error: 'URL đã hết hạn hoặc không hợp lệ' });
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ========================
// Routes
// ========================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/subjects', require('./routes/subjects'));

// Exam CRUD + Export/Import
app.use('/api/exams', require('./routes/exams'));
// /api/export-all — admin export of every exam
const { adminOnly } = require('./lib/auth');
const { readDataAsync } = require('./lib/data');
app.get('/api/export-all', adminOnly, async (req, res, next) => {
    try {
        const data = await readDataAsync();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="easyrevise-backup.json"');
        res.json({ _format: 'easyrevise-backup-v1', _exportedAt: new Date().toISOString(), exams: data.exams });
    } catch (e) { next(e); }
});

// Section + Question CRUD (nested under /api/exams)
app.use('/api/exams', require('./routes/sections'));
app.use('/api/exams', require('./routes/questions'));

// Access Codes (nested under /api/exams)
app.use('/api/exams', require('./routes/codes'));

// Submit + Code Result (mixed mount: some at /api/exams, some at /api)
const submitRouter = require('./routes/submit');
app.use('/api/exams', submitRouter);           // code-result, my-grades, open-result
app.use('/api', submitRouter);                  // upload-submission, review-by-code

// Question Bank (Admin)
app.use('/api/admin', require('./routes/question-bank'));

// Grading (Admin)
app.use('/api/admin', require('./routes/grading'));

// AI Generate + Extract + Cache Recovery (Admin)
app.use('/api/admin', require('./routes/ai-generate'));

// AI Tools: OCR (Admin) + Explain Wrong
const aiToolsRouter = require('./routes/ai-tools');
app.use('/api/admin', aiToolsRouter);           // /api/admin/ocr
// explain-wrong needs :examId param — register with exported handler
app.post('/api/exams/:examId/explain-wrong', aiToolsRouter.explainWrongHandler);

// Media Upload (legacy local)
app.use('/api', require('./routes/media'));

// Media Library (Google Drive)
app.use('/api', require('./routes/media-library'));

// History + Admin PIN
app.use('/api', require('./routes/history'));

// Dashboard (Student)
app.use('/api', require('./routes/dashboard'));

// Settings
app.use('/api', require('./routes/settings'));

// Stats (Code logs at /api, CSV export + exam stats at /api)
app.use('/api', require('./routes/stats'));

// Health check (M4)
app.use('/api', require('./routes/health'));

// FaceHash Avatars (deterministic SVG avatars)
app.use('/api', require('./routes/avatar'));

// Exam Admin (Duplicate + Copy Section)
app.use('/api/admin', require('./routes/exams-admin'));

// Activation Codes (Admin + Public verify)
const activationRouter = require('./routes/activation');
app.use('/api/admin/activation', activationRouter);  // admin endpoints
app.use('/api/activation', activationRouter);          // /api/activation/verify (public)

// H12: Backup cron endpoint (Vercel cron schedules /api/admin/run-backup daily)
app.use('/api/admin', require('./routes/backup-cron'));

// IELTS Reading
app.use('/api/ielts', require('./routes/ielts'));

// Admin Drive monitor + re-auth
app.use('/api/admin/drive', require('./routes/admin-drive'));
app.use('/api/admin/settings', require('./routes/admin-settings'));
app.use('/api/admin/ielts', require('./routes/admin-ielts'));
require('./lib/drive-health').start();

// ========================
// SPA fallback
// ========================
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled:', err.message);
    res.status(500).json({ error: 'Lỗi hệ thống' });
});

// Start
app.listen(PORT, () => {
    console.log(`\n  🚀 EasyRevise Server running at http://localhost:${PORT}`);
    console.log(`  📝 Student:  http://localhost:${PORT}/`);
    console.log(`  ⚙️  Admin:    http://localhost:${PORT}/admin\n`);
    require('./lib/backup').startDailyBackup();
});
