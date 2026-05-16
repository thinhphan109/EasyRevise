// lib/exam-normalizer.js — Normalize AI/import/admin exam schemas into one stable shape

const VALID_SECTION_TYPES = new Set(['multiple-choice', 'reading', 'fill-in-blank', 'free-form', 'writing-essay']);
const VALID_BLANK_TYPES = new Set(['text', 'int', 'float', 'fraction', 'dropdown']);

function makeId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null || value === '') return [];
    return [value];
}

function compactStrings(items) {
    return asArray(items)
        .map(x => typeof x === 'string' ? x.trim() : x)
        .filter(x => typeof x === 'string' ? x.length > 0 : !!x);
}

function stripOptionPrefix(text) {
    return String(text ?? '').replace(/^\s*[A-Da-d][\.)\-:]\s+/, '').trim();
}

function normalizeSectionType(type) {
    if (type === 'writing-choice') return 'multiple-choice';
    return VALID_SECTION_TYPES.has(type) ? type : 'multiple-choice';
}

function normalizeCorrectAnswer(value, options = []) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(0, Math.min(Math.max(options.length - 1, 3), Math.trunc(value)));
    }
    const raw = String(value ?? '').trim();
    if (/^[0-3]$/.test(raw)) return Number(raw);
    const letter = raw.match(/^[A-Da-d]/)?.[0]?.toUpperCase();
    if (letter) return letter.charCodeAt(0) - 65;
    const byText = options.findIndex(opt => stripOptionPrefix(opt).toLowerCase() === stripOptionPrefix(raw).toLowerCase());
    return byText >= 0 ? byText : 0;
}

function normalizeImages(target) {
    const images = [];
    for (const src of asArray(target.images)) {
        if (typeof src === 'string' && src.trim() && !images.includes(src.trim())) images.push(src.trim());
    }
    for (const key of ['image', 'imageUrl']) {
        const src = target[key];
        if (typeof src === 'string' && src.trim() && !images.includes(src.trim())) images.push(src.trim());
    }
    target.images = images;
    target.image = images[0] || target.image || null; // legacy compatibility
    return target;
}

function normalizeOptionImages(value) {
    const arr = Array.isArray(value) ? value.slice(0, 4) : [];
    while (arr.length < 4) arr.push(null);
    return arr.map(x => (typeof x === 'string' && x.trim()) ? x.trim() : null);
}

function countBlankMarkers(text) {
    return (String(text || '').match(/_{3,}/g) || []).length;
}

function normalizeFillBlanks(question) {
    const blanks = asArray(question.blanks).map((blank, i) => {
        const type = VALID_BLANK_TYPES.has(blank?.type) ? blank.type : 'text';
        const normalized = {
            index: Number.isFinite(Number(blank?.index)) ? Number(blank.index) : i,
            answer: String(blank?.answer ?? '').trim(),
            type,
            alternatives: compactStrings(blank?.alternatives),
            caseSensitive: !!blank?.caseSensitive
        };
        if (type === 'dropdown') normalized.dropdownOptions = compactStrings(blank?.dropdownOptions);
        if (type === 'float' || type === 'fraction') {
            const tol = Number(blank?.tolerance);
            normalized.tolerance = Number.isFinite(tol) && tol >= 0 ? tol : (type === 'fraction' ? 0.001 : 0.01);
        }
        return normalized;
    });

    const markerCount = countBlankMarkers(question.question);
    while (markerCount > blanks.length) {
        blanks.push({ index: blanks.length, answer: '', type: 'text', alternatives: [], caseSensitive: false });
    }
    question.blanks = blanks.map((b, i) => ({ ...b, index: i }));
    if (markerCount !== blanks.length) {
        question._schemaWarnings = [...(question._schemaWarnings || []), `Số chỗ trống ___ (${markerCount}) không khớp số đáp án (${blanks.length}).`];
    }
    return question;
}

