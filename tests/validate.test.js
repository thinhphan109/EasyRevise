// tests/validate.test.js — Test lib/validate.js
const { validateExam, validateSection, validateQuestion, validateURL, validateCode, VALID_SECTION_TYPES, VALID_BLANK_TYPES } = require('../lib/validate');

describe('validateExam', () => {
    test('valid exam passes', () => {
        expect(validateExam({ title: 'Đề kiểm tra Toán' })).toBeNull();
    });

    test('empty title returns error', () => {
        expect(validateExam({ title: '' })).toBe('Tên đề thi không được để trống');
    });

    test('missing title returns error', () => {
        expect(validateExam({})).toBe('Tên đề thi không được để trống');
    });

    test('title too long returns error', () => {
        expect(validateExam({ title: 'x'.repeat(501) })).toBe('Tên đề thi quá dài (tối đa 500 ký tự)');
    });

    test('negative timeLimit returns error', () => {
        expect(validateExam({ title: 'Test', timeLimit: -5 })).toBe('Thời gian phải là số không âm');
    });
});

describe('validateSection', () => {
    test('valid section passes', () => {
        expect(validateSection({ type: 'multiple-choice', title: 'Phần 1' })).toBeNull();
    });

    test('all valid types pass', () => {
        VALID_SECTION_TYPES.forEach(type => {
            expect(validateSection({ type, title: 'Test' })).toBeNull();
        });
    });

    test('invalid type returns error', () => {
        const err = validateSection({ type: 'invalid', title: 'Test' });
        expect(err).toContain('Loại section không hợp lệ');
        expect(err).toContain('invalid');
    });

    test('empty title returns error', () => {
        expect(validateSection({ type: 'multiple-choice', title: '' })).toBe('Tên phần (section) không được để trống');
    });
});

describe('validateQuestion', () => {
    test('valid MC question passes', () => {
        expect(validateQuestion({ correctAnswer: 2, options: ['A', 'B', 'C', 'D'] }, 'multiple-choice')).toBeNull();
    });

    test('MC correctAnswer out of range returns error', () => {
        const err = validateQuestion({ correctAnswer: 5 }, 'multiple-choice');
        expect(err).toContain('correctAnswer phải từ 0-3');
    });

    test('MC negative correctAnswer returns error', () => {
        expect(validateQuestion({ correctAnswer: -1 }, 'multiple-choice')).toContain('correctAnswer phải từ 0-3');
    });

    test('fill-blank valid passes', () => {
        expect(validateQuestion({
            blanks: [{ index: 0, answer: 'hello', type: 'text' }]
        }, 'fill-in-blank')).toBeNull();
    });

    test('fill-blank invalid type returns error', () => {
        const err = validateQuestion({
            blanks: [{ index: 0, answer: 'test', type: 'xyz' }]
        }, 'fill-in-blank');
        expect(err).toContain('type không hợp lệ');
    });

    test('fill-blank empty answer is allowed (drafts)', () => {
        // Implementation explicitly allows empty answer during draft creation;
        // grading layer handles missing answers separately.
        const err = validateQuestion({
            blanks: [{ index: 0, answer: '', type: 'text' }]
        }, 'fill-in-blank');
        expect(err).toBeNull();
    });

    test('fill-blank dropdown without options returns error', () => {
        const err = validateQuestion({
            blanks: [{ index: 0, answer: 'a', type: 'dropdown' }]
        }, 'fill-in-blank');
        expect(err).toContain('dropdownOptions');
    });

    test('fill-blank dropdown with options passes', () => {
        expect(validateQuestion({
            blanks: [{ index: 0, answer: 'a', type: 'dropdown', dropdownOptions: ['a', 'b', 'c'] }]
        }, 'fill-in-blank')).toBeNull();
    });

    test('essay question passes (no special validation)', () => {
        expect(validateQuestion({}, 'writing-essay')).toBeNull();
    });
});

describe('validateURL', () => {
    test('https URL passes', () => {
        expect(validateURL('https://example.com')).toBeNull();
    });

    test('empty URL passes', () => {
        expect(validateURL('')).toBeNull();
    });

    test('null URL passes', () => {
        expect(validateURL(null)).toBeNull();
    });

    test('relative URL passes', () => {
        expect(validateURL('/uploads/image.jpg')).toBeNull();
    });

    test('javascript: URL blocked', () => {
        expect(validateURL('javascript:alert(1)')).toContain('javascript:');
    });

    test('data: URL blocked', () => {
        expect(validateURL('data:text/html,<script>alert(1)</script>')).toContain('data:');
    });

    test('vbscript: URL blocked', () => {
        expect(validateURL('vbscript:msgbox')).toContain('vbscript:');
    });

    test('http:// non-localhost blocked', () => {
        expect(validateURL('http://example.com')).toContain('https://');
    });

    test('http://localhost allowed', () => {
        expect(validateURL('http://localhost:3000')).toBeNull();
    });
});

describe('validateCode', () => {
    test('valid code passes', () => {
        expect(validateCode('ABC123')).toBeNull();
    });

    test('empty code returns error', () => {
        expect(validateCode('')).toBe('Mã kích hoạt không hợp lệ');
    });

    test('too long code returns error', () => {
        expect(validateCode('ABCDEFGHIJK')).toBe('Mã kích hoạt quá dài (tối đa 10 ký tự)');
    });

    test('special chars rejected', () => {
        expect(validateCode('ABC!@#')).toContain('chữ cái và số');
    });
});
