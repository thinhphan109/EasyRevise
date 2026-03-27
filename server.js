const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

// ========================
// Crash Guard — prevent server shutdown on unhandled errors
// ========================
process.on('uncaughtException', (err) => {
    console.error(`[CRASH PREVENTED] ${new Date().toISOString()}:`, err.message);
    console.error(err.stack);
    // Không gọi process.exit() — server tiếp tục chạy
});
process.on('unhandledRejection', (reason) => {
    console.error(`[CRASH PREVENTED] unhandledRejection:`, String(reason));
});

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'exams.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SUBJECTS_FILE = path.join(__dirname, 'data', 'subjects.json');
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');

// Middleware — safe body parser: trả 413/400 thay vì crash
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
        count += (s.questions || []).length;
    });
    return count;
}

// ========================
// Input Helpers (FIX-6: sanitizeCode + FIX-7: login rate limit)
// ========================
function sanitizeCode(raw) {
    if (!raw || typeof raw !== 'string') return null;
    return raw.toUpperCase().trim();
}

const _loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 3 * 60 * 1000; // 3 minutes
function checkLoginRateLimit(ip) {
    const now = Date.now();
    const rec = _loginAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
        _loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return true;
    }
    rec.count++;
    return rec.count <= LOGIN_MAX;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of _loginAttempts) { if (now > rec.resetAt) _loginAttempts.delete(ip); }
}, 5 * 60 * 1000);

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
    if (process.env.ALLOW_REGISTER !== 'true') {
        return res.status(403).json({ error: 'Đăng ký tài khoản đã bị tắt' });
    }
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
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkLoginRateLimit(ip)) {
        return res.status(429).json({ error: 'Đăng nhập quá nhiều lần. Vui lòng thử lại sau 3 phút.' });
    }
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
        autoGrade: req.body.autoGrade ?? data.exams[index].autoGrade ?? true,
        aiExplainLimit: req.body.aiExplainLimit !== undefined ? req.body.aiExplainLimit : (data.exams[index].aiExplainLimit ?? -1),
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
        images: req.body.images || [],
        optionImages: req.body.optionImages || [null, null, null, null],
        explanationImages: req.body.explanationImages || [],
        video: req.body.video || null, mediaAsHint: !!req.body.mediaAsHint,
        explanationImage: req.body.explanationImage || null,
        explanationVideo: req.body.explanationVideo || null,
        type: req.body.type || null,
        blanks: req.body.blanks || null,
        table: req.body.table || null,
        imageUrl: req.body.imageUrl || null,
        imageRegion: req.body.imageRegion || null
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
    const maxAttempts = parseInt(req.body.maxAttempts) || 0; // 0 = unlimited
    const newCodes = [];
    for (let i = 0; i < count; i++) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        newCodes.push({ code, maxUses, maxAttempts, usedBy: [], createdAt: new Date().toISOString() });
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

    // Check maxAttempts per student
    const userId2 = (req.body.userId || 'anonymous');
    if (codeObj.maxAttempts && codeObj.maxAttempts > 0) {
        const studentAttempts = codeObj.usedBy.filter(u => u.userId === userId2 && u.completed).length;
        if (studentAttempts >= codeObj.maxAttempts) {
            return res.status(403).json({ error: `Bạn đã hết lượt làm bài (tối đa ${codeObj.maxAttempts} lần)` });
        }
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
// QR Preview: get exam info + code history WITHOUT consuming slot
// ========================
app.post('/api/exams/:id/preview-code', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Đề thi không tồn tại' });

    const inputCode = (req.body.code || '').toUpperCase().trim();
    const codeObj = (exam.accessCodes || []).find(c => c.code === inputCode);
    if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });

    const maxUses = codeObj.maxUses || (codeObj.type === 'single-use' ? 1 : 999);
    const completedUses = (codeObj.usedBy || []).filter(u => u.completed);
    const inProgressUses = (codeObj.usedBy || []).filter(u => !u.completed);
    const usedCount = completedUses.length;
    const isFull = usedCount >= maxUses;

    // Build history list from completed uses
    const history = completedUses.map(u => ({
        displayName: u.displayName || u.userId || 'Ẩn danh',
        completedAt: u.completedAt,
        score: u.score,
        result: u.result ? { correct: u.result.correct, total: u.result.total, timeSpent: u.result.timeSpent } : null
    }));

    // In-progress list
    const inProgress = inProgressUses.map(u => ({
        displayName: u.displayName || u.userId || 'Ẩn danh',
        startedAt: u.startedAt
    }));

    res.json({
        exam: {
            id: exam.id,
            title: exam.title,
            subject: exam.subject,
            year: exam.year,
            totalQuestions: countQuestions(exam),
            sectionCount: exam.sections.length,
            timeLimit: exam.timeLimit || 0
        },
        code: inputCode,
        maxUses,
        usedCount,
        isFull,
        history,
        inProgress
    });
});

