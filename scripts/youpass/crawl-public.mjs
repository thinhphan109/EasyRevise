// scripts/youpass/crawl-public.mjs — bulk crawl all public IELTS quizzes
import 'dotenv/config';
import { api, paginate } from './client.mjs';
import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 5
});

// quiz_type: 1=Reading, 2=Listening, 3=Speaking, 4=Writing
const QUIZ_TYPES_TO_CRAWL = [1, 2, 3, 4];

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

async function alreadyHave(table, ids) {
    if (!ids.length) return new Set();
    const r = await pool.query(`SELECT id FROM ${table} WHERE id = ANY($1)`, [ids]);
    return new Set(r.rows.map(r => r.id));
}

let stats = { quizzes: 0, parts: 0, questions: 0, files: new Set() };

async function crawlType(qt) {
    console.log(`\n═══ quiz_type=${qt} ═══`);
    const quizzes = await paginate(
        `/items/quiz?filter[is_public][_eq]=true&filter[quiz_type][_eq]=${qt}&fields=*&sort=id`,
        { pageSize: 200, onPage: (data, off, meta) => {
            console.log(`  fetched offset=${off}  total=${meta.total_count}`);
        }}
    );
    console.log(`  total quizzes: ${quizzes.length}`);

    // 1. Bulk insert quizzes
    const quizRows = quizzes.map(q => ({
        id: q.id, raw: q,
        type: q.type ?? null,
        quiz_type: q.quiz_type ?? null
    }));
    for (const batch of chunk(quizRows, 200)) {
        await bulkUpsert('youpass_quizzes', batch, 'id', ['type', 'quiz_type']);
    }
    stats.quizzes += quizzes.length;

    // 2. Collect part + question IDs across all quizzes
    const allPartIds = new Set();
    const allQuestionIds = new Set();
    for (const q of quizzes) {
        (q.parts || []).forEach(id => allPartIds.add(id));
        (q.questions || []).forEach(id => allQuestionIds.add(id));
    }
    console.log(`  parts to fetch: ${allPartIds.size}, questions: ${allQuestionIds.size}`);

    // 3. Fetch parts in batches of 100 (Directus filter[id][_in])
    const partIdsArr = [...allPartIds];
    let partsFetched = 0;
    for (const ids of chunk(partIdsArr, 100)) {
        const f = encodeURIComponent(JSON.stringify({ id: { _in: ids } }));
        const r = await api(`/items/part?filter=${f}&fields=*&limit=${ids.length}`);
        const parts = r.data || [];
        const rows = parts.map(p => ({
            id: p.id, raw: p,
            section_id: null,           // unknown from this path; will fill from course path later
            quiz_id: p.quiz ?? null
        }));
        await bulkUpsert('youpass_parts', rows, 'id', ['section_id', 'quiz_id']);
        partsFetched += parts.length;

        // Collect nested questions from parts
        for (const p of parts) {
            (p.questions || []).forEach(id => allQuestionIds.add(id));
            if (p.file_id) stats.files.add(p.file_id);
        }
    }
    stats.parts += partsFetched;
    console.log(`  ✓ parts fetched: ${partsFetched}`);

    // 4. Fetch questions in batches of 100
    const questionIdsArr = [...allQuestionIds];
    let questionsFetched = 0;
    for (const ids of chunk(questionIdsArr, 100)) {
        const f = encodeURIComponent(JSON.stringify({ id: { _in: ids } }));
        const r = await api(`/items/question?filter=${f}&fields=*&limit=${ids.length}`);
        const qs = r.data || [];
        const rows = qs.map(q => ({
            id: q.id, raw: q,
            part_id: q.part ?? null,
            quiz_id: q.quiz ?? null
        }));
        await bulkUpsert('youpass_questions', rows, 'id', ['part_id', 'quiz_id']);
        questionsFetched += qs.length;

        for (const q of qs) {
            if (q.audio_url) stats.files.add(q.audio_url);
            if (q.audio) stats.files.add(q.audio);
            if (q.writing_graph_image) stats.files.add(q.writing_graph_image);
        }
    }
    stats.questions += questionsFetched;
    console.log(`  ✓ questions fetched: ${questionsFetched}`);
}

const START = Date.now();
for (const qt of QUIZ_TYPES_TO_CRAWL) {
    try {
        await crawlType(qt);
    } catch (e) {
        console.error(`✗ quiz_type=${qt} failed:`, e.message);
    }
}

console.log('\n═══ FINAL STATS ═══');
console.log(`Quizzes:    ${stats.quizzes}`);
console.log(`Parts:      ${stats.parts}`);
console.log(`Questions:  ${stats.questions}`);
console.log(`Asset IDs:  ${stats.files.size}`);
console.log(`Elapsed:    ${((Date.now() - START) / 1000).toFixed(1)}s`);

// Persist asset IDs for download phase
const fs = await import('node:fs/promises');
await fs.writeFile('docs/youpass-assets.txt', [...stats.files].join('\n'));
console.log(`Wrote ${stats.files.size} asset IDs to docs/youpass-assets.txt`);

await pool.end();
