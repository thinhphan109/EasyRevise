import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });

const r = await p.query(`SELECT skill, count(*)::int AS n FROM ielts_tests GROUP BY skill ORDER BY skill`);
console.log('Tests by skill:');
r.rows.forEach(x => console.log(`  ${x.skill}: ${x.n}`));

const r2 = await p.query(`SELECT count(*)::int AS n FROM ielts_writing_prompts`);
console.log(`Writing prompts: ${r2.rows[0].n}`);

const r3 = await p.query(`SELECT count(*)::int AS n FROM ielts_speaking_parts`);
console.log(`Speaking parts: ${r3.rows[0].n}`);

const r4 = await p.query(`SELECT count(*)::int AS n FROM ielts_passages WHERE audio_url IS NOT NULL`);
console.log(`Listening passages with audio: ${r4.rows[0].n}`);

const r5 = await p.query(`SELECT count(*)::int AS n FROM ielts_questions`);
console.log(`Questions: ${r5.rows[0].n}`);

await p.end();