// ========================
// Code-Based Result Save/Retrieve
// ========================
app.post('/api/exams/:examId/code-result', async (req, res) => {
    const { code, result, displayName: bodyDisplayName } = req.body;
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
        // TN3: save displayName if provided (guest name or logged-in user)
        if (bodyDisplayName) usage.displayName = bodyDisplayName;
        if (!usage.essayGrades) usage.essayGrades = [];
    }
    codeObj.result = { ...result, savedAt: new Date().toISOString() };
    writeData(data);

    // Respond immediately — don't wait for AI
    res.json({ success: true });

    // ——— Background auto-grading ———
    if (!usage) return;

    const essayResults = (result.results || []).filter(r => r.isEssay);
    const fillResults = (result.results || []).filter(r => r.isFillBlank);

    // 1) Fill-in-blank: grade by comparison (instant, no AI needed)
    if (fillResults.length > 0) {
        try {
            const freshData = readData();
            const freshExam = freshData.exams.find(e => e.id === req.params.examId);
            const freshCode = (freshExam?.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
            const freshUsage = freshCode?.usedBy.find(u => u.userId === usage.userId && u.completed && u.completedAt === usage.completedAt);
            if (freshUsage) {
                if (!freshUsage.essayGrades) freshUsage.essayGrades = [];
                for (const r of fillResults) {
                    // Find section for this fill-in-blank
                    const section = freshExam.sections.find(s => s.questions?.some(q => String(q.id) === String(r.id)));
                    const question = section?.questions?.find(q => String(q.id) === String(r.id));
                    if (!question || !question.blanks) continue;

                    const blanks = question.blanks || [];
                    const answers = r.userAnswer || {};
                    let correct = 0;
                    blanks.forEach((blank, i) => {
                        const given = (String(answers[i] ?? '')).trim();
                        const expected = String(blank.answer || '').trim();
                        if (blank.type === 'int') { if (parseInt(given) === parseInt(expected)) correct++; }
                        else if (blank.type === 'float') { if (Math.abs(parseFloat(given) - parseFloat(expected)) <= 0.01) correct++; }
                        else { if (given.toLowerCase() === expected.toLowerCase()) correct++; }
                    });

                    const score = blanks.length > 0 ? parseFloat(((correct / blanks.length) * 10).toFixed(1)) : 0;
                    let grade = freshUsage.essayGrades.find(g => g.questionId === r.id);
                    if (!grade) { grade = { questionId: r.id }; freshUsage.essayGrades.push(grade); }
                    grade.aiScore = score;
                    grade.aiMaxScore = 10;
                    grade.aiFeedback = `Đúng ${correct}/${blanks.length} ô trống`;
                    grade.aiGradedAt = new Date().toISOString();
                    grade.gradedByAi = false; // comparison, not AI
                }
                writeData(freshData);
                console.log(`[AutoGrade] Fill-in-blank graded for ${usage.userId}`);
            }
        } catch (e) { console.error('[AutoGrade] Fill-blank error:', e.message); }
    }

    // 2) Essay: call AI grader asynchronously (only if exam.autoGrade !== false)
    if (essayResults.length === 0) return;
    if (exam.autoGrade === false) {
        console.log(`[AutoGrade] Skipped for exam ${req.params.examId} (autoGrade disabled)`);
        return;
    }
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) { console.log('[AutoGrade] No API key, skipping essay AI'); return; }

    for (const r of essayResults) {
        try {
            // FIX-3: tìm section CHỨA câu hỏi này trước; fallback mới dùng type
            const section = exam.sections.find(s =>
                s.id === r.id ||
                (s.questions || []).some(q => String(q.id) === String(r.id))
            ) || exam.sections.find(s => s.type === 'writing-essay' || s.type === 'free-form');
            if (!section) continue;

            const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
            const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
            const settings = readSettings();
            const model = settings.gradeModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
            const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

            const userContent = [];

            // Attach images from student submission
            if (r.attachments && r.attachments.length > 0) {
                for (const attUrl of r.attachments) {
                    if (attUrl.match(/\.(jpg|jpeg|png|webp)$/i)) {
                        try {
                            const filePath = path.join(__dirname, 'public', attUrl);
                            if (fs.existsSync(filePath)) {
                                const imgBuffer = fs.readFileSync(filePath);
                                const resized = await sharp(imgBuffer)
                                    .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
                                    .jpeg({ quality: 85 }).toBuffer();
                                const base64 = resized.toString('base64');
                                if (sdkType === 'openai') {
                                    userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
                                } else {
                                    userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });
                                }
                            }
                        } catch (imgErr) { console.error('[AutoGrade] Image err:', imgErr.message); }
                    }
                }
            }

            // FIX-4: fallback qua nhiều field name (free-form dùng instruction, không phải prompt)
            const sectionPrompt = section.prompt
                || section.instruction
                || section.essayPrompt
                || section.passage
                || '(không có)';
            const sectionSample = section.sampleAnswer
                || section.sampleEssay
                || section.expectedAnswer
                || '(không có)';

            const gradingPrompt = `Bạn là giáo viên chấm bài. Hãy chấm bài tự luận sau theo thang 10 điểm.

Câu hỏi/Đề bài: ${sectionPrompt}
Đáp án mẫu: ${sectionSample}

Bài làm của học sinh:
${r.userAnswer || '(Học sinh không viết gì)'}
${r.attachments?.length > 0 ? '(Có ảnh bài làm đính kèm phía trên)' : ''}

Trả về JSON (KHÔNG có text bên ngoài JSON):
{ "score": 7.5, "maxScore": 10, "feedback": "Nhận xét chi tiết...", "breakdown": "Ý 1: X điểm - ..." }`;

            userContent.push({ type: 'text', text: gradingPrompt });

            let aiText = '';
            if (sdkType === 'openai') {
                const OpenAI = require('openai');
                const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 90000, defaultHeaders: CUSTOM_HEADERS });
                const completion = await openai.chat.completions.create({
                    model, max_tokens: 1024,
                    messages: [{ role: 'user', content: userContent }]
                });
                aiText = completion.choices?.[0]?.message?.content || '';
            } else {
                const Anthropic = require('@anthropic-ai/sdk');
                const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 90000, defaultHeaders: CUSTOM_HEADERS });
                const msg = await client.messages.create({
                    model, max_tokens: 1024,
                    messages: [{ role: 'user', content: userContent }]
                });
                aiText = msg.content?.[0]?.text || '';
            }

            // Parse result
            let jsonStr = aiText;
            const jm = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jm) jsonStr = jm[1];
            const js = jsonStr.indexOf('{'), je = jsonStr.lastIndexOf('}');
            if (js !== -1 && je !== -1) jsonStr = jsonStr.substring(js, je + 1);

            let gradeResult;
            try { gradeResult = JSON.parse(jsonStr); } catch (e) { gradeResult = { score: null, maxScore: 10, feedback: 'Không parse được kết quả AI' }; }

            // Save into usage
            const freshData2 = readData();
            const freshExam2 = freshData2.exams.find(e => e.id === req.params.examId);
            const freshCode2 = (freshExam2?.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
            const freshUsage2 = freshCode2?.usedBy.find(u => u.userId === usage.userId && u.completed && u.completedAt === usage.completedAt);
            if (freshUsage2) {
                if (!freshUsage2.essayGrades) freshUsage2.essayGrades = [];
                let grade = freshUsage2.essayGrades.find(g => g.questionId === r.id);
                if (!grade) { grade = { questionId: r.id }; freshUsage2.essayGrades.push(grade); }
                grade.aiScore = gradeResult.score;
                grade.aiMaxScore = gradeResult.maxScore || 10;
                grade.aiFeedback = gradeResult.feedback;
                grade.aiBreakdown = gradeResult.breakdown;
                grade.aiGradedAt = new Date().toISOString();
                grade.gradedByAi = true;
                writeData(freshData2);
                console.log(`[AutoGrade] Essay AI graded for ${usage.userId} q=${r.id}: ${gradeResult.score}/10`);
            }
        } catch (e) { console.error(`[AutoGrade] Essay error q=${r.id}:`, e.message); }
    }
});

// ========================
// Student: Get my auto-grade results (poll after submit)
// ========================
app.get('/api/exams/:examId/my-grades', (req, res) => {
    const { code, userId } = req.query;
    if (!code) return res.status(400).json({ error: 'Thiếu mã' });
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
    if (!codeObj) return res.status(404).json({ error: 'Code not found' });

    // Find the latest completed usage (optionally by userId)
    let usage;
    if (userId) {
        usage = [...codeObj.usedBy].reverse().find(u => u.userId === userId && u.completed);
    } else {
        usage = [...codeObj.usedBy].reverse().find(u => u.completed);
    }

    if (!usage) return res.json({ grades: [], pending: false });

    const grades = usage.essayGrades || [];
    // Figure out if still pending: check if essay questions haven't been graded yet
    const essayResults = (usage.result?.results || []).filter(r => r.isEssay);
    const allGraded = essayResults.every(r => grades.find(g => g.questionId === r.id && g.aiScore !== null && g.aiScore !== undefined));
    const pending = essayResults.length > 0 && !allGraded;

    res.json({ grades, pending, totalEssays: essayResults.length });
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
const upload = multer({
    storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

app.post('/api/upload', adminOnly, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
});

// ========================
// OCR — Image to Text
// ========================
const ocrUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Chỉ hỗ trợ file ảnh'));
    }
});

