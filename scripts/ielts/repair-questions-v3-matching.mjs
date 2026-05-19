// scripts/ielts/repair-questions-v3-matching.mjs
// For matching/classify questions, the option pool ('A. ... B. ... C.
// ...') lives in yp_question.raw.description. Extract it once per part
// and apply to all questions in that part whose options are empty.
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
            .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

// Parse pool from HTML. Supports: "A. text", "i. text", "<strong>i.</strong>
// text", roman numerals.
function parsePool(html) {
    if (!html) return null;

    // Try: bold-tag prefix patterns first (often used in tables)
    //   <strong>A.</strong>text  /  <strong>i</strong>.text
    const boldRegex = /<strong[^>]*>\s*([A-Z]|[ivxlcdm]+)\s*[\.\):]?\s*<\/strong>\s*([\s\S]*?)(?=<strong[^>]*>\s*(?:[A-Z]|[ivxlcdm]+)\s*[\.\):]?\s*<\/strong>|<\/td>|<\/tr>|<\/table>|$)/gi;
    let m;
    let boldItems = [];
    while ((m = boldRegex.exec(html)) !== null) {
        const label = m[1].toLowerCase();
        const text = stripHtml(m[2]).replace(/^[\.\)\s:]+/, '').trim();
        if (text && text.length < 300) boldItems.push({ label, text });
    }
    if (boldItems.length >= 2) {
        // Dedupe label
        const seen = new Set();
        boldItems = boldItems.filter(i => seen.has(i.label) ? false : (seen.add(i.label), true));
        return boldItems.map(i => i.text);
    }

    // Fallback: line-based
    const text = stripHtml(html);
    const lines = text.split(/\n+/);
    const items = [];
    for (const line of lines) {
        const m1 = line.match(/^([A-Z])[\.\)]\s+(.+)$/);
        if (m1) { items.push({ label: m1[1], text: m1[2].trim() }); continue; }
        const m2 = line.match(/^([ivxlcdm]{1,5})[\.\)]\s+(.+)$/i);
        if (m2) items.push({ label: m2[1].toLowerCase(), text: m2[2].trim() });
    }
    if (items.length < 2) return null;
    const seen = new Set();
    return items.filter(i => seen.has(i.label) ? false : (seen.add(i.label), true))
                .map(i => i.text);
}

console.log('═══ Loading matching questions with empty options ═══');
const { rows: cand } = await c.query(`
    SELECT q.id AS qid,
           q.passage_id,
           q.order AS q_order,
           p.order AS p_order,
           t.title AS test_title
      FROM ielts_questions q
      JOIN ielts_passages p ON p.id = q.passage_id
      JOIN ielts_tests t ON t.id = p.test_id
     WHERE t.skill IN ('reading','listening')
       AND t.source = 'youpass.vn'
       AND jsonb_array_length(COALESCE(q.payload->'options', '[]'::jsonb)) = 0
       AND q.correct IS NOT NULL
       AND jsonb_typeof(q.correct) = 'string'
       AND (q.correct::text ~ '^"[A-Z]"$' OR q.correct::text ~ '^"[ivxlcdm]+"$')
`);
console.log(`Candidates: ${cand.length}`);

// Group candidates by part (test_title + p_order) → fetch description once
const partMap = new Map();
for (const r of cand) {
    const key = `${r.test_title}${r.p_order}`;
    if (!partMap.has(key)) partMap.set(key, []);
    partMap.get(key).push(r);
}

console.log(`Distinct parts: ${partMap.size}`);

let fixed = 0, noPool = 0, noYqDesc = 0;

for (const [key, group] of partMap) {
    const sepIdx = key.lastIndexOf('\u0001');
    const testTitle = key.slice(0, sepIdx);
    const pOrder = parseInt(key.slice(sepIdx + 1), 10);

    // Find the FIRST yp_question's description for this part — pool is shared
    const { rows: descs } = await c.query(`
        SELECT yq.raw->>'description' AS d,
               COALESCE((yq.raw->>'sort')::int, (yq.raw->>'order')::int) AS so
          FROM youpass_questions yq
          JOIN youpass_parts yp ON yp.id = yq.part_id
          JOIN youpass_quizzes yz ON yz.id = yp.quiz_id
         WHERE LOWER(yz.raw->>'title') = LOWER($1)
           AND COALESCE((yp.raw->>'sort')::int, (yp.raw->>'order')::int, 1) = $2
           AND yq.raw->>'description' IS NOT NULL
           AND yq.raw->>'description' <> ''
         ORDER BY so NULLS LAST
         LIMIT 5`,
        [testTitle, pOrder]
    );

    if (!descs.length) { noYqDesc += group.length; continue; }

    let pool = null;
    for (const d of descs) {
        pool = parsePool(d.d);
        if (pool && pool.length >= 2) break;
    }

    if (!pool || pool.length < 2) { noPool += group.length; continue; }

    for (const r of group) {
        await c.query(
            `UPDATE ielts_questions
                SET payload = jsonb_set(
                                COALESCE(payload, '{}'::jsonb),
                                '{options}',
                                $1::jsonb
                              )
              WHERE id = $2`,
            [JSON.stringify(pool), r.qid]
        );
        fixed++;
    }
    if (fixed % 1000 === 0) console.log(`  …${fixed} fixed`);
}

console.log(`\nFixed: ${fixed}`);
console.log(`No yp description for part: ${noYqDesc}`);
console.log(`Could not parse pool: ${noPool}`);

await c.end();
