// scripts/youpass/probe-collections.mjs
// Brute-force probe known IELTS collections names. Logs anything that returns 200.
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

const CANDIDATES = [
    // Generic
    'tests', 'test', 'lessons', 'lesson', 'quizzes', 'quiz', 'questions', 'question',
    'topics', 'topic', 'subjects', 'subject', 'courses', 'course', 'units', 'unit',
    'exercises', 'exercise', 'media', 'files', 'audios', 'audio',

    // IELTS-specific
    'ielts_tests', 'ielts_test', 'ielts_lessons', 'ielts_lesson',
    'ielts_questions', 'ielts_question', 'ielts_quizzes', 'ielts_quiz',
    'ielts_reading', 'ielts_listening', 'ielts_writing', 'ielts_speaking',
    'reading_tests', 'listening_tests', 'writing_tests', 'speaking_tests',
    'reading', 'listening', 'writing', 'speaking',
    'reading_passages', 'listening_audios', 'listening_audio',
    'writing_tasks', 'writing_task', 'speaking_parts', 'speaking_part',
    'speaking_topics', 'writing_prompts',

    // Sub-shapes
    'passages', 'passage', 'questions_choices', 'choices', 'options',
    'answers', 'answer', 'submissions', 'submission',
    'attempts', 'attempt', 'results', 'result',
    'transcripts', 'transcript', 'sample_answers', 'sample_answer',

    // youpass branding
    'tasks', 'task', 'parts', 'part', 'sections', 'section',
    'practice_tests', 'practice_test', 'mock_tests', 'mock_test',
    'flash_cards', 'flashcards', 'vocabulary', 'vocab',

    // Camel-cased fallbacks (Directus default is snake_case but worth checking)
    'IeltsTests', 'IeltsLessons',

    // Course platform
    'students', 'student', 'classes', 'class', 'enrollments',
    'progresses', 'progress', 'levels', 'level',
    'achievements', 'badges',

    // Categories
    'categories', 'category', 'tags', 'tag',
    'difficulties', 'difficulty', 'topic_tags'
];

const results = {};

for (const c of CANDIDATES) {
    const r = await fetch(`${BASE}/items/${c}?limit=1&meta=*`, { headers: HEADERS });
    if (r.status === 200) {
        const body = await r.json();
        const meta = body.meta || {};
        const sampleKeys = body.data?.[0] ? Object.keys(body.data[0]) : [];
        results[c] = { status: 200, total: meta.total_count, filteredCount: meta.filter_count, sampleKeys };
        console.log(`✓ ${c.padEnd(28)} total=${meta.total_count ?? '?'}  fields=${sampleKeys.length}  ${sampleKeys.slice(0, 5).join(',')}…`);
    } else if (r.status === 403) {
        // forbidden but exists
        results[c] = { status: 403 };
        // Don't print to keep noise low
    }
}

// Summary
const found = Object.entries(results).filter(([_, v]) => v.status === 200);
const forbidden = Object.entries(results).filter(([_, v]) => v.status === 403);
console.log(`\n─ Summary ─`);
console.log(`Accessible: ${found.length}`);
console.log(`Forbidden (exists, no permission): ${forbidden.length}`);
if (forbidden.length) console.log(`  ${forbidden.map(([k]) => k).join(', ')}`);

const outDir = path.join(process.cwd(), 'docs');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'youpass-collections.json'), JSON.stringify(results, null, 2));
console.log(`\nSaved to docs/youpass-collections.json`);
