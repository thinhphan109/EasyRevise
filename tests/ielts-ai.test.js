// tests/ielts-ai.test.js — AI grading + rate limit integration tests
'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-ielts-ai-tests';
process.env.SIGN_SECRET = process.env.SIGN_SECRET || 'test-sign-secret-for-ielts-ai-tests';
process.env.ALLOW_REGISTER = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const express = require('express');
const helmet = require('helmet');

function createApp() {
    const app = express();
    app.set('trust proxy', true);
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/auth', require('../routes/auth'));
    app.use('/api/ielts', require('../routes/ielts'));
    app.use((err, req, res, next) => {
         
        console.error('[test] unhandled:', err);
        res.status(500).json({ error: err.message });
    });
    return app;
}

const request = require('supertest');
const app = createApp();

const TEST_USER = `ielts_ai_user_${Date.now()}`;
let token = null;
let userId = null;

beforeAll(async () => {
    const res = await request(app)
        .post('/api/auth/register')
        .send({ username: TEST_USER, password: 'testpass123', displayName: 'IELTS AI Tester' });
    expect(res.status).toBe(201);
    token = res.body.token;
    userId = res.body.id;
});

afterAll(async () => {
    try {
        const { query } = require('../lib/repos/_pool');
        await query(`DELETE FROM users WHERE username = $1`, [TEST_USER]);
        await query(`DELETE FROM ielts_rate_limits WHERE user_id = $1`, [userId]);
    } catch { /* ignore */ }
});

describe('IELTS Writing flow', () => {
    let testId, submissionId;

    test('GET /api/ielts/writing/tests returns list', async () => {
        const r = await request(app).get('/api/ielts/writing/tests?taskType=2');
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body)).toBe(true);
        expect(r.body.length).toBeGreaterThan(0);
        testId = r.body[0].id;
    });

    test('POST /writing/tests/:id/start creates submission', async () => {
        const r = await request(app)
            .post(`/api/ielts/writing/tests/${testId}/start`)
            .set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(201);
        submissionId = r.body.id;
        expect(submissionId).toBeDefined();
    });

    test('POST /writing/submissions/:id/save updates draft', async () => {
        const r = await request(app)
            .post(`/api/ielts/writing/submissions/${submissionId}/save`)
            .set('Authorization', `Bearer ${token}`)
            .send({ essay: 'Draft text here.' });
        expect(r.status).toBe(200);
        expect(r.body.wordCount).toBe(3);
    });

    test('POST /writing/submissions/:id/submit grades essay (~30s)', async () => {
        const essay = 'In recent decades technology has transformed education profoundly. Digital tools democratise access to learning so students in remote villages can follow lectures from world-class universities. AI enables personalisation that conventional classrooms cannot match. Critics argue that excessive screen time harms social skills, but blended models can mitigate this concern. In conclusion, technology should be embraced as a powerful ally in modern education. When deployed wisely it expands access, enables personalisation, and prepares learners for a digital economy.';
        const r = await request(app)
            .post(`/api/ielts/writing/submissions/${submissionId}/submit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ essay });
        expect(r.status).toBe(200);
        expect(r.body.band).toBeDefined();
        expect(r.body.band.overall).toBeGreaterThan(0);
        expect(r.body.band.overall).toBeLessThanOrEqual(9);
        expect(r.body.feedback).toBeDefined();
    }, 60_000);
});

describe('IELTS Speaking flow', () => {
    let testId, submissionId;

    test('GET /api/ielts/speaking/tests returns list', async () => {
        const r = await request(app).get('/api/ielts/speaking/tests?partNumber=1');
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body)).toBe(true);
        testId = r.body[0]?.id;
        expect(testId).toBeDefined();
    });

    test('POST /speaking/submissions/:id/submit grades transcript (~30s)', async () => {
        const start = await request(app)
            .post(`/api/ielts/speaking/tests/${testId}/start`)
            .set('Authorization', `Bearer ${token}`);
        submissionId = start.body.id;

        const transcript = "Yes, in my country most people live in houses, especially in rural areas. In big cities people increasingly live in apartments because of population density and high cost of land. Personally I grew up in a house and enjoyed having a small garden, but my friends in apartments like the convenience of having a gym in the same building.";
        const r = await request(app)
            .post(`/api/ielts/speaking/submissions/${submissionId}/submit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ transcript });
        expect(r.status).toBe(200);
        expect(r.body.band.overall).toBeGreaterThan(0);
        expect(r.body.band.fc).toBeDefined();
    }, 60_000);
});

describe('Rate limiting', () => {
    test('GET /api/ielts/usage returns daily counts', async () => {
        const r = await request(app)
            .get('/api/ielts/usage')
            .set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(200);
        expect(r.body.usage).toBeDefined();
        expect(r.body.limits.writing).toBeGreaterThanOrEqual(1);
        // After the writing test, count should be 1
        expect(r.body.usage.writing?.used).toBeGreaterThanOrEqual(1);
    });

    test('Rate limiter blocks after limit reached', async () => {
        const { checkAndIncrement } = require('../lib/ielts-rate-limit');
        // Manually fill up writing quota for THIS user
        const fakeUserId = `test-${Date.now()}`;
        // Use a synthetic UUID
        const { v4 } = require('uuid');
        const otherId = v4();
        // Increment 10 times (limit)
        for (let i = 0; i < 10; i++) await checkAndIncrement(otherId, 'writing');
        // 11th should throw
        await expect(checkAndIncrement(otherId, 'writing')).rejects.toThrow(/giới hạn/i);

        // Cleanup
        const { query } = require('../lib/repos/_pool');
        await query(`DELETE FROM ielts_rate_limits WHERE user_id = $1`, [otherId]);
    });
});
