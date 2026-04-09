// server.js — EasyRevise Entry Point
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');

// ========================
// Crash Guard — prevent server shutdown on unhandled errors
// ========================
process.on('uncaughtException', (err) => {
    console.error(`[CRASH PREVENTED] ${new Date().toISOString()}:`, err.message);
    console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
    console.error(`[CRASH PREVENTED] unhandledRejection:`, String(reason));
});

const app = express();
const PORT = process.env.PORT || 3000;

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
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// Routes
// ========================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/subjects', require('./routes/subjects'));

// Exam CRUD + Export/Import
app.use('/api/exams', require('./routes/exams'));
// Note: export-all is at /api/export-all, handled by exams router as /export-all
// We need a separate mount for /api/export-all
const { adminOnly } = require('./lib/auth');
const { readData } = require('./lib/data');
app.get('/api/export-all', adminOnly, (req, res) => {
    const data = readData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="easyrevise-backup.json"');
    res.json({ _format: 'easyrevise-backup-v1', _exportedAt: new Date().toISOString(), exams: data.exams });
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

// Settings
app.use('/api', require('./routes/settings'));

// Stats (Code logs at /api, CSV export + exam stats at /api)
app.use('/api', require('./routes/stats'));

// Exam Admin (Duplicate + Copy Section)
app.use('/api/admin', require('./routes/exams-admin'));

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
