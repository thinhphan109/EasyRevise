// scripts/ielts/repair-questions-v8-ai-distractors.mjs
// For mc_single questions where we have a correct answer (likely a
// content fragment, not an A/B/C letter) but no options, ask Claude
// to write 3 plausible distractors grounded in the passage.
//
// Validation: distractors must be different from each other AND from
// the correct answer (case-insensitive, normalised).
//
// Quality: prompt asks for IELTS-style distractors that are plausible
// but contradicted by the passage.
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

function norm(s) {
    return String(s || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

console.log('═══ Loading mc_single without options but with content correct ═══');
const { rows: cand } = await c.query(`
    SELECT q.id, q.prompt, q.correct, q.payload, p.body AS passage_body, p.id AS passage_id
      FROM ielts_questions q
      JOIN ielts_passages p ON p.id=q.passage_id
      JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='reading'
       AND t.source='youpass.vn'
       AND q.type='mc_single'
       AND jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) = 0
       AND q.correct IS NOT NULL
       AND jsonb_typeof(q.correct) = 'string'
       AND q.correct::text !~ '^"[A-Z]"$'
       AND q.correct::text !~ '^"[ivxlcdm]+"$'
       AND LENGTH(q.prompt) > 10
     LIMIT 800
`);
console.log(`Candidates: ${cand.length}`);

const SYS = `You are an IELTS Reading test writer. Given a passage, a question stem, and the correct answer, write 3 plausible but INCORRECT distractor options. Each distractor must:
1. Be similar in length and style to the correct answer (typically 3-15 words).
2. Be grammatically valid in the question.
3. Be plausibly related to the topic but contradicted by, or absent from, the passage.
4. NOT paraphrase the correct answer.
5. NOT contain hedging like "maybe" or "possibly".

Output ONLY: {"distractors":["a","b","c"]}`;

let aiCalls = 0, aiErrors = 0, fixed = 0, badQuality = 0;

for (const r of cand) {
    const passage = stripHtml(r.passage_body || '').slice(0, 4000);
    const correct = String(r.correct).replace(/^"|"$/g, '');
    const stem = r.prompt.slice(0, 500);

    if (!passage || passage.length < 100) continue;

    let distractors;
    try {
        const j = await chatJson([
            { role: 'system', content: SYS },
            { role: 'user', content:
                `PASSAGE:\n${passage}\n\nQUESTION: ${stem}\n\nCORRECT ANSWER: ${correct}\n\nWrite 3 distractors.` }
        ], { maxTokens: 600, temperature: 0.4 });
        aiCalls++;
        distractors = Array.isArray(j.distractors) ? j.distractors.map(String) : null;
    } catch (e) {
        aiErrors++;
        if (aiErrors <= 5) console.log(`  AI err: ${e.message.slice(0, 80)}`);
        continue;
    }

    if (!distractors || distractors.length < 3) { badQuality++; continue; }

    // Quality gate: distractors unique + not duplicating correct
    const seen = new Set([norm(correct)]);
    const clean = [];
    for (const d of distractors) {
        const key = norm(d);
        if (key.length < 2 || seen.has(key)) continue;
        seen.add(key);
        clean.push(d.trim());
    }
    if (clean.length < 3) { badQuality++; continue; }

    // Build options array, randomise position of correct A-D
    const options = [correct, ...clean.slice(0, 3)];
    // Place correct at random slot, but for simplicity always put at index 0 → letter "A"
    // Actually let's randomise so we don't bias users toward A
    const correctSlot = Math.floor(Math.random() * 4);
    [options[0], options[correctSlot]] = [options[correctSlot], options[0]];
    const correctLetter = String.fromCharCode(65 + correctSlot);

    await c.query(
        `UPDATE ielts_questions
            SET payload = jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$1::jsonb),
                correct = $2::jsonb
          WHERE id = $3`,
        [JSON.stringify(options), JSON.stringify(correctLetter), r.id]
    );
    fixed++;
    if (fixed % 50 === 0) console.log(`  …${fixed} fixed (${aiCalls} calls, ${aiErrors} errs)`);
}

console.log(`\nAI calls: ${aiCalls}`);
console.log(`AI errors: ${aiErrors}`);
console.log(`Bad quality: ${badQuality}`);
console.log(`Fixed: ${fixed}`);

await c.end();
