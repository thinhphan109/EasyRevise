// scripts/ielts/repair-questions-v9-ai-full-mc.mjs
// For mc_single questions with no options AND no correct, but real
// passage + real prompt, ask Claude to derive a complete 4-option MC
// from the passage.
//
// Higher quality bar: passage must be ≥500ch, prompt ≥10ch and not an
// instruction-style header.
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

function isInstructionPrompt(p) {
    if (!p) return true;
    return /^(Choose|Complete|Read|Reading Passage|Listening|Section|Questions?|Do the following|Classify|Match|Write|Decide)/i.test(p)
        || /^\d{1,3}\.?$/.test(p)
        || p.length < 10;
}

console.log('═══ Loading mc_single recoverables ═══');
const { rows: cand } = await c.query(`
    SELECT q.id, q.prompt, p.body AS passage_body
      FROM ielts_questions q
      JOIN ielts_passages p ON p.id=q.passage_id
      JOIN ielts_tests t ON t.id=p.test_id
     WHERE t.skill='reading' AND t.source='youpass.vn'
       AND q.type='mc_single'
       AND jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) < 2
       AND (q.correct IS NULL OR q.correct::text='null')
       AND LENGTH(p.body) > 500
       AND LENGTH(q.prompt) > 10
       AND q.prompt !~ '^\\d{1,3}\\.?$'
`);
const filtered = cand.filter(r => !isInstructionPrompt(r.prompt));
console.log(`Candidates: ${cand.length}, after filter: ${filtered.length}`);

const SYS = `You are an IELTS Reading test writer. Given a passage and a question stem, produce a 4-option multiple choice question grounded strictly in the passage.

Rules:
1. Generate exactly 4 options labelled A, B, C, D.
2. Exactly ONE option must be correct, derivable from the passage.
3. The other 3 must be plausible distractors that are contradicted by, or absent from, the passage.
4. Each option is a self-contained phrase (3-15 words typically), parallel in style.
5. Identify the correct letter (A/B/C/D).

Output ONLY: {"options":["A text","B text","C text","D text"],"correct":"X"}`;

let aiCalls = 0, aiErrors = 0, fixed = 0, badQuality = 0;

for (const r of filtered) {
    const passage = stripHtml(r.passage_body || '').slice(0, 4500);
    const stem = r.prompt.slice(0, 600);

    let result;
    try {
        result = await chatJson([
            { role: 'system', content: SYS },
            { role: 'user', content: `PASSAGE:\n${passage}\n\nQUESTION: ${stem}\n\nGenerate the MC.` }
        ], { maxTokens: 700, temperature: 0.3 });
        aiCalls++;
    } catch (e) {
        aiErrors++;
        if (aiErrors <= 5) console.log(`  AI err: ${e.message.slice(0, 80)}`);
        continue;
    }

    const options = Array.isArray(result.options) ? result.options.map(String) : null;
    const correct = String(result.correct || '').trim().toUpperCase();

    if (!options || options.length !== 4 || !/^[A-D]$/.test(correct)) {
        badQuality++;
        continue;
    }
    // De-dupe
    const seen = new Set();
    let unique = true;
    for (const o of options) {
        const k = o.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(k) || k.length < 2) { unique = false; break; }
        seen.add(k);
    }
    if (!unique) { badQuality++; continue; }

    await c.query(
        `UPDATE ielts_questions
            SET payload = jsonb_set(COALESCE(payload,'{}'::jsonb),'{options}',$1::jsonb),
                correct = $2::jsonb
          WHERE id = $3`,
        [JSON.stringify(options), JSON.stringify(correct), r.id]
    );
    fixed++;
    if (fixed % 50 === 0) console.log(`  …${fixed}/${filtered.length} fixed`);
}

console.log(`\nAI calls: ${aiCalls}`);
console.log(`AI errors: ${aiErrors}`);
console.log(`Bad quality: ${badQuality}`);
console.log(`Fixed: ${fixed}`);

await c.end();
