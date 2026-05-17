// lib/repos/ielts.js — IELTS Reading (and other skills) repository
'use strict';
const { query, queryOne, withTx } = require('./_pool');
const { decodeText, decodeDeep } = require('../utils/decode-entities');

// ── Mappers ───────────────────────────────────────────────────────────
function mapTest(row) {
    if (!row) return null;
    return {
        id: row.id,
        skill: row.skill,
        module: row.module,
        title: row.title,
        description: row.description,
        source: row.source,
        durationSec: row.duration_sec,
        isPublished: row.is_published,
        requiresCode: !!row.requires_code,
        category: row.category || null,
        topic: row.topic || null,
        level: row.level || null,
        year: row.year != null ? Number(row.year) : null,
        tags: Array.isArray(row.tags) ? row.tags : [],
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapPassage(row) {
    if (!row) return null;
    return {
        id: row.id,
        testId: row.test_id,
        order: row.order,
        title: decodeText(row.title),
        body: decodeText(row.body),
        audioUrl: row.audio_url,
        audioDriveId: row.audio_drive_id || null,
        sectionNumber: row.section_number,
        imageUrls: row.image_urls || []
    };
}

function mapWritingPrompt(row) {
    if (!row) return null;
    return {
        id: row.id,
        testId: row.test_id,
        taskType: row.task_type,
        instruction: decodeText(row.instruction),
        promptText: decodeText(row.prompt_text),
        graphImageUrl: row.graph_image_url,
        graphType: row.graph_type,
        minWords: row.min_words,
        maxWords: row.max_words,
        timeLimitSec: row.time_limit_sec,
        sampleAnswers: decodeDeep(row.sample_answers || []),
        metadata: row.metadata || {}
    };
}

function mapSpeakingPart(row) {
    if (!row) return null;
    return {
        id: row.id,
        testId: row.test_id,
        partNumber: row.part_number,
        title: row.title,
        instruction: row.instruction,
        prompts: row.prompts || [],
        cueCardText: row.cue_card_text,
        prepTimeSec: row.prep_time_sec,
        talkTimeSec: row.talk_time_sec,
        sampleAnswers: row.sample_answers || []
    };
}

function mapQuestion(row, { includeCorrect = false } = {}) {
    if (!row) return null;
    const out = {
        id: row.id,
        passageId: row.passage_id,
        order: row.order,
        type: row.type,
        prompt: decodeText(row.prompt),
        payload: decodeDeep(row.payload || {}),
        config: row.config || {},
        explanation: decodeText(row.explanation)
    };
    if (includeCorrect) {
        out.correct = row.correct;
        out.alternatives = row.alternatives || [];
    }
    return out;
}

function mapSubmission(row) {
    if (!row) return null;
    return {
        id: row.id,
        testId: row.test_id,
        userId: row.user_id,
        startedAt: row.started_at,
        submittedAt: row.submitted_at,
        durationSec: row.duration_sec,
        answers: row.answers || {},
        flags: row.flags || [],
        rawScore: row.raw_score,
        bandScore: row.band_score == null ? null : Number(row.band_score),
        perQuestion: row.per_question || null,
        aiFeedback: row.ai_feedback,
        isComplete: row.is_complete,
        createdAt: row.created_at
    };
}

// ── Tests ─────────────────────────────────────────────────────────────
async function listTests({
    skill, module: mod, isPublished,
    category, topic, level, year, tag,
    q, limit = 100
} = {}) {
    const where = [];
    const params = [];
    if (skill)        { params.push(skill);   where.push(`t.skill = $${params.length}`); }
    if (mod)          { params.push(mod);     where.push(`t.module = $${params.length}`); }
    if (isPublished !== undefined) {
        params.push(!!isPublished);
        where.push(`t.is_published = $${params.length}`);
    }
    if (category)     { params.push(category); where.push(`t.category = $${params.length}`); }
    if (topic)        { params.push(topic);    where.push(`t.topic = $${params.length}`); }
    if (level)        { params.push(level);    where.push(`t.level = $${params.length}`); }
    if (year)         { params.push(Number(year)); where.push(`t.year = $${params.length}`); }
    if (tag)          { params.push(JSON.stringify([tag])); where.push(`t.tags @> $${params.length}::jsonb`); }
    if (q && q.trim()) {
        params.push('%' + q.trim().toLowerCase() + '%');
        where.push(`LOWER(t.title) LIKE $${params.length}`);
    }
    params.push(limit);
    // Annotate with question_count so the UI can hide / mark empty tests.
    const rows = await query(
        `SELECT t.*,
                COALESCE(q.cnt, 0)::int AS question_count
           FROM ielts_tests t
           LEFT JOIN (
               SELECT p.test_id, COUNT(q.id) AS cnt
                 FROM ielts_passages p
            LEFT JOIN ielts_questions q ON q.passage_id = p.id
             GROUP BY p.test_id
           ) q ON q.test_id = t.id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY t.created_at DESC
         LIMIT $${params.length}`,
        params
    );
    return rows.map(r => ({ ...mapTest(r), questionCount: r.question_count }));
}

// ── Catalog facets — aggregate counts for filter chips ───────────────
async function listTaxonomyFacets({ skill, isPublished = true } = {}) {
    const where = ['1=1'];
    const params = [];
    if (skill)            { params.push(skill);              where.push(`skill = $${params.length}`); }
    if (isPublished !== undefined) { params.push(!!isPublished); where.push(`is_published = $${params.length}`); }
    const w = where.join(' AND ');

    const [categories, topics, levels, years] = await Promise.all([
        query(`SELECT category AS key, COUNT(*)::int AS count FROM ielts_tests WHERE ${w} AND category IS NOT NULL GROUP BY category ORDER BY count DESC`, params),
        query(`SELECT topic    AS key, COUNT(*)::int AS count FROM ielts_tests WHERE ${w} AND topic    IS NOT NULL GROUP BY topic    ORDER BY count DESC`, params),
        query(`SELECT level    AS key, COUNT(*)::int AS count FROM ielts_tests WHERE ${w} AND level    IS NOT NULL GROUP BY level    ORDER BY count DESC`, params),
        query(`SELECT year::text AS key, COUNT(*)::int AS count FROM ielts_tests WHERE ${w} AND year     IS NOT NULL GROUP BY year     ORDER BY year DESC`, params)
    ]);
    return { categories, topics, levels, years };
}

async function getTestById(id, { withQuestions = false, includeCorrect = false } = {}) {
    const test = mapTest(await queryOne(`SELECT * FROM ielts_tests WHERE id = $1`, [id]));
    if (!test) return null;
    if (!withQuestions) return test;

    const passages = (await query(
        `SELECT * FROM ielts_passages WHERE test_id = $1 ORDER BY "order"`,
        [id]
    )).map(mapPassage);

    if (passages.length === 0) {
        return { ...test, passages: [] };
    }

    const passageIds = passages.map(p => p.id);
    const questions = await query(
        `SELECT * FROM ielts_questions
         WHERE passage_id = ANY($1::uuid[])
         ORDER BY "order"`,
        [passageIds]
    );

    const byPassage = new Map(passages.map(p => [p.id, { ...p, questions: [] }]));
    for (const q of questions) {
        const mapped = mapQuestion(q, { includeCorrect });
        const p = byPassage.get(q.passage_id);
        if (p) p.questions.push(mapped);
    }
    return { ...test, passages: [...byPassage.values()] };
}

async function createTest(payload) {
    const row = await queryOne(
        `INSERT INTO ielts_tests
            (id, skill, module, title, description, source, duration_sec,
             is_published, created_by, category, topic, level, year, tags)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9,
                 $10, $11, $12, $13, $14::jsonb)
         RETURNING *`,
        [
            payload.id || null,
            payload.skill || 'reading',
            payload.module || 'academic',
            payload.title,
            payload.description || null,
            payload.source || null,
            payload.durationSec || 60 * 60,
            payload.isPublished || false,
            payload.createdBy || null,
            payload.category || null,
            payload.topic || null,
            payload.level || null,
            payload.year || null,
            JSON.stringify(Array.isArray(payload.tags) ? payload.tags : [])
        ]
    );
    return mapTest(row);
}

async function updateTest(id, patch) {
    const sets = [];
    const params = [];
    const map = {
        title: 'title', description: 'description', source: 'source',
        durationSec: 'duration_sec', isPublished: 'is_published',
        skill: 'skill', module: 'module',
        category: 'category', topic: 'topic', level: 'level', year: 'year'
    };
    for (const [k, col] of Object.entries(map)) {
        if (patch[k] !== undefined) {
            params.push(patch[k]);
            sets.push(`${col} = $${params.length}`);
        }
    }
    if (patch.tags !== undefined) {
        params.push(JSON.stringify(Array.isArray(patch.tags) ? patch.tags : []));
        sets.push(`tags = $${params.length}::jsonb`);
    }
    if (!sets.length) return getTestById(id);
    params.push(id);
    const row = await queryOne(
        `UPDATE ielts_tests SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
    );
    return mapTest(row);
}

async function deleteTest(id) {
    await query(`DELETE FROM ielts_tests WHERE id = $1`, [id]);
    return true;
}

// ── Passages ──────────────────────────────────────────────────────────
async function addPassage(testId, payload) {
    const row = await queryOne(
        `INSERT INTO ielts_passages (id, test_id, "order", title, body, audio_url, image_urls)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING *`,
        [
            payload.id || null,
            testId,
            payload.order,
            payload.title || null,
            payload.body,
            payload.audioUrl || null,
            JSON.stringify(payload.imageUrls || [])
        ]
    );
    return mapPassage(row);
}

async function updatePassage(id, patch) {
    const sets = [];
    const params = [];
    const map = { order: '"order"', title: 'title', body: 'body',
                  audioUrl: 'audio_url' };
    for (const [k, col] of Object.entries(map)) {
        if (patch[k] !== undefined) {
            params.push(patch[k]);
            sets.push(`${col} = $${params.length}`);
        }
    }
    if (patch.imageUrls !== undefined) {
        params.push(JSON.stringify(patch.imageUrls));
        sets.push(`image_urls = $${params.length}::jsonb`);
    }
    if (!sets.length) return null;
    params.push(id);
    const row = await queryOne(
        `UPDATE ielts_passages SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
    );
    return mapPassage(row);
}

async function removePassage(id) {
    await query(`DELETE FROM ielts_passages WHERE id = $1`, [id]);
    return true;
}

// ── Questions ─────────────────────────────────────────────────────────
async function addQuestion(passageId, payload) {
    const row = await queryOne(
        `INSERT INTO ielts_questions
            (id, passage_id, "order", type, prompt, payload, correct,
             alternatives, config, explanation)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5,
                 $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10)
         RETURNING *`,
        [
            payload.id || null,
            passageId,
            payload.order,
            payload.type,
            payload.prompt,
            JSON.stringify(payload.payload || {}),
            JSON.stringify(payload.correct ?? null),
            JSON.stringify(payload.alternatives || []),
            JSON.stringify(payload.config || {}),
            payload.explanation || null
        ]
    );
    return mapQuestion(row, { includeCorrect: true });
}

async function updateQuestion(id, patch) {
    const sets = [];
    const params = [];
    const colMap = {
        order: '"order"', type: 'type', prompt: 'prompt',
        explanation: 'explanation'
    };
    for (const [k, col] of Object.entries(colMap)) {
        if (patch[k] !== undefined) {
            params.push(patch[k]);
            sets.push(`${col} = $${params.length}`);
        }
    }
    const jsonbMap = {
        payload: 'payload', correct: 'correct',
        alternatives: 'alternatives', config: 'config'
    };
    for (const [k, col] of Object.entries(jsonbMap)) {
        if (patch[k] !== undefined) {
            params.push(JSON.stringify(patch[k]));
            sets.push(`${col} = $${params.length}::jsonb`);
        }
    }
    if (!sets.length) return null;
    params.push(id);
    const row = await queryOne(
        `UPDATE ielts_questions SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
    );
    return mapQuestion(row, { includeCorrect: true });
}

async function removeQuestion(id) {
    await query(`DELETE FROM ielts_questions WHERE id = $1`, [id]);
    return true;
}

// ── Band lookup ───────────────────────────────────────────────────────
async function bandLookup(skill, module_, rawScore) {
    const row = await queryOne(
        `SELECT band_score FROM ielts_band_tables
         WHERE skill = $1 AND module = $2 AND raw_score = $3`,
        [skill, module_, rawScore]
    );
    if (row) return Number(row.band_score);

    // Closest match below
    const below = await queryOne(
        `SELECT band_score FROM ielts_band_tables
         WHERE skill = $1 AND module = $2 AND raw_score <= $3
         ORDER BY raw_score DESC LIMIT 1`,
        [skill, module_, rawScore]
    );
    if (below) return Number(below.band_score);
    return 0;
}

// ── Submissions ───────────────────────────────────────────────────────
async function startSubmission({ testId, userId }) {
    const row = await queryOne(
        `INSERT INTO ielts_submissions (test_id, user_id, started_at)
         VALUES ($1, $2, now())
         RETURNING *`,
        [testId, userId]
    );
    return mapSubmission(row);
}

async function getSubmissionById(id) {
    return mapSubmission(await queryOne(
        `SELECT * FROM ielts_submissions WHERE id = $1`, [id]
    ));
}

async function saveAnswers(submissionId, answers, flags) {
    const sets = [];
    const params = [];
    if (answers !== undefined) {
        params.push(JSON.stringify(answers));
        sets.push(`answers = $${params.length}::jsonb`);
    }
    if (flags !== undefined) {
        params.push(JSON.stringify(flags));
        sets.push(`flags = $${params.length}::jsonb`);
    }
    if (!sets.length) return null;
    params.push(submissionId);
    const row = await queryOne(
        `UPDATE ielts_submissions SET ${sets.join(', ')}
         WHERE id = $${params.length} RETURNING *`,
        params
    );
    return mapSubmission(row);
}

async function finalizeSubmission(submissionId, { rawScore, bandScore, perQuestion, durationSec, aiFeedback }) {
    const row = await queryOne(
        `UPDATE ielts_submissions
         SET submitted_at = now(),
             raw_score = $1, band_score = $2,
             per_question = $3::jsonb,
             duration_sec = $4,
             ai_feedback = $5,
             is_complete = true
         WHERE id = $6
         RETURNING *`,
        [rawScore, bandScore, JSON.stringify(perQuestion || []),
         durationSec || null, aiFeedback || null, submissionId]
    );
    return mapSubmission(row);
}

async function listSubmissions({ userId, testId, limit = 50 } = {}) {
    const where = [];
    const params = [];
    if (userId) { params.push(userId); where.push(`user_id = $${params.length}`); }
    if (testId) { params.push(testId); where.push(`test_id = $${params.length}`); }
    params.push(limit);
    const rows = await query(
        `SELECT * FROM ielts_submissions
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params
    );
    return rows.map(mapSubmission);
}

// ── Writing prompts ───────────────────────────────────────────────────
async function getWritingPromptByTestId(testId) {
    return mapWritingPrompt(await queryOne(
        `SELECT * FROM ielts_writing_prompts WHERE test_id = $1 LIMIT 1`,
        [testId]
    ));
}

async function listWritingTests({ taskType, limit = 100 } = {}) {
    const params = [];
    let where = `t.skill = 'writing' AND t.is_published = true`;
    if (taskType) {
        params.push(taskType);
        where += ` AND p.task_type = $${params.length}`;
    }
    params.push(limit);
    return query(
        `SELECT t.*, p.id AS prompt_id, p.task_type, p.graph_image_url, p.min_words, p.time_limit_sec
         FROM ielts_tests t
         LEFT JOIN ielts_writing_prompts p ON p.test_id = t.id
         WHERE ${where}
         ORDER BY t.created_at DESC LIMIT $${params.length}`,
        params
    );
}

async function createWritingSubmission({ promptId, userId }) {
    return queryOne(
        `INSERT INTO ielts_writing_submissions (prompt_id, user_id) VALUES ($1, $2) RETURNING *`,
        [promptId, userId]
    );
}

async function getWritingSubmission(id) {
    return queryOne(`SELECT * FROM ielts_writing_submissions WHERE id = $1`, [id]);
}

async function saveWritingDraft(id, essay) {
    const wc = String(essay || '').trim().split(/\s+/).filter(Boolean).length;
    return queryOne(
        `UPDATE ielts_writing_submissions SET essay_text = $1, word_count = $2 WHERE id = $3 RETURNING *`,
        [essay || '', wc, id]
    );
}

async function finalizeWritingSubmission(id, { bandTr, bandCc, bandLr, bandGra, bandOverall, aiFeedback, durationSec }) {
    return queryOne(
        `UPDATE ielts_writing_submissions
         SET submitted_at = now(), is_complete = true,
             band_tr = $1, band_cc = $2, band_lr = $3, band_gra = $4, band_overall = $5,
             ai_feedback = $6::jsonb, duration_sec = $7
         WHERE id = $8 RETURNING *`,
        [bandTr, bandCc, bandLr, bandGra, bandOverall, JSON.stringify(aiFeedback || {}), durationSec || null, id]
    );
}

// ── Speaking parts ────────────────────────────────────────────────────
async function getSpeakingPartByTestId(testId) {
    return mapSpeakingPart(await queryOne(
        `SELECT * FROM ielts_speaking_parts WHERE test_id = $1 LIMIT 1`,
        [testId]
    ));
}

async function listSpeakingTests({ partNumber, limit = 100 } = {}) {
    const params = [];
    let where = `t.skill = 'speaking' AND t.is_published = true`;
    if (partNumber) {
        params.push(partNumber);
        where += ` AND p.part_number = $${params.length}`;
    }
    params.push(limit);
    return query(
        `SELECT t.*, p.id AS part_id, p.part_number, p.cue_card_text, p.prep_time_sec, p.talk_time_sec
         FROM ielts_tests t
         LEFT JOIN ielts_speaking_parts p ON p.test_id = t.id
         WHERE ${where}
         ORDER BY t.created_at DESC LIMIT $${params.length}`,
        params
    );
}

async function createSpeakingSubmission({ speakingPartId, userId }) {
    return queryOne(
        `INSERT INTO ielts_speaking_submissions (speaking_part_id, user_id) VALUES ($1, $2) RETURNING *`,
        [speakingPartId, userId]
    );
}

async function getSpeakingSubmission(id) {
    return queryOne(`SELECT * FROM ielts_speaking_submissions WHERE id = $1`, [id]);
}

async function finalizeSpeakingSubmission(id, { audioDriveId, audioUrl, transcript, bandFc, bandLr, bandGra, bandPron, bandOverall, aiFeedback, durationSec }) {
    return queryOne(
        `UPDATE ielts_speaking_submissions
         SET submitted_at = now(), is_complete = true,
             audio_drive_id = $1, audio_url = $2, transcript = $3,
             band_fc = $4, band_lr = $5, band_gra = $6, band_pron = $7, band_overall = $8,
             ai_feedback = $9::jsonb, duration_sec = $10
         WHERE id = $11 RETURNING *`,
        [audioDriveId, audioUrl, transcript, bandFc, bandLr, bandGra, bandPron, bandOverall,
         JSON.stringify(aiFeedback || {}), durationSec || null, id]
    );
}

// ── Aggregated student results ────────────────────────────────────────
// Returns latest N completed submissions across reading / writing / speaking,
// already shaped for the "My Results" page. Each row has a uniform shape so
// the UI can render them in a single timeline regardless of skill.
async function listMyResults(userId, limit = 50) {
    if (!userId) return [];
    const rows = await query(
        `WITH unified AS (
            -- Reading / Listening
            SELECT
                'reading'::text     AS skill_kind,
                s.id::text          AS submission_id,
                s.test_id::text     AS ref_id,
                NULL::text          AS quiz_exam_id,
                t.title             AS title,
                t.skill::text       AS skill,
                NULL::int           AS part_number,
                s.raw_score::float  AS overall_score,
                s.band_score::float AS band_overall,
                NULL::float         AS band_a,
                NULL::float         AS band_b,
                NULL::float         AS band_c,
                NULL::float         AS band_d,
                s.submitted_at      AS submitted_at,
                NULL::int           AS duration_sec
              FROM ielts_submissions s
              JOIN ielts_tests t ON t.id = s.test_id
             WHERE s.user_id = $1 AND s.is_complete = true AND s.hidden_by_user_at IS NULL

            UNION ALL

            -- Writing
            SELECT
                'writing'::text,
                ws.id::text,
                wp.test_id::text,
                NULL::text,
                t.title,
                'writing'::text,
                NULL::int,
                ws.band_overall::float,
                ws.band_overall::float,
                ws.band_tr::float,
                ws.band_cc::float,
                ws.band_lr::float,
                ws.band_gra::float,
                ws.submitted_at,
                NULL::int
              FROM ielts_writing_submissions ws
              JOIN ielts_writing_prompts wp ON wp.id = ws.prompt_id
              JOIN ielts_tests t ON t.id = wp.test_id
             WHERE ws.user_id = $1 AND ws.is_complete = true AND ws.hidden_by_user_at IS NULL

            UNION ALL

            -- Speaking
            SELECT
                'speaking'::text,
                ss.id::text,
                sp.test_id::text,
                NULL::text,
                t.title,
                'speaking'::text,
                sp.part_number::int,
                ss.band_overall::float,
                ss.band_overall::float,
                ss.band_fc::float,
                ss.band_lr::float,
                ss.band_gra::float,
                ss.band_pron::float,
                ss.submitted_at,
                ss.duration_sec
              FROM ielts_speaking_submissions ss
              JOIN ielts_speaking_parts sp ON sp.id = ss.speaking_part_id
              JOIN ielts_tests t ON t.id = sp.test_id
             WHERE ss.user_id = $1 AND ss.is_complete = true AND ss.hidden_by_user_at IS NULL

            UNION ALL

            -- TracNghiem (quiz) submissions
            SELECT
                'quiz'::text,
                os.id::text,
                NULL::text,
                os.exam_id::text,            -- quiz exam id (text, not uuid)
                COALESCE(e.title, 'Đề thi')  AS title,
                'quiz'::text,
                NULL::int,
                os.score::float,             -- 0-10 scale
                NULL::float,                 -- no band for quiz
                NULL::float, NULL::float, NULL::float, NULL::float,
                os.completed_at,
                NULL::int
              FROM open_submissions os
              LEFT JOIN exams e ON e.id = os.exam_id
             WHERE os.user_id = $1 AND os.completed_at IS NOT NULL
        )
        SELECT * FROM unified
        ORDER BY submitted_at DESC NULLS LAST
        LIMIT $2`,
        [userId, limit]
    );
    return rows.map(r => ({
        skillKind: r.skill_kind,
        submissionId: r.submission_id,
        testId: r.ref_id,
        // For quiz items the textual exam_id (used by /result.html) is
        // returned alongside; UI should prefer this when skillKind === 'quiz'.
        quizExamId: r.quiz_exam_id || null,
        title: r.title,
        skill: r.skill,
        partNumber: r.part_number,
        overallScore: r.overall_score,
        bandOverall: r.band_overall,
        bandA: r.band_a,
        bandB: r.band_b,
        bandC: r.band_c,
        bandD: r.band_d,
        submittedAt: r.submitted_at,
        durationSec: r.duration_sec
    }));
}

async function myResultsStats(userId) {
    if (!userId) return null;
    const rows = await query(
        `WITH all_completed AS (
            SELECT 'reading'::text AS kind, band_score::float AS band, NULL::float AS score, submitted_at FROM ielts_submissions WHERE user_id = $1 AND is_complete = true AND band_score IS NOT NULL AND hidden_by_user_at IS NULL
            UNION ALL
            SELECT 'writing'::text,  band_overall::float, NULL::float, submitted_at FROM ielts_writing_submissions WHERE user_id = $1 AND is_complete = true AND band_overall IS NOT NULL AND hidden_by_user_at IS NULL
            UNION ALL
            SELECT 'speaking'::text, band_overall::float, NULL::float, submitted_at FROM ielts_speaking_submissions WHERE user_id = $1 AND is_complete = true AND band_overall IS NOT NULL AND hidden_by_user_at IS NULL
            UNION ALL
            SELECT 'quiz'::text,     NULL::float, score::float, completed_at FROM open_submissions WHERE user_id = $1 AND completed_at IS NOT NULL AND score IS NOT NULL
        )
        SELECT kind,
               COUNT(*)::int      AS count,
               AVG(band)::float   AS avg_band,
               MAX(band)::float   AS max_band,
               AVG(score)::float  AS avg_score,
               MAX(score)::float  AS max_score
          FROM all_completed
         GROUP BY kind`,
        [userId]
    );
    const out = { reading: null, writing: null, speaking: null, quiz: null, total: 0 };
    for (const r of rows) {
        out[r.kind] = {
            count: r.count,
            avgBand: r.avg_band,
            maxBand: r.max_band,
            avgScore: r.avg_score,
            maxScore: r.max_score
        };
        out.total += r.count;
    }
    return out;
}

// ── Abandon / cancel in-progress attempts ─────────────────────────
async function abandonReadingSubmission(id, userId) {
    return queryOne(
        `DELETE FROM ielts_submissions
          WHERE id = $1 AND user_id = $2 AND is_complete = false
      RETURNING id`,
        [id, userId]
    );
}
async function abandonWritingSubmission(id, userId) {
    return queryOne(
        `DELETE FROM ielts_writing_submissions
          WHERE id = $1 AND user_id = $2 AND is_complete = false
      RETURNING id`,
        [id, userId]
    );
}
async function abandonSpeakingSubmission(id, userId) {
    return queryOne(
        `DELETE FROM ielts_speaking_submissions
          WHERE id = $1 AND user_id = $2 AND is_complete = false
      RETURNING id`,
        [id, userId]
    );
}

// ── User soft-delete (hide from my-results) ───────────────────────
// Only the owner can hide. Hiding a draft (is_complete=false) is a hard
// abandon since drafts have no audit value.
async function hideReadingSubmission(id, userId) {
    return queryOne(
        `UPDATE ielts_submissions
            SET hidden_by_user_at = now()
          WHERE id = $1 AND user_id = $2 AND is_complete = true
                AND hidden_by_user_at IS NULL
      RETURNING id`,
        [id, userId]
    );
}
async function hideWritingSubmission(id, userId) {
    return queryOne(
        `UPDATE ielts_writing_submissions
            SET hidden_by_user_at = now()
          WHERE id = $1 AND user_id = $2 AND is_complete = true
                AND hidden_by_user_at IS NULL
      RETURNING id`,
        [id, userId]
    );
}
async function hideSpeakingSubmission(id, userId) {
    return queryOne(
        `UPDATE ielts_speaking_submissions
            SET hidden_by_user_at = now()
          WHERE id = $1 AND user_id = $2 AND is_complete = true
                AND hidden_by_user_at IS NULL
      RETURNING id`,
        [id, userId]
    );
}

// ── Admin hard delete ────────────────────────────────────────────
// Removes the row entirely. User loses the history too — by design.
async function adminDeleteReadingSubmission(id) {
    return queryOne(
        `DELETE FROM ielts_submissions WHERE id = $1 RETURNING id`,
        [id]
    );
}
async function adminDeleteWritingSubmission(id) {
    return queryOne(
        `DELETE FROM ielts_writing_submissions WHERE id = $1 RETURNING id`,
        [id]
    );
}
async function adminDeleteSpeakingSubmission(id) {
    return queryOne(
        `DELETE FROM ielts_speaking_submissions WHERE id = $1 RETURNING id`,
        [id]
    );
}

// ── Resume helpers: list user's pending (not completed) attempts ─────
async function findPendingAttempts(userId) {
    if (!userId) return [];
    const rows = await query(
        `SELECT 'reading' AS kind, s.id AS submission_id, s.test_id::text AS ref_id,
                t.title, t.skill::text AS skill, s.started_at
           FROM ielts_submissions s
           JOIN ielts_tests t ON t.id = s.test_id
          WHERE s.user_id = $1 AND s.is_complete = false
        UNION ALL
         SELECT 'writing', ws.id, wp.test_id::text,
                t.title, 'writing', ws.started_at
           FROM ielts_writing_submissions ws
           JOIN ielts_writing_prompts wp ON wp.id = ws.prompt_id
           JOIN ielts_tests t ON t.id = wp.test_id
          WHERE ws.user_id = $1 AND ws.is_complete = false
        UNION ALL
         SELECT 'speaking', ss.id, sp.test_id::text,
                t.title, 'speaking', ss.started_at
           FROM ielts_speaking_submissions ss
           JOIN ielts_speaking_parts sp ON sp.id = ss.speaking_part_id
           JOIN ielts_tests t ON t.id = sp.test_id
          WHERE ss.user_id = $1 AND ss.is_complete = false
          ORDER BY started_at DESC
          LIMIT 20`,
        [userId]
    );
    return rows.map(r => ({
        kind: r.kind,
        submissionId: r.submission_id,
        refId: r.ref_id,
        title: r.title,
        skill: r.skill,
        startedAt: r.started_at
    }));
}

module.exports = {
    listTests, listTaxonomyFacets, getTestById, createTest, updateTest, deleteTest,
    addPassage, updatePassage, removePassage,
    addQuestion, updateQuestion, removeQuestion,
    bandLookup,
    startSubmission, getSubmissionById, saveAnswers,
    finalizeSubmission, listSubmissions,
    // Writing
    getWritingPromptByTestId, listWritingTests,
    createWritingSubmission, getWritingSubmission,
    saveWritingDraft, finalizeWritingSubmission,
    // Speaking
    getSpeakingPartByTestId, listSpeakingTests,
    createSpeakingSubmission, getSpeakingSubmission,
    finalizeSpeakingSubmission,
    // Abandon / pending
    abandonReadingSubmission, abandonWritingSubmission, abandonSpeakingSubmission,
    hideReadingSubmission, hideWritingSubmission, hideSpeakingSubmission,
    adminDeleteReadingSubmission, adminDeleteWritingSubmission, adminDeleteSpeakingSubmission,
    findPendingAttempts,
    // Aggregated
    listMyResults, myResultsStats
};
