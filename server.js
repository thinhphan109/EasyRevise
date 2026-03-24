const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'exams.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SUBJECTS_FILE = path.join(__dirname, 'data', 'subjects.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// Helper Functions
// ========================
function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ exams: [] }, null, 2));
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (err) { return { exams: [] }; }
}

function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) { return { users: [] }; }
}

function writeUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readSubjects() {
    try {
        if (!fs.existsSync(SUBJECTS_FILE)) fs.writeFileSync(SUBJECTS_FILE, JSON.stringify({ subjects: [] }, null, 2));
        return JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf-8'));
    } catch (err) { return { subjects: [] }; }
}

function writeSubjects(data) { fs.writeFileSync(SUBJECTS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ adminPin: '123456', pinSessionHours: 3, siteName: 'EasyRevise', siteDescription: 'Hệ thống ôn tập đề cương thông minh' }, null, 2));
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (err) { return { adminPin: '123456', pinSessionHours: 3, siteName: 'EasyRevise', siteDescription: 'Hệ thống ôn tập đề cương thông minh' }; }
}

function writeSettings(data) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

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
    exam.sections.forEach(s => {
        if (s.type === 'writing-essay') count += 1;
        else if (s.type === 'free-form') count += (s.questions || []).length;
        else count += (s.questions || []).length;
    });
    return count;
}

// ========================
// Auth Middleware
// ========================
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const token = authHeader.split(' ')[1];
    const user = readUsers().users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    req.user = user;
    next();
}

function adminOnly(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const token = authHeader.split(' ')[1];
    const user = readUsers().users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền admin' });
    req.user = user;
    next();
}

// ========================
// Auth Routes
// ========================
app.post('/api/auth/register', (req, res) => {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    if (username.length < 3) return res.status(400).json({ error: 'Tên đăng nhập phải từ 3 ký tự' });
    if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải từ 4 ký tự' });

    const usersData = readUsers();
    if (usersData.users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });

    const token = generateToken(uuidv4());
    const newUser = {
        id: uuidv4(), username, passwordHash: simpleHash(password),
        displayName: displayName || username,
        role: usersData.users.length === 0 ? 'admin' : 'student',
        token, history: [], createdAt: new Date().toISOString()
    };
    usersData.users.push(newUser);
    writeUsers(usersData);
    res.status(201).json({ id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role, token });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const usersData = readUsers();
    const user = usersData.users.find(u => u.username === username);
    if (!user || user.passwordHash !== simpleHash(password)) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    user.token = generateToken(user.id);
    writeUsers(usersData);
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, token: user.token });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role });
});

// ========================
// User Management (Admin)
// ========================
app.get('/api/users', adminOnly, (req, res) => {
    const usersData = readUsers();
    res.json(usersData.users.map(u => ({
        id: u.id, username: u.username, displayName: u.displayName,
        role: u.role, historyCount: (u.history || []).length, createdAt: u.createdAt
    })));
});

app.put('/api/users/:id', adminOnly, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.role) user.role = req.body.role;
    if (req.body.displayName) user.displayName = req.body.displayName;
    if (req.body.username) {
        const dup = usersData.users.find(u => u.username === req.body.username && u.id !== req.params.id);
        if (dup) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        user.username = req.body.username;
    }
    writeUsers(usersData);
    res.json({ success: true });
});

app.put('/api/users/:id/reset-password', adminOnly, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newPassword = req.body.password || '1234';
    user.passwordHash = simpleHash(newPassword);
    user.token = generateToken(user.id); // invalidate old sessions
    writeUsers(usersData);
    res.json({ success: true, newPassword });
});

app.delete('/api/users/:id', adminOnly, (req, res) => {
    const usersData = readUsers();
    usersData.users = usersData.users.filter(u => u.id !== req.params.id);
    writeUsers(usersData);
    res.json({ success: true });
});

// ========================
// Subjects (Admin)
// ========================
app.get('/api/subjects', (req, res) => { res.json(readSubjects().subjects); });

app.post('/api/subjects', adminOnly, (req, res) => {
    const data = readSubjects();
    const subject = { id: uuidv4(), name: req.body.name || '', icon: req.body.icon || '📚' };
    data.subjects.push(subject);
    writeSubjects(data);
    res.status(201).json(subject);
});

