// scripts/youpass/import.mjs — map staging → production ielts_* tables
import 'dotenv/config';
import pg from 'pg';
import he from 'he';

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }, max: 5
});

const ASSET_BASE = 'https://cms.youpass.vn/assets/';

const stats = {
    reading: 0, listening: 0, writing: 0, speaking: 0,
    questions: 0, passages: 0, skipped: 0
};

// ── Question type mapping ────────────────────────────────────────
function mapQuestionType(yp) {
    const t = (yp || '').toUpperCase();
    if (t === 'SINGLE-SELECTION' || t === 'SINGLE-RADIO') return 'mc_single';
    if (t === 'MULTIPLE') return 'mc_multi';
    if (t === 'FILL-IN-THE-BLANK' || t === 'FILL_BLANK') return 'sentence_completion';
    if (t === 'TRUE_FALSE') return 'tfng';
    if (t === 'YES_NO') return 'ynng';
    if (t === 'MATCHING_HEADING') return 'matching_headings';
    if (t === 'MATCHING_INFO' || t === 'MATCHING_INFORMATION') return 'matching_information';
    if (t === 'MATCHING_NAMES' || t === 'MATCHING_FEATURES') return 'matching_features';
    if (t === 'MAP_DIAGRAM_LABEL') return 'diagram_labelling';
    if (t === 'SHORT_ANSWER' || t === 'SHORT-ANSWER') return 'short_answer';
    return null;
}

