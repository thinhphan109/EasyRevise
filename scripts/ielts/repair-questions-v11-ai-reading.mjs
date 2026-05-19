// scripts/ielts/repair-questions-v11-ai-reading.mjs
// Two parallel passes:
//
//   PASS A — partial data: 610 mc_single in reading where EITHER
//     options OR correct is missing (but not both — v9 already handled
//     full orphans). Use AI to fill the gap based on passage + prompt.
//
//   PASS B — zero-q reading tests: 28 reading tests with rich body but
//     no questions. Generate full sets like v10 did for listening.
//
import 'dotenv/config';
import pg from 'pg';
import he from 'he';
import crypto from 'node:crypto';
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

function uuid(seed) {
    const h = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

// =============== PASS A: fill partial mc_single ===============
console.log('═══ PASS A: partial mc_single in reading ═══');
const { rows: partialA } = await c.query(`
    SELECT q.id, q.prompt, q.correct, q.payload, p.body AS passage_body
      FROM ielts_questions q
      JOIN ielts_passages p ON p.id=q.passage_id
      JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='reading' AND t.source='youpass.vn'
       AND q.type='mc_single'
       AND (q.correct IS NULL OR q.correct::text='null'
            OR jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) < 2)
       AND LENGTH(p.body) > 500
       AND LENGTH(q.prompt) > 10
       AND q.prompt !~ '^\\d{1,3}\\.?$'
`);
console.log(`Candidates: ${partialA.length}`);

const SYS_A = `You are an IELTS Reading test writer. Given a passage, a question stem, and partial data, complete a 4-option MC.

Return JSON: {"options":["A text","B text","C text","D text"],"correct":"X"}

Rules:
1. All answer must be derivable from the passage.
2. The 3 distractors are plausible but contradicted by, or absent from, the passage.
3. Each option is concise (typically 3-15 words).
4. correct is one of A, B, C, D.`;

let aCalls = 0, aErr = 0, aFix = 0, aBad = 0;

for (const r of partialA) {
    const passage = stripHtml(r.passage_body || '').slice(0, 4500);
    const stem = r.prompt.slice(0, 500);
    const existingCorrect = r.correct;
    const existingOpts = r.payload?.options || [];

    let hint = '';
    if (existingCorrect && existingCorrect !== null) {
        hint += `\nKNOWN CORRECT ANSWER (preserve as one of the options): ${JSON.stringify(existingCorrect)}`;
    }
    if (Array.isArray(existingOpts) && existingOpts.length > 0) {
        hint += `\nEXISTING OPTIONS (preserve, fill missing slots): ${JSON.stringify(existingOpts)}`;
    }

    let result;
    try {
        result = await chatJson([
            { role: 'system', content: SYS_A },
            { role: 'user', content: `PASSAGE:\n${passage}\n\nQUESTION: ${stem}${hint}\n\nGenerate the MC.` }
        ], { maxTokens: 700, temperature: 0.3 });
        aCalls++;
    } catch (e) {
        aErr++;
        if (aErr <= 5) console.log(`  A err: ${e.message.slice(0, 80)}`);
        continue;
    }

    const options = Array.isArray(result.options) ? result.options.map(String) : null;
    const correct = String(result.correct || '').trim().toUpperCase();
    if (!options || options.length !== 4 || !/^[A-D]$/.test(correct)) { aBad++; continue; }

    const seen = new Set();
    let unique = true;
    for (const o of options) {
        const k = o.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(k) || k.length < 2) { unique = false; break; }
        seen.add(k);
    }
    if (!unique) { aBad++; continue; }

    await c.query(
        `UPDATE ielts_questions
            SET payload = jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$1::jsonb),
                correct = $2::jsonb
          WHERE id = $3`,
        [JSON.stringify(options), JSON.stringify(correct), r.id]
    );
    aFix++;
    if (aFix % 50 === 0) console.log(`  A …${aFix}/${partialA.length}`);
}