app.put('/api/subjects/:id', adminOnly, (req, res) => {
    const data = readSubjects();
    const s = data.subjects.find(s => s.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Subject not found' });
    if (req.body.name) s.name = req.body.name;
    if (req.body.icon) s.icon = req.body.icon;
    writeSubjects(data);
    res.json(s);
});

app.delete('/api/subjects/:id', adminOnly, (req, res) => {
    const data = readSubjects();
    data.subjects = data.subjects.filter(s => s.id !== req.params.id);
    writeSubjects(data);
    res.json({ success: true });
});

// ========================
// Exam CRUD
// ========================
app.get('/api/exams', (req, res) => {
    const data = readData();
    res.json(data.exams.map(exam => ({
        id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
        createdAt: exam.createdAt, updatedAt: exam.updatedAt,
        totalQuestions: countQuestions(exam),
        totalEssays: exam.sections.filter(s => s.type === 'writing-essay').length,
        sectionCount: exam.sections.length,
        requireCode: exam.requireCode || false
    })));
});

app.get('/api/exams/:id', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // If exam requires code, check if user has access
    if (exam.requireCode) {
        const codeHeader = req.headers['x-access-code'];
        const authHeader = req.headers.authorization;
        let isAdmin = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const user = readUsers().users.find(u => u.token === authHeader.split(' ')[1]);
            if (user && user.role === 'admin') isAdmin = true;
        }
        if (!isAdmin && codeHeader) {
            const code = exam.accessCodes?.find(c => c.code === codeHeader);
            if (!code) return res.status(403).json({ error: 'Mã kích hoạt không đúng', requireCode: true });
        } else if (!isAdmin && !codeHeader) {
            // Return limited data
            return res.json({
                id: exam.id, title: exam.title, subject: exam.subject, year: exam.year,
                requireCode: true, sections: [], totalQuestions: countQuestions(exam)
            });
        }
    }
    res.json(exam);
});

app.post('/api/exams', adminOnly, (req, res) => {
    const data = readData();
    const newExam = {
        id: uuidv4(), title: req.body.title || 'Đề mới',
        subject: req.body.subject || 'Tiếng Anh', year: req.body.year || new Date().getFullYear().toString(),
        sections: req.body.sections || [], requireCode: false, accessCodes: [],
        timeLimit: req.body.timeLimit || 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.exams.push(newExam);
    writeData(data);
    res.status(201).json(newExam);
});

app.put('/api/exams/:id', adminOnly, (req, res) => {
    const data = readData();
    const index = data.exams.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Exam not found' });
    data.exams[index] = {
        ...data.exams[index],
        title: req.body.title ?? data.exams[index].title,
        subject: req.body.subject ?? data.exams[index].subject,
        year: req.body.year ?? data.exams[index].year,
        sections: req.body.sections ?? data.exams[index].sections,
        requireCode: req.body.requireCode ?? data.exams[index].requireCode,
        accessCodes: req.body.accessCodes ?? data.exams[index].accessCodes,
        timeLimit: req.body.timeLimit ?? data.exams[index].timeLimit ?? 0,
        updatedAt: new Date().toISOString()
    };
    writeData(data);
    res.json(data.exams[index]);
});

app.delete('/api/exams/:id', adminOnly, (req, res) => {
    const data = readData();
    data.exams = data.exams.filter(e => e.id !== req.params.id);
    writeData(data);
    res.json({ success: true });
});

// ========================
// Section CRUD (Admin)
// ========================
app.post('/api/exams/:id/sections', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const newSection = {
        id: req.body.id || uuidv4(), title: req.body.title || 'Phần mới',
        instruction: req.body.instruction || '', type: req.body.type || 'multiple-choice',
        passage: req.body.passage || null, questions: req.body.questions || [],
        prompt: req.body.prompt || null, context: req.body.context || null,
        cues: req.body.cues || [], sampleAnswer: req.body.sampleAnswer || null,
        explanation: req.body.explanation || null,
        showInstruction: req.body.showInstruction ?? true, showCues: req.body.showCues ?? true
    };
    exam.sections.push(newSection);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.status(201).json(newSection);
});

app.put('/api/exams/:examId/sections/:sectionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const sIndex = exam.sections.findIndex(s => s.id === req.params.sectionId);
    if (sIndex === -1) return res.status(404).json({ error: 'Section not found' });
    exam.sections[sIndex] = { ...exam.sections[sIndex], ...req.body };
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json(exam.sections[sIndex]);
});

app.delete('/api/exams/:examId/sections/:sectionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    exam.sections = exam.sections.filter(s => s.id !== req.params.sectionId);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
});

