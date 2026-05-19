// scripts/ielts/repair-questions-v7-radio-pull.mjs
// Targets the 901 reading + ~50 listening questions where:
//   - correct is null
//   - yp_question has populated single_choice_radio (or mutilple_choice)
//
// v4 skipped these because the existing prompt looked "ok" (e.g.
// "Complete the summary below. Choose NO MORE THAN TWO WORDS...").
// But that's the section instruction, not the per-q stem. The real
// stem is in yp.title (e.g. "When discussing the theory developed by").
//
// Strategy: aggressive overwrite when yp.single_choice_radio is non-empty.
//   - prompt = yp.title (if > current generic instruction)
//   - options = single_choice_radio[].text
//   - correct = letter of the entry where correct === true
//   - type = mc_single
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

function isInstructionPrompt(p) {
    if (!p) return true;
    return /^(Choose|Complete|Read|Reading Passage|Listening|Section|Questions?|Do the following|Classify|Match|Write|Decide)/i.test(p)
        || p.startsWith('Chọn ')
        || p.startsWith('Hoàn thành ')
        || /^\d{1,3}\.?$/.test(p);
}

console.log('═══ Phase: pair passages with parts ═══');
const { rows: pairs } = await c.query(`
    SELECT iq.passage_id, iq.test_title, iq.p_order, iq.i_count,
           yqc.yp_part_id, yqc.y_count
      FROM (
        SELECT t.id AS test_id, t.title AS test_title, p.id AS passage_id,
               p.order AS p_order, COUNT(q.id) AS i_count
          FROM ielts_tests t
          JOIN ielts_passages p ON p.test_id=t.id
          LEFT JOIN ielts_questions q ON q.passage_id=p.id
         WHERE t.skill IN ('reading','listening') AND t.source='youpass.vn'
         GROUP BY t.id, t.title, p.id, p.order
      ) iq
      JOIN (
        SELECT LOWER(yz.raw->>'title') AS title,
               COALESCE((yp.raw->>'sort')::int,(yp.raw->>'order')::int,1) AS p_order,
               yp.id AS yp_part_id,
               COUNT(yq.id) AS y_count
          FROM youpass_parts yp
          JOIN youpass_quizzes yz ON yz.id=yp.quiz_id
          LEFT JOIN youpass_questions yq ON yq.part_id=yp.id
         GROUP BY yz.raw->>'title', yp.id
      ) yqc ON LOWER(iq.test_title)=yqc.title AND iq.p_order=yqc.p_order
     WHERE iq.i_count > 0 AND iq.i_count = yqc.y_count
`);
console.log(`Matched parts: ${pairs.length}`);

let touched = 0, fixed = 0, noUpgrade = 0;

for (const pr of pairs) {
    const { rows: iqs } = await c.query(
        `SELECT id, prompt, payload, correct
           FROM ielts_questions
          WHERE passage_id=$1
          ORDER BY "order" ASC, id ASC`, [pr.passage_id]);
    const { rows: yqs } = await c.query(
        `SELECT raw FROM youpass_questions
          WHERE part_id=$1
          ORDER BY (raw->>'sort')::int NULLS LAST,
                   (raw->>'order')::int NULLS LAST,
                   id ASC`, [pr.yp_part_id]);

    if (iqs.length !== yqs.length) continue;

    for (let i = 0; i < iqs.length; i++) {
        touched++;
        const iq = iqs[i];
        const yp = yqs[i].raw;
        if (!yp) continue;

        // Skip if already fully repaired
        const hasGoodOpts = (iq.payload?.options || []).length >= 2;
        const hasCorrect = iq.correct != null && iq.correct !== 'null';
        const hasGoodPrompt = !isInstructionPrompt(iq.prompt);
        if (hasGoodOpts && hasCorrect && hasGoodPrompt) continue;

        // Try single_choice_radio first
        let arr = yp.single_choice_radio;
        let multi = false;
        if (!Array.isArray(arr) || arr.length < 2) {
            arr = yp.mutilple_choice;
            multi = true;
        }
        if (!Array.isArray(arr) || arr.length < 2) continue;

        const opts = arr.map(o => stripHtml(o.text || '')).filter(Boolean);
        if (opts.length < 2) continue;

        const correctIdxs = arr.map((o, idx) => o.correct ? idx : -1).filter(i => i >= 0);
        if (!correctIdxs.length) continue;

        const correct = multi
            ? correctIdxs.map(i => String.fromCharCode(65 + i)).join(',')
            : String.fromCharCode(65 + correctIdxs[0]);

        const ypTitle = stripHtml(yp.title || '');
        const newPrompt = (ypTitle && ypTitle.length > 5 && !isInstructionPrompt(ypTitle))
            ? ypTitle
            : iq.prompt;

        await c.query(
            `UPDATE ielts_questions
                SET prompt = $1,
                    payload = jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$2::jsonb),
                    correct = $3::jsonb,
                    type = $4::ielts_q_type
              WHERE id = $5`,
            [newPrompt.slice(0, 8000), JSON.stringify(opts),
             JSON.stringify(correct), multi ? 'mc_multi' : 'mc_single', iq.id]
        );
        fixed++;
        if (fixed % 500 === 0) console.log(`  …${fixed} fixed`);
    }
}

console.log(`\nTouched: ${touched}  Fixed: ${fixed}  No upgrade: ${noUpgrade}`);

await c.end();
