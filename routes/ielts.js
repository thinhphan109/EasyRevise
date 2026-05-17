// routes/ielts.js — IELTS Reading API
'use strict';
const express = require('express');
const router = express.Router();
const repos = require('../lib/repos');
const { authMiddleware, adminOnly } = require('../lib/auth');
const { gradeSubmission } = require('../lib/ielts-grader');
const drive = require('../lib/drive');
const { queryOne } = require('../lib/repos/_pool');

// ── Audio stream: prefer Drive mirror, fall back to youpass.vn ─────────
// Public so audio works without auth (player can't send Bearer header
// inside <audio> tag). Throttling is implicit via Drive quota.
router.get('/audio/:passageId', async (req, res, next) => {
    try {
        const row = await queryOne(
            `SELECT audio_drive_id, audio_url FROM ielts_passages WHERE id = $1`,
            [req.params.passageId]
        );
        if (!row || !row.audio_url) return res.status(404).json({ error: 'Audio not found' });

        // Prefer mirrored Drive copy
        if (row.audio_drive_id) {
            try {
                await drive.streamFileFromDrive(row.audio_drive_id, res);
                return;
            } catch (e) {
                console.warn('[ielts/audio] Drive stream failed, fallback:', e.message);
                // Fall through to youpass redirect
            }
        }
        // Fallback: 302 to original youpass URL
        res.redirect(302, row.audio_url);
    } catch (e) { next(e); }
});

// ── Public: catalog ───────────────────────────────────────────────────
router.get('/tests', async (req, res, next) => {
    try {
        const tests = await repos.ielts.listTests({
            skill: req.query.skill || undefined,
            module: req.query.module || undefined,
            isPublished: true,
            limit: 100
        });
        res.json(tests);
    } catch (e) { next(e); }
});

// ── Public: take a test (no `correct` field leaked) ───────────────────
router.get('/tests/:id', async (req, res, next) => {
    try {
        const test = await repos.ielts.getTestById(req.params.id, {
            withQuestions: true,
            includeCorrect: false
        });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (!test.isPublished) {
            // Allow admin preview via Bearer token
            const auth = req.headers.authorization;
            let isAdmin = false;
            if (auth && auth.startsWith('Bearer ')) {
                const u = await require('../lib/auth').findUserByToken(auth.slice(7));
                if (u && u.role === 'admin') isAdmin = true;
            }
            if (!isAdmin) return res.status(404).json({ error: 'Test not found' });
        }
        res.json(test);
    } catch (e) { next(e); }
});

// ── Auth: start submission ────────────────────────────────────────────
router.post('/tests/:id/start', authMiddleware, async (req, res, next) => {
    try {
        const test = await repos.ielts.getTestById(req.params.id);
        if (!test || !test.isPublished) return res.status(404).json({ error: 'Test not found' });
        const sub = await repos.ielts.startSubmission({
            testId: req.params.id, userId: req.user.id
        });
        res.status(201).json({ id: sub.id, startedAt: sub.startedAt });
    } catch (e) { next(e); }
});

// ── Auth: autosave answers ────────────────────────────────────────────
router.post('/submissions/:id/answer', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getSubmissionById(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (sub.isComplete) return res.status(409).json({ error: 'Submission already submitted' });

        const updated = await repos.ielts.saveAnswers(
            req.params.id, req.body.answers, req.body.flags
        );
        res.json({ ok: true, updatedAt: new Date().toISOString() });
    } catch (e) { next(e); }
});

