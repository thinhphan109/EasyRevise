// lib/repos/exams.js
//
// Repository for the TracNghiem (legacy school-exam) data layer.
//
// The on-disk model used to be a single big JSON document where each `exam`
// embedded its sections, questions, access codes, and submissions inline.
// In Postgres these are split across `exams`, `exam_sections`,
// `exam_questions`, `access_codes`, `code_usages`, `open_submissions`.
//
// `getById` and `listAll` rebuild the legacy shape so existing route code
// can keep treating an exam as one object. Mutations (`addSection`,
// `addQuestion`, `addCode`, …) write to the normalized tables directly.
'use strict';
const { query, queryOne, withTx } = require('./_pool');

// ── Row → JS mappers ──────────────────────────────────────────────────
function mapExamRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title,
        subject: row.subject,
        year: row.year,
        timeLimit: row.time_limit,
        requireCode: !!row.require_code,
        autoGrade: !!row.auto_grade,
        aiExplainLimit: row.ai_explain_limit || 0,
        visible: row.visible !== false,
        sortOrder: row.sort_order || 0,
        settings: row.settings || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapSectionRow(row, questions = []) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        instruction: row.instruction,
        ...(row.metadata || {}),
        questions
    };
}

function mapQuestionRow(row) {
    // Question payload already has id baked in; trust the column for canonical id.
    return { ...(row.payload || {}), id: row.id };
}

function mapAccessCodeRow(row) {
    return {
        code: row.code,
        maxUses: row.max_uses,
        maxAttempts: row.max_attempts,
        ...(row.metadata || {})
    };
}

function mapOpenSubmissionRow(row) {
    return {
        id: String(row.id),
        examId: row.exam_id,
        userId: row.user_id,
        displayName: row.display_name,
        score: row.score == null ? null : Number(row.score),
        result: row.result,
        essayGrades: row.essay_grades || [],
        completedAt: row.completed_at,
        ...(row.metadata || {})
    };
}

// ── Hydration ─────────────────────────────────────────────────────────
async function hydrate(exam) {
    if (!exam) return null;
    const sections = await query(
        `SELECT * FROM exam_sections WHERE exam_id = $1 ORDER BY "order"`,
        [exam.id]
    );
    const sectionIds = sections.map(s => s.id);
    const questions = sectionIds.length
        ? await query(
            `SELECT * FROM exam_questions WHERE section_id = ANY($1::text[]) ORDER BY section_id, "order"`,
            [sectionIds]
        )
        : [];
    const codes = await query(
        `SELECT * FROM access_codes WHERE exam_id = $1 ORDER BY created_at`,
        [exam.id]
    );
    const opens = await query(
        `SELECT * FROM open_submissions WHERE exam_id = $1 ORDER BY completed_at DESC`,
        [exam.id]
    );

    const qBySection = new Map();
    for (const q of questions) {
        const list = qBySection.get(q.section_id) || [];
        list.push(mapQuestionRow(q));
        qBySection.set(q.section_id, list);
    }

    return {
        ...exam,
        sections: sections.map(s => mapSectionRow(s, qBySection.get(s.id) || [])),
        accessCodes: codes.map(mapAccessCodeRow),
        openSubmissions: opens.map(mapOpenSubmissionRow)
    };
}

// ── Reads ─────────────────────────────────────────────────────────────
async function listAll() {
    const rows = await query(`SELECT * FROM exams ORDER BY sort_order, updated_at DESC`);
    const exams = rows.map(mapExamRow);
    return Promise.all(exams.map(hydrate));
}

async function getById(id) {
    const exam = mapExamRow(await queryOne(`SELECT * FROM exams WHERE id = $1`, [id]));
    return hydrate(exam);
}

async function findByAccessCode(code) {
    const row = await queryOne(`SELECT exam_id FROM access_codes WHERE code = $1`, [code]);
    return row ? getById(row.exam_id) : null;
}

// ── Top-level exam mutations ──────────────────────────────────────────
async function create(input) {
    const row = await queryOne(
        `INSERT INTO exams (id, title, subject, year, time_limit, require_code,
                            auto_grade, ai_explain_limit, visible, sort_order, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
         RETURNING *`,
        [
            input.id, input.title, input.subject || null, input.year || null,
            input.timeLimit || 0, !!input.requireCode,
            input.autoGrade !== false, input.aiExplainLimit || 0,
            input.visible !== false, input.sortOrder || 0,
            JSON.stringify(input.settings || {})
        ]
    );
    return mapExamRow(row);
}

