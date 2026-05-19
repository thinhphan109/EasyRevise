// scripts/ielts/audit-data-quality.mjs
// Comprehensive audit of crawled IELTS data — flags rows that are too
// short, missing audio, missing question stems, missing options, etc.
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
await c.connect();

console.log('═'.repeat(70));
console.log('IELTS DATA QUALITY AUDIT');
console.log('═'.repeat(70));

// ── 1. Overall test counts per skill
const counts = await c.query(`
    SELECT skill, COUNT(*) AS total,
           COUNT(*) FILTER (WHERE is_published) AS published
      FROM ielts_tests GROUP BY skill ORDER BY skill`);
console.log('\n[1] Test counts');
counts.rows.forEach(r => console.log(`  ${r.skill.padEnd(10)} total=${r.total}  published=${r.published}`));

// ── 2. Reading/Listening: tests with NO passages or 0 questions
console.log('\n[2] Reading/Listening — tests missing content');
const r2 = await c.query(`
    WITH stats AS (
        SELECT t.id, t.title, t.skill,
               COUNT(DISTINCT p.id) AS n_passages,
               COUNT(q.id) AS n_questions,
               COUNT(p.id) FILTER (WHERE p.audio_url IS NOT NULL) AS n_audio_passages,
               AVG(LENGTH(p.body)) AS avg_passage_len
          FROM ielts_tests t
          LEFT JOIN ielts_passages p ON p.test_id = t.id
          LEFT JOIN ielts_questions q ON q.passage_id = p.id
         WHERE t.skill IN ('reading','listening')
         GROUP BY t.id, t.title, t.skill
    )
    SELECT skill,
           COUNT(*) FILTER (WHERE n_passages = 0) AS no_passages,
           COUNT(*) FILTER (WHERE n_questions = 0) AS no_questions,
           COUNT(*) FILTER (WHERE skill='listening' AND n_audio_passages = 0) AS listening_no_audio,
           COUNT(*) FILTER (WHERE avg_passage_len < 100) AS very_short_passages,
           COUNT(*) AS total
      FROM stats GROUP BY skill ORDER BY skill`);
r2.rows.forEach(r => {
    console.log(`  ${r.skill}:`);
    console.log(`    no passages:          ${r.no_passages}/${r.total}`);
    console.log(`    no questions:         ${r.no_questions}/${r.total}`);
    if (r.skill === 'listening') console.log(`    listening no audio:   ${r.listening_no_audio}/${r.total}`);
    console.log(`    very short (<100 ch): ${r.very_short_passages}/${r.total}`);
});

// ── 3. Question quality
console.log('\n[3] Question quality');
const q3 = await c.query(`
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE prompt IS NULL OR LENGTH(prompt) < 5) AS empty_prompts,
        COUNT(*) FILTER (WHERE type::text = 'multiple-choice' AND
                        (payload->'options' IS NULL
                         OR jsonb_typeof(payload->'options') <> 'array'
                         OR jsonb_array_length(payload->'options') < 2)) AS bad_mc,
        COUNT(*) FILTER (WHERE correct IS NULL) AS no_answer,
        COUNT(*) FILTER (WHERE type IS NULL) AS no_type
      FROM ielts_questions`);
const q = q3.rows[0];
console.log(`  total questions:        ${q.total}`);
console.log(`  empty/short prompts:    ${q.empty_prompts}`);
console.log(`  bad MC (<2 options):    ${q.bad_mc}`);
console.log(`  no correct answer:      ${q.no_answer}`);
console.log(`  no type:                ${q.no_type}`);

console.log('\n[3a] Question type distribution');
const q3a = await c.query(`
    SELECT COALESCE(type::text, '(null)') AS type, COUNT(*) AS n
      FROM ielts_questions GROUP BY type::text ORDER BY n DESC`);
q3a.rows.forEach(r => console.log(`  ${r.type.padEnd(30)} ${r.n}`));

// ── 4. Writing prompts
console.log('\n[4] Writing prompts');
const w = await c.query(`
    SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE prompt_text IS NULL OR LENGTH(prompt_text) < 30) AS short_prompts,
        COUNT(*) FILTER (WHERE task_type IS NULL) AS no_task_type,
        AVG(LENGTH(prompt_text))::int AS avg_len
      FROM ielts_writing_prompts`);
const wr = w.rows[0];
console.log(`  total prompts:        ${wr.total}`);
console.log(`  short (<30 ch):       ${wr.short_prompts}`);
console.log(`  missing task_type:    ${wr.no_task_type}`);
console.log(`  avg length:           ${wr.avg_len}`);

// ── 5. Speaking parts
console.log('\n[5] Speaking parts');
const sp = await c.query(`
    SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT test_id) AS distinct_tests,
        COUNT(*) FILTER (WHERE cue_card_text IS NULL OR LENGTH(cue_card_text) < 20) AS short_cue
      FROM ielts_speaking_parts`);
const s = sp.rows[0];
console.log(`  total parts:        ${s.total}`);
console.log(`  distinct tests:     ${s.distinct_tests}`);
console.log(`  short cue cards:    ${s.short_cue}`);

// ── 6. Examples of bad rows for human inspection
console.log('\n[6] Examples of broken tests (top 5 each)');
const examples = await c.query(`
    SELECT t.id, t.title, t.skill,
           COUNT(p.id) AS n_pass,
           COUNT(q.id) AS n_q,
           AVG(LENGTH(p.body))::int AS avg_len
      FROM ielts_tests t
      LEFT JOIN ielts_passages p ON p.test_id = t.id
      LEFT JOIN ielts_questions q ON q.passage_id = p.id
     WHERE t.skill IN ('reading','listening')
       AND t.is_published = true
     GROUP BY t.id, t.title, t.skill
     HAVING COUNT(q.id) = 0 OR AVG(LENGTH(p.body)) < 100 OR COUNT(p.id) = 0
     LIMIT 10`);
examples.rows.forEach(r =>
    console.log(`  [${r.skill}] ${(r.title || '?').slice(0, 60).padEnd(60)} ` +
                `pass=${r.n_pass} q=${r.n_q} avg=${r.avg_len ?? '-'}`));

await c.end();