// ── Auth: finalize + grade ────────────────────────────────────────────
router.post('/submissions/:id/submit', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getSubmissionById(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (sub.isComplete) {
            // Idempotent: return current finalized state
            return res.json({
                id: sub.id, raw: sub.rawScore, band: sub.bandScore,
                total: (sub.perQuestion || []).reduce((a, q) => a + (q.max || 0), 0),
                perQuestion: sub.perQuestion
            });
        }

        // Save final answers if posted, then grade
        const finalAnswers = req.body.answers ?? sub.answers;
        const finalFlags = req.body.flags ?? sub.flags;
        if (req.body.answers !== undefined || req.body.flags !== undefined) {
            await repos.ielts.saveAnswers(req.params.id, finalAnswers, finalFlags);
        }

        const test = await repos.ielts.getTestById(sub.testId, {
            withQuestions: true, includeCorrect: true
        });
        if (!test) return res.status(404).json({ error: 'Test missing' });

        const graded = gradeSubmission(test, finalAnswers || {});
        const band = await repos.ielts.bandLookup(test.skill, test.module, graded.raw);
        const durationSec = Math.round(
            (Date.now() - new Date(sub.startedAt).getTime()) / 1000
        );

        const finalized = await repos.ielts.finalizeSubmission(req.params.id, {
            rawScore: graded.raw,
            bandScore: band,
            perQuestion: graded.perQuestion,
            durationSec
        });

        res.json({
            id: finalized.id,
            raw: finalized.rawScore,
            total: graded.total,
            band: finalized.bandScore,
            perQuestion: finalized.perQuestion,
            submittedAt: finalized.submittedAt
        });
    } catch (e) { next(e); }
});

// ── Auth: read submission ─────────────────────────────────────────────
router.get('/submissions/:id', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getSubmissionById(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.userId !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // Attach the test (with `correct` only if completed)
        const test = await repos.ielts.getTestById(sub.testId, {
            withQuestions: true,
            includeCorrect: sub.isComplete
        });
        res.json({ submission: sub, test });
    } catch (e) { next(e); }
});

// ── Auth: list user's submissions ─────────────────────────────────────
router.get('/submissions', authMiddleware, async (req, res, next) => {
    try {
        const subs = await repos.ielts.listSubmissions({
            userId: req.user.id, limit: 50
        });
        res.json(subs);
    } catch (e) { next(e); }
});

// ── Auth: aggregated cross-skill results ──────────────────────────────
// Used by the "My Results" page on the student side to show a unified
// timeline of completed Reading/Listening/Writing/Speaking attempts.
router.get('/my-results', authMiddleware, async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const [results, stats] = await Promise.all([
            repos.ielts.listMyResults(req.user.id, limit),
            repos.ielts.myResultsStats(req.user.id)
        ]);
        res.json({ results, stats });
    } catch (e) { next(e); }
});

// ── Auth: pending (in-progress) attempts ─────────────────────────────
//   GET /api/ielts/pending  → list draft submissions across skills
router.get('/pending', authMiddleware, async (req, res, next) => {
    try {
        const items = await repos.ielts.findPendingAttempts(req.user.id);
        res.json({ items });
    } catch (e) { next(e); }
});

// ── Auth: abandon (delete) an in-progress submission ─────────────────
//   DELETE /api/ielts/submissions/:id            → reading/listening
//   DELETE /api/ielts/writing/submissions/:id    → writing
//   DELETE /api/ielts/speaking/submissions/:id   → speaking
router.delete('/submissions/:id', authMiddleware, async (req, res, next) => {
    try {
        const row = await repos.ielts.abandonReadingSubmission(req.params.id, req.user.id);
        if (!row) return res.status(404).json({ error: 'Not found or already submitted' });
        res.json({ ok: true, id: row.id });
    } catch (e) { next(e); }
});
router.delete('/writing/submissions/:id', authMiddleware, async (req, res, next) => {
    try {
        const row = await repos.ielts.abandonWritingSubmission(req.params.id, req.user.id);
        if (!row) return res.status(404).json({ error: 'Not found or already submitted' });
        res.json({ ok: true, id: row.id });
    } catch (e) { next(e); }
});
router.delete('/speaking/submissions/:id', authMiddleware, async (req, res, next) => {
    try {
        const row = await repos.ielts.abandonSpeakingSubmission(req.params.id, req.user.id);
        if (!row) return res.status(404).json({ error: 'Not found or already submitted' });
        res.json({ ok: true, id: row.id });
    } catch (e) { next(e); }
});

