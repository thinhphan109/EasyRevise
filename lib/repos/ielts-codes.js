// lib/repos/ielts-codes.js — IELTS activation codes repository
// Mirrors lib/repos/exams.js code helpers (TracNghiem) but writes to
// the separate ielts_access_codes / ielts_code_usages tables so the
// quiz core schema is left untouched.
'use strict';
const { query, queryOne } = require('./_pool');

// ── Codes ────────────────────────────────────────────────────────
async function addCode({ testId, code, maxUses, maxAttempts, metadata, createdBy }) {
    return queryOne(
        `INSERT INTO ielts_access_codes
            (code, test_id, max_uses, max_attempts, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING *`,
        [code, testId, maxUses || 1, maxAttempts || 0,
         JSON.stringify(metadata || {}), createdBy || null]
    );
}

async function getCode(code) {
    return queryOne(
        `SELECT * FROM ielts_access_codes WHERE code = $1`,
        [code]
    );
}

async function listCodesForTest(testId) {
    return query(
        `SELECT ac.*,
                (SELECT COUNT(*)::int FROM ielts_code_usages u
                  WHERE u.code = ac.code AND u.completed)        AS used_count,
                (SELECT COUNT(*)::int FROM ielts_code_usages u
                  WHERE u.code = ac.code AND NOT u.completed)    AS in_progress_count
           FROM ielts_access_codes ac
          WHERE ac.test_id = $1
          ORDER BY ac.created_at DESC`,
        [testId]
    );
}

async function removeCode(code) {
    return queryOne(
        `DELETE FROM ielts_access_codes WHERE code = $1 RETURNING code`,
        [code]
    );
}

// ── Usages ───────────────────────────────────────────────────────
async function recordUsage({ code, userId, displayName, completed = false,
    submissionKind, submissionId }) {
    return queryOne(
        `INSERT INTO ielts_code_usages
            (code, user_id, display_name, completed, submission_kind, submission_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [code, userId || null, displayName || null,
         !!completed, submissionKind || null, submissionId || null]
    );
}

async function listUsages(code) {
    return query(
        `SELECT id, code, user_id AS "userId", display_name AS "displayName",
                started_at AS "startedAt", completed_at AS "completedAt",
                completed, submission_kind AS "submissionKind",
                submission_id AS "submissionId", score, result
           FROM ielts_code_usages
          WHERE code = $1
          ORDER BY started_at`,
        [code]
    );
}

async function deleteStaleInProgress(code, expireMs) {
    const cutoff = new Date(Date.now() - expireMs).toISOString();
    return query(
        `DELETE FROM ielts_code_usages
          WHERE code = $1 AND NOT completed AND started_at < $2
        RETURNING id`,
        [code, cutoff]
    );
}

async function deleteUserInProgress(code, userId) {
    if (!userId) return [];
    return query(
        `DELETE FROM ielts_code_usages
          WHERE id IN (
              SELECT id FROM ielts_code_usages
               WHERE code = $1 AND user_id = $2 AND NOT completed
            ORDER BY started_at DESC
               LIMIT 1
          )
        RETURNING id`,
        [code, userId]
    );
}

async function markUsageCompleted({ submissionKind, submissionId, score, result }) {
    if (!submissionId) return null;
    return queryOne(
        `UPDATE ielts_code_usages
            SET completed = true, completed_at = now(),
                score = $1, result = $2::jsonb
          WHERE submission_kind = $3 AND submission_id = $4 AND NOT completed
        RETURNING id, code`,
        [score == null ? null : score, JSON.stringify(result || {}),
         submissionKind, submissionId]
    );
}

// Helper used at start: load code + usages, validate it belongs to this test.
async function loadCodeForTest(code, testId) {
    const row = await queryOne(
        `SELECT * FROM ielts_access_codes WHERE code = $1`, [code]
    );
    if (!row) return null;
    if (row.test_id !== testId) return null;
    const usages = await listUsages(code);
    return { code: row, usages };
}

module.exports = {
    addCode, getCode, listCodesForTest, removeCode,
    recordUsage, listUsages,
    deleteStaleInProgress, deleteUserInProgress, markUsageCompleted,
    loadCodeForTest
};
