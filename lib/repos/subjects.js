// lib/repos/subjects.js
'use strict';
const { query, queryOne } = require('./_pool');

function map(row) {
    if (!row) return null;
    return {
        id: row.id, name: row.name,
        icon: row.icon, color: row.color,
        createdAt: row.created_at
    };
}

async function listAll() {
    const rows = await query(`SELECT * FROM subjects ORDER BY name`);
    return rows.map(map);
}

async function getById(id) {
    return map(await queryOne(`SELECT * FROM subjects WHERE id = $1`, [id]));
}

async function upsert({ id, name, icon = null, color = null }) {
    const row = await queryOne(
        `INSERT INTO subjects (id, name, icon, color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, icon = EXCLUDED.icon, color = EXCLUDED.color
         RETURNING *`,
        [id, name, icon, color]
    );
    return map(row);
}

async function remove(id) {
    await query(`DELETE FROM subjects WHERE id = $1`, [id]);
}

module.exports = { listAll, getById, upsert, remove };