function stripHtml(s) {
    if (s == null) return '';
    let str = String(s);
    // Decode entities up to 3 times for double-encoded YouPass payloads
    for (let i = 0; i < 3; i++) {
        const next = he.decode(str);
        if (next === str) break;
        str = next;
    }
    return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Decode entities while preserving line breaks (for prompt body/passage).
function decodeKeepBreaks(s) {
    if (s == null) return '';
    let str = String(s);
    for (let i = 0; i < 3; i++) {
        const next = he.decode(str);
        if (next === str) break;
        str = next;
    }
    return str
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function parseOptions(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw.map(stripHtml).filter(Boolean);
    if (typeof raw === 'string') {
        try {
            const j = JSON.parse(raw);
            if (Array.isArray(j)) return j.map(stripHtml).filter(Boolean);
        } catch {}
    }
    return null;
}

function parseCorrect(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
}

// ── Helpers ──────────────────────────────────────────────────────
async function upsertTest(id, data) {
    const { rows } = await pool.query(
        `INSERT INTO ielts_tests (id, skill, module, title, description, source, duration_sec, is_published)
         VALUES ($1, $2, 'academic', $3, $4, $5, $6, true)
         ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title, description = EXCLUDED.description,
             source = EXCLUDED.source, duration_sec = EXCLUDED.duration_sec,
             skill = EXCLUDED.skill,
             updated_at = now()
         RETURNING id`,
        [id, data.skill, data.title, data.description || null, data.source || 'youpass.vn', data.durationSec || 60 * 60]
    );
    return rows[0].id;
}

import crypto from 'node:crypto';
function uuidFromInt(prefix, n) {
    // Deterministic UUID v5-style from prefix + integer
    const hash = crypto.createHash('sha1').update(`${prefix}:${n}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function importReading(quiz, parts, questionsByPart) {
    const passageParts = parts.filter(p => {
        const c = p.raw?.content || p.raw?.passage || '';
        return stripHtml(c).length > 200;
    });
    if (!passageParts.length) return false;

    const testId = uuidFromInt('a1ead', quiz.id);
    await upsertTest(testId, {
        skill: 'reading',
        title: stripHtml(quiz.raw?.title) || `Reading Test ${quiz.id}`,
        source: 'youpass.vn',
        durationSec: (quiz.raw?.time || 60) * 60
    });

    // Wipe + reinsert passages
    await pool.query(`DELETE FROM ielts_passages WHERE test_id = $1`, [testId]);

    let passageOrder = 0;
    for (const part of passageParts) {
        passageOrder++;
        const passageBody = decodeKeepBreaks(part.raw.content || part.raw.passage);
        const passageId = uuidFromInt('a1eaf', part.id);
        await pool.query(
            `INSERT INTO ielts_passages (id, test_id, "order", title, body)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE
             SET test_id = EXCLUDED.test_id, "order" = EXCLUDED."order",
                 title = EXCLUDED.title, body = EXCLUDED.body`,
            [passageId, testId, passageOrder, stripHtml(part.raw.title) || `Passage ${passageOrder}`, passageBody]
        );
        stats.passages++;

        const qs = (questionsByPart.get(part.id) || []).filter(q => mapQuestionType(q.raw?.type));
        await pool.query(`DELETE FROM ielts_questions WHERE passage_id = $1`, [passageId]);

        let order = 0;
        for (const q of qs) {
            const mappedType = mapQuestionType(q.raw.type);
            const promptText = stripHtml(q.raw.title) || stripHtml(q.raw.gap_fill_in_blank);
            // Skip questions with no prompt text — these were causing
            // “Question 5/6/7” placeholders in the UI.
            if (!promptText) continue;
            // Skip MC questions with too-few options
            const options = parseOptions(q.raw.options) || [];
            if ((mappedType === 'mc_single' || mappedType === 'mc_multi') && options.length < 2) continue;
            order++;
            const qId = uuidFromInt('a1eaq', q.id);
            const correct = parseCorrect(q.raw.correct_answer ?? q.raw.correct_answers ?? q.raw.correct);
            try {
                await pool.query(
                    `INSERT INTO ielts_questions
                        (id, passage_id, "order", type, prompt, payload, correct, alternatives, config)
                     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,'{}'::jsonb)
                     ON CONFLICT (id) DO UPDATE
                     SET "order" = EXCLUDED."order", prompt = EXCLUDED.prompt,
                         payload = EXCLUDED.payload, correct = EXCLUDED.correct, type = EXCLUDED.type`,
                    [qId, passageId, order, mappedType,
                     promptText,
                     JSON.stringify({ options, originalType: q.raw.type, locate: q.raw.locate_info }),
                     JSON.stringify(correct)]
                );
                stats.questions++;
            } catch (e) { /* skip bad row */ }
        }
    }
    stats.reading++;
    return true;
}

async function importListening(quiz, parts, questionsByPart) {
    const audioParts = parts.filter(p => p.raw?.file_id);
    if (!audioParts.length) return false;

    const testId = uuidFromInt('11lsng', quiz.id);
    await upsertTest(testId, {
        skill: 'listening',
        title: stripHtml(quiz.raw?.title) || `Listening Test ${quiz.id}`,
        source: 'youpass.vn',
        durationSec: 30 * 60
    });

    await pool.query(`DELETE FROM ielts_passages WHERE test_id = $1`, [testId]);

    let order = 0;
    for (const part of audioParts) {
        order++;
        const passageId = uuidFromInt('11lspg', part.id);
        const audioUrl = ASSET_BASE + part.raw.file_id;
        await pool.query(
            `INSERT INTO ielts_passages (id, test_id, "order", title, body, audio_url, section_number)
             VALUES ($1, $2, $3::int, $4, $5, $6, $3::smallint)
             ON CONFLICT (id) DO UPDATE
             SET test_id = EXCLUDED.test_id, "order" = EXCLUDED."order",
                 title = EXCLUDED.title, body = EXCLUDED.body,
                 audio_url = EXCLUDED.audio_url, section_number = EXCLUDED.section_number`,
            [passageId, testId, order,
             stripHtml(part.raw.title) || `Section ${order}`,
             stripHtml(part.raw.transcription || part.raw.content || part.raw.instruction || ''),
             audioUrl]
        );
        stats.passages++;

        const qs = (questionsByPart.get(part.id) || []).filter(q => mapQuestionType(q.raw?.type));
        await pool.query(`DELETE FROM ielts_questions WHERE passage_id = $1`, [passageId]);
        let qOrder = 0;
        for (const q of qs) {
            const mappedType = mapQuestionType(q.raw.type);
            const promptText = stripHtml(q.raw.title) || stripHtml(q.raw.gap_fill_in_blank);
            if (!promptText) continue;
            const options = parseOptions(q.raw.options) || [];
            if ((mappedType === 'mc_single' || mappedType === 'mc_multi') && options.length < 2) continue;
            qOrder++;
            const qId = uuidFromInt('11lsqq', q.id);
            const correct = parseCorrect(q.raw.correct_answer ?? q.raw.correct_answers ?? q.raw.correct);
            try {
                await pool.query(
                    `INSERT INTO ielts_questions
                        (id, passage_id, "order", type, prompt, payload, correct, alternatives, config)
                     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,'{}'::jsonb)
                     ON CONFLICT (id) DO UPDATE
                     SET "order" = EXCLUDED."order", prompt = EXCLUDED.prompt,
                         payload = EXCLUDED.payload, correct = EXCLUDED.correct, type = EXCLUDED.type`,
                    [qId, passageId, qOrder, mappedType,
                     promptText,
                     JSON.stringify({ options, originalType: q.raw.type }),
                     JSON.stringify(correct)]
                );
                stats.questions++;
            } catch (e) { /* skip */ }
        }
    }
    stats.listening++;
    return true;
}

async function importWriting(quiz, writingQuestions) {
    if (!writingQuestions.length) return false;

    const testId = uuidFromInt('22wrtg', quiz.id);
    await upsertTest(testId, {
        skill: 'writing',
        title: stripHtml(quiz.raw?.title) || `Writing Test ${quiz.id}`,
        source: 'youpass.vn',
        durationSec: 20 * 60
    });

    for (const q of writingQuestions) {
        const taskType = Number(q.raw.writing_task_type || quiz.raw?.writing_task_type || 1);
        const promptId = uuidFromInt('22wrtq', q.id);
        const youpassId = `q${q.id}`; // unique per question, not per quiz
        const imageUrl = q.raw.writing_graph_image ? ASSET_BASE + q.raw.writing_graph_image : null;
        try {
            await pool.query(
                `INSERT INTO ielts_writing_prompts
                    (id, test_id, task_type, instruction, prompt_text, graph_image_url, graph_type,
                     min_words, max_words, time_limit_sec, sample_answers, metadata, youpass_quiz_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
                 ON CONFLICT (id) DO UPDATE
                 SET prompt_text = EXCLUDED.prompt_text, graph_image_url = EXCLUDED.graph_image_url,
                     graph_type = EXCLUDED.graph_type, instruction = EXCLUDED.instruction,
                     min_words = EXCLUDED.min_words, max_words = EXCLUDED.max_words,
                     sample_answers = EXCLUDED.sample_answers,
                     updated_at = now()`,
                [promptId, testId, taskType,
                 stripHtml(q.raw.description || q.raw.instruction) || (taskType === 1 ? 'Write at least 150 words.' : 'Write at least 250 words.'),
                 decodeKeepBreaks(q.raw.content_writing || q.raw.title) || 'Writing prompt',
                 imageUrl,
                 q.raw.writing_graph_type ? `type-${q.raw.writing_graph_type}` : null,
                 taskType === 1 ? 150 : 250,
                 q.raw.max_words || null,
                 (taskType === 1 ? 20 : 40) * 60,
                 JSON.stringify(q.raw.sample_answers ? [decodeKeepBreaks(q.raw.sample_answers)] : []),
                 JSON.stringify({ description: stripHtml(q.raw.writing_graph_description) }),
                 String(youpassId)]
            );
            stats.questions++;
        } catch (e) { console.log(`    ! writing q=${q.id} ${e.message.slice(0,80)}`); }
    }
    stats.writing++;
    return true;
}

async function importSpeaking(quiz, speakingQuestions) {
    if (!speakingQuestions.length) return false;

    const testId = uuidFromInt('33spkg', quiz.id);
    await upsertTest(testId, {
        skill: 'speaking',
        title: stripHtml(quiz.raw?.title) || `Speaking Test ${quiz.id}`,
        source: 'youpass.vn',
        durationSec: 12 * 60
    });

    const partType = Number(quiz.raw?.speaking_part_type || 1);
    const partId = uuidFromInt('33spkp', quiz.id);
    const prompts = speakingQuestions.map(q => ({
        id: q.id,
        text: stripHtml(q.raw.title) || '',
        followUps: []
    }));

    try {
        await pool.query(
            `INSERT INTO ielts_speaking_parts
                (id, test_id, part_number, title, instruction, prompts, cue_card_text,
                 prep_time_sec, talk_time_sec, sample_answers, metadata, youpass_quiz_id)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb,$12)
             ON CONFLICT (id) DO UPDATE
             SET prompts = EXCLUDED.prompts, title = EXCLUDED.title,
                 part_number = EXCLUDED.part_number, updated_at = now()`,
            [partId, testId, Math.max(1, Math.min(3, partType)),
             stripHtml(quiz.raw?.title) || `Speaking Part ${partType}`,
             stripHtml(quiz.raw?.short_description || quiz.raw?.description) || null,
             JSON.stringify(prompts),
             partType === 2 ? stripHtml(speakingQuestions[0]?.raw?.title) : null,
             partType === 2 ? 60 : 0,
             partType === 2 ? 120 : 0,
             '[]', '{}', String(quiz.id)]
        );
        stats.speaking++;
        stats.questions += prompts.length;
    } catch (e) { console.log(`    ! speaking quiz=${quiz.id} ${e.message.slice(0,80)}`); }
    return true;
}

// ── Main ─────────────────────────────────────────────────────────
console.log('Loading staging…');
const allQuizzes = (await pool.query(`SELECT id, type, quiz_type, raw FROM youpass_quizzes`)).rows;
const allParts = (await pool.query(`SELECT id, quiz_id, raw FROM youpass_parts`)).rows;
const allQuestions = (await pool.query(`SELECT id, part_id, quiz_id, raw FROM youpass_questions`)).rows;
console.log(`  ${allQuizzes.length} quizzes, ${allParts.length} parts, ${allQuestions.length} questions`);

const partsByQuiz = new Map();
for (const p of allParts) {
    if (!partsByQuiz.has(p.quiz_id)) partsByQuiz.set(p.quiz_id, []);
    partsByQuiz.get(p.quiz_id).push(p);
}
const questionsByPart = new Map();
const questionsByQuiz = new Map();
for (const q of allQuestions) {
    if (q.part_id) {
        if (!questionsByPart.has(q.part_id)) questionsByPart.set(q.part_id, []);
        questionsByPart.get(q.part_id).push(q);
    }
    if (q.quiz_id) {
        if (!questionsByQuiz.has(q.quiz_id)) questionsByQuiz.set(q.quiz_id, []);
        questionsByQuiz.get(q.quiz_id).push(q);
    }
}

console.log('\nImporting…');
let processed = 0;
for (const quiz of allQuizzes) {
    processed++;
    if (processed % 500 === 0) console.log(`  …${processed}/${allQuizzes.length}  R=${stats.reading} L=${stats.listening} W=${stats.writing} S=${stats.speaking}`);

    const parts = partsByQuiz.get(quiz.id) || [];
    const questions = questionsByQuiz.get(quiz.id) || [];
    const writingQs = questions.filter(q => q.raw?.type === 'writing');
    const speakingQs = questions.filter(q => q.raw?.type === 'speaking');
    const hasAudio = parts.some(p => p.raw?.file_id);
    const hasReading = parts.some(p => stripHtml(p.raw?.content || p.raw?.passage || '').length > 200);

    let imported = false;
    if (writingQs.length) imported = await importWriting(quiz, writingQs) || imported;
    if (speakingQs.length) imported = await importSpeaking(quiz, speakingQs) || imported;
    if (hasAudio) imported = await importListening(quiz, parts, questionsByPart) || imported;
    else if (hasReading) imported = await importReading(quiz, parts, questionsByPart) || imported;

    if (!imported) stats.skipped++;
}

console.log('\n═══ FINAL ═══');
console.log(stats);

await pool.end();