// ========================
// Question CRUD (Admin)
// ========================
app.post('/api/exams/:examId/sections/:sectionId/questions', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    const newQ = {
        id: req.body.id || Date.now(), question: req.body.question || '',
        options: req.body.options || ['', '', '', ''], correctAnswer: req.body.correctAnswer ?? 0,
        explanation: req.body.explanation || '', expansion: req.body.expansion || '',
        answer: req.body.answer || '', image: req.body.image || null,
        video: req.body.video || null, mediaAsHint: !!req.body.mediaAsHint,
        explanationImage: req.body.explanationImage || null,
        explanationVideo: req.body.explanationVideo || null
    };
    section.questions.push(newQ);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.status(201).json(newQ);
});

app.put('/api/exams/:examId/sections/:sectionId/questions/:questionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    const qIndex = section.questions.findIndex(q => String(q.id) === String(req.params.questionId));
    if (qIndex === -1) return res.status(404).json({ error: 'Question not found' });
    section.questions[qIndex] = { ...section.questions[qIndex], ...req.body };
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json(section.questions[qIndex]);
});

app.delete('/api/exams/:examId/sections/:sectionId/questions/:questionId', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });
    section.questions = section.questions.filter(q => String(q.id) !== String(req.params.questionId));
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
});

// ========================
// Access Codes (Admin)
// ========================
app.post('/api/exams/:id/codes', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!exam.accessCodes) exam.accessCodes = [];

    const count = parseInt(req.body.count) || 1;
    const maxUses = parseInt(req.body.maxUses) || 1;
    const newCodes = [];
    for (let i = 0; i < count; i++) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        newCodes.push({ code, maxUses, usedBy: [], createdAt: new Date().toISOString() });
    }
    exam.accessCodes.push(...newCodes);
    exam.requireCode = true;
    writeData(data);
    res.status(201).json(newCodes);
});

app.delete('/api/exams/:id/codes/:code', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    exam.accessCodes = (exam.accessCodes || []).filter(c => c.code !== req.params.code);
    writeData(data);
    res.json({ success: true });
});

app.post('/api/exams/:id/verify-code', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không đúng' });

    // Auto-expire: remove incomplete usages older than 24 hours
    const settings = readSettings();
    const expireMs = (settings.codeExpireHours || 24) * 60 * 60 * 1000;
    codeObj.usedBy = codeObj.usedBy.filter(u => {
        if (!u.completed && (Date.now() - new Date(u.usedAt).getTime()) > expireMs) return false;
        return true;
    });
    const completedUses = codeObj.usedBy.filter(u => u.completed).length;
    if (completedUses >= codeObj.maxUses) {
        return res.status(403).json({ error: 'Mã này đã dùng hết ' + codeObj.maxUses + ' lần' });
    }

    const userId = req.body.userId || 'anonymous';
    const displayName = req.body.displayName || userId;
    codeObj.usedBy.push({ userId, displayName, usedAt: new Date().toISOString(), completed: false, score: null });
    writeData(data);
    res.json({ success: true, code: inputCode });
});

app.post('/api/exams/:id/cancel-code', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.json({ success: true });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const userId = req.body.userId || 'anonymous';
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.json({ success: true });
    const idx = codeObj.usedBy.findIndex(u => u.userId === userId && !u.completed);
    if (idx !== -1) codeObj.usedBy.splice(idx, 1);
    writeData(data);
    res.json({ success: true });
});

// ========================
// Code-Based Result Save/Retrieve
// ========================
app.post('/api/exams/:examId/code-result', (req, res) => {
    const { code, result } = req.body;
    if (!code || !result) return res.status(400).json({ error: 'Missing code or result' });
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
    if (!codeObj) return res.status(403).json({ error: 'Mã không hợp lệ' });

    const usage = [...codeObj.usedBy].reverse().find(u => !u.completed);
    if (usage) {
        usage.completed = true;
        usage.completedAt = new Date().toISOString();
        usage.score = result.score;
        usage.result = result;
    }
    codeObj.result = { ...result, savedAt: new Date().toISOString() };
    writeData(data);
    res.json({ success: true });
});

app.post('/api/review-by-code', (req, res) => {
    const code = (req.body.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ error: 'Thiếu mã' });
    const data = readData();
    for (const exam of data.exams) {
        const codeObj = (exam.accessCodes || []).find(c => c.code === code);
        if (codeObj) {
            const completed = codeObj.usedBy.filter(u => u.completed && u.result);
            if (completed.length) {
                const results = completed.map(u => ({
                    displayName: u.displayName || u.userId || 'Ẩn danh',
                    completedAt: u.completedAt,
                    score: u.score,
                    result: u.result
                }));
                return res.json({ examId: exam.id, examTitle: exam.title, code, results, count: results.length });
            }
            if (codeObj.result) {
                return res.json({ examId: exam.id, examTitle: exam.title, code, results: [{ displayName: 'Ẩn danh', result: codeObj.result, score: codeObj.result.score }], count: 1 });
            }
        }
    }
    res.status(404).json({ error: 'Không tìm thấy kết quả với mã này' });
});

