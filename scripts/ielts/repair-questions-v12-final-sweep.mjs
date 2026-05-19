// scripts/ielts/repair-questions-v12-final-sweep.mjs
// Final sweep covering everything left over from v6-v11:
//   PASS A — Reading mc_single missing correct or options (relaxed body ≥200)
//   PASS B — Reading mc_multi missing correct
//   PASS C — Reading sentence_completion missing correct
//   PASS D — Reading + Listening zero-q tests with body ≥200
//   PASS E — Listening mc_single missing options (with passage hint)
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

const stats = { calls: 0, errs: 0, fixed: 0, bad: 0 };

async function tryAi(messages, opts = {}) {
    try {
        const r = await chatJson(messages, opts);
        stats.calls++;
        return r;
    } catch (e) {
        stats.errs++;
        if (stats.errs <= 5) console.log(`  err: ${e.message.slice(0, 80)}`);
        return null;
    }
}

// ─── PASS A: Reading mc_single (relaxed) ─────────────────────────────
console.log('═══ PASS A: reading mc_single (relaxed body ≥200) ═══');
const SYS_MC = `You are an IELTS Reading test writer. Generate a 4-option MC grounded in the passage.
Return only JSON: {"options":["A text","B text","C text","D text"],"correct":"X"}
Rules: 4 distinct options, correct is one of A/B/C/D, all derivable/contradicted by passage.`;

const { rows: passA } = await c.query(`
    SELECT q.id, q.prompt, q.correct, q.payload, p.body
      FROM ielts_questions q JOIN ielts_passages p ON p.id=q.passage_id JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='reading' AND t.source='youpass.vn' AND q.type='mc_single'
       AND (q.correct IS NULL OR q.correct::text='null'
            OR jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) < 2)
       AND LENGTH(p.body) > 200 AND LENGTH(q.prompt) > 5 AND q.prompt !~ '^\\d{1,3}\\.?$'
`);
console.log(`Cands: ${passA.length}`);
for (const r of passA) {
    const passage = stripHtml(r.body || '').slice(0, 4500);
    const stem = r.prompt.slice(0, 500);
    let hint = '';
    if (r.correct && r.correct !== null) hint += `\nKNOWN CORRECT: ${JSON.stringify(r.correct)}`;
    const exOpts = r.payload?.options || [];
    if (Array.isArray(exOpts) && exOpts.length > 0) hint += `\nEXISTING OPTIONS: ${JSON.stringify(exOpts)}`;

    const j = await tryAi([
        { role: 'system', content: SYS_MC },
        { role: 'user', content: `PASSAGE:\n${passage}\n\nQUESTION: ${stem}${hint}` }
    ], { maxTokens: 700, temperature: 0.3 });
    if (!j) continue;
    const opts = Array.isArray(j.options) ? j.options.map(String) : null;
    const correct = String(j.correct || '').trim().toUpperCase();
    if (!opts || opts.length !== 4 || !/^[A-D]$/.test(correct)) { stats.bad++; continue; }
    const seen = new Set();
    if (opts.some(o => { const k = o.toLowerCase().trim(); if (seen.has(k) || k.length < 2) return true; seen.add(k); return false; })) { stats.bad++; continue; }

    await c.query(
        `UPDATE ielts_questions SET payload=jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$1::jsonb), correct=$2::jsonb WHERE id=$3`,
        [JSON.stringify(opts), JSON.stringify(correct), r.id]
    );
    stats.fixed++;
    if (stats.fixed % 50 === 0) console.log(`  …A ${stats.fixed} fixed`);
}

// ─── PASS B: Reading mc_multi missing correct ────────────────────────
console.log(`\n═══ PASS B: reading mc_multi missing correct ═══`);
const SYS_MULTI = `You are an IELTS Reading writer. Given options that already exist for a multiple-answer MC, identify which letters are correct.
Return only JSON: {"correct":"A,C"} (comma-separated letters).`;
const { rows: passB } = await c.query(`
    SELECT q.id, q.prompt, q.payload, p.body
      FROM ielts_questions q JOIN ielts_passages p ON p.id=q.passage_id JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='reading' AND q.type='mc_multi'
       AND (q.correct IS NULL OR q.correct::text='null')
       AND jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) >= 2
       AND LENGTH(p.body) > 200
`);
console.log(`Cands: ${passB.length}`);
for (const r of passB) {
    const passage = stripHtml(r.body || '').slice(0, 4500);
    const opts = r.payload.options;
    const labelled = opts.map((o, i) => `${String.fromCharCode(65+i)}. ${o}`).join('\n');

    const j = await tryAi([
        { role: 'system', content: SYS_MULTI },
        { role: 'user', content: `PASSAGE:\n${passage}\n\nQUESTION: ${r.prompt}\n\nOPTIONS:\n${labelled}\n\nWhich letters are correct?` }
    ], { maxTokens: 100, temperature: 0.1 });
    if (!j) continue;
    const correct = String(j.correct || '').trim().toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z](,[A-Z])*$/.test(correct)) { stats.bad++; continue; }

    await c.query(`UPDATE ielts_questions SET correct=$1::jsonb WHERE id=$2`, [JSON.stringify(correct), r.id]);
    stats.fixed++;
}

