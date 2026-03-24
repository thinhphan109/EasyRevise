require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// MongoDB Connection
// ========================
mongoose.connect(process.env.MONGODB_URI).then(() => console.log('  ✅ MongoDB connected')).catch(err => console.error('  ❌ MongoDB error:', err.message));

// ========================
// Schemas
// ========================
const questionSchema = new mongoose.Schema({
    id: mongoose.Schema.Types.Mixed,
    question: String, options: [String], correctAnswer: Number,
    explanation: String, expansion: String, answer: String, image: String
}, { _id: false });

const sectionSchema = new mongoose.Schema({
    id: String, title: String, instruction: String, type: String,
    passage: String, questions: [questionSchema],
    prompt: String, context: String, cues: [String],
    sampleAnswer: String, explanation: String,
    showInstruction: { type: Boolean, default: true }, showCues: { type: Boolean, default: false }
}, { _id: false });

const codeSchema = new mongoose.Schema({
    code: String, type: { type: String, default: 'reusable' },
    usedBy: [String], createdAt: Date
}, { _id: false });

const examSchema = new mongoose.Schema({
    id: { type: String, unique: true }, title: String, subject: String, year: String,
    sections: [sectionSchema], requireCode: { type: Boolean, default: false },
    accessCodes: [codeSchema]
}, { timestamps: true });

const historyItemSchema = new mongoose.Schema({
    id: String, examId: String, examTitle: String, score: String,
    correct: Number, incorrect: Number, skipped: Number, total: Number,
    results: [mongoose.Schema.Types.Mixed], timestamp: String, timeSpent: Number, savedAt: Date
}, { _id: false });

const userSchema = new mongoose.Schema({
    id: { type: String, unique: true }, username: { type: String, unique: true },
    passwordHash: String, displayName: String,
    role: { type: String, default: 'student' },
    token: String, history: [historyItemSchema]
}, { timestamps: true });

const subjectSchema = new mongoose.Schema({
    id: { type: String, unique: true }, name: String, icon: { type: String, default: '📚' }
});

const Exam = mongoose.model('Exam', examSchema);
const User = mongoose.model('User', userSchema);
const Subject = mongoose.model('Subject', subjectSchema);

// ========================
// Helpers
// ========================
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return 'h' + Math.abs(hash).toString(36) + str.length;
}

function generateToken(userId) {
    return Buffer.from(`${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`).toString('base64');
}

function countQuestions(exam) {
    let count = 0;
    (exam.sections || []).forEach(s => {
        if (s.type === 'writing-essay') count += 1;
        else count += (s.questions || []).length;
    });
    return count;
}

// ========================
// Auth Middleware
// ========================
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const user = await User.findOne({ token: authHeader.split(' ')[1] });
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    req.user = user;
    next();
}

async function adminOnly(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const user = await User.findOne({ token: authHeader.split(' ')[1] });
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền admin' });
    req.user = user;
    next();
}

// ========================
// Auth Routes
// ========================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, displayName } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
        if (username.length < 3) return res.status(400).json({ error: 'Tên đăng nhập phải từ 3 ký tự' });
        if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải từ 4 ký tự' });
        if (await User.findOne({ username })) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });

        const userCount = await User.countDocuments();
        const token = generateToken(uuidv4());
        const newUser = await User.create({
            id: uuidv4(), username, passwordHash: simpleHash(password),
            displayName: displayName || username,
            role: userCount === 0 ? 'admin' : 'student', token, history: []
        });
        res.status(201).json({ id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role, token });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || user.passwordHash !== simpleHash(password)) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        user.token = generateToken(user.id);
        await user.save();
        res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, token: user.token });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role });
});

// ========================
// User Management (Admin)
// ========================
app.get('/api/users', adminOnly, async (req, res) => {
    const users = await User.find({}, 'id username displayName role history createdAt');
    res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, historyCount: (u.history || []).length, createdAt: u.createdAt })));
});

app.put('/api/users/:id', adminOnly, async (req, res) => {
    const update = {};
    if (req.body.role) update.role = req.body.role;
    if (req.body.displayName) update.displayName = req.body.displayName;
    await User.updateOne({ id: req.params.id }, update);
    res.json({ success: true });
});

app.put('/api/users/:id/reset-password', adminOnly, async (req, res) => {
    const newPassword = req.body.password || '1234';
    await User.updateOne({ id: req.params.id }, { passwordHash: simpleHash(newPassword), token: generateToken(req.params.id) });
    res.json({ success: true, newPassword });
});