// ========================
// Export / Import
// ========================
app.get('/api/exams/:id/export', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const exportData = {
        _format: 'easyrevise-exam-v1', _exportedAt: new Date().toISOString(),
        title: exam.title, subject: exam.subject, year: exam.year, sections: exam.sections
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`);
    res.json(exportData);
});

app.post('/api/exams/import', adminOnly, (req, res) => {
    const data = readData();
    const importData = req.body;
    if (!importData || (!importData.sections && !importData.title)) {
        return res.status(400).json({ error: 'Invalid format' });
    }
    const newExam = {
        id: uuidv4(), title: importData.title || 'Đề nhập',
        subject: importData.subject || 'Tiếng Anh', year: importData.year || new Date().getFullYear().toString(),
        sections: importData.sections || [], requireCode: false, accessCodes: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    data.exams.push(newExam);
    writeData(data);
    res.status(201).json(newExam);
});

app.get('/api/export-all', adminOnly, (req, res) => {
    const data = readData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="easyrevise-backup.json"');
    res.json({ _format: 'easyrevise-backup-v1', _exportedAt: new Date().toISOString(), exams: data.exams });
});

// ========================
// Image Upload
// ========================
const multer = require('multer');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`);
    }
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
app.post('/api/history', authMiddleware, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.history) user.history = [];
    user.history.unshift(req.body);
    if (user.history.length > 100) user.history = user.history.slice(0, 100);
    writeUsers(usersData);
    res.json({ success: true });
});

app.get('/api/history', authMiddleware, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    if (!user) return res.json([]);
    res.json(user.history || []);
});

// ========================
// Admin PIN Verification
// ========================
app.post('/api/admin/verify-pin', (req, res) => {
    const settings = readSettings();
    const pin = req.body.pin;
    if (pin === settings.adminPin) res.json({ success: true, sessionHours: settings.pinSessionHours });
    else res.status(403).json({ error: 'PIN không đúng' });
});

// ========================
// Settings
// ========================
app.get('/api/settings', adminOnly, (req, res) => { res.json(readSettings()); });

app.put('/api/settings', adminOnly, (req, res) => {
    const settings = readSettings();
    if (req.body.adminPin !== undefined) settings.adminPin = req.body.adminPin;
    if (req.body.pinSessionHours !== undefined) settings.pinSessionHours = parseInt(req.body.pinSessionHours) || 3;
    if (req.body.codeExpireHours !== undefined) settings.codeExpireHours = parseInt(req.body.codeExpireHours) || 24;
    if (req.body.siteName !== undefined) settings.siteName = req.body.siteName;
    if (req.body.siteDescription !== undefined) settings.siteDescription = req.body.siteDescription;
    writeSettings(settings);
    res.json(settings);
});

app.get('/api/settings/public', (req, res) => {
    const s = readSettings();
    res.json({ siteName: s.siteName, siteDescription: s.siteDescription, codeExpireHours: s.codeExpireHours || 24 });
});

// ========================
// Release stuck code (Admin)
// ========================
app.post('/api/exams/:id/release-code', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(404).json({ error: 'Code not found' });
    // Remove all incomplete usages
    const before = codeObj.usedBy.length;
    codeObj.usedBy = codeObj.usedBy.filter(u => u.completed);
    const removed = before - codeObj.usedBy.length;
    writeData(data);
    res.json({ success: true, released: removed });
});

// ========================
// Code Logs (Admin)
// ========================
app.get('/api/code-logs', adminOnly, (req, res) => {
    const data = readData();
    const logs = [];
    for (const exam of data.exams) {
        for (const code of (exam.accessCodes || [])) {
            for (const usage of (code.usedBy || [])) {
                logs.push({
                    examId: exam.id, examTitle: exam.title,
                    code: code.code, maxUses: code.maxUses || 1,
                    userId: usage.userId, displayName: usage.displayName,
                    usedAt: usage.usedAt, completed: usage.completed,
                    completedAt: usage.completedAt || null,
                    score: usage.score
                });
            }
        }
    }
    logs.sort((a, b) => new Date(b.usedAt) - new Date(a.usedAt));
    res.json(logs);
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
