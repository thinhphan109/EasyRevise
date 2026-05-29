// tests/ielts.test.js — IELTS API integration tests
'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-ielts-tests';
process.env.SIGN_SECRET = process.env.SIGN_SECRET || 'test-sign-secret-for-ielts-tests';
process.env.ALLOW_REGISTER = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const path = require('path');
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

const HAS_DB = !!(process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL);
const describeDb = HAS_DB ? describe : describe.skip;


const TEST_ID = '11111111-1111-1111-1111-111111111101';
const QID = {
    q1: '11111111-1111-1111-1111-111111111201',
    q2: '11111111-1111-1111-1111-111111111202',
    q3: '11111111-1111-1111-1111-111111111203',
    q4: '11111111-1111-1111-1111-111111111204',
    q5: '11111111-1111-1111-1111-111111111205',
    q6: '11111111-1111-1111-1111-111111111206',
    q7: '11111111-1111-1111-1111-111111111207',
    q8: '11111111-1111-1111-1111-111111111208',
    q9: '11111111-1111-1111-1111-111111111209'
};

const ALL_CORRECT = {
    [QID.q1]: 'false',
    [QID.q2]: 'false',
    [QID.q3]: 'not_given',
    [QID.q4]: 1,
    [QID.q5]: 2,
    [QID.q6]: '10',
    [QID.q7]: 'crude oil',
    [QID.q8]: '20 million',
    [QID.q9]: { A: 'iii', B: 'ii', C: 'vii', D: 'v', E: 'i' }
};

const TEST_USER = `ielts_user_${Date.now()}`;
let token = null;
let userId = null;

beforeAll(async () => {
    if (!HAS_DB) return;
    const res = await request(app)
        .post('/api/auth/register')
        .send({ username: TEST_USER, password: 'testpass123', displayName: 'IELTS Tester' });
    expect(res.status).toBe(201);
    token = res.body.token;
    userId = res.body.id;
});

afterAll(async () => {
    if (!HAS_DB) return;
    try {
        const { query } = require('../lib/repos/_pool');
        await query(`DELETE FROM users WHERE username = $1`, [TEST_USER]);
    } catch { /* ignore */ }
});

describeDb('IELTS catalog', () => {
    test('GET /api/ielts/tests/:id returns the seeded test', async () => {
        const res = await request(app).get(`/api/ielts/tests/${TEST_ID}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(TEST_ID);
    });

    test('GET /api/ielts/tests/:id does NOT leak `correct`', async () => {
        const res = await request(app).get(`/api/ielts/tests/${TEST_ID}`);
        expect(res.status).toBe(200);
        const q = res.body.passages[0].questions[0];
        expect(q.correct).toBeUndefined();
        expect(q.alternatives).toBeUndefined();
    });

    test('GET /api/ielts/tests/:id 404 for unknown id', async () => {
        const res = await request(app).get('/api/ielts/tests/00000000-0000-0000-0000-000000000000');
        expect(res.status).toBe(404);
    });
});

describeDb('IELTS submission flow', () => {
    test('POST /tests/:id/start requires auth', async () => {
        const res = await request(app).post(`/api/ielts/tests/${TEST_ID}/start`);
        expect(res.status).toBe(401);
    });

    test('Full happy path: start → submit all-correct → review', async () => {
        const startRes = await request(app)
            .post(`/api/ielts/tests/${TEST_ID}/start`)
            .set('Authorization', `Bearer ${token}`);
        expect(startRes.status).toBe(201);
        const subId = startRes.body.id;
        expect(subId).toBeDefined();

        const submitRes = await request(app)
            .post(`/api/ielts/submissions/${subId}/submit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ answers: ALL_CORRECT });
        expect(submitRes.status).toBe(200);
        expect(submitRes.body.raw).toBe(13);     // 8 + 5 matching pairs
        expect(submitRes.body.total).toBe(13);
        expect(submitRes.body.band).toBeGreaterThan(0);

        const review = await request(app)
            .get(`/api/ielts/submissions/${subId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(review.status).toBe(200);
        expect(review.body.submission.isComplete).toBe(true);
        // After complete, `correct` IS revealed for review
        expect(review.body.test.passages[0].questions[0].correct).toBeDefined();
    });

    test('Empty answers grade to raw=0', async () => {
        const startRes = await request(app)
            .post(`/api/ielts/tests/${TEST_ID}/start`)
            .set('Authorization', `Bearer ${token}`);
        const subId = startRes.body.id;
        const submitRes = await request(app)
            .post(`/api/ielts/submissions/${subId}/submit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ answers: {} });
        expect(submitRes.status).toBe(200);
        expect(submitRes.body.raw).toBe(0);
        expect(Number(submitRes.body.band)).toBe(0);
    });

    test('Submit twice is idempotent', async () => {
        const startRes = await request(app)
            .post(`/api/ielts/tests/${TEST_ID}/start`)
            .set('Authorization', `Bearer ${token}`);
        const subId = startRes.body.id;
        const r1 = await request(app)
            .post(`/api/ielts/submissions/${subId}/submit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ answers: ALL_CORRECT });
        const r2 = await request(app)
            .post(`/api/ielts/submissions/${subId}/submit`)
            .set('Authorization', `Bearer ${token}`)
            .send({ answers: {} });
        // Second call should return cached result, NOT regrade with empty answers
        expect(r2.body.raw).toBe(r1.body.raw);
    });

    test('Cannot read another user submission', async () => {
        // Create a second user
        const other = `ielts_other_${Date.now()}`;
        const reg = await request(app)
            .post('/api/auth/register')
            .send({ username: other, password: 'testpass123' });
        const otherToken = reg.body.token;

        // First user starts a submission
        const startRes = await request(app)
            .post(`/api/ielts/tests/${TEST_ID}/start`)
            .set('Authorization', `Bearer ${token}`);
        const subId = startRes.body.id;

        // Second user tries to read it
        const peek = await request(app)
            .get(`/api/ielts/submissions/${subId}`)
            .set('Authorization', `Bearer ${otherToken}`);
        expect(peek.status).toBe(403);

        // Cleanup the second user
        try {
            const { query } = require('../lib/repos/_pool');
            await query(`DELETE FROM users WHERE username = $1`, [other]);
        } catch { /* ignore */ }
    });
});

describe('IELTS grader unit checks', () => {
    const { gradeQuestion } = require('../lib/ielts-grader');

    test('tfng case-insensitive match', () => {
        expect(gradeQuestion({ type: 'tfng', correct: 'true' }, 'TRUE').isCorrect).toBe(true);
        expect(gradeQuestion({ type: 'tfng', correct: 'true' }, 'false').isCorrect).toBe(false);
    });

    test('sentence_completion alternates', () => {
        const q = { type: 'sentence_completion', correct: '10', alternatives: ['ten'], payload: { maxWords: 1 } };
        expect(gradeQuestion(q, '10').isCorrect).toBe(true);
        expect(gradeQuestion(q, 'TEN').isCorrect).toBe(true);
        expect(gradeQuestion(q, 'eleven').isCorrect).toBe(false);
    });

    test('matching_headings counts each pairing', () => {
        const q = { type: 'matching_headings', correct: { A: 'i', B: 'ii', C: 'iii' } };
        const r = gradeQuestion(q, { A: 'i', B: 'wrong', C: 'iii' });
        expect(r.points).toBe(2);
        expect(r.isCorrect).toBe(false);
    });
});
