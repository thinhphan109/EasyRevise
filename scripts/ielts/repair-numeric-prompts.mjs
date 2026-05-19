// scripts/ielts/repair-numeric-prompts.mjs
// Listening crawler stored questions where prompt is just a number ("1",
// "2", ...) and options are empty.  The real stem lives in the yp
// question.title (when title is descriptive) or shared description
// across questions, and options live in raw.single_choice_radio /
// raw.mutilple_choice / raw.selection.
//
// Repair strategy:
//   • For each ielts_question whose prompt is a 1-3 char numeric string
//     and whose options array is empty,
//   • Find the corresponding yp_question by:
//     - test title ↔ youpass_quizzes.raw.title
//     - passage.order ↔ part.raw.sort
//     - q.order ↔ yp_question.raw.sort or .order
//   • Re-extract prompt + options + correct.
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
        String(html).replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    );
}

function pickPrompt(yp) {
    // Try title first; if numeric or short, fall back to content/description
    let p = stripHtml(yp.title || '');
    if (!p || p.length < 5 || /^\d+\.?$/.test(p)) {
        p = stripHtml(yp.content || yp.description || '');
    }
    return p.slice(0, 8000);
}

function extractMC(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const opts = arr.map(o => stripHtml(o.text || '')).filter(Boolean);
    if (opts.length < 2) return null;
    const correctIdx = arr.findIndex(o => o.correct);
    if (correctIdx < 0) return null;
    return {
        options: opts,
        correct: String.fromCharCode(65 + correctIdx)
    };
}

console.log('═══ Loading repair candidates ═══');
const { rows: cand } = await c.query(`
    SELECT q.id AS qid,
           q.passage_id,
           q.order AS q_order,
           q.prompt,
           p.order AS p_order,
           t.title AS test_title,
           t.skill::text
      FROM ielts_questions q
      JOIN ielts_passages p ON p.id = q.passage_id
      JOIN ielts_tests t ON t.id = p.test_id
     WHERE t.skill IN ('reading','listening')
       AND t.source = 'youpass.vn'
       AND (q.prompt ~ '^\\d{1,3}\\.?$'
            OR (q.payload->'options' IS NOT NULL
                AND jsonb_array_length(q.payload->'options') = 0
                AND q.type::text IN ('mc_single','mc_multi')))
`);
console.log(`Candidates: ${cand.length}`);

let fixed = 0, missingYP = 0, noUpgrade = 0;

for (const r of cand) {
    // Find yp_question by part-title match + question order
    const { rows: yqs } = await c.query(`
        SELECT yq.raw
          FROM youpass_questions yq
          JOIN youpass_parts yp ON yp.id = yq.part_id
          JOIN youpass_quizzes yz ON yz.id = yp.quiz_id
         WHERE LOWER(yz.raw->>'title') = LOWER($1)
           AND COALESCE((yp.raw->>'sort')::int, (yp.raw->>'order')::int, 1) = $2
           AND COALESCE((yq.raw->>'sort')::int, (yq.raw->>'order')::int) = $3
         LIMIT 1`,
        [r.test_title, r.p_order, r.q_order]
    );
    if (!yqs.length) { missingYP++; continue; }
    const yp = yqs[0].raw;

    const newPrompt = pickPrompt(yp);
    const mc = extractMC(yp.single_choice_radio) || extractMC(yp.mutilple_choice);

    // Only update when we improved something
    const promptBetter = newPrompt && newPrompt.length > (r.prompt || '').length + 5;
    if (!promptBetter && !mc) { noUpgrade++; continue; }

    const sets = [];
    const args = [r.qid];
    let idx = 2;
    if (promptBetter) {
        sets.push(`prompt = $${idx++}`);
        args.push(newPrompt);
    }
    if (mc) {
        sets.push(`payload = jsonb_set(payload, '{options}', $${idx++}::jsonb)`);
        args.push(JSON.stringify(mc.options));
        sets.push(`correct = $${idx++}::jsonb`);
        args.push(JSON.stringify(mc.correct));
    }
    await c.query(`UPDATE ielts_questions SET ${sets.join(', ')} WHERE id = $1`, args);
    fixed++;
    if (fixed % 500 === 0) console.log(`  …${fixed} fixed`);
}

console.log(`\nFixed: ${fixed}`);
console.log(`Missing yp data: ${missingYP}`);
console.log(`No upgrade possible: ${noUpgrade}`);

await c.end();
