// tests/data.test.js — Test lib/data.js core functions
const path = require('path');
const fs = require('fs');

// Create temp data files for testing
const DATA_DIR = path.join(__dirname, '..', 'data');
const TEST_EXAMS_FILE = path.join(DATA_DIR, 'exams-test.json');

describe('lib/data.js', () => {
    const { uuidv4, countQuestions } = require('../lib/data');

    test('uuidv4 generates valid UUID format', () => {
        const id = uuidv4();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('uuidv4 generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => uuidv4()));
        expect(ids.size).toBe(100);
    });

    test('countQuestions returns correct count', () => {
        const exam = {
            sections: [
                { questions: [{ id: 1 }, { id: 2 }] },
                { questions: [{ id: 3 }] },
                { questions: [] }
            ]
        };
        expect(countQuestions(exam)).toBe(3);
    });

    test('countQuestions handles empty sections', () => {
        expect(countQuestions({ sections: [] })).toBe(0);
    });

    test('countQuestions handles missing questions array', () => {
        expect(countQuestions({ sections: [{ title: 'test' }] })).toBe(0);
    });
});

describe('lib/auth.js', () => {
    const { sanitizeCode } = require('../lib/auth');

    test('sanitizeCode uppercases', () => {
        expect(sanitizeCode('abc123')).toBe('ABC123');
    });

    test('sanitizeCode trims spaces', () => {
        expect(sanitizeCode('  ABC  ')).toBe('ABC');
    });

    test('sanitizeCode handles falsy values', () => {
        expect(sanitizeCode('')).toBeNull();
        expect(sanitizeCode(null)).toBeNull();
        expect(sanitizeCode(undefined)).toBeNull();
    });
});
