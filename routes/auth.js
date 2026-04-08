// routes/auth.js — Register, Login, Me
const express = require('express');
const router = express.Router();
const { readUsers, writeUsers, secureHash, verifyPassword, generateToken, uuidv4 } = require('../lib/data');
const { checkLoginRateLimit, authMiddleware } = require('../lib/auth');

// POST /api/auth/register
router.post('/register', (req, res) => {
    if (process.env.ALLOW_REGISTER !== 'true') {
        return res.status(403).json({ error: 'Đăng ký tài khoản đã bị tắt' });
    }
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    if (username.length < 3) return res.status(400).json({ error: 'Tên đăng nhập phải từ 3 ký tự' });
    if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải từ 4 ký tự' });

    const usersData = readUsers();
    if (usersData.users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });

    const { token, tokenExpiry } = generateToken(uuidv4());
    const newUser = {
        id: uuidv4(), username, passwordHash: secureHash(password),
        displayName: displayName || username,
        role: usersData.users.length === 0 ? 'admin' : 'student',
        token, tokenExpiry, history: [], createdAt: new Date().toISOString()
    };
    usersData.users.push(newUser);
    writeUsers(usersData);
    res.status(201).json({ id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role, token });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkLoginRateLimit(ip)) {
        return res.status(429).json({ error: 'Đăng nhập quá nhiều lần. Vui lòng thử lại sau 3 phút.' });
    }
    const { username, password } = req.body;
    const usersData = readUsers();
    const user = usersData.users.find(u => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    // Auto-upgrade old simpleHash to pbkdf2
    if (!user.passwordHash.startsWith('pbkdf2:')) {
        user.passwordHash = secureHash(password);
    }
    const { token, tokenExpiry } = generateToken(user.id);
    user.token = token;
    user.tokenExpiry = tokenExpiry;
    writeUsers(usersData);
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, token });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role });
});

module.exports = router;

