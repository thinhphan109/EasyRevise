// scripts/ielts/backfill-questions-from-yp.mjs
// Backfill ielts_questions for tests where the crawler dropped them.
// youpass schema:
//   raw.title       → question prompt (e.g. "What did the 2006 discovery...")
//   raw.type        → SINGLE-RADIO|SINGLE-SELECTION|MULTI-RADIO|...
//   raw.selection   → [{ text, answer:'A'|'B'|... }] — MC options + correct
//   raw.text        → fill-in-blank answer (sometimes)
//   raw.explain     → explanation HTML
import 'dotenv/config';
import pg from 'pg';
import he from 'he';
import crypto from 'node:crypto';

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
await c.connect();

function stripHtml(html) {
    if (!html) return '';
    return he.decode(
        String(html)
            .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

function uuid(seed) {
    const h = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// Map youpass type → our ielts_q_type enum
function mapType(yt) {
    const t = String(yt || '').toUpperCase();
    if (t === 'SINGLE-RADIO' || t === 'SINGLE-SELECTION') return 'mc_single';
    if (t === 'MULTI-RADIO' || t === 'MULTI-SELECTION')  return 'mc_multi';
    if (t === 'FILL' || t === 'BLANK')                   return 'sentence_completion';
    if (t === 'TRUE-FALSE-NG' || t === 'TFNG')           return 'tfng';
    return 'mc_single';
}

console.log('═══ Loading skill+test linkage ═══');
const { rows: testLink } = await c.query(`
    SELECT t.id   AS test_id,
           t.skill::text,
           p.id   AS passage_id,
           p.order AS p_order,
           yp.id  AS yp_part_id
      FROM ielts_tests t
      JOIN ielts_passages p ON p.test_id = t.id
      JOIN youpass_quizzes yz
        ON LOWER(yz.raw->>'title') = LOWER(t.title)
      JOIN youpass_parts yp ON yp.quiz_id = yz.id
                            AND COALESCE((yp.raw->>'sort')::int,
                                         (yp.raw->>'order')::int, 1) = p.order
     WHERE t.skill IN ('reading','listening')
       AND t.source = 'youpass.vn'
`);
console.log(`Linked passages: ${testLink.length}`);

const linkByPid = new Map();
for (const x of testLink) linkByPid.set(x.passage_id, x);

// How many of these passages currently have NO questions?
const { rows: needs } = await c.query(`
    SELECT p.id AS pid
      FROM ielts_passages p
      LEFT JOIN ielts_questions q ON q.passage_id = p.id
     WHERE p.id = ANY($1::uuid[])
     GROUP BY p.id
     HAVING COUNT(q.id) = 0`,
    [testLink.map(x => x.passage_id)]
);
console.log(`Passages with 0 questions: ${needs.length}`);

let inserted = 0, skipped = 0;
for (const { pid } of needs) {
    const link = linkByPid.get(pid);
    if (!link) continue;
    const { rows: yqs } = await c.query(
        `SELECT raw FROM youpass_questions
          WHERE part_id = $1
          ORDER BY (raw->>'sort')::int NULLS LAST, (raw->>'order')::int NULLS LAST`,
        [link.yp_part_id]
    );
    if (!yqs.length) { skipped++; continue; }

    let order = 1;
    for (const { raw } of yqs) {
        if (!raw) continue;
        const qtype = mapType(raw.type);
        const prompt = stripHtml(raw.title || raw.content || '').slice(0, 8000);
        if (!prompt || prompt.length < 2) continue;

        const selection = Array.isArray(raw.selection) ? raw.selection : [];
        let payload = {
            originalType: raw.type,
            locate: raw.locate ?? null
        };
        let correct = null;

        if (qtype === 'mc_single' || qtype === 'mc_multi') {
            const opts = selection.map(s => stripHtml(s.text || '')).filter(Boolean);
            payload.options = opts;
            const ansLetters = selection
                .map((s, i) => (s.answer != null && s.answer !== false) ? String.fromCharCode(65 + i) : null)
                .filter(Boolean);
            // Some yp rows store the answer letter directly on a single selection entry
            if (!ansLetters.length) {
                const direct = selection.find(s => typeof s.answer === 'string' && /^[A-D]$/i.test(s.answer));
                if (direct) ansLetters.push(direct.answer.toUpperCase());
            }
            correct = ansLetters.length ? (qtype === 'mc_single' ? ansLetters[0] : ansLetters.join(',')) : null;
        } else if (qtype === 'sentence_completion') {
            correct = stripHtml(raw.text || (selection[0] && selection[0].text) || '').slice(0, 200);
        } else if (qtype === 'tfng') {
            correct = (selection[0] && selection[0].answer) || null;
        }

        // Skip questions we can't fully reconstruct — better empty than wrong answer key
        if (!correct) {
            continue;
        }

        const qid = uuid(`q|${link.yp_part_id}|${raw.id || order}`);
        await c.query(
            `INSERT INTO ielts_questions (id, passage_id, "order", type, prompt, payload, correct, alternatives, config, explanation)
             VALUES ($1, $2, $3, $4::ielts_q_type, $5, $6::jsonb, $7::jsonb, '[]'::jsonb, '{}'::jsonb, $8)
             ON CONFLICT (id) DO NOTHING`,
            [qid, pid, order++, qtype, prompt,
             JSON.stringify(payload),
             JSON.stringify(correct),
             stripHtml(raw.explain || '').slice(0, 4000) || null]
        );
        inserted++;
    }
    if (inserted % 500 === 0 && inserted > 0) console.log(`  …${inserted} inserted`);
}

console.log(`\nInserted: ${inserted}`);
console.log(`Skipped (no yp questions): ${skipped}`);

await c.end();
