// scripts/ielts/repair-questions-v5-fill-correct.mjs
// sentence_completion questions often have correct=null because the
// original backfill couldn't parse gap_fill_in_blank. Use positional
// linkage to pull the answer from yp.text, yp.gap_fill_in_blank, or
// yp.selection[0].answer.
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
        String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    );
}

function parseGapFill(html) {
    if (!html) return null;
    const re = /\{\[([^\]]+?)\]\[(\d+)\]\}/g;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        const answers = m[1].split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
        if (answers.length) out.push(answers[0]);
    }
    return out.length ? out.join(' | ') : null;
}

console.log('═══ Loading sentence_completion with null correct ═══');
const { rows: pairs } = await c.query(`
    WITH needs AS (
        SELECT q.id AS qid, q.passage_id, q.order AS q_order,
               p.order AS p_order, t.title AS test_title
          FROM ielts_questions q
          JOIN ielts_passages p ON p.id=q.passage_id
          JOIN ielts_tests t ON t.id=p.test_id
         WHERE t.source='youpass.vn'
           AND q.type='sentence_completion'
           AND (q.correct IS NULL OR q.correct::text = 'null')
    ),
    parts AS (
        SELECT LOWER(yz.raw->>'title') AS title,
               COALESCE((yp.raw->>'sort')::int,(yp.raw->>'order')::int,1) AS p_order,
               yp.id AS yp_part_id,
               COUNT(yq.id) AS y_count
          FROM youpass_parts yp
          JOIN youpass_quizzes yz ON yz.id=yp.quiz_id
          LEFT JOIN youpass_questions yq ON yq.part_id=yp.id
         GROUP BY yz.raw->>'title', yp.id
    )
    SELECT n.qid, n.passage_id, n.q_order, n.p_order, n.test_title,
           parts.yp_part_id, parts.y_count
      FROM needs n
      JOIN parts ON LOWER(n.test_title)=parts.title AND n.p_order=parts.p_order
`);
console.log(`Candidates: ${pairs.length}`);

// Group by passage
const byPassage = new Map();
for (const p of pairs) {
    if (!byPassage.has(p.passage_id)) byPassage.set(p.passage_id, []);
    byPassage.get(p.passage_id).push(p);
}

let fixed = 0, noAnswer = 0;

for (const [passageId, group] of byPassage) {
    const pr = group[0];
    // Get all ielts questions for this passage (ordered)
    const { rows: iqs } = await c.query(
        `SELECT id, "order" FROM ielts_questions WHERE passage_id=$1 ORDER BY "order" ASC, id ASC`,
        [passageId]
    );
    // Get all yp questions for this part (ordered)
    const { rows: yqs } = await c.query(
        `SELECT raw FROM youpass_questions WHERE part_id=$1
         ORDER BY (raw->>'sort')::int NULLS LAST, (raw->>'order')::int NULLS LAST, id ASC`,
        [pr.yp_part_id]
    );
    if (iqs.length !== yqs.length) continue;

    // Build position map: ielts q.id → yp raw
    const posMap = new Map();
    for (let i = 0; i < iqs.length; i++) posMap.set(iqs[i].id, yqs[i].raw);

    for (const g of group) {
        const yp = posMap.get(g.qid);
        if (!yp) continue;

        let answer = null;

        // Try gap_fill_in_blank
        if (typeof yp.gap_fill_in_blank === 'string') {
            answer = parseGapFill(yp.gap_fill_in_blank);
        }
        // Try text
        if (!answer && yp.text) {
            answer = stripHtml(yp.text).slice(0, 200);
        }
        // Try selection[0].answer
        if (!answer && Array.isArray(yp.selection) && yp.selection[0]?.answer) {
            answer = String(yp.selection[0].answer).trim();
        }
        // Try selection[0].text (sometimes answer stored here for fill)
        if (!answer && Array.isArray(yp.selection) && yp.selection[0]?.text) {
            const t = stripHtml(yp.selection[0].text);
            if (t && t.length <= 50) answer = t;
        }

        if (!answer || answer.length < 1) { noAnswer++; continue; }

        await c.query(
            `UPDATE ielts_questions SET correct = $1::jsonb WHERE id = $2`,
            [JSON.stringify(answer), g.qid]
        );
        fixed++;
    }
    if (fixed > 0 && fixed % 500 === 0) console.log(`  …${fixed} fixed`);
}

console.log(`\nFixed: ${fixed}`);
console.log(`No answer found: ${noAnswer}`);

await c.end();