app.delete('/api/users/:id', adminOnly, async (req, res) => {
    await User.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

// ========================
// Subjects
// ========================
app.get('/api/subjects', async (req, res) => { res.json(await Subject.find({})); });

app.post('/api/subjects', adminOnly, async (req, res) => {
    const subject = await Subject.create({ id: uuidv4(), name: req.body.name || '', icon: req.body.icon || '📚' });
    res.status(201).json(subject);
});

app.put('/api/subjects/:id', adminOnly, async (req, res) => {
    const update = {};
    if (req.body.name) update.name = req.body.name;
    if (req.body.icon) update.icon = req.body.icon;
    const s = await Subject.findOneAndUpdate({ id: req.params.id }, update, { new: true });
    res.json(s);
});

app.delete('/api/subjects/:id', adminOnly, async (req, res) => {
    await Subject.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

// ========================
// Exam CRUD
// ========================
app.get('/api/exams', async (req, res) => {
    const exams = await Exam.find({});
    res.json(exams.map(exam => ({
        id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
        createdAt: exam.createdAt, updatedAt: exam.updatedAt,
        totalQuestions: countQuestions(exam),
        totalEssays: exam.sections.filter(s => s.type === 'writing-essay').length,
        sectionCount: exam.sections.length, requireCode: exam.requireCode || false
    })));
});

app.get('/api/exams/:id', async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    if (exam.requireCode) {
        const codeHeader = req.headers['x-access-code'];
        const authHeader = req.headers.authorization;
        let isAdmin = false;
        if (authHeader?.startsWith('Bearer ')) {
            const user = await User.findOne({ token: authHeader.split(' ')[1] });
            if (user?.role === 'admin') isAdmin = true;
        }
        if (!isAdmin && !codeHeader) {
            return res.json({ id: exam.id, title: exam.title, subject: exam.subject, year: exam.year, requireCode: true, sections: [], totalQuestions: countQuestions(exam) });
        }
        if (!isAdmin && codeHeader) {
            const code = exam.accessCodes?.find(c => c.code === codeHeader);
            if (!code) return res.status(403).json({ error: 'Mã kích hoạt không đúng', requireCode: true });
        }
    }
    res.json(exam);
});

app.post('/api/exams', adminOnly, async (req, res) => {
    const newExam = await Exam.create({
        id: uuidv4(), title: req.body.title || 'Đề mới',
        subject: req.body.subject || 'Tiếng Anh', year: req.body.year || new Date().getFullYear().toString(),
        sections: req.body.sections || [], requireCode: false, accessCodes: []
    });
    res.status(201).json(newExam);
});

app.put('/api/exams/:id', adminOnly, async (req, res) => {
    const update = {};
    if (req.body.title !== undefined) update.title = req.body.title;
    if (req.body.subject !== undefined) update.subject = req.body.subject;
    if (req.body.year !== undefined) update.year = req.body.year;
    if (req.body.sections !== undefined) update.sections = req.body.sections;
    if (req.body.requireCode !== undefined) update.requireCode = req.body.requireCode;
    if (req.body.accessCodes !== undefined) update.accessCodes = req.body.accessCodes;
    const exam = await Exam.findOneAndUpdate({ id: req.params.id }, update, { new: true });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
});

app.delete('/api/exams/:id', adminOnly, async (req, res) => {
    await Exam.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

// ========================
// Section CRUD
// ========================
app.post('/api/exams/:id/sections', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const newSection = {
        id: req.body.id || uuidv4(), title: req.body.title || 'Phần mới',
        instruction: req.body.instruction || '', type: req.body.type || 'multiple-choice',
        passage: req.body.passage || null, questions: req.body.questions || [],
        prompt: req.body.prompt || null, context: req.body.context || null,
        cues: req.body.cues || [], sampleAnswer: req.body.sampleAnswer || null,
        explanation: req.body.explanation || null,
        showInstruction: req.body.showInstruction ?? true, showCues: req.body.showCues ?? false
    };
    exam.sections.push(newSection);
    await exam.save();
    res.status(201).json(newSection);
});

app.put('/api/exams/:examId/sections/:sectionId', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    Object.assign(section, req.body);
    await exam.save();
    res.json(section);
});

app.delete('/api/exams/:examId/sections/:sectionId', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    exam.sections = exam.sections.filter(s => s.id !== req.params.sectionId);
    await exam.save();
    res.json({ success: true });
});

// ========================
// Question CRUD
// ========================
app.post('/api/exams/:examId/sections/:sectionId/questions', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    const newQ = {
        id: req.body.id || Date.now(), question: req.body.question || '',
        options: req.body.options || ['', '', '', ''], correctAnswer: req.body.correctAnswer ?? 0,
        explanation: req.body.explanation || '', expansion: req.body.expansion || '',
        answer: req.body.answer || '', image: req.body.image || null
    };
    section.questions.push(newQ);
    await exam.save();
    res.status(201).json(newQ);
});

app.put('/api/exams/:examId/sections/:sectionId/questions/:questionId', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    const q = section.questions.find(q => String(q.id) === String(req.params.questionId));
    if (!q) return res.status(404).json({ error: 'Question not found' });
    Object.assign(q, req.body);
    await exam.save();
    res.json(q);
});

