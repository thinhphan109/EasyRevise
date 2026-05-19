// scripts/ielts/backfill-passages-from-yp.mjs
// The crawler picked youpass_parts.raw.passage (a placeholder integer)
// instead of youpass_parts.raw.content (the actual HTML text). This
// script repairs ielts_passages.body for all rows linked to a youpass
// part, matching by ielts_test.title ↔ youpass_quiz.raw.title and
// passage.order ↔ part.raw.sort.
//
// Idempotent: only updates rows where the new content is meaningfully
// longer than the existing body (current placeholder is 2 chars).
import 'dotenv/config';
import pg from 'pg';
import he from 'he';

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
await c.connect();

function stripHtml(html) {
    if (!html) return '';
    return he.decode(
        String(html)
            .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, '\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

console.log('═══ Loading youpass parts (with content) keyed by quiz title ═══');
const { rows: parts } = await c.query(`
    SELECT yp.id, yp.quiz_id,
           yp.raw->>'sort'      AS sort,
           yp.raw->>'order'     AS p_order,
           yp.raw->>'content'   AS content,
           yq.raw->>'title'     AS quiz_title
      FROM youpass_parts yp
      JOIN youpass_quizzes yq ON yq.id = yp.quiz_id
     WHERE yp.raw->>'content' IS NOT NULL
       AND LENGTH(yp.raw->>'content') > 100
`);
console.log(`Found ${parts.length} parts with usable content`);

// Group parts by quiz title (lowercase) → array of {sort, content}
const byTitle = new Map();
for (const p of parts) {
    if (!p.quiz_title) continue;
    const key = p.quiz_title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push({
        sort: Number(p.sort) || Number(p.p_order) || 1,
        content: p.content
    });
}
byTitle.forEach(arr => arr.sort((a, b) => a.sort - b.sort));

console.log(`Distinct quiz titles: ${byTitle.size}`);

console.log('\n═══ Updating ielts_passages ═══');
const { rows: passages } = await c.query(`
    SELECT p.id AS pid, p.body, p.order AS p_order, t.title AS test_title, t.skill::text
      FROM ielts_passages p
      JOIN ielts_tests t ON t.id = p.test_id
     WHERE LENGTH(COALESCE(p.body, '')) < 100
       AND t.skill IN ('reading','listening')
       AND t.source = 'youpass.vn'
`);
console.log(`Candidate passages: ${passages.length}`);

let fixed = 0, noMatch = 0, contentTooShort = 0;
for (const r of passages) {
    const list = byTitle.get((r.test_title || '').toLowerCase());
    if (!list || !list.length) { noMatch++; continue; }
    // Pick the part by 1-indexed order; fall back to first part
    const idx = Math.max(0, Math.min(list.length - 1, (r.p_order || 1) - 1));
    const text = stripHtml(list[idx].content);
    if (text.length < 100) { contentTooShort++; continue; }
    if (text.length <= (r.body || '').length) continue;
    await c.query(`UPDATE ielts_passages SET body = $1 WHERE id = $2`, [text, r.pid]);
    fixed++;
    if (fixed % 200 === 0) console.log(`  …${fixed} fixed so far`);
}
console.log(`\nFixed: ${fixed}`);
console.log(`No title match: ${noMatch}`);
console.log(`yp content too short: ${contentTooShort}`);

await c.end();
