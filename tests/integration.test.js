// tests/integration.test.js — Integration tests for core API flows
// Uses supertest to test actual HTTP endpoints without starting a separate server.
//
// Run: npm test (jest picks up all *.test.js)
//
// NOTE: These tests use the REAL data files. To avoid polluting production data,
// they only test read-only endpoints + use unique test usernames.

const path = require('path');

// Set test env vars before requiring anything
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests-only';
process.env.SIGN_SECRET = 'test-sign-secret-for-integration-tests-only';
process.env.ALLOW_REGISTER = 'true';
process.env.NODE_ENV = 'test';
process.env.DROP_SIMPLEHASH = 'false';

// We need to create a test app instance without calling .listen()
// Extract app from server.js is tricky (it calls listen). Create minimal app:
const express = require('express');
const helmet = require('helmet');

function createTestApp() {
    const app = express();
    app.set('trust proxy', true);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // Mount routes same as server.js
    app.use('/api/auth', require('../routes/auth'));
    app.use('/api/users', require('../routes/users'));
    app.use('/api/subjects', require('../routes/subjects'));
    app.use('/api/exams', require('../routes/exams'));
    app.use('/api/exams', require('../routes/sections'));
    app.use('/api/exams', require('../routes/questions'));
    app.use('/api/exams', require('../routes/codes'));
    const submitRouter = require('../routes/submit');
    app.use('/api/exams', submitRouter);
    app.use('/api', submitRouter);
    app.use('/api', require('../routes/health'));
    app.use('/api', require('../routes/settings'));

    app.use((err, req, res, next) => {
        res.status(500).json({ error: 'Test server error' });
    });
    return app;
}

const request = require('supertest');
const app = createTestApp();

// Unique test username to avoid collision
const TEST_USER = `test_user_${Date.now()}`;
const TEST_PASS = 'testpass123';
let testToken = null;
let testUserId = null;

describe('Health endpoint', () => {
    test('GET /api/health returns 200 with ok:true', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.version).toBe('1.0.0');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });
});

describe('Auth flow', () => {
    test('POST /api/auth/register creates user and returns JWT', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: TEST_USER, password: TEST_PASS, displayName: 'Test User' });
        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
        expect(res.body.username).toBe(TEST_USER);
        expect(res.body.role).toBe('student');
        testToken = res.body.token;
        testUserId = res.body.id;
    });

    test('POST /api/auth/register rejects duplicate username', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: TEST_USER, password: TEST_PASS });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('đã tồn tại');
    });

    test('POST /api/auth/login with correct credentials returns JWT', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: TEST_USER, password: TEST_PASS });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.id).toBe(testUserId);
        testToken = res.body.token; // update to latest
    });

    test('POST /api/auth/login with wrong password returns 401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: TEST_USER, password: 'wrongpass' });
        expect(res.status).toBe(401);
    });

    test('GET /api/auth/me with valid token returns user', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${testToken}`);
        expect(res.status).toBe(200);
        expect(res.body.username).toBe(TEST_USER);
        expect(res.body.role).toBe('student');
    });

    test('GET /api/auth/me without token returns 401', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    test('GET /api/auth/me with invalid token returns 401', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid.token.here');
        expect(res.status).toBe(401);
    });
});

describe('Input validation', () => {
    test('POST /api/auth/register rejects short username', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'ab', password: 'test123' });
        expect(res.status).toBe(400);
    });

    test('POST /api/auth/register rejects short password', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'validuser', password: '12' });
        expect(res.status).toBe(400);
    });

    test('POST /api/auth/login rejects missing fields', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({});
        expect(res.status).toBe(400);
    });
});

describe('Security: rate limiting', () => {
    test('POST /api/auth/login rate-limits after 10 attempts', async () => {
        // Use unique IP simulation (trust proxy + X-Forwarded-For)
        const fakeIp = `192.168.99.${Math.floor(Math.random() * 255)}`;
        let lastStatus = 200;
        for (let i = 0; i < 12; i++) {
            const res = await request(app)
                .post('/api/auth/login')
                .set('X-Forwarded-For', fakeIp)
                .send({ username: 'nonexistent', password: 'wrong' });
            lastStatus = res.status;
            if (lastStatus === 429) break;
        }
        expect(lastStatus).toBe(429);
    });
});

describe('Security: upload protection', () => {
    test('POST /api/upload-submission without auth returns 401', async () => {
        const res = await request(app)
            .post('/api/upload-submission')
            .attach('file', Buffer.from('fake'), 'test.jpg');
        expect(res.status).toBe(401);
    });
});

describe('Exams API (read-only)', () => {
    test('GET /api/exams returns array', async () => {
        const res = await request(app).get('/api/exams');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});

describe('Settings API', () => {
    test('GET /api/settings/public returns site name', async () => {
        const res = await request(app).get('/api/settings/public');
        expect(res.status).toBe(200);
        expect(res.body.siteName).toBeDefined();
    });
});

// Cleanup: remove test user after all tests
afterAll(async () => {
    try {
        const { readUsers, writeUsers } = require('../lib/data');
        const data = readUsers();
        data.users = data.users.filter(u => u.username !== TEST_USER);
        writeUsers(data);
    } catch (e) { /* ignore */ }

    // Also remove from SQLite
    try {
        const { getDb, saveDb } = require('../lib/db');
        const db = getDb();
        db.run(`DELETE FROM users WHERE username = '${TEST_USER}'`);
        saveDb();
    } catch (e) { /* ignore */ }
});
