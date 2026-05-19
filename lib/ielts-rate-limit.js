// lib/ielts-rate-limit.js — per-user daily quota for AI grading
'use strict';
const { query, queryOne } = require('./repos/_pool');

// Defaults if no global setting + no per-user override.
const DEFAULTS = {
    writing: 10,
    speaking: 10,
    transcription: 20
};

const appSettings = require('./app-settings');

async function getEffectiveLimit(userId, kind) {
    // 1. Per-user override
    const override = await queryOne(
        `SELECT limit_per_day FROM ielts_quota_overrides
         WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
    );
    if (override && override.limit_per_day !== null && override.limit_per_day !== undefined) {
        return Number(override.limit_per_day);  // -1 = unlimited
    }
    // 2. Global setting
    const settingKey = {
        writing: 'ieltsLimitWriting',
        speaking: 'ieltsLimitSpeaking',
        transcription: 'ieltsLimitTranscription'
    }[kind];
    const v = settingKey ? appSettings.get(settingKey) : null;
    if (v != null && v !== '') return Number(v);
    // 3. Hardcoded default
    return DEFAULTS[kind] || 10;
}

async function checkAndIncrement(userId, kind) {
    const limit = await getEffectiveLimit(userId, kind);
    const today = new Date().toISOString().slice(0, 10);

    // -1 = unlimited
    if (limit === -1) {
        await query(
            `INSERT INTO ielts_rate_limits (user_id, kind, day, count)
             VALUES ($1, $2, $3, 1)
             ON CONFLICT (user_id, kind, day) DO UPDATE SET count = ielts_rate_limits.count + 1`,
            [userId, kind, today]
        );
        return { count: null, limit: -1, remaining: -1 };
    }

    const row = await queryOne(
        `INSERT INTO ielts_rate_limits (user_id, kind, day, count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id, kind, day) DO UPDATE
         SET count = ielts_rate_limits.count + 1
         RETURNING count`,
        [userId, kind, today]
    );

    if (row.count > limit) {
        await query(
            `UPDATE ielts_rate_limits SET count = count - 1
             WHERE user_id = $1 AND kind = $2 AND day = $3`,
            [userId, kind, today]
        );
        const err = new Error(`Đã đạt giới hạn ${limit} lượt ${kind}/ngày. Hôm nay vui lòng quay lại sau.`);
        err.statusCode = 429;
        throw err;
    }

    return { count: row.count, limit, remaining: limit - row.count };
}

async function getUsage(userId) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await query(
        `SELECT kind, count FROM ielts_rate_limits
         WHERE user_id = $1 AND day = $2`,
        [userId, today]
    );
    const out = {};
    for (const kind of ['writing', 'speaking', 'transcription']) {
        const found = rows.find(r => r.kind === kind);
        out[kind] = {
            used: found ? found.count : 0,
            limit: await getEffectiveLimit(userId, kind)
        };
    }
    return out;
}

// Admin: list overrides for one user (returns null when no override).
async function getOverrides(userId) {
    const rows = await query(
        `SELECT kind, limit_per_day FROM ielts_quota_overrides WHERE user_id = $1`,
        [userId]
    );
    const out = { writing: null, speaking: null, transcription: null };
    for (const r of rows) out[r.kind] = r.limit_per_day;
    return out;
}

// Admin: set/clear an override. Pass null to clear.
async function setOverride(userId, kind, limit) {
    if (!['writing', 'speaking', 'transcription'].includes(kind)) {
        throw new Error(`Unknown kind: ${kind}`);
    }
    if (limit === null || limit === undefined || limit === '') {
        await query(
            `DELETE FROM ielts_quota_overrides WHERE user_id = $1 AND kind = $2`,
            [userId, kind]
        );
    } else {
        const n = Number(limit);
        if (!Number.isFinite(n)) throw new Error('Invalid limit');
        await query(
            `INSERT INTO ielts_quota_overrides (user_id, kind, limit_per_day, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, kind) DO UPDATE
             SET limit_per_day = EXCLUDED.limit_per_day, updated_at = now()`,
            [userId, kind, n]
        );
    }
}

module.exports = { checkAndIncrement, getUsage, getEffectiveLimit, getOverrides, setOverride, DEFAULTS };