async function update(id, patch) {
    const fields = [];
    const values = [];
    let i = 1;
    const map = {
        title: 'title', subject: 'subject', year: 'year',
        timeLimit: 'time_limit', requireCode: 'require_code',
        autoGrade: 'auto_grade', aiExplainLimit: 'ai_explain_limit',
        visible: 'visible', sortOrder: 'sort_order',
        settings: 'settings'
    };
    for (const [k, v] of Object.entries(patch)) {
        const col = map[k];
        if (!col) continue;
        fields.push(`${col} = $${i++}`);
        values.push(k === 'settings' ? JSON.stringify(v) : v);
    }
    if (!fields.length) return getById(id);
    values.push(id);
    const row = await queryOne(
        `UPDATE exams SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
    );
    return hydrate(mapExamRow(row));
}

async function remove(id) {
    return withTx(async (c) => {
        await c.query(`DELETE FROM access_codes  WHERE exam_id = $1`, [id]);
        await c.query(`DELETE FROM open_submissions WHERE exam_id = $1`, [id]);
        await c.query(`DELETE FROM exam_questions
                        WHERE section_id IN (SELECT id FROM exam_sections WHERE exam_id = $1)`, [id]);
        await c.query(`DELETE FROM exam_sections WHERE exam_id = $1`, [id]);
        await c.query(`DELETE FROM exams         WHERE id      = $1`, [id]);
    });
}

// ── Sections ──────────────────────────────────────────────────────────
async function nextSectionOrder(examId) {
    const r = await queryOne(
        `SELECT COALESCE(max("order"), -1) + 1 AS next FROM exam_sections WHERE exam_id = $1`,
        [examId]
    );
    return r ? Number(r.next) : 0;
}

async function addSection(examId, section) {
    const order = section.order != null ? section.order : await nextSectionOrder(examId);
    const meta = { ...section };
    delete meta.id; delete meta.type; delete meta.title;
    delete meta.instruction; delete meta.questions; delete meta.order;

    const row = await queryOne(
        `INSERT INTO exam_sections (id, exam_id, "order", type, title, instruction, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING *`,
        [section.id, examId, order, section.type || 'multiple-choice',
         section.title || null, section.instruction || null,
         JSON.stringify(meta)]
    );
    return mapSectionRow(row);
}

async function updateSection(sectionId, patch) {
    const fields = [];
    const values = [];
    let i = 1;
    const map = { type: 'type', title: 'title', instruction: 'instruction', order: '"order"' };
    for (const [k, v] of Object.entries(patch)) {
        const col = map[k];
        if (!col) continue;
        fields.push(`${col} = $${i++}`);
        values.push(v);
    }
    if (!fields.length) return null;
    values.push(sectionId);
    const row = await queryOne(
        `UPDATE exam_sections SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
    );
    return mapSectionRow(row);
}

async function removeSection(sectionId) {
    return withTx(async (c) => {
        await c.query(`DELETE FROM exam_questions WHERE section_id = $1`, [sectionId]);
        await c.query(`DELETE FROM exam_sections  WHERE id         = $1`, [sectionId]);
    });
}

// ── Questions ─────────────────────────────────────────────────────────
async function nextQuestionOrder(sectionId) {
    const r = await queryOne(
        `SELECT COALESCE(max("order"), -1) + 1 AS next FROM exam_questions WHERE section_id = $1`,
        [sectionId]
    );
    return r ? Number(r.next) : 0;
}

async function addQuestion(sectionId, question) {
    const order = question.order != null ? question.order : await nextQuestionOrder(sectionId);
    const row = await queryOne(
        `INSERT INTO exam_questions (id, section_id, "order", payload)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING *`,
        [question.id, sectionId, order, JSON.stringify(question)]
    );
    return mapQuestionRow(row);
}

async function updateQuestion(questionId, patch) {
    // Patch is a partial question object; merge into existing payload.
    const cur = await queryOne(`SELECT payload FROM exam_questions WHERE id = $1`, [questionId]);
    if (!cur) return null;
    const merged = { ...(cur.payload || {}), ...patch, id: questionId };
    await query(
        `UPDATE exam_questions SET payload = $1::jsonb WHERE id = $2`,
        [JSON.stringify(merged), questionId]
    );
    return merged;
}

async function removeQuestion(questionId) {
    await query(`DELETE FROM exam_questions WHERE id = $1`, [questionId]);
}

// ── Access codes ──────────────────────────────────────────────────────
async function addCode({ examId, code, maxUses = 1, maxAttempts = 0, metadata = {} }) {
    const row = await queryOne(
        `INSERT INTO access_codes (code, exam_id, max_uses, max_attempts, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [code, examId, maxUses, maxAttempts, JSON.stringify(metadata)]
    );
    return mapAccessCodeRow(row);
}

async function removeCode(code) {
    await query(`DELETE FROM access_codes WHERE code = $1`, [code]);
}

async function getCode(code) {
    return mapAccessCodeRow(await queryOne(`SELECT * FROM access_codes WHERE code = $1`, [code]));
}

// ── Code usages ───────────────────────────────────────────────────────
async function recordCodeUsage({ code, userId = null, displayName = null, result = null, score = null, essayGrades = [], completed = false }) {
    const row = await queryOne(
        `INSERT INTO code_usages (code, user_id, display_name, completed,
                                  completed_at, score, result, essay_grades)
         VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END,
                 $5, $6::jsonb, $7::jsonb)
         RETURNING *`,
        [code, userId, displayName, completed, score,
         JSON.stringify(result), JSON.stringify(essayGrades)]
    );
    return row;
}

async function listUsagesByCode(code) {
    return query(`SELECT * FROM code_usages WHERE code = $1 ORDER BY started_at DESC`, [code]);
}

// ── Open submissions ──────────────────────────────────────────────────
async function recordOpenSubmission({ examId, userId = null, displayName = null, score = null, result = null, essayGrades = [] }) {
    const row = await queryOne(
        `INSERT INTO open_submissions (exam_id, user_id, display_name, score, result, essay_grades)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
         RETURNING *`,
        [examId, userId, displayName, score,
         JSON.stringify(result), JSON.stringify(essayGrades)]
    );
    return mapOpenSubmissionRow(row);
}

async function listOpenSubmissions(examId) {
    const rows = await query(
        `SELECT * FROM open_submissions WHERE exam_id = $1 ORDER BY completed_at DESC`,
        [examId]
    );
    return rows.map(mapOpenSubmissionRow);
}

module.exports = {
    listAll, getById, findByAccessCode,
    create, update, remove,
    addSection, updateSection, removeSection,
    addQuestion, updateQuestion, removeQuestion,
    addCode, removeCode, getCode,
    recordCodeUsage, listUsagesByCode,
    recordOpenSubmission, listOpenSubmissions,
    withTx,
    // Mappers exported for tests / advanced callers
    _mapExamRow: mapExamRow, _hydrate: hydrate
};
