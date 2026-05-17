// lib/repos/questionBank.js
'use strict';
const { query, queryOne } = require('./_pool');

function map(row) {
    if (!row) return null;
    return {
        id: row.id,
        subject: row.subject,
        sectionType: row.section_type,
        payload: row.payload,
        tags: row.tags || [],
        difficulty: row.difficulty,
        source: row.source,
        createdAt: row.created_at
    };
}

async function listAll({ subject = null, difficulty = null, limit = 200, offset = 0 } = {}) {
    const where = [];
    const values = [];
    let i = 1;
    if (subject)    { where.push(`subject = $${i++}`); values.push(subject); }
    if (difficulty) { where.push(`difficulty = $${i++}`); values.push(difficulty); }
    const sql = `SELECT * FROM question_bank
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY created_at DESC
                 LIMIT $${i++} OFFSET $${i}`;
    values.push(limit, offset);
    const rows = await query(sql, values);
    return rows.map(map);
}

async function getById(id) {
    return map(await queryOne(`SELECT * FROM question_bank WHERE id = $1`, [id]));
}

async function upsert({ id, subject = null, sectionType = null, payload, tags = [], difficulty = null, source = null }) {
    const row = await queryOne(
        `INSERT INTO question_bank (id, subject, section_type, payload, tags, difficulty, source)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
         ON CONFLICT (id) DO UPDATE
         SET subject = EXCLUDED.subject, section_type = EXCLUDED.section_type,
             payload = EXCLUDED.payload, tags = EXCLUDED.tags,
             difficulty = EXCLUDED.difficulty, source = EXCLUDED.source
         RETURNING *`,
        [id, subject, sectionType, JSON.stringify(payload),
         JSON.stringify(tags), difficulty, source]
    );
    return map(row);
}

async function remove(id) {
    await query(`DELETE FROM question_bank WHERE id = $1`, [id]);
}

module.exports = { listAll, getById, upsert, remove };
