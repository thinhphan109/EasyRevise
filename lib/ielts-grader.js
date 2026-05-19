// lib/ielts-grader.js — pure grading logic for IELTS submissions
'use strict';

function normaliseText(s) {
    return String(s ?? '').trim().toLowerCase()
        .replace(/[\u201c\u201d"]/g, '"')
        .replace(/[\u2018\u2019']/g, "'")
        .replace(/\s+/g, ' ');
}

function checkTfng(given, correct) {
    if (!given) return false;
    return normaliseText(given) === normaliseText(correct);
}

function checkMcSingle(given, correct) {
    if (given === undefined || given === null || given === '') return false;
    return Number(given) === Number(correct);
}

function checkMcMulti(given, correct) {
    if (!Array.isArray(given) || !Array.isArray(correct)) return false;
    if (given.length !== correct.length) return false;
    const a = given.map(Number).sort();
    const b = correct.map(Number).sort();
    return a.every((v, i) => v === b[i]);
}

function checkText(given, correct, alternatives = [], maxWords) {
    if (!given) return false;
    const norm = normaliseText(given);
    if (!norm) return false;
    if (maxWords && norm.split(/\s+/).length > maxWords) return false;
    const all = [correct, ...alternatives].map(normaliseText);
    return all.includes(norm);
}

function checkMatchingObject(given, correct) {
    if (!given || typeof given !== 'object') return { allCorrect: false, perKey: {} };
    const perKey = {};
    let count = 0;
    for (const [key, expected] of Object.entries(correct || {})) {
        const ok = normaliseText(given[key]) === normaliseText(expected);
        perKey[key] = ok;
        if (ok) count++;
    }
    return { perKey, count, total: Object.keys(correct || {}).length };
}

/** Grade one question.
 *  Returns { isCorrect: bool, partial: 0..1 (for matching), notes? }   */
function gradeQuestion(question, given) {
    const { type, correct, alternatives = [], payload = {} } = question;
    switch (type) {
        case 'tfng':
        case 'ynng':
            return { isCorrect: checkTfng(given, correct), points: checkTfng(given, correct) ? 1 : 0 };

        case 'mc_single':
            return { isCorrect: checkMcSingle(given, correct), points: checkMcSingle(given, correct) ? 1 : 0 };

        case 'mc_multi': {
            const ok = checkMcMulti(given, correct);
            return { isCorrect: ok, points: ok ? 1 : 0 };
        }

        case 'sentence_completion':
        case 'short_answer':
        case 'note_completion': {
            const ok = checkText(given, correct, alternatives, payload.maxWords);
            return { isCorrect: ok, points: ok ? 1 : 0 };
        }

        case 'matching_headings':
        case 'matching_information':
        case 'matching_features':
        case 'sentence_endings': {
            const r = checkMatchingObject(given, correct);
            return {
                isCorrect: r.count === r.total,
                points: r.count,           // each pairing scores 1 point
                perKey: r.perKey,
                expected: correct
            };
        }

        case 'summary_completion':
        case 'diagram_labelling': {
            // Treat payload like { blanks: [{ key, answer, alternatives, maxWords }] }
            const blanks = payload.blanks || [];
            if (!Array.isArray(blanks) || !blanks.length) {
                return { isCorrect: false, points: 0 };
            }
            const perKey = {};
            let count = 0;
            for (const b of blanks) {
                const userVal = (given && typeof given === 'object') ? given[b.key] : null;
                const ok = checkText(userVal, b.answer, b.alternatives || [], b.maxWords);
                perKey[b.key] = ok;
                if (ok) count++;
            }
            return {
                isCorrect: count === blanks.length,
                points: count, perKey, expected: blanks
            };
        }

        default:
            return { isCorrect: false, points: 0 };
    }
}

/** Grade a whole submission.
 *  test = full test object with passages[].questions[] (must include `correct`)
 *  answers = map keyed by question id
 *
 *  Returns:
 *  {
 *      raw: integer total points (matching counts each pairing),
 *      total: max possible points,
 *      perQuestion: [{ id, isCorrect, points, max, given, expected }]
 *  }
 */
function gradeSubmission(test, answers) {
    const flat = [];
    for (const p of (test.passages || [])) {
        for (const q of (p.questions || [])) flat.push(q);
    }

    let raw = 0;
    let total = 0;
    const perQuestion = [];

    for (const q of flat) {
        const given = answers ? answers[q.id] : undefined;
        const result = gradeQuestion(q, given);
        let max = 1;
        if (['matching_headings', 'matching_information', 'matching_features',
             'sentence_endings'].includes(q.type)) {
            max = Object.keys(q.correct || {}).length || 1;
        } else if (['summary_completion', 'diagram_labelling'].includes(q.type)) {
            max = (q.payload?.blanks || []).length || 1;
        }
        total += max;
        raw += Math.min(result.points || 0, max);
        perQuestion.push({
            id: q.id,
            order: q.order,
            type: q.type,
            isCorrect: !!result.isCorrect,
            points: result.points || 0,
            max,
            given: given ?? null,
            expected: q.correct,
            perKey: result.perKey || null
        });
    }

    return { raw, total, perQuestion };
}

module.exports = { gradeQuestion, gradeSubmission, normaliseText };