// ── Admin: tests CRUD ─────────────────────────────────────────────────
router.get('/admin/tests', adminOnly, async (req, res, next) => {
    try {
        const tests = await repos.ielts.listTests({ limit: 500 });
        res.json(tests);
    } catch (e) { next(e); }
});

router.get('/admin/tests/:id', adminOnly, async (req, res, next) => {
    try {
        const test = await repos.ielts.getTestById(req.params.id, {
            withQuestions: true, includeCorrect: true
        });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        res.json(test);
    } catch (e) { next(e); }
});

router.post('/admin/tests', adminOnly, async (req, res, next) => {
    try {
        if (!req.body.title) return res.status(400).json({ error: 'title required' });
        const test = await repos.ielts.createTest({
            ...req.body, createdBy: req.user.id
        });
        res.status(201).json(test);
    } catch (e) { next(e); }
});

router.put('/admin/tests/:id', adminOnly, async (req, res, next) => {
    try {
        const test = await repos.ielts.updateTest(req.params.id, req.body);
        if (!test) return res.status(404).json({ error: 'Test not found' });
        res.json(test);
    } catch (e) { next(e); }
});

router.delete('/admin/tests/:id', adminOnly, async (req, res, next) => {
    try {
        await repos.ielts.deleteTest(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

router.post('/admin/tests/:id/publish', adminOnly, async (req, res, next) => {
    try {
        const t = await repos.ielts.updateTest(req.params.id, { isPublished: true });
        res.json(t);
    } catch (e) { next(e); }
});

router.post('/admin/tests/:id/unpublish', adminOnly, async (req, res, next) => {
    try {
        const t = await repos.ielts.updateTest(req.params.id, { isPublished: false });
        res.json(t);
    } catch (e) { next(e); }
});

// ── Admin: passages ───────────────────────────────────────────────────
router.post('/admin/tests/:id/passages', adminOnly, async (req, res, next) => {
    try {
        if (!req.body.body) return res.status(400).json({ error: 'body required' });
        if (req.body.order === undefined) return res.status(400).json({ error: 'order required' });
        const p = await repos.ielts.addPassage(req.params.id, req.body);
        res.status(201).json(p);
    } catch (e) { next(e); }
});

router.put('/admin/passages/:id', adminOnly, async (req, res, next) => {
    try {
        const p = await repos.ielts.updatePassage(req.params.id, req.body);
        if (!p) return res.status(404).json({ error: 'Passage not found' });
        res.json(p);
    } catch (e) { next(e); }
});

router.delete('/admin/passages/:id', adminOnly, async (req, res, next) => {
    try {
        await repos.ielts.removePassage(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ── Admin: questions ──────────────────────────────────────────────────
router.post('/admin/passages/:id/questions', adminOnly, async (req, res, next) => {
    try {
        if (!req.body.type) return res.status(400).json({ error: 'type required' });
        if (req.body.order === undefined) return res.status(400).json({ error: 'order required' });
        const q = await repos.ielts.addQuestion(req.params.id, req.body);
        res.status(201).json(q);
    } catch (e) { next(e); }
});

router.put('/admin/questions/:id', adminOnly, async (req, res, next) => {
    try {
        const q = await repos.ielts.updateQuestion(req.params.id, req.body);
        if (!q) return res.status(404).json({ error: 'Question not found' });
        res.json(q);
    } catch (e) { next(e); }
});

router.delete('/admin/questions/:id', adminOnly, async (req, res, next) => {
    try {
        await repos.ielts.removeQuestion(req.params.id);
        res.json({ success: true });
    } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════
// WRITING
// ═══════════════════════════════════════════════════════════════════
const { gradeWriting, gradeSpeaking } = require('../lib/ielts-ai-grader');
const rateLimit = require('../lib/ielts-rate-limit');
const { transcribe } = require('../lib/whisper');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// GET /api/ielts/usage — current user's daily quotas
router.get('/usage', authMiddleware, async (req, res, next) => {
    try {
        res.json({
            usage: await rateLimit.getUsage(req.user.id),
            limits: rateLimit.DEFAULTS
        });
    } catch (e) { next(e); }
});

router.get('/writing/tests', async (req, res, next) => {
    try {
        const tests = await repos.ielts.listWritingTests({
            taskType: req.query.taskType ? Number(req.query.taskType) : undefined,
            limit: 200
        });
        res.json(tests);
    } catch (e) { next(e); }
});

router.get('/writing/tests/:id', async (req, res, next) => {
    try {
        const test = await repos.ielts.getTestById(req.params.id);
        if (!test || test.skill !== 'writing') return res.status(404).json({ error: 'Test not found' });
        const prompt = await repos.ielts.getWritingPromptByTestId(test.id);
        if (!prompt) return res.status(404).json({ error: 'Prompt missing' });
        res.json({ test, prompt });
    } catch (e) { next(e); }
});

router.post('/writing/tests/:id/start', authMiddleware, async (req, res, next) => {
    try {
        const prompt = await repos.ielts.getWritingPromptByTestId(req.params.id);
        if (!prompt) return res.status(404).json({ error: 'Prompt missing' });
        const sub = await repos.ielts.createWritingSubmission({
            promptId: prompt.id, userId: req.user.id
        });
        res.status(201).json({ id: sub.id, startedAt: sub.started_at });
    } catch (e) { next(e); }
});

router.post('/writing/submissions/:id/save', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getWritingSubmission(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (sub.is_complete) return res.status(409).json({ error: 'Already submitted' });
        const updated = await repos.ielts.saveWritingDraft(req.params.id, req.body.essay);
        res.json({ ok: true, wordCount: updated.word_count });
    } catch (e) { next(e); }
});

router.post('/writing/submissions/:id/submit', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getWritingSubmission(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (sub.is_complete) return res.json({ id: sub.id, alreadySubmitted: true });

        // Rate limit
        try { await rateLimit.checkAndIncrement(req.user.id, 'writing'); }
        catch (e) { return res.status(e.statusCode || 429).json({ error: e.message }); }

        const essay = (req.body.essay ?? sub.essay_text) || '';
        if (req.body.essay !== undefined) {
            await repos.ielts.saveWritingDraft(req.params.id, essay);
        }

        // Look up prompt directly
        const promptRow = await require('../lib/repos/_pool').queryOne(
            `SELECT * FROM ielts_writing_prompts WHERE id = $1`, [sub.prompt_id]
        );
        if (!promptRow) return res.status(404).json({ error: 'Prompt missing' });

        const grade = await gradeWriting({
            taskType: promptRow.task_type,
            prompt: promptRow.prompt_text,
            graphImageUrl: promptRow.graph_image_url,
            essay
        });

        const durationSec = Math.round((Date.now() - new Date(sub.started_at).getTime()) / 1000);
        const finalized = await repos.ielts.finalizeWritingSubmission(req.params.id, {
            ...grade, aiFeedback: grade.feedback, durationSec
        });
        res.json({
            id: finalized.id,
            wordCount: finalized.word_count,
            band: {
                tr: Number(finalized.band_tr), cc: Number(finalized.band_cc),
                lr: Number(finalized.band_lr), gra: Number(finalized.band_gra),
                overall: Number(finalized.band_overall)
            },
            feedback: finalized.ai_feedback
        });
    } catch (e) { next(e); }
});

router.get('/writing/submissions/:id', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getWritingSubmission(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const prompt = await require('../lib/repos/_pool').queryOne(
            `SELECT * FROM ielts_writing_prompts WHERE id = $1`, [sub.prompt_id]
        );
        res.json({ submission: sub, prompt });
    } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════
// SPEAKING
// ══════════════════════════════════════════════════════════════════════

router.get('/speaking/tests', async (req, res, next) => {
    try {
        const tests = await repos.ielts.listSpeakingTests({
            partNumber: req.query.partNumber ? Number(req.query.partNumber) : undefined,
            limit: 200
        });
        res.json(tests);
    } catch (e) { next(e); }
});

router.get('/speaking/tests/:id', async (req, res, next) => {
    try {
        const test = await repos.ielts.getTestById(req.params.id);
        if (!test || test.skill !== 'speaking') return res.status(404).json({ error: 'Test not found' });
        const part = await repos.ielts.getSpeakingPartByTestId(test.id);
        if (!part) return res.status(404).json({ error: 'Part missing' });
        res.json({ test, part });
    } catch (e) { next(e); }
});

router.post('/speaking/tests/:id/start', authMiddleware, async (req, res, next) => {
    try {
        const part = await repos.ielts.getSpeakingPartByTestId(req.params.id);
        if (!part) return res.status(404).json({ error: 'Part missing' });
        const sub = await repos.ielts.createSpeakingSubmission({
            speakingPartId: part.id, userId: req.user.id
        });
        res.status(201).json({ id: sub.id, startedAt: sub.started_at });
    } catch (e) { next(e); }
});

router.post('/speaking/submissions/:id/submit', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getSpeakingSubmission(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (sub.is_complete) return res.json({ id: sub.id, alreadySubmitted: true });

        // Rate limit
        try { await rateLimit.checkAndIncrement(req.user.id, 'speaking'); }
        catch (e) { return res.status(e.statusCode || 429).json({ error: e.message }); }

        const transcript = req.body.transcript || '';
        const audioUrl = req.body.audioUrl || null;
        const audioDriveId = req.body.audioDriveId || null;

        const partRow = await require('../lib/repos/_pool').queryOne(
            `SELECT * FROM ielts_speaking_parts WHERE id = $1`, [sub.speaking_part_id]
        );
        const grade = await gradeSpeaking({
            partNumber: partRow.part_number,
            prompts: partRow.prompts || [],
            transcript
        });

        const durationSec = Math.round((Date.now() - new Date(sub.started_at).getTime()) / 1000);
        const finalized = await repos.ielts.finalizeSpeakingSubmission(req.params.id, {
            audioDriveId, audioUrl, transcript, ...grade, aiFeedback: grade.feedback, durationSec
        });
        res.json({
            id: finalized.id, transcript: finalized.transcript,
            band: {
                fc: Number(finalized.band_fc), lr: Number(finalized.band_lr),
                gra: Number(finalized.band_gra), pron: Number(finalized.band_pron),
                overall: Number(finalized.band_overall)
            },
            feedback: finalized.ai_feedback
        });
    } catch (e) { next(e); }
});

// POST /api/ielts/speaking/transcribe — Whisper auto-transcribe
router.post('/speaking/transcribe', authMiddleware, upload.single('audio'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'audio file required' });

        try { await rateLimit.checkAndIncrement(req.user.id, 'transcription'); }
        catch (e) { return res.status(e.statusCode || 429).json({ error: e.message }); }

        const result = await transcribe({
            audioBuffer: req.file.buffer,
            mime: req.file.mimetype || 'audio/webm',
            filename: req.file.originalname || 'audio.webm',
            language: 'en'
        });
        res.json({ text: result.text, duration: result.duration, language: result.language });
    } catch (e) { next(e); }
});

router.get('/speaking/submissions/:id', authMiddleware, async (req, res, next) => {
    try {
        const sub = await repos.ielts.getSpeakingSubmission(req.params.id);
        if (!sub) return res.status(404).json({ error: 'Submission not found' });
        if (sub.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const part = await require('../lib/repos/_pool').queryOne(
            `SELECT * FROM ielts_speaking_parts WHERE id = $1`, [sub.speaking_part_id]
        );
        res.json({ submission: sub, part });
    } catch (e) { next(e); }
});

module.exports = router;