// ─── PASS C: Reading sentence_completion missing correct ─────────────
console.log(`\n═══ PASS C: reading sentence_completion missing correct ═══`);
const SYS_FILL = `You are an IELTS Reading writer. Find the answer to this fill-in-the-blank from the passage.
Return only JSON: {"answer":"the word(s)"}. Use exact words from the passage. If multiple acceptable answers, separate with " | ".`;
const { rows: passC } = await c.query(`
    SELECT q.id, q.prompt, p.body
      FROM ielts_questions q JOIN ielts_passages p ON p.id=q.passage_id JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='reading' AND q.type='sentence_completion'
       AND (q.correct IS NULL OR q.correct::text='null')
       AND LENGTH(p.body) > 200 AND LENGTH(q.prompt) > 10
`);
console.log(`Cands: ${passC.length}`);
for (const r of passC) {
    const passage = stripHtml(r.body || '').slice(0, 4500);
    const j = await tryAi([
        { role: 'system', content: SYS_FILL },
        { role: 'user', content: `PASSAGE:\n${passage}\n\nQUESTION: ${r.prompt}` }
    ], { maxTokens: 100, temperature: 0.2 });
    if (!j) continue;
    const ans = String(j.answer || '').trim();
    if (!ans || ans.length < 1 || ans.length > 80) { stats.bad++; continue; }
    await c.query(`UPDATE ielts_questions SET correct=$1::jsonb WHERE id=$2`, [JSON.stringify(ans), r.id]);
    stats.fixed++;
}

// ─── PASS D: Reading + Listening zero-q tests ────────────────────────
console.log(`\n═══ PASS D: zero-q tests (reading+listening) ═══`);
const SYS_FULL = `You are an IELTS test writer. Given a passage/transcript, produce a complete question set.

Generate exactly:
  - 4 mc_single (4 options, 1 correct A-D)
  - 2 tfng

Return only JSON:
{"questions":[
  {"type":"mc_single","stem":"...","options":["a","b","c","d"],"correct":"A"},
  {"type":"tfng","stem":"...","correct":"TRUE"}
]}`;

const { rows: passD } = await c.query(`
    SELECT t.id AS test_id, t.skill::text AS skill, p.id AS passage_id, p.body
      FROM ielts_tests t JOIN ielts_passages p ON p.test_id=t.id
      LEFT JOIN ielts_questions q ON q.passage_id=p.id
     WHERE t.skill IN ('reading','listening') AND t.source='youpass.vn' AND LENGTH(p.body) > 200
     GROUP BY t.id, t.skill, p.id, p.body
     HAVING COUNT(q.id) = 0
`);
console.log(`Cands: ${passD.length}`);
for (const r of passD) {
    const text = stripHtml(r.body || '').slice(0, 5000);
    const j = await tryAi([
        { role: 'system', content: SYS_FULL },
        { role: 'user', content: `${r.skill === 'listening' ? 'TRANSCRIPT' : 'PASSAGE'}:\n${text}` }
    ], { maxTokens: 2200, temperature: 0.4 });
    if (!j || !Array.isArray(j.questions) || j.questions.length < 4) { stats.bad++; continue; }

    let inserted = 0, order = 1;
    for (const q of j.questions) {
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
            if (!['TRUE','FALSE','NOT GIVEN'].includes(correct)) continue;
            qtype = 'tfng';
            payload = { options: ['TRUE','FALSE','NOT GIVEN'], aiGenerated: true };
        } else continue;
        const qid = uuid(`ai-v12|${r.passage_id}|${order}`);
        await c.query(
            `INSERT INTO ielts_questions (id,passage_id,"order",type,prompt,payload,correct,alternatives,config,explanation)
             VALUES ($1,$2,$3,$4::ielts_q_type,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,$8::jsonb,NULL)
             ON CONFLICT (id) DO NOTHING`,
            [qid, r.passage_id, order++, qtype, stem, JSON.stringify(payload), JSON.stringify(correct),
             JSON.stringify({ aiModel: process.env.AI_MODEL || 'Claude-Opus', generatedAt: new Date().toISOString() })]
        );
        inserted++;
    }
    if (inserted >= 4) stats.fixed++;
    else stats.bad++;
}

// ─── PASS E: Listening mc_single missing options ────────────────────
console.log(`\n═══ PASS E: listening mc_single missing options ═══`);
const { rows: passE } = await c.query(`
    SELECT q.id, q.prompt, q.correct, p.body
      FROM ielts_questions q JOIN ielts_passages p ON p.id=q.passage_id JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='listening' AND q.type='mc_single'
       AND jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) < 2
       AND LENGTH(p.body) > 200 AND LENGTH(q.prompt) > 5
`);
console.log(`Cands: ${passE.length}`);
for (const r of passE) {
    const transcript = stripHtml(r.body || '').slice(0, 4500);
    let hint = '';
    if (r.correct && r.correct !== null) hint += `\nKNOWN CORRECT: ${JSON.stringify(r.correct)}`;
    const j = await tryAi([
        { role: 'system', content: SYS_MC.replace('Reading', 'Listening').replace('passage', 'transcript') },
        { role: 'user', content: `TRANSCRIPT:\n${transcript}\n\nQUESTION: ${r.prompt}${hint}` }
    ], { maxTokens: 700, temperature: 0.3 });
    if (!j) continue;
    const opts = Array.isArray(j.options) ? j.options.map(String) : null;
    const correct = String(j.correct || '').trim().toUpperCase();
    if (!opts || opts.length !== 4 || !/^[A-D]$/.test(correct)) { stats.bad++; continue; }
    await c.query(
        `UPDATE ielts_questions SET payload=jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$1::jsonb), correct=$2::jsonb WHERE id=$3`,
        [JSON.stringify(opts), JSON.stringify(correct), r.id]
    );
    stats.fixed++;
}

console.log(`\n══════ FINAL ══════`);
console.log(`AI calls: ${stats.calls}`);
console.log(`AI errors: ${stats.errs}`);
console.log(`Fixed: ${stats.fixed}`);
console.log(`Bad quality: ${stats.bad}`);

await c.end();
