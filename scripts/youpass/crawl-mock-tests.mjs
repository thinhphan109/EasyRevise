// scripts/youpass/crawl-mock-tests.mjs — crawl all mock tests
import 'dotenv/config';
import { api, paginate } from './client.mjs';
import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }, max: 5
});

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function bulkUpsert(table, rows, idCol = 'id', extraCols = []) {
    if (!rows.length) return;
    const cols = [idCol, 'raw', ...extraCols];
    const placeholders = [];
    const vals = [];
    rows.forEach((r, i) => {
        const offset = i * cols.length;
        placeholders.push(`(${cols.map((_, j) => `$${offset + j + 1}`).join(',')})`);
        vals.push(r.id ?? r[idCol]);
        vals.push(JSON.stringify(r.raw));
        for (const c of extraCols) vals.push(r[c] ?? null);
    });
    const updates = cols.filter(c => c !== idCol).map(c => `${c} = EXCLUDED.${c}`).join(', ');
    await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders.join(',')}
         ON CONFLICT (${idCol}) DO UPDATE SET ${updates}, fetched_at = now()`,
        vals
    );
}

const stats = { quizzes: 0, parts: 0, questions: 0 };

async function crawlMockType(mtt) {
    console.log(`\n═══ mock_test_type=${mtt} ═══`);
    const quizzes = await paginate(
        `/items/quiz?filter[mock_test_type][_eq]=${mtt}&fields=*&sort=id`,
        { pageSize: 200, onPage: (data, off, meta) => {
            console.log(`  fetched offset=${off}  total=${meta.total_count}`);
        }}
    );
    console.log(`  total: ${quizzes.length}`);

    const quizRows = quizzes.map(q => ({ id: q.id, raw: q, type: q.type ?? null, quiz_type: q.quiz_type ?? null }));
    for (const batch of chunk(quizRows, 200)) {
        await bulkUpsert('youpass_quizzes', batch, 'id', ['type', 'quiz_type']);
    }
    stats.quizzes += quizzes.length;

    const allPartIds = new Set();
    const allQuestionIds = new Set();
    for (const q of quizzes) {
        (q.parts || []).forEach(id => allPartIds.add(id));
        (q.questions || []).forEach(id => allQuestionIds.add(id));
    }
    console.log(`  parts: ${allPartIds.size}, questions: ${allQuestionIds.size}`);

    for (const ids of chunk([...allPartIds], 100)) {
        const f = encodeURIComponent(JSON.stringify({ id: { _in: ids } }));
        const r = await api(`/items/part?filter=${f}&fields=*&limit=${ids.length}`);
        const parts = r.data || [];
        const rows = parts.map(p => ({ id: p.id, raw: p, section_id: null, quiz_id: p.quiz ?? null }));
        await bulkUpsert('youpass_parts', rows, 'id', ['section_id', 'quiz_id']);
        stats.parts += parts.length;
        for (const p of parts) (p.questions || []).forEach(id => allQuestionIds.add(id));
    }

    for (const ids of chunk([...allQuestionIds], 100)) {
        const f = encodeURIComponent(JSON.stringify({ id: { _in: ids } }));
        const r = await api(`/items/question?filter=${f}&fields=*&limit=${ids.length}`);
        const qs = r.data || [];
        const rows = qs.map(q => ({ id: q.id, raw: q, part_id: q.part ?? null, quiz_id: q.quiz ?? null }));
        await bulkUpsert('youpass_questions', rows, 'id', ['part_id', 'quiz_id']);
        stats.questions += qs.length;
    }
    console.log(`  ✓ ${stats.questions} questions imported so far`);
}

const START = Date.now();
for (const mtt of [1, 2]) {
    try { await crawlMockType(mtt); }
    catch (e) { console.error(`✗ mtt=${mtt}:`, e.message); }
}
console.log('\n═══ DONE ═══');
console.log(stats);
console.log(`Elapsed: ${((Date.now() - START) / 1000).toFixed(1)}s`);
await pool.end();