app.post('/api/admin/ocr', adminOnly, ocrUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Không có ảnh' });

        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'CLAUDE_API_KEY chưa cấu hình' });

        const resized = await sharp(req.file.buffer)
            .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        const base64 = resized.toString('base64');

        const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
        const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
        const settings = readSettings();
        const model = settings.ocrModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
        const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

        const ocrPrompt = 'Trích xuất chính xác toàn bộ văn bản trong ảnh. Công thức toán viết dạng LaTeX: inline dùng $...$, block dùng $$...$$. Chỉ trả về nội dung thuần, không giải thích thêm.';

        let text = '';
        if (sdkType === 'openai') {
            const OpenAI = require('openai');
            const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const completion = await openai.chat.completions.create({
                model, max_tokens: 4096,
                messages: [{
                    role: 'user', content: [
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
                        { type: 'text', text: ocrPrompt }
                    ]
                }]
            });
            text = completion.choices?.[0]?.message?.content || '';
        } else {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const msg = await client.messages.create({
                model, max_tokens: 4096,
                messages: [{
                    role: 'user', content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
                        { type: 'text', text: ocrPrompt }
                    ]
                }]
            });
            text = msg.content?.[0]?.text || '';
        }

        res.json({ text: text.trim() });
    } catch (err) {
        console.error('OCR error:', err.message);
        res.status(500).json({ error: 'OCR thất bại: ' + err.message });
    }
});

// ========================
// AI Exam Generator
// ========================
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Multer for AI files (PDF, images, DOCX)
const aiUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
        if (allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Chỉ hỗ trợ PDF, ảnh (JPG/PNG), hoặc DOCX'));
    }
});

// Subject-specific prompt hints
const SUBJECT_PROMPTS = {
    'english': 'Đây là đề thi Tiếng Anh. Chú ý: pronunciation, stress pattern, grammar, vocabulary, reading comprehension, writing. Giải thích bằng tiếng Việt, có ví dụ và quy tắc ngữ pháp.',
    'math': 'Đây là đề thi Toán học. Chú ý: giải chi tiết từng bước, ghi rõ công thức áp dụng. Sử dụng ký hiệu LaTeX cho công thức: $...$ cho inline, $$...$$ cho block. VD: $\\frac{a}{b}$, $\\sqrt{x}$, $x^2$. Nếu là trắc nghiệm, giải thích tại sao các đáp án khác sai.',
    'physics': 'Đây là đề thi Vật lý. Chú ý: ghi rõ công thức, đơn vị, giải thích hiện tượng vật lý liên quan. Nếu có bài tính toán, trình bày lời giải chi tiết.',
    'chemistry': 'Đây là đề thi Hóa học. Chú ý: phương trình hóa học phải cân bằng, ghi rõ điều kiện phản ứng, giải thích cơ chế nếu cần.',
    'biology': 'Đây là đề thi Sinh học. Chú ý: giải thích cơ chế sinh học, sử dụng thuật ngữ chính xác, mở rộng kiến thức liên quan đến chương trình.',
    'history': 'Đây là đề thi Lịch sử. Chú ý: ghi rõ mốc thời gian, sự kiện, nhân vật liên quan. Giải thích bối cảnh và ý nghĩa lịch sử.',
    'geography': 'Đây là đề thi Địa lý. Chú ý: dữ liệu thống kê, vị trí địa lý, đặc điểm tự nhiên/kinh tế. Giải thích mối liên hệ giữa các yếu tố.',
    'literature': 'Đây là đề thi Ngữ văn. Chú ý: phân tích tác phẩm, biện pháp tu từ, ý nghĩa nội dung và nghệ thuật. Đề viết luận cần có bài mẫu.',
    'it': 'Đây là đề thi Tin học. Chú ý: thuật toán, cấu trúc dữ liệu, lập trình. Giải thích rõ logic và có ví dụ minh họa.',
    'auto': 'Tự phát hiện môn học từ nội dung đề thi và giải thích phù hợp.'
};

