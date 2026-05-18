// scripts/ielts/unpublish-broken-tests.mjs
// Conservative gates — unpublish only when content is structurally empty:
//   • reading/listening: zero questions OR avg passage body < 100 chars
//   • writing: zero prompts OR longest prompt < 30 chars
//   • speaking: zero parts OR no playable prompt/cue
//
// Stricter gates (correct-answer / option-completeness) belong in a
// separate review pass since some legacy crawler data has answers in
// payload fields rather than the dedicated 'correct' column.
import 'dotenv/config';
import pg from 'pg';

const c = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});
await c.connect();

await c.query(`UPDATE ielts_tests SET is_published = true`);

// A "playable" question:
//   - prompt is not numeric placeholder ("1", "2", ...) and ≥ 1 char
//   - has a non-null correct answer
//   - has ≥ 2 options OR is fill-in-blank/tfng (which don't need options)
const a = await c.query(`
    UPDATE ielts_tests t SET is_published = false
     WHERE t.skill IN ('reading','listening')
       AND t.id IN (
         SELECT t.id
           FROM ielts_tests t
           LEFT JOIN ielts_passages p ON p.test_id = t.id
           LEFT JOIN ielts_questions q ON q.passage_id = p.id
          WHERE t.skill IN ('reading','listening')
          GROUP BY t.id
          HAVING COUNT(q.id) = 0
              OR AVG(LENGTH(p.body)) < 100
              OR COUNT(q.id) FILTER (
                   WHERE q.prompt !~ '^\\d{1,3}\\.?$'
                     AND LENGTH(q.prompt) >= 1
                     AND q.correct IS NOT NULL
                     AND q.correct::text <> 'null'
                     AND (jsonb_array_length(COALESCE(q.payload->'options','[]'::jsonb)) >= 2
                          OR q.type::text IN ('sentence_completion','tfng'))
                 )::float / NULLIF(COUNT(q.id), 0) < 0.5
       )`);
console.log(`Reading/Listening unpublished: ${a.rowCount}`);

const b = await c.query(`
    UPDATE ielts_tests t SET is_published = false
     WHERE t.skill = 'writing'
       AND t.id IN (
         SELECT t.id FROM ielts_tests t
         LEFT JOIN ielts_writing_prompts wp ON wp.test_id = t.id
         WHERE t.skill = 'writing'
         GROUP BY t.id
         HAVING COUNT(wp.id) = 0 OR MAX(LENGTH(wp.prompt_text)) < 30
       )`);
console.log(`Writing unpublished: ${b.rowCount}`);

const c3 = await c.query(`
    UPDATE ielts_tests t SET is_published = false
     WHERE t.skill = 'speaking'
       AND t.id IN (
         SELECT t.id FROM ielts_tests t
         LEFT JOIN ielts_speaking_parts sp ON sp.test_id = t.id
         WHERE t.skill = 'speaking'
         GROUP BY t.id
         HAVING COUNT(sp.id) = 0
             OR COUNT(sp.id) FILTER (
                  WHERE COALESCE(LENGTH(sp.cue_card_text), 0) >= 20
                     OR (sp.prompts IS NOT NULL
                         AND jsonb_array_length(sp.prompts) > 0)
                ) = 0
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
