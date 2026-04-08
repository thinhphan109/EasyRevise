// lib/validate.js — Input validation for all routes

const VALID_SECTION_TYPES = [
    'multiple-choice', 'reading', 'writing-choice',
    'writing-essay', 'free-form', 'fill-in-blank'
];

const VALID_BLANK_TYPES = ['text', 'int', 'float', 'fraction', 'dropdown'];

/**
 * Validate exam fields
 * @returns {string|null} error message or null if valid
 */
function validateExam(body) {
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
        return 'Tên đề thi không được để trống';
    }
    if (body.title.length > 500) {
        return 'Tên đề thi quá dài (tối đa 500 ký tự)';
    }
    if (body.timeLimit !== undefined && body.timeLimit !== null) {
        const tl = Number(body.timeLimit);
        if (isNaN(tl) || tl < 0) return 'Thời gian phải là số không âm';
    }
    return null;
}

/**
 * Validate section fields
 * @returns {string|null} error message or null if valid
 */
function validateSection(body) {
    if (!body.type || !VALID_SECTION_TYPES.includes(body.type)) {
        return `Loại section không hợp lệ: "${body.type}". Chấp nhận: ${VALID_SECTION_TYPES.join(', ')}`;
    }
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
        return 'Tên phần (section) không được để trống';
    }
    return null;
}

/**
 * Validate question fields based on section type
 * @param {object} body - question data
 * @param {string} sectionType - parent section type
 * @returns {string|null} error message or null if valid
 */
function validateQuestion(body, sectionType) {
    // MC / reading / writing-choice
    if (['multiple-choice', 'reading', 'writing-choice'].includes(sectionType)) {
        if (body.correctAnswer !== undefined) {
            const ca = Number(body.correctAnswer);
            if (isNaN(ca) || ca < 0 || ca > 3) {
                return `correctAnswer phải từ 0-3 (A-D), nhận: ${body.correctAnswer}`;
            }
        }
        if (body.options && (!Array.isArray(body.options) || body.options.length < 2)) {
            return 'options phải là mảng có ít nhất 2 phần tử';
        }
    }

    // Fill-in-blank
    if (sectionType === 'fill-in-blank' && body.blanks) {
        if (!Array.isArray(body.blanks)) {
            return 'blanks phải là mảng';
        }
        for (let i = 0; i < body.blanks.length; i++) {
            const blank = body.blanks[i];
            if (blank.type && !VALID_BLANK_TYPES.includes(blank.type)) {
                return `blanks[${i}].type không hợp lệ: "${blank.type}". Chấp nhận: ${VALID_BLANK_TYPES.join(', ')}`;
            }
            if (blank.answer === undefined || blank.answer === null || String(blank.answer).trim() === '') {
                return `blanks[${i}].answer không được để trống`;
            }
            if (blank.type === 'dropdown') {
                if (!Array.isArray(blank.dropdownOptions) || blank.dropdownOptions.length < 2) {
                    return `blanks[${i}] type=dropdown phải có dropdownOptions (≥2 phần tử)`;
                }
            }
            if ((blank.type === 'float' || blank.type === 'fraction') && blank.tolerance !== undefined) {
                if (typeof blank.tolerance !== 'number' || blank.tolerance < 0) {
                    return `blanks[${i}].tolerance phải là số dương`;
                }
            }
            if (blank.alternatives !== undefined && !Array.isArray(blank.alternatives)) {
                return `blanks[${i}].alternatives phải là mảng`;
            }
            if (blank.caseSensitive !== undefined && typeof blank.caseSensitive !== 'boolean') {
                return `blanks[${i}].caseSensitive phải là boolean`;
            }
        }
    }

    return null;
}

/**
 * Validate URL (reject XSS vectors)
 * @returns {string|null} error message or null if valid
 */
function validateURL(url) {
    if (!url || typeof url !== 'string') return null; // empty is OK
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith('javascript:')) return 'URL chứa javascript: không được phép';
    if (trimmed.startsWith('data:')) return 'URL chứa data: không được phép';
    if (trimmed.startsWith('vbscript:')) return 'URL chứa vbscript: không được phép';
    // Allow relative URLs (e.g. /uploads/...) and https:// URLs
    if (trimmed.startsWith('http://') && !trimmed.startsWith('http://localhost')) {
        return 'URL phải dùng https:// (không chấp nhận http://)';
    }
    return null;
}

/**
 * Validate access code string
 * @returns {string|null} error message or null if valid
 */
function validateCode(code) {
    if (!code || typeof code !== 'string') return 'Mã kích hoạt không hợp lệ';
    if (code.length > 10) return 'Mã kích hoạt quá dài (tối đa 10 ký tự)';
    if (!/^[A-Za-z0-9]+$/.test(code)) return 'Mã chỉ chấp nhận chữ cái và số';
    return null;
}

module.exports = {
    validateExam, validateSection, validateQuestion, validateURL, validateCode,
    VALID_SECTION_TYPES, VALID_BLANK_TYPES
};
