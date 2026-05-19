// scripts/ielts/repair-questions-v4-positional.mjs
// Issue: IELTS questions store q.order as sequential 1..N within passage,
// but yp_questions store yp.order as the *original question number* (often
// matching the test's "Question 8" / "Question 12" labelling). This means
// matching by q.order = yp.order misses many rows.
//
// Strategy: for each (test, passage) pair where the COUNT of ielts
// questions equals the COUNT of yp questions, link them by ordinal
// position (1st ielts q → 1st yp q in canonical order, etc).
//
// Canonical yp ordering: (sort ASC NULLS LAST, order ASC NULLS LAST,
// id ASC) — this matches what the original crawler appears to have used.
//
// Skip parts where counts don't match (avoids cross-contamination).
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

function classifyAnswer(ans) {
    if (ans == null) return null;
    const a = String(ans).trim().toUpperCase();
    if (['TRUE', 'FALSE', 'NOT GIVEN', 'NG', 'YES', 'NO'].includes(a)) return 'tfng';
    if (/^[A-Z]$/.test(a)) return 'matching';
    if (/^[ivxlcdm]+$/i.test(a)) return 'matching';
    if (a.length > 0) return 'fill';
    return null;
}

function extractFromYp(yp) {
    // Returns { stem, options, correct, qtype } or null
    const sel = Array.isArray(yp.selection) ? yp.selection : [];

    // Strategy A: selection[0] holds stem + answer
    if (sel.length === 1 && sel[0] && sel[0].text != null) {
        const stem = stripHtml(sel[0].text);
        const ans = sel[0].answer != null ? String(sel[0].answer).trim() : null;
        if (stem && stem.length >= 3 && ans) {
            const cat = classifyAnswer(ans);
            if (cat === 'tfng') {
                return { stem, options: ['TRUE', 'FALSE', 'NOT GIVEN'],
                         correct: ans.toUpperCase(), qtype: 'tfng' };
            }
            if (cat === 'matching') {
                return { stem, options: [], correct: ans, qtype: 'mc_single' };
            }
            if (cat === 'fill') {
                return { stem, options: [], correct: ans, qtype: 'sentence_completion' };
            }
        }
    }

    // Strategy B: selection has 2+ entries → MC
    if (sel.length >= 2) {
        const opts = sel.map(o => stripHtml(o.text || '')).filter(Boolean);
        const correctIdx = sel.findIndex(o => o.correct === true || o.correct === 'true' || o.answer === 'A' || /^[A-Z]$/i.test(o.answer || ''));
        const stem = stripHtml(yp.title || yp.content || '');
        if (opts.length >= 2 && stem && stem.length >= 3) {
            // find correct letter from sel.answer if any object has it
            const ansObj = sel.find(o => o.answer && /^[A-Z]$/i.test(String(o.answer).trim()));
            const correct = ansObj ? String(ansObj.answer).trim().toUpperCase() :
                            (correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : null);
            if (correct) return { stem, options: opts, correct, qtype: 'mc_single' };
        }
    }

    // Strategy C: single_choice_radio
    if (Array.isArray(yp.single_choice_radio) && yp.single_choice_radio.length >= 2) {
        const arr = yp.single_choice_radio;
        const opts = arr.map(o => stripHtml(o.text || '')).filter(Boolean);
        const idx = arr.findIndex(o => o.correct);
        const stem = stripHtml(yp.title || yp.content || '');
        if (opts.length >= 2 && idx >= 0 && stem) {
            return { stem, options: opts, correct: String.fromCharCode(65 + idx),
                     qtype: 'mc_single' };
        }
    }

    return null;
}

console.log('═══ Phase 1: pair ielts passages with yp parts ═══');
const { rows: pairs } = await c.query(`
    WITH iq AS (
        SELECT t.id AS test_id, t.title AS test_title, p.id AS passage_id,
               p.order AS p_order, COUNT(q.id) AS i_count
          FROM ielts_tests t
          JOIN ielts_passages p ON p.test_id=t.id
          LEFT JOIN ielts_questions q ON q.passage_id=p.id
         WHERE t.skill IN ('reading','listening')
           AND t.source='youpass.vn'
         GROUP BY t.id, t.title, p.id, p.order
    ),
    yqc AS (
        SELECT LOWER(yz.raw->>'title') AS title,
               COALESCE((yp.raw->>'sort')::int,(yp.raw->>'order')::int,1) AS p_order,
               yp.id AS yp_part_id,
               COUNT(yq.id) AS y_count
          FROM youpass_parts yp
          JOIN youpass_quizzes yz ON yz.id=yp.quiz_id
          LEFT JOIN youpass_questions yq ON yq.part_id=yp.id
         GROUP BY yz.raw->>'title', yp.id
    )
    SELECT iq.passage_id, iq.test_title, iq.p_order, iq.i_count,
           yqc.yp_part_id, yqc.y_count
      FROM iq
      JOIN yqc ON LOWER(iq.test_title)=yqc.title AND iq.p_order=yqc.p_order
     WHERE iq.i_count > 0 AND iq.i_count = yqc.y_count
`);
console.log(`Matched parts where counts align: ${pairs.length}`);

let touched = 0, fixed = 0, skipped = 0;
const stats = { tfng: 0, matching: 0, fill: 0, mc: 0 };

for (const pr of pairs) {
    const { rows: iqs } = await c.query(`
        SELECT id, prompt, payload, correct
          FROM ielts_questions
         WHERE passage_id=$1
         ORDER BY "order" ASC, id ASC`, [pr.passage_id]);
    const { rows: yqs } = await c.query(`
        SELECT raw FROM youpass_questions
         WHERE part_id=$1
         ORDER BY (raw->>'sort')::int NULLS LAST,
                  (raw->>'order')::int NULLS LAST,
                  id ASC`, [pr.yp_part_id]);
    if (iqs.length !== yqs.length) { skipped++; continue; }

    for (let i = 0; i < iqs.length; i++) {
        touched++;
        const iq = iqs[i];
        const yp = yqs[i].raw;
        if (!yp) continue;

        // Skip already-good rows: prompt > 10ch AND options >= 2
        const promptOk = (iq.prompt || '').length > 10 && !/^\d{1,3}\.?$/.test(iq.prompt);
        const opts = iq.payload?.options || [];
        if (promptOk && opts.length >= 2) continue;

        const ext = extractFromYp(yp);
        if (!ext) continue;

        // Don't downgrade: if existing options >= 2 keep them
        const newOptions = (opts.length >= 2) ? opts : ext.options;

        await c.query(
            `UPDATE ielts_questions
                SET prompt  = $1,
                    payload = jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$2::jsonb),
                    correct = $3::jsonb,
                    type    = $4::ielts_q_type
              WHERE id = $5`,
            [ext.stem.slice(0, 8000),
             JSON.stringify(newOptions),
             JSON.stringify(ext.correct),
             ext.qtype,
             iq.id]
        );
        fixed++;
        stats[ext.qtype === 'tfng' ? 'tfng'
            : ext.qtype === 'sentence_completion' ? 'fill'
            : ext.options.length === 0 ? 'matching' : 'mc']++;
    }
    if (fixed > 0 && fixed % 1000 === 0) console.log(`  …${fixed} fixed`);
}

console.log(`\nTouched: ${touched}  Fixed: ${fixed}  Skipped parts (mismatch): ${skipped}`);
console.log(`  • TFNG:        ${stats.tfng}`);
console.log(`  • matching:    ${stats.matching}`);
console.log(`  • fill:        ${stats.fill}`);
console.log(`  • MC w/opts:   ${stats.mc}`);

await c.end();
