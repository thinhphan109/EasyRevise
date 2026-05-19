// scripts/youpass/find-ielts.mjs — find IELTS courses + traverse one
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://cms.youpass.vn';
const TOKEN = process.env.YOUPASS_TOKEN;
const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://youpass.vn',
    'Referer': 'https://youpass.vn/'
};

async function get(url) {
    const r = await fetch(`${BASE}${url}`, { headers: HEADERS });
    return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

console.log('─ All courses ─');
const courses = await get('/items/course?fields=id,title,sub_title,level,duration&limit=100');
const list = courses.body.data || [];
console.log(`${list.length} courses:`);
list.forEach(c => console.log(`  [${String(c.id).padStart(4)}] ${(c.level || '?').padEnd(8)}  ${c.title}  (${c.sub_title || ''})`));

const ielts = list.filter(c => /ielts/i.test(c.title + ' ' + (c.sub_title || '')));
console.log(`\nIELTS-flavored: ${ielts.length}`);

console.log('\n─ Sample full course (first IELTS) ─');
const sample = ielts[0] || list[0];
console.log('Course:', sample.title);
const full = await get(`/items/course/${sample.id}?fields=*,sections.*,sections.parts.*`);
const courseData = full.body.data;
console.log(`  ${(courseData.sections || []).length} sections`);

const firstSection = courseData.sections?.[0];
if (firstSection) {
    const sec = await get(`/items/section/${firstSection.id || firstSection}?fields=*,parts.*`);
    const secData = sec.body.data;
    console.log(`  First section: "${secData.title}" with ${(secData.parts || []).length} parts`);

    const firstPartId = (secData.parts || [])[0];
    if (firstPartId) {
        const pId = typeof firstPartId === 'object' ? firstPartId.id : firstPartId;
        const part = await get(`/items/part/${pId}?fields=*,questions.*`);
        const partData = part.body.data;
        console.log(`\n  First part: "${partData.title}"`);
        console.log(`    quiz=${partData.quiz}  file_id=${partData.file_id}`);
        console.log(`    question_count=${(partData.questions || []).length}`);
        console.log(`    transcription len=${(partData.transcription || '').length}`);

        // Sample one question fully
        const firstQ = (partData.questions || [])[0];
        if (firstQ) {
            const qId = typeof firstQ === 'object' ? firstQ.id : firstQ;
            const q = await get(`/items/question/${qId}?fields=*`);
            console.log('\n  Sample question (all fields):');
            const populated = Object.entries(q.body.data).filter(([k, v]) =>
                v !== null && v !== '' && (!Array.isArray(v) || v.length));
            populated.forEach(([k, v]) => {
                let val = v;
                if (typeof v === 'string' && v.length > 100) val = v.slice(0, 100) + '…';
                if (typeof v === 'object') val = JSON.stringify(v).slice(0, 100) + '…';
                console.log(`    ${k.padEnd(28)}= ${val}`);
            });
        }
    }
}

// Probe quiz directly
console.log('\n─ Sample quizzes (any 5) ─');
const quizzes = await get('/items/quiz?fields=id,title,type,skill,quiz_type,quiz_skill&limit=20');
(quizzes.body.data || []).slice(0, 10).forEach(q => {
    console.log(`  [${String(q.id).padStart(5)}] type=${q.type || q.quiz_type || '?'}  skill=${q.skill || q.quiz_skill || '?'}  "${(q.title || '').slice(0, 60)}"`);
});

// Probe quiz fields
console.log('\n─ Quiz field types (one full row) ─');
const oneQuiz = await get('/items/quiz?limit=1');
const sampleQuiz = oneQuiz.body.data?.[0];
if (sampleQuiz) {
    Object.keys(sampleQuiz).forEach(k => {
        const v = sampleQuiz[k];
        const typ = v === null ? 'null'
                  : Array.isArray(v) ? 'array'
                  : typeof v;
        console.log(`  ${k.padEnd(28)} ${typ}`);
    });
}

const outDir = path.join(process.cwd(), 'docs');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'youpass-courses.json'), JSON.stringify({ courses: list, ielts }, null, 2));
console.log('\nSaved to docs/youpass-courses.json');
