// scripts/ielts/repair-questions-v6-ai-pools.mjs
// For matching/classify questions whose regex-based parser failed,
// use Claude to extract the option pool from the yp_question HTML.
//
// Strategy:
//   1. Find all (test, passage) groups where:
//      - candidate questions still have empty options
//      - their correct answer is A-Z or roman numeral (i, ii, iii, ...)
//      - the part has at least one yp_question.description with content
//   2. Send the description to Claude with a strict prompt:
//      "Extract the option pool. Return JSON: {options: [...]}"
//   3. Validate: pool must have ≥2 entries, each ≤300 chars
//   4. Apply to all questions in that part
//
// Each part is one AI call. Pool is shared across questions, so cost
// is per part, not per question.
import 'dotenv/config';
import pg from 'pg';
import he from 'he';
import { chatJson } from '../lib/ai-client.mjs';

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

console.log('═══ Loading parts that need AI pool extraction ═══');
const { rows: cand } = await c.query(`
    SELECT q.id AS qid, q.passage_id, q.order AS q_order,
           p.order AS p_order, t.title AS test_title
      FROM ielts_questions q
      JOIN ielts_passages p ON p.id=q.passage_id
      JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill IN ('reading','listening')
       AND t.source='youpass.vn'
       AND jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) = 0
       AND q.correct IS NOT NULL
       AND jsonb_typeof(q.correct) = 'string'
       AND (q.correct::text ~ '^"[A-Z]"$' OR q.correct::text ~ '^"[ivxlcdm]+"$')
`);
console.log(`Candidates: ${cand.length}`);

// Group by part
const partMap = new Map();
for (const r of cand) {
    const key = `${r.test_title}\u0001${r.p_order}`;
    if (!partMap.has(key)) partMap.set(key, []);
    partMap.get(key).push(r);
}
console.log(`Distinct parts: ${partMap.size}`);

let aiCalls = 0, aiErrors = 0, fixed = 0, noDesc = 0, badPool = 0;

const SYS = `You are a precise IELTS test data extractor. Given an HTML description that contains a list of options (a "List of Headings", "Locations", "People", etc.), extract the options as a clean JSON array.

Rules:
- The options are usually labelled A, B, C... or i, ii, iii...
- Strip the labels — return only the option TEXT.
- Preserve order matching A→Z or i→whatever.
- If the description has no clear option list, return {"options":[]}.
- If unsure, return {"options":[]}.
- Each option is short (typically 2-15 words). Skip lines that look like instructions ("Choose the correct letter...").

Output ONLY: {"options":["text1","text2",...]}`;

for (const [key, group] of partMap) {
    const sepIdx = key.lastIndexOf('\u0001');
    const testTitle = key.slice(0, sepIdx);
    const pOrder = parseInt(key.slice(sepIdx + 1), 10);

    // Get the richest description for this part
    const { rows: descs } = await c.query(`
        SELECT yq.raw->>'description' AS d,
               LENGTH(yq.raw->>'description') AS L
          FROM youpass_questions yq
          JOIN youpass_parts yp ON yp.id=yq.part_id
          JOIN youpass_quizzes yz ON yz.id=yp.quiz_id
         WHERE LOWER(yz.raw->>'title')=LOWER($1)
           AND COALESCE((yp.raw->>'sort')::int,(yp.raw->>'order')::int,1)=$2
           AND yq.raw->>'description' IS NOT NULL
           AND LENGTH(yq.raw->>'description') > 50
         ORDER BY L DESC LIMIT 1`,
        [testTitle, pOrder]
    );

    if (!descs.length) { noDesc += group.length; continue; }
    const html = descs[0].d.slice(0, 8000);

    let pool = null;
    try {
        const j = await chatJson([
            { role: 'system', content: SYS },
            { role: 'user', content: `Extract option pool:\n\n${html}` }
        ], { maxTokens: 800, temperature: 0.1 });
        aiCalls++;
        if (Array.isArray(j.options) && j.options.length >= 2) {
            pool = j.options
                .map(o => stripHtml(String(o)).slice(0, 300))
                .filter(o => o.length >= 2);
        }
    } catch (e) {
        aiErrors++;
        if (aiErrors <= 5) console.log(`  AI err [${aiErrors}]: ${e.message.slice(0,100)}`);
        continue;
    }

    if (!pool || pool.length < 2) { badPool += group.length; continue; }

    // Sanity check: validate that the correct answer letter/numeral indexes
    // into the pool. Skip the part if first question's correct doesn't match.
    const firstQ = await c.query(`SELECT correct FROM ielts_questions WHERE id=$1`, [group[0].qid]);
    const firstCorrect = firstQ.rows[0]?.correct ?? null;
    if (firstCorrect) {
        const n = /^[A-Z]$/.test(firstCorrect)
            ? firstCorrect.charCodeAt(0) - 65
            : firstCorrect.toLowerCase().split('').reduce((acc, ch) => {
                const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }[ch] || 0;
                return acc + v;
              }, 0) - 1;  // crude roman→index
        if (n >= pool.length) { badPool += group.length; continue; }
    }

    for (const r of group) {
        await c.query(
            `UPDATE ielts_questions
                SET payload = jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$1::jsonb)
              WHERE id = $2`,
            [JSON.stringify(pool), r.qid]
        );
        fixed++;
    }
    if (fixed > 0 && fixed % 200 === 0) console.log(`  …${fixed} fixed (${aiCalls} AI calls, ${aiErrors} errs)`);
}

console.log(`\nAI calls:    ${aiCalls}`);
console.log(`AI errors:   ${aiErrors}`);
console.log(`Fixed:       ${fixed}`);
console.log(`No desc:     ${noDesc}`);
console.log(`Bad pool:    ${badPool}`);

await c.end();
