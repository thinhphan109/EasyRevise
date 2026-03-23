const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'exams.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// Helper Functions
// ========================
function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({ exams: [] }, null, 2));
        }
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Error reading data:', err);
        return { exams: [] };
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ========================
// API Routes - Exams
// ========================

// GET all exams (summary only, no questions)
app.get('/api/exams', (req, res) => {
    const data = readData();
    const summaries = data.exams.map(exam => ({
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        year: exam.year,
        createdAt: exam.createdAt,
        updatedAt: exam.updatedAt,
        totalQuestions: countQuestions(exam),
        totalEssays: exam.sections.filter(s => s.type === 'writing-essay').length,
        sectionCount: exam.sections.length
    }));
    res.json(summaries);
});

// GET single exam (full data with questions)
app.get('/api/exams/:id', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
});

// POST create new exam
app.post('/api/exams', (req, res) => {
    const data = readData();
    const newExam = {
        id: uuidv4(),
        title: req.body.title || 'Đề mới',
        subject: req.body.subject || 'Tiếng Anh',
        year: req.body.year || new Date().getFullYear().toString(),
        sections: req.body.sections || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    data.exams.push(newExam);
    writeData(data);
    res.status(201).json(newExam);
});

// PUT update exam metadata
app.put('/api/exams/:id', (req, res) => {
    const data = readData();
    const index = data.exams.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Exam not found' });

    data.exams[index] = {
        ...data.exams[index],
        title: req.body.title ?? data.exams[index].title,
        subject: req.body.subject ?? data.exams[index].subject,
        year: req.body.year ?? data.exams[index].year,
        sections: req.body.sections ?? data.exams[index].sections,
        updatedAt: new Date().toISOString()
    };
    writeData(data);
    res.json(data.exams[index]);
});

// DELETE exam
app.delete('/api/exams/:id', (req, res) => {
    const data = readData();
    const index = data.exams.findIndex(e => e.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Exam not found' });
    data.exams.splice(index, 1);
    writeData(data);
    res.json({ success: true });
});

// ========================
// API Routes - Sections
// ========================

// POST add section to exam
app.post('/api/exams/:id/sections', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const newSection = {
        id: req.body.id || uuidv4(),
        title: req.body.title || 'Phần mới',
        instruction: req.body.instruction || '',
        type: req.body.type || 'multiple-choice',
        passage: req.body.passage || null,
        questions: req.body.questions || [],
        // For essay type
        prompt: req.body.prompt || null,
        context: req.body.context || null,
        cues: req.body.cues || [],
        sampleAnswer: req.body.sampleAnswer || null,
        explanation: req.body.explanation || null
    };

    exam.sections.push(newSection);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.status(201).json(newSection);
});

// PUT update section
app.put('/api/exams/:examId/sections/:sectionId', (req, res) => {
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

// DELETE section
app.delete('/api/exams/:examId/sections/:sectionId', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    exam.sections = exam.sections.filter(s => s.id !== req.params.sectionId);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
});

// ========================
// API Routes - Questions
// ========================

// POST add question to a section
app.post('/api/exams/:examId/sections/:sectionId/questions', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const section = exam.sections.find(s => s.id === req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const newQ = {
        id: req.body.id || Date.now(),
        question: req.body.question || '',
        options: req.body.options || ['', '', '', ''],
        correctAnswer: req.body.correctAnswer ?? 0,
        explanation: req.body.explanation || '',
        expansion: req.body.expansion || ''
    };

    section.questions.push(newQ);
    exam.updatedAt = new Date().toISOString();
    writeData(data);
    res.status(201).json(newQ);
});

// PUT update question
app.put('/api/exams/:examId/sections/:sectionId/questions/:questionId', (req, res) => {
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

// DELETE question
app.delete('/api/exams/:examId/sections/:sectionId/questions/:questionId', (req, res) => {
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
// Helper
// ========================
function countQuestions(exam) {
    let count = 0;
    exam.sections.forEach(s => {
        if (s.type === 'writing-essay') count += 1;
        else count += (s.questions || []).length;
    });
    return count;
}

// ========================
// Export / Import
// ========================

// GET export exam as JSON
app.get('/api/exams/:id/export', (req, res) => {
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const exportData = {
        _format: 'easyrevise-exam-v1',
        _exportedAt: new Date().toISOString(),
        exam: {
            title: exam.title,
            subject: exam.subject,
            year: exam.year,
            sections: exam.sections
        }
    };

    res.setHeader('Content-Type', 'application/json');
    const safeName = exam.title.replace(/[^a-zA-Z0-9 ]/g, '_').trim() || 'exam';
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.json"; filename*=UTF-8''${encodeURIComponent(exam.title)}.json`);
    res.json(exportData);
});

// POST import exam from JSON
app.post('/api/exams/import', (req, res) => {
    const data = readData();
    const importData = req.body;

    // Validate format
    if (!importData._format || importData._format !== 'easyrevise-exam-v1') {
        return res.status(400).json({ error: 'Invalid import format. Must be easyrevise-exam-v1.' });
    }

    if (!importData.exam || !importData.exam.sections) {
        return res.status(400).json({ error: 'Missing exam data or sections.' });
    }

    const now = new Date().toISOString();
    const newExam = {
        id: uuidv4(),
        title: importData.exam.title || 'Đề import',
        subject: importData.exam.subject || 'Tiếng Anh',
        year: importData.exam.year || '',
        sections: importData.exam.sections.map(s => ({
            ...s,
            id: s.id || uuidv4()
        })),
        createdAt: now,
        updatedAt: now
    };

    data.exams.push(newExam);
    writeData(data);
    res.status(201).json(newExam);
});

// GET export all exams
app.get('/api/export-all', (req, res) => {
    const data = readData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="easyrevise-backup.json"');
    res.json({ _format: 'easyrevise-backup-v1', _exportedAt: new Date().toISOString(), exams: data.exams });
});

// ========================
// User Auth System
// ========================
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) {
        return { users: [] };
    }
}

function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Simple hash (not crypto-grade, suitable for this app)
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return 'h' + Math.abs(hash).toString(36) + str.length;
}

// Simple token
function generateToken(userId) {
    return Buffer.from(`${userId}:${Date.now()}:${Math.random().toString(36).slice(2)}`).toString('base64');
}

// Auth middleware
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
    const token = authHeader.split(' ')[1];
    const usersData = readUsers();
    const user = usersData.users.find(u => u.token === token);
    if (!user) return res.status(401).json({ error: 'Token không hợp lệ' });
    req.user = user;
    next();
}

// POST register
app.post('/api/auth/register', (req, res) => {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    if (username.length < 3) return res.status(400).json({ error: 'Tên đăng nhập phải từ 3 ký tự' });
    if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải từ 4 ký tự' });

    const usersData = readUsers();
    if (usersData.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    const token = generateToken(uuidv4());
    const newUser = {
        id: uuidv4(),
        username,
        passwordHash: simpleHash(password),
        displayName: displayName || username,
        role: usersData.users.length === 0 ? 'admin' : 'student', // First user = admin
        token,
        history: [],
        createdAt: new Date().toISOString()
    };

    usersData.users.push(newUser);
    writeUsers(usersData);

    res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        displayName: newUser.displayName,
        role: newUser.role,
        token
    });
});

// POST login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const usersData = readUsers();
    const user = usersData.users.find(u => u.username === username);

    if (!user || user.passwordHash !== simpleHash(password)) {
        return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    // Refresh token
    user.token = generateToken(user.id);
    writeUsers(usersData);

    res.json({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        token: user.token
    });
});

