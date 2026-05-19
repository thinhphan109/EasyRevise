import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

async function count(label, q) {
    const r = await c.query(q);
    console.log(`  ${label.padEnd(28)} ${r.rows[0].n}`);
}

console.log('\n── Row counts ──');
await count('exams',           'SELECT count(*)::int n FROM exams');
await count('exam_sections',   'SELECT count(*)::int n FROM exam_sections');
await count('exam_questions',  'SELECT count(*)::int n FROM exam_questions');
await count('access_codes',    'SELECT count(*)::int n FROM access_codes');
await count('code_usages',     'SELECT count(*)::int n FROM code_usages');
await count('open_submissions','SELECT count(*)::int n FROM open_submissions');
await count('subjects',        'SELECT count(*)::int n FROM subjects');
await count('users',           'SELECT count(*)::int n FROM public.users');
await count('user_history',    'SELECT count(*)::int n FROM user_history');
await count('media_folders',   'SELECT count(*)::int n FROM media_folders');
await count('media_files',     'SELECT count(*)::int n FROM media_files');

console.log('\n── Sample exam structure ──');
const r = await c.query(`
    SELECT e.id, e.title,
           (SELECT count(*)::int FROM exam_sections WHERE exam_id = e.id)  sections,
           (SELECT count(*)::int FROM exam_questions q
              JOIN exam_sections s ON s.id = q.section_id
              WHERE s.exam_id = e.id) questions,
           (SELECT count(*)::int FROM access_codes WHERE exam_id = e.id)  codes
    FROM exams e ORDER BY e.title LIMIT 5
`);
r.rows.forEach(x => console.log(' ', x));

await c.end();
