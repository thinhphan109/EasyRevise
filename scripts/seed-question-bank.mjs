// scripts/seed-question-bank.mjs
// One-shot: populate question_bank from all existing exams via the repo
// (which already merges sections + questions correctly).
import 'dotenv/config';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repos = require('../lib/repos');

function stableId(seed) {
    const h = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32);
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

const all = await repos.exams.listAll();
console.log(`Loaded ${all.length} exams`);

let total = 0, inserted = 0, updated = 0;

for (const summary of all) {
    const exam = await repos.exams.getById(summary.id);
    if (!exam) continue;
    for (const sec of (exam.sections || [])) {
        if (sec.type === 'writing-essay') {
            const id = stableId(`${exam.id}|${sec.id}|essay`);
            const payload = {
                question: sec.prompt || sec.title,
                cues: sec.cues || [],
                sampleAnswer: sec.sampleAnswer || '',
                explanation: sec.explanation || '',
                createdAt: new Date().toISOString(),
                usageCount: 0,
                sourceExamId: exam.id
            };
            const before = await repos.questionBank.getById(id);
            await repos.questionBank.upsert({
                id,
                subject: exam.subject || null,
                sectionType: 'writing-essay',
                payload,
                tags: [],
                difficulty: 'medium',
                source: 'exam'
            });
            before ? updated++ : inserted++;
            total++;
        } else {
            for (const q of (sec.questions || [])) {
                const id = stableId(`${exam.id}|${sec.id}|${q.id}`);
                const payload = {
                    question: q.question,
                    options: q.options || [],
                    correctAnswer: q.correctAnswer,
                    blanks: q.blanks || null,
                    subParts: q.subParts || null,
                    explanation: q.explanation || '',
                    expansion: q.expansion || '',
                    createdAt: new Date().toISOString(),
                    usageCount: 0,
                    sourceExamId: exam.id
                };
                const before = await repos.questionBank.getById(id);
                await repos.questionBank.upsert({
                    id,
                    subject: exam.subject || null,
                    sectionType: sec.type || 'multiple-choice',
                    payload,
                    tags: [],
                    difficulty: 'medium',
                    source: 'exam'
                });
                before ? updated++ : inserted++;
                total++;
            }
        }
    }
}

console.log(`\nDone:`);
console.log(`  Total processed: ${total}`);
console.log(`  Inserted: ${inserted}`);
console.log(`  Updated:  ${updated}`);

const tally = (await repos.questionBank.listAll({ limit: 100000 })).length;
console.log(`  question_bank total now: ${tally}`);

process.exit(0);
