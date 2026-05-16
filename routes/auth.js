// routes/auth.js — Register, Login, Me
// Sprint 3: Dual-write — JSON (primary) + SQLite (shadow). Khi stable, swap primary.
const express = require('express');
const router = express.Router();
const { readUsers, writeUsers, secureHash, verifyPassword, generateToken, uuidv4 } = require('../lib/data');
const { checkLoginRateLimit, authMiddleware, invalidateUserCache } = require('../lib/auth');

// Sync user to SQLite (best-effort, non-blocking)
function _syncUserToSqlite(user) {
    try {
        const { getDb, saveDb } = require('../lib/db');
        const db = getDb();
        // Upsert: INSERT OR REPLACE
        const stmt = db.prepare(
            `INSERT OR REPLACE INTO users (id, username, password_hash, display_name, role, requires_password_reset, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        stmt.run([
            user.id,
            user.username,
            user.passwordHash,
            user.displayName || user.username,
            user.role || 'student',
            user.requiresPasswordReset ? 1 : 0,
            user.createdAt || new Date().toISOString(),
            new Date().toISOString()
        ]);
        stmt.free();
        saveDb();
    } catch (e) {
        // SQLite not ready yet — skip silently (JSON is still primary)
        console.warn('[auth] SQLite sync failed:', e.message);
    }
}

// POST /api/auth/register
router.post('/register', (req, res) => {
    if (process.env.ALLOW_REGISTER !== 'true') {
        return res.status(403).json({ error: 'Đăng ký tài khoản đã bị tắt' });
    }
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    if (username.length < 3 || username.length > 50) return res.status(400).json({ error: 'Tên đăng nhập phải từ 3-50 ký tự' });
    if (password.length < 4 || password.length > 200) return res.status(400).json({ error: 'Mật khẩu phải từ 4-200 ký tự' });

    const usersData = readUsers();
    if (usersData.users.find(u => u.username === username)) return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });

    const userId = uuidv4();
    const role = usersData.users.length === 0 ? 'admin' : 'student';
    const { token, tokenExpiry } = generateToken(userId, role);
    const newUser = {
        id: userId, username, passwordHash: secureHash(password),
        displayName: displayName || username,
        role,
        token, tokenExpiry,
        tokens: [{ token, expiry: tokenExpiry, createdAt: new Date().toISOString() }],
        history: [], createdAt: new Date().toISOString()
    };
    usersData.users.push(newUser);
    writeUsers(usersData);
    _syncUserToSqlite(newUser);
    res.status(201).json({ id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role, token });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    if (!checkLoginRateLimit(ip)) {
        return res.status(429).json({ error: 'Đăng nhập quá nhiều lần. Vui lòng thử lại sau 3 phút.' });
    }
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin đăng nhập' });
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    if (password.length > 200) return res.status(400).json({ error: 'Mật khẩu quá dài' });

    const usersData = readUsers();
    const user = usersData.users.find(u => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    // Auto-upgrade old simpleHash to pbkdf2 (transition only — verifyPassword sẽ reject sau migration)
    if (user.passwordHash && !user.passwordHash.startsWith('pbkdf2:')) {
        user.passwordHash = secureHash(password);
    }
    const { token, tokenExpiry } = generateToken(user.id, user.role);
    user.token = token;
    user.tokenExpiry = tokenExpiry;
    const now = Date.now();
    const existingTokens = Array.isArray(user.tokens) ? user.tokens.filter(t => t.token && (!t.expiry || t.expiry > now)) : [];
    user.tokens = [{ token, expiry: tokenExpiry, createdAt: new Date().toISOString() }, ...existingTokens.filter(t => t.token !== token)].slice(0, 5);
    writeUsers(usersData);
    invalidateUserCache(user.id);
    _syncUserToSqlite(user);
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, token });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role });
});

module.exports = router;