app.post('/api/admin/ai-generate', adminOnly, aiUpload.array('files', 10), async (req, res) => {
    try {
        const { title, subject, year, subjectType, sdkType: reqSdkType, model: reqModel } = req.body;
        const files = req.files;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'Vui lòng upload ít nhất 1 file' });
        }

        // Process files
        const contentParts = []; // text parts
        const imageParts = [];  // base64 image parts for vision

        for (const file of files) {
            if (file.mimetype === 'application/pdf') {
                // 1) Extract text (fallback for text-based PDFs)
                try {
                    const pdfData = await pdfParse(file.buffer);
                    if (pdfData.text && pdfData.text.trim().length > 50) {
                        contentParts.push(`[PDF: ${file.originalname}]\n${pdfData.text}`);
                        console.log(`PDF text extracted: ${pdfData.text.length} chars`);
                    }
                } catch (e) { /* silent — may be a scanned PDF */ }

                // 2) Convert pages to images → send to AI vision (handles scans, diagrams, math)
                try {
                    const { pdfToPng } = require('pdf-to-png-converter');
                    const pages = await pdfToPng(file.buffer, {
                        disableFontFace: true,
                        useSystemFonts: true,
                        viewportScale: 1.5,
                        pagesToProcess: [1, 2, 3, 4, 5]
                    });
                    console.log(`PDF ${file.originalname}: ${pages.length} pages converted to images`);
                    for (const page of pages) {
                        const compressed = await sharp(page.content)
                            .resize({ width: 1400, fit: 'inside', withoutEnlargement: true })
                            .jpeg({ quality: 82 })
                            .toBuffer();
                        const base64 = compressed.toString('base64');
                        imageParts.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });
                        console.log(`  Page ${page.pageNumber}: ${(compressed.length / 1024).toFixed(0)}KB`);
                    }
                } catch (pdfImgErr) {
                    console.error(`PDF→image error for ${file.originalname}:`, pdfImgErr.message);
                    // Fallback: if we didn't get any text either, note it
                    if (!contentParts.some(p => p.includes(file.originalname))) {
                        contentParts.push(`[PDF: ${file.originalname}] - Không đọc được (cần text hoặc ảnh).`);
                    }
                }
            } else if (file.mimetype.startsWith('image/')) {
                try {
                    // Resize & compress image to avoid 502 from oversized payloads
                    const resized = await sharp(file.buffer)
                        .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();
                    const base64 = resized.toString('base64');
                    console.log(`Image ${file.originalname}: ${(file.buffer.length / 1024).toFixed(0)}KB → ${(resized.length / 1024).toFixed(0)}KB`);
                    imageParts.push({
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
                    });
                } catch (imgErr) {
                    console.error('Image resize error:', imgErr.message);
                    // Fallback: send original
                    const base64 = file.buffer.toString('base64');
                    imageParts.push({
                        type: 'image',
                        source: { type: 'base64', media_type: file.mimetype, data: base64 }
                    });
                }
            } else if (file.mimetype.includes('wordprocessingml')) {
                try {
                    const result = await mammoth.extractRawText({ buffer: file.buffer });
                    contentParts.push(`[DOCX: ${file.originalname}]\n${result.value}`);
                } catch (e) {
                    contentParts.push(`[DOCX: ${file.originalname}] - Không đọc được nội dung.`);
                }
            }
        }

        const extractedText = contentParts.join('\n\n---\n\n');
        const subjectHint = SUBJECT_PROMPTS[subjectType || 'auto'] || SUBJECT_PROMPTS['auto'];

        // Build Claude messages
        const systemPrompt = `Bạn là trợ lý AI chuyên tạo đề thi cho hệ thống EasyRevise. 
${subjectHint}

QUY TẮC BẮT BUỘC:
1. Phát hiện tự động loại section từ các loại sau:
   - "multiple-choice": câu trắc nghiệm 4 lựa chọn A/B/C/D
   - "reading": đọc hiểu, có đoạn văn (passage) kèm câu hỏi trắc nghiệm
   - "writing-choice": viết có lựa chọn đáp án
   - "writing-essay": viết luận, tự do
   - "fill-in-blank": điền vào chỗ trống ___, dùng khi đề có dạng: điền từ, điền số, hoàn thành câu
   - "free-form": câu tự luận có nhiều phần a, b, c (yêu cầu lời giải)
2. Nếu đề CÓ đáp án → sử dụng đáp án đó
3. Nếu đề KHÔNG CÓ đáp án → tự giải và cung cấp correctAnswer chính xác
4. correctAnswer: 0=A, 1=B, 2=C, 3=D
5. "explanation": giải thích chi tiết bằng tiếng Việt, dễ hiểu cho học sinh cấp trung học
6. "expansion": kiến thức mở rộng liên quan (quy tắc, công thức, cấu trúc, ví dụ thêm)
7. Với reading: bao gồm trường "passage" chứa đoạn văn/bài đọc
8. Với writing-essay: bao gồm "prompt", "cues" (array), "sampleAnswer"
9. Với fill-in-blank: mỗi câu có trường "blanks": [{"index":0,"answer":"...","type":"text|int|float"}]
   - Câu hỏi dùng ___ để đánh dấu chỗ trống
10. Với free-form: mỗi câu có trường "subParts": [{"label":"a","question":"...","sampleAnswer":"..."}]
11. Các section phải theo đúng thứ tự trong đề gốc
12. ID câu hỏi bắt đầu từ 1 và tăng dần liên tục

HÌNH ẢNH/BIỂU ĐỒ TRONG ĐỀ:
- Nếu câu hỏi CÓ hình vẽ, sơ đồ hình học → thêm trường "imageRegion"
- imageRegion: { "imageIndex": 0, "topPercent": %, "heightPercent": %, "description": "mô tả chi tiết" }

BẢNG SỐ LIỆU TRONG ĐỀ:
- Nếu câu hỏi CÓ bảng số liệu → thêm trường "table"
- table: { "headers": ["Cột 1", "Cột 2", ...], "rows": [[giá trị,...], ...] }
- Ví dụ bảng 4x8 không có header → headers=[] và rows có 4 mảng, mỗi mảng 8 phần tử
- Nếu bảng có header (hàng đầu là tiêu đề) → headers chứa tiêu đề, rows chứa dữ liệu
- QUAN TRỌNG: trích xuất CHÍNH XÁC mọi giá trị trong bảng

CÔNG THỨC TOÁN (QUAN TRỌNG - BẮT BUỘC):
- PHẢI dùng LaTeX cho mọi công thức toán học:
  * Inline: $...$ — VD: $x^2 + 2x + 1 = 0$, $\\sqrt{x}$, $\\frac{a}{b}$
  * Block: $$...$$ — VD: $$\\frac{a}{b} = c$$, $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
- KHÔNG dùng: x^2, sqrt(x), x² (unicode superscript), phân số dạng a/b thuần text
- Ví dụ đúng: "Phương trình $x^2 - 5x + 6 = 0$ có hai nghiệm $x_1, x_2$"
- Ví dụ đúng: "Diện tích hình tròn $S = \\pi r^2$"

OUTPUT: Chỉ trả về JSON, không có text giải thích bên ngoài.
SCHEMA:
{
  "_format": "easyrevise-exam-v1",
  "exam": {
    "title": "Tên đề thi",
    "subject": "Tên môn",
    "year": "Năm học",
    "sections": [
      {
        "title": "Tên phần",
        "instruction": "Hướng dẫn",
        "type": "multiple-choice|reading|writing-choice|writing-essay|fill-in-blank|free-form",
        "passage": "(nếu reading)",
        "questions": [
          {
            "id": 1,
            "question": "Nội dung câu hỏi (dùng ___ cho fill-in-blank)",
            "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
            "correctAnswer": 0,
            "explanation": "Giải thích chi tiết",
            "expansion": "Kiến thức mở rộng",
            "blanks": [{"index": 0, "answer": "goes", "type": "text"}],
            "subParts": [{"label": "a", "question": "Tính...", "sampleAnswer": "..."}],
            "table": { "headers": [], "rows": [[1,0,3,0,5,3,2,1],[0,1,2,4,1,2,3,4]] },
            "imageRegion": { "imageIndex": 0, "topPercent": 60, "heightPercent": 30, "description": "Mô tả hình" }
          }
        ]
      }
    ]
  }
}`;

        // Build user message content (Anthropic native format for vision)
        const userContent = [];

        // Add images (Anthropic native base64 format - supports vision)
        for (const img of imageParts) {
            userContent.push(img); // Already in { type: 'image', source: { type: 'base64', ... } } format
        }

        // Add text
        let textPrompt = 'Phân tích nội dung đề thi dưới đây và tạo JSON theo format EasyRevise.\n\n';
        if (title) textPrompt += `Tên đề: ${title}\n`;
        if (subject) textPrompt += `Môn: ${subject}\n`;
        if (year) textPrompt += `Năm học: ${year}\n`;
        textPrompt += '\nNỘI DUNG ĐỀ THI:\n';
        if (extractedText.trim()) {
            textPrompt += extractedText;
        } else if (imageParts.length > 0) {
            textPrompt += '(Nội dung đề thi nằm trong các ảnh đính kèm phía trên)';
        }
        userContent.push({ type: 'text', text: textPrompt });

        // Determine SDK type: request param > env > default
        const sdkType = reqSdkType || process.env.CLAUDE_SDK_TYPE || 'anthropic';
        const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
        const apiKey = process.env.CLAUDE_API_KEY;
        const settingsData = readSettings();
        const model = reqModel || settingsData.generateModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
        const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

        if (!apiKey) {
            return res.status(500).json({ error: 'CLAUDE_API_KEY chưa được cấu hình trong .env' });
        }

        console.log(`Using ${sdkType.toUpperCase()} SDK | Model: ${model}`);

        // Retry logic (3 attempts)
        let aiText = '';
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`AI API attempt ${attempt}/${MAX_RETRIES} (${sdkType})...`);

                if (sdkType === 'openai') {
                    // === OpenAI SDK ===
                    const OpenAI = require('openai');
                    const openai = new OpenAI({
                        baseURL: `${baseUrl}/v1`,
                        apiKey: apiKey,
                        timeout: 5 * 60 * 1000,
                        defaultHeaders: CUSTOM_HEADERS
                    });
                    // Convert Anthropic image format to OpenAI format
                    const openaiContent = userContent.map(p => {
                        if (p.type === 'image') {
                            return { type: 'image_url', image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } };
                        }
                        return p; // text parts stay same
                    });
                    const completion = await openai.chat.completions.create({
                        model,
                        max_tokens: 64000,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: openaiContent }
                        ]
                    });
                    aiText = completion.choices?.[0]?.message?.content || '';
                } else {
                    // === Anthropic SDK (default) — using streaming ===
                    const Anthropic = require('@anthropic-ai/sdk');
                    const client = new Anthropic({
                        baseURL: baseUrl,
                        apiKey: apiKey,
                        timeout: 10 * 60 * 1000,
                        defaultHeaders: CUSTOM_HEADERS
                    });
                    const stream = client.messages.stream({
                        model,
                        max_tokens: 64000,
                        system: systemPrompt,
                        messages: [{ role: 'user', content: userContent }]
                    });
                    const finalMessage = await stream.finalMessage();
                    aiText = finalMessage.content?.[0]?.text || '';
                }
                break; // success
            } catch (apiErr) {
                console.error(`Claude API error (attempt ${attempt}):`, apiErr.message);
                if (attempt < MAX_RETRIES) {
                    console.log('Retrying in 2s...');
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    return res.status(502).json({ error: `Lỗi từ AI API sau ${MAX_RETRIES} lần thử (${sdkType})`, detail: apiErr.message });
                }
            }
        }

        // Parse JSON from response (handle markdown code blocks)
        let jsonStr = aiText;
        const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        // Try to find JSON object
        const jsonStart = jsonStr.indexOf('{');
        const jsonEnd = jsonStr.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            return res.status(422).json({
                error: 'AI trả về JSON không hợp lệ. Vui lòng thử lại.',
                raw: aiText.substring(0, 2000)
            });
        }

        // Validate format
        if (!parsed._format || !parsed.exam || !parsed.exam.sections) {
            return res.status(422).json({
                error: 'AI trả về JSON không đúng format EasyRevise.',
                data: parsed
            });
        }

        // Override with user-provided values if present
        if (title) parsed.exam.title = title;
        if (subject) parsed.exam.subject = subject;
        if (year) parsed.exam.year = year;

        // Post-process: crop imageRegion from original images
        if (imageParts.length > 0) {
            const uploadsDir = path.join(__dirname, 'public', 'uploads', 'ai-images');
            if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

            for (const section of parsed.exam.sections) {
                if (!section.questions) continue;
                for (const q of section.questions) {
                    if (q.imageRegion && typeof q.imageRegion.imageIndex === 'number') {
                        try {
                            const imgIdx = Math.min(q.imageRegion.imageIndex, imageParts.length - 1);
                            const imgData = Buffer.from(imageParts[imgIdx].source.data, 'base64');
                            const metadata = await sharp(imgData).metadata();

                            const top = Math.round((q.imageRegion.topPercent / 100) * metadata.height);
                            const height = Math.round((q.imageRegion.heightPercent / 100) * metadata.height);
                            const cropTop = Math.max(0, Math.min(top, metadata.height - 1));
                            const cropHeight = Math.min(height, metadata.height - cropTop);

                            if (cropHeight > 10) {
                                const cropped = await sharp(imgData)
                                    .extract({ left: 0, top: cropTop, width: metadata.width, height: cropHeight })
                                    .jpeg({ quality: 85 })
                                    .toBuffer();

                                const filename = `q${q.id}_${Date.now()}.jpg`;
                                fs.writeFileSync(path.join(uploadsDir, filename), cropped);
                                q.imageUrl = `/uploads/ai-images/${filename}`;
                                console.log(`Cropped image for Q${q.id}: ${filename} (${(cropped.length / 1024).toFixed(0)}KB)`);
                            }
                        } catch (cropErr) {
                            console.error(`Failed to crop image for Q${q.id}:`, cropErr.message);
                        }
                    }
                }
            }
        }

        res.json({ success: true, data: parsed });

    } catch (err) {
        console.error('AI Generate error:', err);
        res.status(500).json({ error: 'Lỗi server khi xử lý AI: ' + err.message });
    }
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
    if (req.body.generateModel !== undefined) settings.generateModel = req.body.generateModel;
    if (req.body.gradeModel !== undefined) settings.gradeModel = req.body.gradeModel;
    if (req.body.ocrModel !== undefined) settings.ocrModel = req.body.ocrModel;
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
// Phase 3: Submission Upload (Student)
// ========================
const submissionsDir = path.join(__dirname, 'public', 'uploads', 'submissions');
if (!fs.existsSync(submissionsDir)) fs.mkdirSync(submissionsDir, { recursive: true });

const submissionUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, submissionsDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            cb(null, `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|webp)$/.test(file.mimetype) || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ hỗ trợ JPG, PNG, WebP hoặc PDF'));
        }
    }
});

app.post('/api/upload-submission', submissionUpload.single('file'), (req, res) => {
    // Security: validate examId + code before accepting file
    const examId = req.body.examId;
    const code = (req.body.code || '').toUpperCase().trim();
    if (!examId || !code) {
        // Also accept if user is logged in (token-based)
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(400).json({ error: 'Thiếu examId hoặc mã kích hoạt' });
        }
        // Logged-in user — skip code check (teacher/student with account)
    } else {
        const data = readData();
        const exam = data.exams.find(e => e.id === examId);
        if (!exam) return res.status(403).json({ error: 'Đề thi không hợp lệ' });
        const codeObj = (exam.accessCodes || []).find(c => c.code === code);
        if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });
    }

    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    res.json({ url: `/uploads/submissions/${req.file.filename}` });
});

// ========================
// Phase 3: Admin — View Submissions
// ========================
app.get('/api/admin/submissions', adminOnly, (req, res) => {
    const { examId } = req.query;
    const data = readData();
    const exams = examId ? data.exams.filter(e => e.id === examId) : data.exams;
    const submissions = [];

    for (const exam of exams) {
        for (const code of (exam.accessCodes || [])) {
            for (const usage of (code.usedBy || [])) {
                if (!usage.completed || !usage.result) continue;
                // Collect essay answers from the result
                const essayResults = (usage.result.results || []).filter(r => r.isEssay);
                if (essayResults.length === 0) continue;

                const enrichedEssays = essayResults.map(r => {
                    // Find the section for sampleAnswer
                    const section = exam.sections.find(s => s.id === r.id || s.type === 'writing-essay' || s.type === 'free-form');
                    const gradeEntry = (usage.essayGrades || []).find(g => g.questionId === r.id);
                    return {
                        questionId: r.id,
                        sectionTitle: section ? section.title : r.id,
                        prompt: section ? section.prompt : null,
                        sampleAnswer: section ? section.sampleAnswer : null,
                        studentAnswer: r.userAnswer || '',
                        attachments: r.attachments || [],
                        aiScore: gradeEntry ? gradeEntry.aiScore : null,
                        aiMaxScore: gradeEntry ? gradeEntry.aiMaxScore : 10,
                        aiFeedback: gradeEntry ? gradeEntry.aiFeedback : null,
                        teacherScore: gradeEntry ? gradeEntry.teacherScore : null,
                        teacherFeedback: gradeEntry ? gradeEntry.teacherFeedback : null,
                        reviewedAt: gradeEntry ? gradeEntry.reviewedAt : null
                    };
                });

                submissions.push({
                    examId: exam.id,
                    examTitle: exam.title,
                    code: code.code,
                    userId: usage.userId,
                    displayName: usage.displayName || usage.userId,
                    completedAt: usage.completedAt,
                    mcScore: usage.score,
                    essays: enrichedEssays
                });
            }
            // Also include open submissions (no-code exams)
            for (const usage of (exam.openSubmissions || [])) {
                if (!usage.completed && !usage.result) continue;
                const res_usage = usage.result || {};
                const essayResults = (res_usage.results || []).filter(r => r.isEssay);
                if (essayResults.length === 0) continue;

                const enrichedEssays = essayResults.map(r => {
                    const section = exam.sections.find(s => s.id === r.id || s.type === 'writing-essay' || s.type === 'free-form');
                    const gradeEntry = (usage.essayGrades || []).find(g => g.questionId === r.id);
                    return {
                        questionId: r.id,
                        sectionTitle: section ? section.title : r.id,
                        prompt: section ? section.prompt : null,
                        sampleAnswer: section ? section.sampleAnswer : null,
                        studentAnswer: r.userAnswer || '',
                        attachments: r.attachments || [],
                        aiScore: gradeEntry ? gradeEntry.aiScore : null,
                        aiMaxScore: gradeEntry ? gradeEntry.aiMaxScore : 10,
                        aiFeedback: gradeEntry ? gradeEntry.aiFeedback : null,
                        teacherScore: gradeEntry ? gradeEntry.teacherScore : null,
                        teacherFeedback: gradeEntry ? gradeEntry.teacherFeedback : null,
                        reviewedAt: gradeEntry ? gradeEntry.reviewedAt : null
                    };
                });

                submissions.push({
                    examId: exam.id,
                    examTitle: exam.title,
                    code: null,  // no code — open exam
                    source: 'open',
                    userId: usage.userId,
                    displayName: usage.displayName || usage.userId,
                    completedAt: usage.completedAt,
                    mcScore: usage.score,
                    essays: enrichedEssays
                });
            }
        }
    }

    submissions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    res.json(submissions);
});

// ========================
// Open Exam Result Save (no code required)
// ========================
app.post('/api/exams/:examId/open-result', (req, res) => {
    const { result, userId, displayName } = req.body;
    if (!result) return res.status(400).json({ error: 'Thiếu kết quả' });
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (!exam.openSubmissions) exam.openSubmissions = [];

    const entry = {
        userId: userId || 'anonymous',
        displayName: displayName || userId || 'Ẩn danh',
        completedAt: new Date().toISOString(),
        score: result.score,
        result,
        essayGrades: []
    };
    exam.openSubmissions.push(entry);
    // Keep last 500
    if (exam.openSubmissions.length > 500) exam.openSubmissions = exam.openSubmissions.slice(-500);
    writeData(data);
    res.json({ success: true });
});


// ========================
// Phase 3: Admin — Review Submission (Teacher Score)
// ========================
app.post('/api/admin/submissions/review', adminOnly, (req, res) => {
    const { examId, code, userId, questionId, teacherScore, teacherFeedback } = req.body;
    if (!examId || !code || !userId || !questionId) {
        return res.status(400).json({ error: 'Thiếu thông tin' });
    }
    const data = readData();
    const exam = data.exams.find(e => e.id === examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase());
    if (!codeObj) return res.status(404).json({ error: 'Code not found' });
    const usage = codeObj.usedBy.find(u => u.userId === userId && u.completed);
    if (!usage) return res.status(404).json({ error: 'Bài nộp không tìm thấy' });
    if (!usage.essayGrades) usage.essayGrades = [];
    let grade = usage.essayGrades.find(g => g.questionId === questionId);
    if (!grade) {
        grade = { questionId };
        usage.essayGrades.push(grade);
    }
    if (teacherScore !== undefined && teacherScore !== null) grade.teacherScore = parseFloat(teacherScore);
    if (teacherFeedback !== undefined) grade.teacherFeedback = teacherFeedback;
    grade.reviewedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true, grade });
});

// ========================
// Phase 3: Admin — AI Grade Essay
// ========================
app.post('/api/admin/ai-grade-essay', adminOnly, async (req, res) => {
    try {
        const { examId, code, userId, questionId, studentAnswer, attachments, sampleAnswer, prompt } = req.body;

        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'CLAUDE_API_KEY chưa cấu hình' });

        const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
        const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
        const settings = readSettings();
        const model = settings.gradeModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
        const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

        // Build message content
        const userContent = [];

        // Attach images if any
        if (attachments && attachments.length > 0) {
            for (const attUrl of attachments) {
                if (attUrl.match(/\.(jpg|jpeg|png|webp)$/i)) {
                    try {
                        const filePath = path.join(__dirname, 'public', attUrl);
                        if (fs.existsSync(filePath)) {
                            const imgBuffer = fs.readFileSync(filePath);
                            const resized = await sharp(imgBuffer)
                                .resize({ width: 1200, height: 1600, fit: 'inside', withoutEnlargement: true })
                                .jpeg({ quality: 85 }).toBuffer();
                            const base64 = resized.toString('base64');
                            if (sdkType === 'openai') {
                                userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
                            } else {
                                userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });
                            }
                        }
                    } catch (imgErr) { console.error('AI grade image error:', imgErr.message); }
                }
            }
        }

        const gradingPrompt = `Bạn là giáo viên chấm bài. Hãy chấm bài tự luận sau theo thang 10 điểm.

Câu hỏi/Đề bài: ${prompt || '(không có)'}
Đáp án mẫu: ${sampleAnswer || '(không có)'}

Bài làm của học sinh:
${studentAnswer || '(Học sinh không viết gì)'}
${attachments && attachments.length > 0 ? '(Có ảnh bài làm đính kèm phía trên)' : ''}

Hãy chấm điểm và trả về JSON với format sau (KHÔNG có text nào bên ngoài JSON):
{ "score": 7.5, "maxScore": 10, "feedback": "Nhận xét chi tiết về bài làm...", "breakdown": "Ý 1: X điểm - ..." }`;

        userContent.push({ type: 'text', text: gradingPrompt });

        let aiText = '';
        if (sdkType === 'openai') {
            const OpenAI = require('openai');
            const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const completion = await openai.chat.completions.create({
                model, max_tokens: 2048,
                messages: [{ role: 'user', content: userContent }]
            });
            aiText = completion.choices?.[0]?.message?.content || '';
        } else {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const msg = await client.messages.create({
                model, max_tokens: 2048,
                messages: [{ role: 'user', content: userContent }]
            });
            aiText = msg.content?.[0]?.text || '';
        }

        // Parse JSON
        let jsonStr = aiText;
        const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        const jStart = jsonStr.indexOf('{'), jEnd = jsonStr.lastIndexOf('}');
        if (jStart !== -1 && jEnd !== -1) jsonStr = jsonStr.substring(jStart, jEnd + 1);

        let gradeResult;
        try { gradeResult = JSON.parse(jsonStr); } catch (e) {
            return res.status(422).json({ error: 'AI trả về JSON không hợp lệ', raw: aiText.substring(0, 500) });
        }

        // Save to usage if examId/code/userId/questionId provided
        if (examId && code && userId && questionId) {
            try {
                const data = readData();
                const exam = data.exams.find(e => e.id === examId);
                if (exam) {
                    const codeObj = (exam.accessCodes || []).find(c => c.code === code.toUpperCase());
                    if (codeObj) {
                        const usage = codeObj.usedBy.find(u => u.userId === userId && u.completed);
                        if (usage) {
                            if (!usage.essayGrades) usage.essayGrades = [];
                            let grade = usage.essayGrades.find(g => g.questionId === questionId);
                            if (!grade) { grade = { questionId }; usage.essayGrades.push(grade); }
                            grade.aiScore = gradeResult.score;
                            grade.aiMaxScore = gradeResult.maxScore || 10;
                            grade.aiFeedback = gradeResult.feedback;
                            grade.aiBreakdown = gradeResult.breakdown;
                            grade.aiGradedAt = new Date().toISOString();
                            writeData(data);
                        }
                    }
                }
            } catch (saveErr) { console.error('Save AI grade error:', saveErr.message); }
        }

        res.json(gradeResult);
    } catch (err) {
        console.error('AI grade essay error:', err.message);
        res.status(500).json({ error: 'Lỗi AI chấm bài: ' + err.message });
    }
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
// Phase 5: Export CSV
// ========================
app.get('/api/admin/submissions/export', adminOnly, (req, res) => {
    const { code: filterCode, examId: filterExamId } = req.query;
    const data = readData();
    const exams = filterExamId ? data.exams.filter(e => e.id === filterExamId) : data.exams;

    const rows = [];
    rows.push('\uFEFFHọc sinh,Mã kích hoạt,Đề thi,Thời gian nộp,Điểm MC,Điểm AI TB,Điểm GV TB,Nhận xét GV');

    for (const exam of exams) {
        for (const codeObj of (exam.accessCodes || [])) {
            if (filterCode && codeObj.code !== filterCode.toUpperCase()) continue;
            for (const usage of (codeObj.usedBy || [])) {
                if (!usage.completed) continue;
                const time = usage.completedAt
                    ? new Date(usage.completedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '\u2014';
                const mcScore = (usage.score !== null && usage.score !== undefined) ? usage.score : '\u2014';
                const grades = usage.essayGrades || [];
                const aiScores = grades.filter(g => g.aiScore !== null && g.aiScore !== undefined).map(g => g.aiScore);
                const tvScores = grades.filter(g => g.teacherScore !== null && g.teacherScore !== undefined).map(g => g.teacherScore);
                const feedbacks = grades.map(g => g.teacherFeedback || '').filter(Boolean);
                const avg = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '\u2014';
                const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
                rows.push([
                    esc(usage.displayName || usage.userId || 'Ẩn danh'),
                    codeObj.code,
                    esc(exam.title),
                    esc(time),
                    mcScore,
                    avg(aiScores),
                    avg(tvScores),
                    esc(feedbacks.join('; '))
                ].join(','));
            }
        }
    }

    const safeName = filterCode ? filterCode : (filterExamId ? 'exam' : 'all');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ket_qua_${safeName}.csv"`);
    res.send(rows.join('\r\n'));
});

