// Seed script - converts exam-data.js into data/exams.json
// LEGACY: pre-Postgres seed flow. Kept for one-off snapshot generation.
// Reads the old `js/exam-data.js` (a const declaration) and uses eval()
// to materialise it. Project moved to Postgres + JSON imports — this
// is no longer part of the runtime; ESLint rule is suppressed locally.
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Read the old exam-data.js
let examDataContent = fs.readFileSync(path.join(__dirname, 'js', 'exam-data.js'), 'utf-8');

// Replace 'const EXAM_DATA' with 'var EXAM_DATA' so eval works
examDataContent = examDataContent.replace('const EXAM_DATA', 'var EXAM_DATA');

// Execute in current scope (legacy flow — see file header)
// eslint-disable-next-line no-eval
eval(examDataContent);

const examId = uuidv4();
const now = new Date().toISOString();

// Ensure all sections have IDs
EXAM_DATA.sections.forEach(section => {
    if (!section.id || typeof section.id !== 'string' || section.id.length < 10) {
        section.id = uuidv4();
    }
});

const seededExam = {
    id: examId,
    title: EXAM_DATA.title,
    subject: EXAM_DATA.subject || 'Tiếng Anh 9',
    year: EXAM_DATA.year || '2025-2026',
    sections: EXAM_DATA.sections,
    createdAt: now,
    updatedAt: now
};

const data = { exams: [seededExam] };

fs.writeFileSync(
    path.join(__dirname, 'data', 'exams.json'),
    JSON.stringify(data, null, 2),
    'utf-8'
);

console.log(`✅ Seeded 1 exam with ID: ${examId}`);
console.log(`   Title: ${seededExam.title}`);
console.log(`   Sections: ${seededExam.sections.length}`);
let totalQ = 0;
seededExam.sections.forEach(s => {
    if (s.questions) totalQ += s.questions.length;
    else totalQ += 1;
});
console.log(`   Total questions: ${totalQ}`);
