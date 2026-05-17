// scripts/youpass/crawl-pilot.mjs — pilot crawl (1 course → staging tables)
import 'dotenv/config';
import { api, paginate } from './client.mjs';
import pg from 'pg';

const COURSE_ID = Number(process.argv[2] || 88); // default: 01-ROOT (NEW)

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function upsert(table, idColumn, id, raw, extras = {}) {
    const cols = ['id', 'raw', ...Object.keys(extras)];
    const vals = [id, JSON.stringify(raw), ...Object.values(extras)];
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
    const updates = cols
        .filter(c => c !== 'id')
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(', ');
    await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})
         ON CONFLICT (${idColumn}) DO UPDATE SET ${updates}, fetched_at = now()`,
        vals
    );
}

const stats = { courses: 0, sections: 0, parts: 0, quizzes: 0, questions: 0 };

console.log(`─ Crawl course ${COURSE_ID} ─`);

// 1. Course
const cRes = await api(`/items/course/${COURSE_ID}?fields=*`);
const course = cRes.data;
await upsert('youpass_courses', 'id', course.id, course);
stats.courses++;
console.log(`  ✓ course #${course.id}: ${course.title}`);

// 2. Sections (course.sections is an array of IDs)
const sectionIds = course.sections || [];
console.log(`  ${sectionIds.length} sections`);
for (const sid of sectionIds) {
    const sRes = await api(`/items/section/${sid}?fields=*`);
    const section = sRes.data;
    await upsert('youpass_sections', 'id', section.id, section, { course_id: course.id });
    stats.sections++;

    // 3. Parts (section.parts is an array of IDs)
    const partIds = section.parts || [];
    for (const pid of partIds) {
        try {
            const pRes = await api(`/items/part/${pid}?fields=*`);
            const part = pRes.data;
            await upsert('youpass_parts', 'id', part.id, part, {
                section_id: section.id,
                quiz_id: part.quiz || null
            });
            stats.parts++;

            // 4. Quiz
            if (part.quiz) {
                try {
                    const qRes = await api(`/items/quiz/${part.quiz}?fields=*`);
                    const quiz = qRes.data;
                    await upsert('youpass_quizzes', 'id', quiz.id, quiz, {
                        type: quiz.type ?? null,
                        quiz_type: quiz.quiz_type ?? null
                    });
                    stats.quizzes++;
                } catch (e) {
                    console.log(`    ! quiz ${part.quiz} failed: ${e.message.slice(0, 80)}`);
                }
            }

            // 5. Questions
            const questionIds = part.questions || [];
            if (questionIds.length) {
                // Batch fetch (Directus accepts multiple IDs)
                const qFilter = encodeURIComponent(JSON.stringify({ id: { _in: questionIds } }));
                const qRes = await api(`/items/question?filter=${qFilter}&fields=*&limit=${questionIds.length}`);
                for (const q of (qRes.data || [])) {
                    await upsert('youpass_questions', 'id', q.id, q, {
                        part_id: part.id,
                        quiz_id: part.quiz || null
                    });
                    stats.questions++;
                }
            }
        } catch (e) {
            console.log(`    ! part ${pid} failed: ${e.message.slice(0, 80)}`);
        }
    }
    console.log(`  ✓ section ${section.id} "${(section.title || '').slice(0, 40)}"  (parts=${partIds.length})`);
}

console.log('\n─ Stats ─');
console.log(stats);

// Distribution of question_type
const dist = await pool.query(
    `SELECT raw->>'question_type' AS type, count(*) AS n
     FROM youpass_questions
     WHERE quiz_id IN (SELECT id FROM youpass_quizzes)
     GROUP BY type ORDER BY n DESC`
);
console.log('\n─ Question type distribution ─');
dist.rows.forEach(r => console.log(`  ${(r.type || 'null').padEnd(30)} ${r.n}`));

await pool.end();
