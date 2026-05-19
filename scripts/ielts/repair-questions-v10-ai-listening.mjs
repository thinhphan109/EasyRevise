// scripts/ielts/repair-questions-v10-ai-listening.mjs
// 370 listening tests have ZERO questions in our DB, but 304 of them
// HAVE a passage body (the transcript or a summary).  Use Claude to
// generate a complete IELTS-style question set grounded in that text.
//
// Strategy:
//   - Limit to 1 passage per test (so we don't multi-charge).
//   - Generate 4 MC + 2 TFNG questions per test.
//   - Insert into ielts_questions with stable UUIDs (idempotent).
//   - Mark these with config.aiGenerated = true so the audit can trace.
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

console.log('═══ Loading listening tests with body but 0 questions ═══');
const { rows: cand } = await c.query(`
    SELECT t.id AS test_id, t.title, p.id AS passage_id, p.body
      FROM ielts_tests t
      JOIN ielts_passages p ON p.test_id = t.id
      LEFT JOIN ielts_questions q ON q.passage_id = p.id
     WHERE t.skill = 'listening'
       AND t.source = 'youpass.vn'
       AND LENGTH(p.body) > 300
     GROUP BY t.id, t.title, p.id, p.body
     HAVING COUNT(q.id) = 0
     ORDER BY p.id
`);
console.log(`Candidates: ${cand.length}`);

const SYS = `You are an IELTS Listening test writer. Given a transcript, produce a JSON-formatted question set.

Generate exactly:
  - 4 multiple-choice questions (mc_single, 4 options each, 1 correct)
  - 2 true/false/not-given questions (tfng)

Requirements:
  - Every answer must be derivable from the transcript.
  - Stems are concise (under 25 words each).
  - MC distractors are plausible but contradicted by the transcript.
  - TFNG statements are tightly worded.
  - Do not paraphrase the answer to be obvious.

Output ONLY JSON of this shape:
{
  "questions": [
    {"type":"mc_single","stem":"...","options":["a","b","c","d"],"correct":"A"},
    ...
    {"type":"tfng","stem":"...","correct":"TRUE"}
  ]
}`;

let aiCalls = 0, aiErrors = 0, fixed = 0, badQuality = 0;

for (const r of cand) {
    const transcript = stripHtml(r.body || '').slice(0, 5000);
    if (transcript.length < 200) continue;

    let result;
    try {
        result = await chatJson([
            { role: 'system', content: SYS },
            { role: 'user', content: `TRANSCRIPT:\n${transcript}\n\nGenerate the question set.` }
        ], { maxTokens: 2000, temperature: 0.4 });
        aiCalls++;
    } catch (e) {
        aiErrors++;
        if (aiErrors <= 5) console.log(`  AI err: ${e.message.slice(0, 80)}`);
        continue;
    }

    const qs = Array.isArray(result.questions) ? result.questions : null;
    if (!qs || qs.length < 4) { badQuality++; continue; }

    let inserted = 0;
    let order = 1;
    for (const q of qs) {
        const stem = String(q.stem || '').trim();
        const correct = String(q.correct || '').trim().toUpperCase();
        if (!stem || stem.length < 5 || !correct) continue;

        let qtype, options, payload;
        if (q.type === 'mc_single') {
            const opts = Array.isArray(q.options) ? q.options.map(String) : [];
            if (opts.length !== 4) continue;
            if (!/^[A-D]$/.test(correct)) continue;
            qtype = 'mc_single';
            payload = { options: opts, aiGenerated: true };
        } else if (q.type === 'tfng') {
            if (!['TRUE', 'FALSE', 'NOT GIVEN'].includes(correct)) continue;
            qtype = 'tfng';
            payload = { options: ['TRUE', 'FALSE', 'NOT GIVEN'], aiGenerated: true };
        } else continue;

        const qid = uuid(`ai-v10|${r.passage_id}|${order}`);
        await c.query(
            `INSERT INTO ielts_questions
                (id, passage_id, "order", type, prompt, payload, correct, alternatives, config, explanation)
             VALUES ($1,$2,$3,$4::ielts_q_type,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,
                     $8::jsonb, NULL)
             ON CONFLICT (id) DO NOTHING`,
            [qid, r.passage_id, order++, qtype, stem,
             JSON.stringify(payload),
             JSON.stringify(correct),
             JSON.stringify({ aiModel: process.env.AI_MODEL || 'Claude-Opus', generatedAt: new Date().toISOString() })]
        );
        inserted++;
    }
    if (inserted >= 4) {
        fixed++;
        if (fixed % 20 === 0) console.log(`  …${fixed}/${cand.length} tests fixed`);
    } else {
        badQuality++;
    }
}

console.log(`\nAI calls:    ${aiCalls}`);
console.log(`AI errors:   ${aiErrors}`);
console.log(`Bad quality: ${badQuality}`);
console.log(`Tests fixed: ${fixed}`);

await c.end();
