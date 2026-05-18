// scripts/ielts/unpublish-broken-tests.mjs
// Hide tests that genuinely have no playable content. Each skill is
// validated against the right tables:
//   • reading/listening → must have passages with questions
//   • writing           → must have ielts_writing_prompts with prompt_text
//   • speaking          → must have ielts_speaking_parts with cue_card_text
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
await c.connect();

// Reset everything to published first
await c.query(`UPDATE ielts_tests SET is_published = true`);

// 1. Reading/Listening
const a = await c.query(`
    UPDATE ielts_tests t SET is_published = false
     WHERE t.skill IN ('reading','listening')
       AND t.id IN (
         SELECT t.id FROM ielts_tests t
         LEFT JOIN ielts_passages p ON p.test_id = t.id
         LEFT JOIN ielts_questions q ON q.passage_id = p.id
         WHERE t.skill IN ('reading','listening')
         GROUP BY t.id
         HAVING COUNT(q.id) = 0
             OR AVG(LENGTH(p.body)) < 100
       )`);
console.log(`Reading/Listening unpublished: ${a.rowCount}`);

// 2. Writing
const b = await c.query(`
    UPDATE ielts_tests t SET is_published = false
     WHERE t.skill = 'writing'
       AND t.id IN (
         SELECT t.id FROM ielts_tests t
         LEFT JOIN ielts_writing_prompts wp ON wp.test_id = t.id
         WHERE t.skill = 'writing'
         GROUP BY t.id
         HAVING COUNT(wp.id) = 0
             OR MAX(LENGTH(wp.prompt_text)) < 30
       )`);
console.log(`Writing unpublished: ${b.rowCount}`);

// 3. Speaking
const c3 = await c.query(`
    UPDATE ielts_tests t SET is_published = false
     WHERE t.skill = 'speaking'
       AND t.id IN (
         SELECT t.id FROM ielts_tests t
         LEFT JOIN ielts_speaking_parts sp ON sp.test_id = t.id
         WHERE t.skill = 'speaking'
         GROUP BY t.id
         HAVING COUNT(sp.id) = 0
             OR MAX(LENGTH(sp.cue_card_text)) < 20
       )`);
console.log(`Speaking unpublished: ${c3.rowCount}`);

const { rows } = await c.query(
    `SELECT skill::text,
            COUNT(*) FILTER (WHERE is_published) AS published,
            COUNT(*) AS total
       FROM ielts_tests GROUP BY skill::text ORDER BY skill::text`
);
console.log('\nFinal published counts:');
rows.forEach(r => console.log(`  ${r.skill.padEnd(10)} ${r.published}/${r.total}`));

await c.end();