// ========================
// Phase 5: Exam Question Stats
// ========================
app.get('/api/admin/exams/:id/stats', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const questionMeta = {};
    exam.sections.forEach(s => {
        (s.questions || []).forEach(q => {
            questionMeta[String(q.id)] = {
                id: q.id,
                question: (q.question || '').substring(0, 80) || '(fill/free-form)',
                sectionTitle: s.title
            };
        });
    });

    const questionStats = {};
    let totalAttempts = 0;
    const allScores = [];

    for (const codeObj of (exam.accessCodes || [])) {
        for (const usage of (codeObj.usedBy || [])) {
            if (!usage.completed || !usage.result) continue;
            totalAttempts++;
            const score = parseFloat(usage.score);
            if (!isNaN(score)) allScores.push(score);
            for (const r of (usage.result.results || [])) {
                if (r.isEssay) continue;
                const qId = String(r.id);
                if (!questionStats[qId]) questionStats[qId] = { wrong: 0, total: 0 };
                questionStats[qId].total++;
                if (r.isCorrect === false) questionStats[qId].wrong++;
            }
        }
    }

    const avg = arr => arr.length > 0 ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;
    const questionStatsArr = Object.entries(questionStats).map(([qId, stat]) => {
        const wrongRate = stat.total > 0 ? Math.round((stat.wrong / stat.total) * 100) : 0;
        const meta = questionMeta[qId] || { id: qId, question: '(unknown)', sectionTitle: '' };
        return { id: qId, question: meta.question, sectionTitle: meta.sectionTitle, wrongRate, wrongCount: stat.wrong, totalAnswered: stat.total };
    }).sort((a, b) => b.wrongRate - a.wrongRate);

    res.json({
        totalAttempts,
        avgScore: avg(allScores),
        maxScore: allScores.length > 0 ? Math.max(...allScores) : null,
        minScore: allScores.length > 0 ? Math.min(...allScores) : null,
        questionStats: questionStatsArr
    });
});

