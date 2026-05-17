// routes/auth.js — Register, Login, Me (Postgres-backed)
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const {
    secureHash, verifyPassword, generateToken, uuidv4
} = require('../lib/data');
const { checkLoginRateLimit, authMiddleware, invalidateUserCache } = require('../lib/auth');

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
    try {
        if (process.env.ALLOW_REGISTER !== 'true') {
            return res.status(403).json({ error: 'Đăng ký tài khoản đã bị tắt' });
        }
        const { username, password, displayName } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
        if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        if (username.length < 3 || username.length > 50) return res.status(400).json({ error: 'Tên đăng nhập phải từ 3-50 ký tự' });
        if (password.length < 4 || password.length > 200) return res.status(400).json({ error: 'Mật khẩu phải từ 4-200 ký tự' });

        const existing = await repos.users.getByUsername(username, { withHistory: false });
        if (existing) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });

        // First user becomes admin
        const all = await repos.users.listAll({ limit: 1 });
        const role = all.length === 0 ? 'admin' : 'student';

        const userId = uuidv4();
        const passwordHash = secureHash(password);
        await repos.users.create({
            id: userId, username, passwordHash,
            displayName: displayName || username,
            role
        });

        const { token, tokenExpiry, jti } = generateToken(userId, role);
        await repos.users.recordToken({ jti, userId, token, expiry: tokenExpiry });

        res.status(201).json({ id: userId, username, displayName: displayName || username, role, token });
    } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
    try {
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        if (!checkLoginRateLimit(ip)) {
            return res.status(429).json({ error: 'Đăng nhập quá nhiều lần. Vui lòng thử lại sau 3 phút.' });
        }
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
        if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        if (password.length > 200) return res.status(400).json({ error: 'Mật khẩu quá dài' });

        const user = await repos.users.getByUsername(username, { withHistory: false });
        if (!user || !verifyPassword(password, user.passwordHash)) {
            return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
        }

        // Auto-upgrade legacy simpleHash → pbkdf2
        if (user.passwordHash && !user.passwordHash.startsWith('pbkdf2:')) {
            await repos.users.update(user.id, { passwordHash: secureHash(password) });
        }

        const { token, tokenExpiry, jti } = generateToken(user.id, user.role);
        await repos.users.recordToken({ jti, userId: user.id, token, expiry: tokenExpiry });
        invalidateUserCache(user.id);

        res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, token });
    } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role });
});

module.exports = router;