function normalizeTable(table) {
    if (!table) return null;
    if (Array.isArray(table)) return { headers: [], rows: table };
    if (typeof table === 'object') {
        return {
            headers: asArray(table.headers).map(x => String(x ?? '')),
            rows: asArray(table.rows).map(row => asArray(row).map(cell => String(cell ?? '')))
        };
    }
    return null;
}

function normalizeSubParts(subParts) {
    return asArray(subParts).map((p, i) => {
        const part = normalizeImages({ ...p });
        part.label = part.label || String.fromCharCode(97 + i);
        part.question = part.question || part.prompt || part.title || '';
        part.sampleAnswer = part.sampleAnswer || part.answer || part.expectedAnswer || '';
        part.table = normalizeTable(part.table);
        return part;
    });
}

function normalizeQuestion(question = {}, sectionType = 'multiple-choice') {
    const q = normalizeImages({ ...question });
    q.id = q.id || makeId('q');
    q.question = q.question || q.prompt || q.title || '';
    q.explanation = q.explanation || '';
    q.expansion = q.expansion || '';
    q.optionImages = normalizeOptionImages(q.optionImages);
    q.explanationImages = compactStrings(q.explanationImages);
    q.table = normalizeTable(q.table);

    if (sectionType === 'multiple-choice' || sectionType === 'reading') {
        q.options = asArray(q.options).map(stripOptionPrefix).filter(Boolean);
        if (q.options.length === 0) q.options = ['', '', '', ''];
        while (q.options.length < 4) q.options.push('');
        q.correctAnswer = normalizeCorrectAnswer(q.correctAnswer, q.options);
    } else {
        delete q.correctAnswer;
        if (sectionType !== 'fill-in-blank') delete q.options;
    }

    if (sectionType === 'fill-in-blank') {
        q.type = 'fill-in-blank';
        normalizeFillBlanks(q);
    }

    if (sectionType === 'free-form') {
        q.type = 'free-form';
        q.answer = q.answer || q.sampleAnswer || q.expectedAnswer || '';
        q.sampleAnswer = q.sampleAnswer || q.answer || q.expectedAnswer || '';
        q.subParts = normalizeSubParts(q.subParts);
        if (!q.subParts.length && Array.isArray(question.questions)) {
            q.subParts = normalizeSubParts(question.questions);
        }
    }

    return q;
}

function normalizeSection(section = {}) {
    const s = { ...section };
    s.id = s.id || makeId('sec');
    s.type = normalizeSectionType(s.type);
    s.title = s.title || s.name || 'Phần mới';
    s.instruction = s.instruction || '';
    s.questions = asArray(s.questions);

    if (s.type === 'writing-essay') {
        s.prompt = s.prompt || s.question || s.instruction || '';
        s.context = s.context || '';
        s.cues = compactStrings(s.cues);
        s.sampleAnswer = s.sampleAnswer || s.sampleEssay || s.expectedAnswer || '';
        s.rubric = s.rubric || s.explanation || '';
        s.questions = [];
        return s;
    }

    if (s.type === 'free-form') {
        if (!s.questions.length && Array.isArray(s.subParts) && s.subParts.length) {
            s.questions = [{ id: makeId('q'), question: s.prompt || s.title || 'Câu tự luận', subParts: s.subParts, sampleAnswer: s.sampleAnswer || '' }];
        }
        s.questions = s.questions.map(q => normalizeQuestion(q, 'free-form'));
        return s;
    }

    s.questions = s.questions.map(q => normalizeQuestion(q, s.type));
    return s;
}

function normalizeExam(exam = {}) {
    const normalized = { ...exam };
    normalized.sections = asArray(exam.sections).map(normalizeSection);
    return normalized;
}

module.exports = {
    normalizeExam,
    normalizeSection,
    normalizeQuestion,
    normalizeImages,
    normalizeCorrectAnswer,
    normalizeFillBlanks,
    normalizeSectionType,
    countBlankMarkers
};
