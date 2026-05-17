// scripts/youpass/probe-shape.mjs — figure out skill detection
import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

console.log('═ Parts with audio file_id ═');
const r1 = await pool.query(`SELECT count(*) FROM youpass_parts WHERE raw->>'file_id' IS NOT NULL AND raw->>'file_id' != ''`);
console.log(`  ${r1.rows[0].count}`);

console.log('\n═ Parts with transcription ═');
const r2 = await pool.query(`SELECT count(*) FROM youpass_parts WHERE length(raw->>'transcription') > 100`);
console.log(`  ${r2.rows[0].count}`);

console.log('\n═ Parts with passage content (rich Reading) ═');
const r3 = await pool.query(`SELECT count(*) FROM youpass_parts WHERE length(raw->>'content') > 500 OR length(raw->>'passage') > 500`);
console.log(`  ${r3.rows[0].count}`);

console.log('\n═ Sample Listening (audio file present) ═');
const r4 = await pool.query(`
    SELECT q.id AS quiz_id, q.quiz_type, q.raw->>'title' AS title,
           p.id AS part_id, p.raw->>'file_id' AS file_id, p.raw->>'listen_from' AS listen_from,
           length(p.raw->>'transcription') AS tr_len
    FROM youpass_parts p
    JOIN youpass_quizzes q ON q.id = p.quiz_id
    WHERE p.raw->>'file_id' IS NOT NULL AND p.raw->>'file_id' != ''
    LIMIT 5
`);
r4.rows.forEach(r => console.log(`  quiz=${r.quiz_id} type=${r.quiz_type} part=${r.part_id} file=${r.file_id?.slice(0,12)}… tr=${r.tr_len}  "${r.title?.slice(0,60)}"`));

console.log('\n═ Question.type distribution (overall) ═');
const r5 = await pool.query(`SELECT raw->>'type' AS qtype, count(*) FROM youpass_questions GROUP BY qtype ORDER BY count DESC LIMIT 20`);
r5.rows.forEach(r => console.log(`  ${(r.qtype || 'null').padEnd(28)} ${r.count}`));

console.log('\n═ Sample Writing question with image ═');
const r6 = await pool.query(`SELECT q.id, q.raw->>'title' AS title, q.raw->>'writing_graph_image' AS img, q.raw->>'writing_graph_type' AS gtype, q.quiz_id FROM youpass_questions q WHERE q.raw->>'writing_graph_image' IS NOT NULL AND q.raw->>'writing_graph_image' != '' LIMIT 5`);
r6.rows.forEach(r => console.log(`  q=${r.id} quiz=${r.quiz_id} img=${r.img?.slice(0,12)}… gtype=${r.gtype}  "${r.title?.slice(0,70)}"`));

console.log('\n═ Sample Speaking question ═');
const r7 = await pool.query(`SELECT q.id, q.raw->>'title' AS title, q.raw->>'speaking_part_type' AS spt, q.raw->>'sample_answers' AS sa, q.quiz_id FROM youpass_questions q WHERE q.raw->>'type' = 'speaking' LIMIT 3`);
r7.rows.forEach(r => console.log(`  q=${r.id} quiz=${r.quiz_id} part=${r.spt}  "${r.title?.slice(0,80)}"  sa_len=${(r.sa || '').length}`));

await pool.end();