console.log(`PASS A: calls=${aCalls} err=${aErr} fix=${aFix} bad=${aBad}`);

// =============== PASS B: generate zero-q reading tests ===============
console.log('\n═══ PASS B: zero-q reading tests ═══');
const { rows: emptyB } = await c.query(`
    SELECT t.id AS test_id, t.title, p.id AS passage_id, p.body
      FROM ielts_tests t
      JOIN ielts_passages p ON p.test_id = t.id
      LEFT JOIN ielts_questions q ON q.passage_id = p.id
     WHERE t.skill = 'reading' AND t.source = 'youpass.vn'
       AND LENGTH(p.body) > 500
     GROUP BY t.id, t.title, p.id, p.body
     HAVING COUNT(q.id) = 0
`);
console.log(`Candidates: ${emptyB.length}`);

const SYS_B = `You are an IELTS Reading test writer. Given a reading passage, produce a JSON-formatted question set.

Generate exactly:
  - 5 multiple-choice questions (mc_single, 4 options each, 1 correct)
  - 3 true/false/not-given questions (tfng)

Output ONLY JSON:
{
  "questions": [
    {"type":"mc_single","stem":"...","options":["a","b","c","d"],"correct":"A"},
    ...
    {"type":"tfng","stem":"...","correct":"TRUE"}
  ]
}`;

let bCalls = 0, bErr = 0, bFix = 0, bBad = 0;

for (const r of emptyB) {
    const passage = stripHtml(r.body || '').slice(0, 5000);

    let result;
    try {
        result = await chatJson([
            { role: 'system', content: SYS_B },
            { role: 'user', content: `PASSAGE:\n${passage}\n\nGenerate the question set.` }
        ], { maxTokens: 2500, temperature: 0.4 });
        bCalls++;
    } catch (e) {
        bErr++;
        if (bErr <= 5) console.log(`  B err: ${e.message.slice(0, 80)}`);
        continue;
    }

    const qs = Array.isArray(result.questions) ? result.questions : null;
    if (!qs || qs.length < 5) { bBad++; continue; }

    let inserted = 0, order = 1;
    for (const q of qs) {
        const stem = String(q.stem || '').trim();
        const correct = String(q.correct || '').trim().toUpperCase();
        if (!stem || stem.length < 5 || !correct) continue;

        let qtype, payload;
        if (q.type === 'mc_single') {
            const opts = Array.isArray(q.options) ? q.options.map(String) : [];
            if (opts.length !== 4 || !/^[A-D]$/.test(correct)) continue;
            qtype = 'mc_single';
            payload = { options: opts, aiGenerated: true };
        } else if (q.type === 'tfng') {
            if (!['TRUE', 'FALSE', 'NOT GIVEN'].includes(correct)) continue;
            qtype = 'tfng';
            payload = { options: ['TRUE', 'FALSE', 'NOT GIVEN'], aiGenerated: true };
        } else continue;

        const qid = uuid(`ai-v11|${r.passage_id}|${order}`);
        await c.query(
            `INSERT INTO ielts_questions
                (id, passage_id, "order", type, prompt, payload, correct, alternatives, config, explanation)
             VALUES ($1,$2,$3,$4::ielts_q_type,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,$8::jsonb,NULL)
             ON CONFLICT (id) DO NOTHING`,
            [qid, r.passage_id, order++, qtype, stem,
             JSON.stringify(payload),
             JSON.stringify(correct),
             JSON.stringify({ aiModel: process.env.AI_MODEL || 'Claude-Opus', generatedAt: new Date().toISOString() })]
        );
        inserted++;
    }
    if (inserted >= 5) bFix++;
    else bBad++;
}

console.log(`PASS B: calls=${bCalls} err=${bErr} fix=${bFix} bad=${bBad}`);
console.log(`\nTotal: ${aFix + bFix} additions (${aCalls + bCalls} AI calls)`);

await c.end();
