// scripts/ielts/backfill-questions-from-yp.mjs (v2)
// Robust extractor for all three storage formats found in youpass:
//
//   1. SINGLE-RADIO / SINGLE-SELECTION
//      • raw.selection            → [{text, answer}]                   (legacy)
//      • raw.single_choice_radio  → [{text, correct, order, explain}]  (current)
//
//   2. MULTIPLE
//      • raw.mutilple_choice      → [{text, correct, order, explain}]  (typo intentional)
//
//   3. FILL-IN-THE-BLANK
//      • raw.gap_fill_in_blank    → HTML string with markers
//                                   {[answer1 | answer2 | ...][order]}
//      • raw.text                 → simple plain answer (legacy)
//
//   4. TFNG
//      • raw.selection[0].answer
//
// Idempotent: ON CONFLICT DO NOTHING by stable UUID seed.
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

function mapType(yt) {
    const t = String(yt || '').toUpperCase();
    if (t === 'SINGLE-RADIO' || t === 'SINGLE-SELECTION') return 'mc_single';
    if (t === 'MULTIPLE' || t === 'MULTI-RADIO' || t === 'MULTI-SELECTION') return 'mc_multi';
    if (t === 'FILL-IN-THE-BLANK' || t === 'FILL' || t === 'BLANK') return 'sentence_completion';
    if (t === 'TRUE-FALSE-NG' || t === 'TFNG') return 'tfng';
    return 'mc_single';
}

// Parse {[answer1 | answer2 | answer3][order]} → array of { order, answers[] }
function parseGapFill(html) {
    if (!html) return [];
    const re = /\{\[([^\]]+?)\]\[(\d+)\]\}/g;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
        const answers = m[1].split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
        const order = parseInt(m[2], 10);
        if (answers.length) out.push({ order, answers });
    }
    return out;
}

// Extract MC options + correct letter(s) from a {text, correct} array
function extractMC(arr, multi = false) {
    if (!Array.isArray(arr) || !arr.length) return null;
    const opts = arr.map(o => stripHtml(o.text || '').trim()).filter(Boolean);
    if (opts.length < 2) return null;
    const correctLetters = arr
        .map((o, i) => o.correct ? String.fromCharCode(65 + i) : null)
        .filter(Boolean);
    if (!correctLetters.length) return null;
    return {
        options: opts,
        correct: multi ? correctLetters.join(',') : correctLetters[0]
    };
}

console.log('═══ Loading test ↔ part linkage ═══');
const { rows: links } = await c.query(`
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
console.log(`Linked passages: ${links.length}`);

const linkByPid = new Map();
for (const x of links) linkByPid.set(x.passage_id, x);

// Passages still missing questions
const { rows: needs } = await c.query(`
    SELECT p.id AS pid
      FROM ielts_passages p
      LEFT JOIN ielts_questions q ON q.passage_id = p.id
     WHERE p.id = ANY($1::uuid[])
     GROUP BY p.id
     HAVING COUNT(q.id) = 0`,
    [links.map(x => x.passage_id)]
);
console.log(`Passages with 0 questions: ${needs.length}`);

let inserted = 0, skipped = 0, parsedMC = 0, parsedFill = 0, parsedSelection = 0;

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

        const payload = {
            originalType: raw.type,
            locate: raw.locate ?? null,
            options: []
        };
        let correct = null;

        // 1. MC single
        if (qtype === 'mc_single') {
            const mc = extractMC(raw.single_choice_radio, false);
            if (mc) {
                payload.options = mc.options;
                correct = mc.correct;
                parsedMC++;
            } else if (Array.isArray(raw.selection) && raw.selection.length) {
                // legacy shape
                const opts = raw.selection.map(s => stripHtml(s.text || '')).filter(Boolean);
                payload.options = opts;
                const ans = raw.selection.find(s => typeof s.answer === 'string'
                    && /^[A-Z]$/i.test(s.answer.trim()));
                if (ans) { correct = ans.answer.toUpperCase(); parsedSelection++; }
            }
        }

        // 2. MC multi
        else if (qtype === 'mc_multi') {
            const mc = extractMC(raw.mutilple_choice, true);
            if (mc) {
                payload.options = mc.options;
                correct = mc.correct;
                parsedMC++;
            }
        }

        // 3. Fill-in-the-blank
        else if (qtype === 'sentence_completion') {
            // Use embedded HTML for the prompt body
            if (typeof raw.gap_fill_in_blank === 'string'
                && raw.gap_fill_in_blank.length > 5) {
                const parsedGaps = parseGapFill(raw.gap_fill_in_blank);
                if (parsedGaps.length) {
                    parsedGaps.sort((a, b) => a.order - b.order);
                    payload.gaps = parsedGaps.map(g => ({
                        order: g.order,
                        accept: g.answers
                    }));
                    // Use the primary answer for the canonical 'correct'
                    correct = parsedGaps.map(g => g.answers[0]).join(' | ');
                    // Replace the question prompt with a clean version
                    const cleaned = raw.gap_fill_in_blank
                        .replace(/\{\[([^\]]+?)\]\[\d+\]\}/g, (_, ans) => {
                            // Show first variant for human display
                            return `____(${ans.split(/\s*\|\s*/)[0]})____`;
                        });
                    payload.bodyHtml = cleaned;
                    parsedFill++;
                }
            }
            if (!correct && raw.text) {
                correct = stripHtml(raw.text).slice(0, 200);
            }
        }

        // 4. TFNG
        else if (qtype === 'tfng') {
            const ans = (raw.selection?.[0]?.answer) || raw.correct_answer;
            if (ans) correct = ans;
        }

        if (!correct) continue;

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
    if (inserted % 1000 === 0 && inserted > 0) console.log(`  …${inserted} inserted`);
}

console.log(`\nInserted: ${inserted}`);
console.log(`  • MC (single+multi via *_choice): ${parsedMC}`);
console.log(`  • MC (legacy selection):           ${parsedSelection}`);
console.log(`  • Fill-in-the-blank:               ${parsedFill}`);
console.log(`Skipped (no yp questions):           ${skipped}`);

await c.end();