// ========================
// TN1: Duplicate Exam (Admin)
// ========================
app.post('/api/admin/exams/:id/duplicate', adminOnly, (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Deep clone
    const clone = JSON.parse(JSON.stringify(exam));
    clone.id = uuidv4();
    clone.title = exam.title + ' (Copy)';
    clone.accessCodes = []; // new exam has no codes
    clone.requireCode = false;
    clone.createdAt = new Date().toISOString();
    clone.updatedAt = new Date().toISOString();

    // New IDs for sections and questions
    clone.sections = clone.sections.map(s => {
        s.id = uuidv4();
        s.questions = (s.questions || []).map(q => {
            q.id = uuidv4();
            return q;
        });
        return s;
    });

    data.exams.push(clone);
    writeData(data);
    res.json({ success: true, id: clone.id, title: clone.title });
});

// ========================
// TN1: Copy Section to Another Exam (Admin)
// ========================
app.post('/api/admin/exams/:id/copy-section', adminOnly, (req, res) => {
    const { sectionId, targetExamId } = req.body;
    if (!sectionId || !targetExamId) return res.status(400).json({ error: 'Thiếu sectionId hoặc targetExamId' });

    const data = readData();
    const sourceExam = data.exams.find(e => e.id === req.params.id);
    if (!sourceExam) return res.status(404).json({ error: 'Source exam not found' });
    const sectionToClone = sourceExam.sections.find(s => s.id === sectionId);
    if (!sectionToClone) return res.status(404).json({ error: 'Section not found' });

    const targetExam = data.exams.find(e => e.id === targetExamId);
    if (!targetExam) return res.status(404).json({ error: 'Target exam not found' });

    // Deep clone + new IDs
    const cloned = JSON.parse(JSON.stringify(sectionToClone));
    cloned.id = uuidv4();
    cloned.questions = (cloned.questions || []).map(q => { q.id = uuidv4(); return q; });

    targetExam.sections.push(cloned);
    targetExam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true, sectionId: cloned.id });
});

