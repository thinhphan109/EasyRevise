// scripts/youpass/inspect-staging.mjs — analyse staged data for import planning
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

console.log('═ Quiz counts by quiz_type ═');
const r1 = await pool.query(`SELECT quiz_type, count(*) FROM youpass_quizzes GROUP BY quiz_type ORDER BY quiz_type`);
r1.rows.forEach(r => console.log(`  quiz_type=${r.quiz_type}  ${r.count}`));

console.log('\n═ Question types per quiz_type ═');
const r2 = await pool.query(`
    SELECT q.quiz_type, qq.raw->>'type' AS qtype, count(*) AS n
    FROM youpass_questions qq
    JOIN youpass_quizzes q ON q.id = qq.quiz_id
    GROUP BY q.quiz_type, qtype
    ORDER BY q.quiz_type, n DESC
`);
let prev;
r2.rows.forEach(r => {
    if (r.quiz_type !== prev) { console.log(`\n quiz_type=${r.quiz_type}`); prev = r.quiz_type; }
    console.log(`    ${(r.qtype || 'null').padEnd(28)} ${r.n}`);
});

console.log('\n═ Sample WRITING quiz with image ═');
const r3 = await pool.query(`
    SELECT q.id, q.raw->>'title' AS title, q.raw->>'writing_task_type' AS task, q.raw->>'parts' AS parts,
           qq.raw->>'writing_graph_image' AS image,
           qq.raw->>'writing_graph_description' AS desc
    FROM youpass_quizzes q
    JOIN youpass_questions qq ON qq.quiz_id = q.id
    WHERE q.quiz_type = 4
      AND qq.raw->>'writing_graph_image' IS NOT NULL
    LIMIT 3
`);
r3.rows.forEach(r => {
    console.log(`  [${r.id}] task=${r.task}  image=${r.image?.slice(0, 24)}…`);
    console.log(`    title: ${r.title?.slice(0, 80)}`);
    console.log(`    desc: ${(r.desc || '').slice(0, 100)}…`);
});

console.log('\n═ Sample READING quiz with parts ═');
const r4 = await pool.query(`
    SELECT q.id, q.raw->>'title' AS title,
           p.id AS part_id, p.raw->>'transcription' AS transcription,
           p.raw->>'passage' AS passage,
           p.raw->>'content' AS content,
           p.raw->>'file_id' AS file_id
    FROM youpass_quizzes q
    JOIN youpass_parts p ON p.quiz_id = q.id
    WHERE q.quiz_type = 1
    ORDER BY q.id
    LIMIT 3
`);
r4.rows.forEach(r => {
    console.log(`  [${r.id}] ${r.title?.slice(0, 60)}`);
    console.log(`    part #${r.part_id}  passage_len=${(r.passage || '').length}  content_len=${(r.content || '').length}  file_id=${r.file_id}`);
});

console.log('\n═ Sample LISTENING quiz ═');
const r5 = await pool.query(`
    SELECT q.id, q.raw->>'title' AS title,
           p.id AS part_id, p.raw->>'transcription' AS transcription,
           p.raw->>'file_id' AS file_id, p.raw->>'listen_from' AS listen_from
    FROM youpass_quizzes q
    JOIN youpass_parts p ON p.quiz_id = q.id
    WHERE q.quiz_type = 2
    ORDER BY q.id
    LIMIT 3
`);
r5.rows.forEach(r => {
    console.log(`  [${r.id}] ${r.title?.slice(0, 60)}`);
    console.log(`    part #${r.part_id}  file=${r.file_id}  listen_from=${r.listen_from}  transcription_len=${(r.transcription || '').length}`);
});

console.log('\n═ Sample SPEAKING quiz ═');
const r6 = await pool.query(`
    SELECT q.id, q.raw->>'title' AS title, q.raw->>'speaking_part_type' AS part_type,
           q.raw->>'speaking_topic_id' AS topic
    FROM youpass_quizzes q
    WHERE q.quiz_type = 3
    LIMIT 3
`);
r6.rows.forEach(r => console.log(`  [${r.id}] part=${r.part_type} topic=${r.topic}  ${r.title?.slice(0, 80)}`));

await pool.end();
