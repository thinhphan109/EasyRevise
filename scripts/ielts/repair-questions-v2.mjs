// scripts/ielts/repair-questions-v2.mjs
// Many listening questions store the real stem in raw.selection[0].text
// (yes — only ONE entry, paradoxically) and the correct answer letter in
// raw.selection[0].answer. This applies to matching, TFNG, classification.
//
// Strategy:
//   1. For each ielts_question whose options are empty AND prompt looks
//      like an instruction header ("Questions N-M"), repair using
//      selection[0].text as stem and selection[0].answer as answer.
//   2. Detect TFNG by answer in {TRUE, FALSE, NOT GIVEN}; preserve options.
//   3. Detect matching by answer in {A, B, C, D, ...}; options are not
//      stored per-question (they're in the part description) — leave
//      options empty but record the type as 'matching_headings' or similar.
//
// Idempotent.
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

function classifyAnswer(ans) {
    if (!ans) return null;
    const a = String(ans).trim().toUpperCase();
    if (['TRUE', 'FALSE', 'NOT GIVEN', 'NG'].includes(a)) return 'tfng';
    if (['YES', 'NO'].includes(a)) return 'tfng';
    if (/^[A-Z]$/.test(a)) return 'matching';
    if (a.length > 0) return 'fill';
    return null;
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
       AND (q.prompt LIKE 'Questions %'
            OR q.prompt LIKE 'Question %'
            OR q.prompt LIKE 'Choose %'
            OR q.prompt LIKE 'Complete %'
            OR q.prompt LIKE 'Do the following%'
            OR q.prompt LIKE 'Classify%'
            OR q.prompt LIKE 'Match%'
            OR q.prompt LIKE 'Reading Passage %'
            OR q.prompt LIKE 'Listening Passage %'
            OR q.prompt LIKE 'Section %'
            OR q.prompt ~ '^\\d{1,3}\\.?$'
            OR (jsonb_typeof(q.payload->'options') = 'array'
                AND jsonb_array_length(q.payload->'options') = 0))
`);
console.log(`Candidates: ${cand.length}`);

let fixed = 0, missingYP = 0, noSelection = 0, noUpgrade = 0;
const stats = { tfng: 0, matching: 0, fill: 0 };

for (const r of cand) {
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

    // Strategy: pull stem from selection[0].text, answer from .answer
    const sel = Array.isArray(yp.selection) ? yp.selection : [];
    if (!sel.length) { noSelection++; continue; }

    const first = sel[0];
    const stem = stripHtml(first.text || '').slice(0, 8000);
    const answer = first.answer != null ? String(first.answer).trim() : null;

    if (!stem || stem.length < 3 || !answer) { noUpgrade++; continue; }

    const cat = classifyAnswer(answer);
    let qtype, options, correctValue;

    if (cat === 'tfng') {
        qtype = 'tfng';
        options = ['TRUE', 'FALSE', 'NOT GIVEN'];
        correctValue = answer.toUpperCase();
        stats.tfng++;
    } else if (cat === 'matching') {
        // Keep as mc_single since matching letters share the option pool
        qtype = 'mc_single';
        options = [];                  // pool described at part level
        correctValue = answer.toUpperCase();
        stats.matching++;
    } else if (cat === 'fill') {
        qtype = 'sentence_completion';
        options = [];
        correctValue = answer;
        stats.fill++;
    } else {
        noUpgrade++;
        continue;
    }

    // Build the new payload: keep keys, replace options
    await c.query(
        `UPDATE ielts_questions
            SET prompt  = $1,
                payload = jsonb_set(
                            COALESCE(payload, '{}'::jsonb),
                            '{options}',
                            $2::jsonb
                          ),
                correct = $3::jsonb,
                type    = $4::ielts_q_type
          WHERE id = $5`,
        [stem, JSON.stringify(options), JSON.stringify(correctValue), qtype, r.qid]
    );
    fixed++;
    if (fixed % 1000 === 0) console.log(`  …${fixed} fixed`);
}

console.log(`\nFixed: ${fixed}`);
console.log(`  • TFNG:                  ${stats.tfng}`);
console.log(`  • matching/classify:     ${stats.matching}`);
console.log(`  • fill-in-blank:         ${stats.fill}`);
console.log(`Missing yp data:           ${missingYP}`);
console.log(`No selection in yp:        ${noSelection}`);
console.log(`Could not classify answer: ${noUpgrade}`);

await c.end();