// GET current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        role: req.user.role
    });
});

// GET all users (admin only)
app.get('/api/users', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền' });
    const usersData = readUsers();
    res.json(usersData.users.map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        historyCount: (u.history || []).length,
        createdAt: u.createdAt
    })));
});

// DELETE user (admin only)
app.delete('/api/users/:id', authMiddleware, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Không có quyền' });
    const usersData = readUsers();
    usersData.users = usersData.users.filter(u => u.id !== req.params.id);
    writeUsers(usersData);
    res.json({ success: true });
});

// ========================
// Exam History
// ========================

// POST save history
app.post('/api/history', authMiddleware, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.history) user.history = [];
    user.history.unshift({
        ...req.body,
        id: uuidv4(),
        savedAt: new Date().toISOString()
    });

    // Keep max 100 history items
    if (user.history.length > 100) user.history = user.history.slice(0, 100);
    writeUsers(usersData);
    res.status(201).json({ success: true });
});

// GET history
app.get('/api/history', authMiddleware, (req, res) => {
    const usersData = readUsers();
    const user = usersData.users.find(u => u.id === req.user.id);
    res.json(user?.history || []);
});

// ========================
// SPA fallback - serve HTML pages
// ========================
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// Start
app.listen(PORT, () => {
    console.log(`\n  🚀 EasyRevise Server running at http://localhost:${PORT}`);
    console.log(`  📝 Student:  http://localhost:${PORT}/`);
    console.log(`  ⚙️  Admin:    http://localhost:${PORT}/admin\n`);
});