app.delete('/api/exams/:examId/sections/:sectionId/questions/:questionId', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    section.questions = section.questions.filter(q => String(q.id) !== String(req.params.questionId));
    await exam.save();
    res.json({ success: true });
});

// ========================
// Access Codes
// ========================
app.post('/api/exams/:id/codes', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const count = parseInt(req.body.count) || 1;
    const type = req.body.type || 'reusable';
    const newCodes = [];
    for (let i = 0; i < count; i++) {
        newCodes.push({ code: Math.random().toString(36).substring(2, 8).toUpperCase(), type, usedBy: [], createdAt: new Date() });
    }
    exam.accessCodes.push(...newCodes);
    exam.requireCode = true;
    await exam.save();
    res.status(201).json(newCodes);
});

app.delete('/api/exams/:id/codes/:code', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    exam.accessCodes = exam.accessCodes.filter(c => c.code !== req.params.code);
    await exam.save();
    res.json({ success: true });
});

app.post('/api/exams/:id/verify-code', async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không đúng' });
    if (codeObj.type === 'single-use' && codeObj.usedBy.length > 0) return res.status(403).json({ error: 'Mã này đã được sử dụng' });
    const userId = req.body.userId || 'anonymous';
    if (!codeObj.usedBy.includes(userId)) codeObj.usedBy.push(userId);
    await exam.save();
    res.json({ success: true, code: inputCode });
});

// ========================
// Export / Import
// ========================
app.get('/api/exams/:id/export', adminOnly, async (req, res) => {
    const exam = await Exam.findOne({ id: req.params.id });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const exportData = { _format: 'easyrevise-exam-v1', _exportedAt: new Date().toISOString(), exam: { title: exam.title, subject: exam.subject, year: exam.year, sections: exam.sections } };
    res.setHeader('Content-Type', 'application/json');
    const safeName = exam.title.replace(/[^a-zA-Z0-9 ]/g, '_').trim() || 'exam';
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"; filename*=UTF-8''${encodeURIComponent(exam.title)}.json`);
    res.json(exportData);
});

app.post('/api/exams/import', adminOnly, async (req, res) => {
    const importData = req.body;
    if (!importData._format || importData._format !== 'easyrevise-exam-v1') return res.status(400).json({ error: 'Invalid format' });
    if (!importData.exam?.sections) return res.status(400).json({ error: 'Missing exam data' });
    const newExam = await Exam.create({
        id: uuidv4(), title: importData.exam.title || 'Đề import',
        subject: importData.exam.subject || 'Tiếng Anh', year: importData.exam.year || '',
        sections: importData.exam.sections.map(s => ({ ...s, id: s.id || uuidv4() })),
        requireCode: false, accessCodes: []
    });
    res.status(201).json(newExam);
});

app.get('/api/export-all', adminOnly, async (req, res) => {
    const exams = await Exam.find({});
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="easyrevise-backup.json"');
    res.json({ _format: 'easyrevise-backup-v1', _exportedAt: new Date().toISOString(), exams });
});

// ========================
// Image Upload
// ========================
const multer = require('multer');
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
}});

app.post('/api/upload', adminOnly, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
});

// ========================
// Exam History
// ========================
app.post('/api/history', authMiddleware, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.history.unshift({ ...req.body, id: uuidv4(), savedAt: new Date() });
    if (user.history.length > 100) user.history = user.history.slice(0, 100);
    await user.save();
    res.status(201).json({ success: true });
});

app.get('/api/history', authMiddleware, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    res.json(user?.history || []);
});

// ========================
// SPA fallback
// ========================
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

app.listen(PORT, () => {
    console.log(`\n  🚀 EasyRevise Server running at http://localhost:${PORT}`);
    console.log(`  📝 Student:  http://localhost:${PORT}/`);
    console.log(`  ⚙️  Admin:    http://localhost:${PORT}/admin\n`);
});