// ========================
// TN5: AI "Why Am I Wrong?" Explain
// ========================
app.post('/api/exams/:examId/explain-wrong', async (req, res) => {
    // FIX-5: thêm userId và completedAt để tìm đúng bài nộp của đúng học sinh
    const { code, questionId, userAnswer, correctAnswer, questionText, options, explanation, userId, completedAt } = req.body;
    if (!code || !questionId) return res.status(400).json({ error: 'Thiếu thông tin' });

    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const codeObj = (exam?.accessCodes || []).find(c => c.code === sanitizeCode(code));
    if (!codeObj) return res.status(403).json({ error: 'Mã không hợp lệ' });

    // FIX-5: tìm đúng người, fallback về mới nhất
    const usage = [...codeObj.usedBy].reverse().find(u =>
        u.completed && u.result &&
        (userId ? u.userId === userId : true) &&
        (completedAt ? u.completedAt === completedAt : true)
    ) || [...codeObj.usedBy].reverse().find(u => u.completed && u.result);
    if (!usage) return res.status(404).json({ error: 'Bài nộp không tìm thấy' });

    // Check limit
    const examLimit = exam.aiExplainLimit ?? -1;
    const codeLimit = codeObj.aiExplainLimit ?? examLimit;
    const effectiveLimit = codeLimit;
    const used = usage.aiExplainUsed || 0;

    // Limit = 0 means disabled
    if (effectiveLimit === 0) return res.status(429).json({ error: 'Tính năng AI giải thích đã bị tắt cho đề này', used, limit: 0 });
    if (effectiveLimit !== -1 && used >= effectiveLimit) {
        return res.status(429).json({ error: `Đã dùng hết ${effectiveLimit} lần giải thích AI`, used, limit: effectiveLimit });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'CLAUDE_API_KEY chưa cấu hình' });

    const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
    const baseUrl = (process.env.CLAUDE_API_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
    const settings = readSettings();
    const model = settings.gradeModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
    const CUSTOM_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

    // Build prompt
    const optLabels = ['A', 'B', 'C', 'D'];
    const optText = (options || []).map((o, i) => `${optLabels[i]}. ${o}`).join('\n');
    const userLabel = typeof userAnswer === 'number' ? (optLabels[userAnswer] || userAnswer) : userAnswer;
    const correctLabel = typeof correctAnswer === 'number' ? (optLabels[correctAnswer] || correctAnswer) : correctAnswer;
    const prompt = `Học sinh vừa trả lời sai câu hỏi sau:\nCâu hỏi: ${questionText}\nCác lựa chọn:\n${optText}\nHọc sinh chọn: ${userLabel}\nĐáp án đúng: ${correctLabel}\n${explanation ? `Giải thích có sẵn: ${explanation}` : ''}\n\nHãy giải thích ngắn gọn (3-5 câu) tại sao đáp án của học sinh sai và tại sao đáp án đúng là đúng. Dùng tiếng Việt, thân thiện, dễ hiểu.`;

    try {
        let aiText = '';
        if (sdkType === 'openai') {
            const OpenAI = require('openai');
            const openai = new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const completion = await openai.chat.completions.create({
                model, max_tokens: 512,
                messages: [{ role: 'user', content: prompt }]
            });
            aiText = completion.choices?.[0]?.message?.content || '';
        } else {
            const Anthropic = require('@anthropic-ai/sdk');
            const client = new Anthropic({ baseURL: baseUrl, apiKey, timeout: 60000, defaultHeaders: CUSTOM_HEADERS });
            const msg = await client.messages.create({
                model, max_tokens: 512,
                messages: [{ role: 'user', content: prompt }]
            });
            aiText = msg.content?.[0]?.text || '';
        }

        // Save counter
        const freshData = readData();
        const freshExam = freshData.exams.find(e => e.id === req.params.examId);
        const freshCode = (freshExam?.accessCodes || []).find(c => c.code === code.toUpperCase().trim());
        const freshUsage = freshCode?.usedBy ? [...freshCode.usedBy].reverse().find(u => u.userId === usage.userId && u.completed && u.completedAt === usage.completedAt) : null;
        if (freshUsage) {
            freshUsage.aiExplainUsed = (freshUsage.aiExplainUsed || 0) + 1;
            writeData(freshData);
        }

        const newUsed = used + 1;
        const remaining = effectiveLimit === -1 ? -1 : effectiveLimit - newUsed;
        res.json({ explanation: aiText, used: newUsed, limit: effectiveLimit, remaining });
    } catch (err) {
        console.error('[ExplainWrong] Error:', err.message);
        res.status(500).json({ error: 'Lỗi AI: ' + err.message });
    }
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

    // ========================
    // Daily Auto-Backup
    // ========================
    function runDailyBackup() {
        try {
            const backupDir = path.join(__dirname, 'data', 'backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            if (!fs.existsSync(DATA_FILE)) return;
            const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const dest = path.join(backupDir, `exams.backup.${date}.json`);
            if (!fs.existsSync(dest)) {
                fs.copyFileSync(DATA_FILE, dest);
                console.log('[Backup] Saved:', dest);
            }
            // Keep at most 7 backup files
            const files = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('exams.backup.'))
                .sort();
            while (files.length > 7) {
                fs.unlinkSync(path.join(backupDir, files.shift()));
                console.log('[Backup] Pruned old backup');
            }
        } catch (e) { console.error('[Backup] Error:', e.message); }
    }
    runDailyBackup(); // Run immediately on startup
    setInterval(runDailyBackup, 24 * 60 * 60 * 1000); // Then every 24h
});

