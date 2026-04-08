// tests/grading.test.js — Test fill-in-blank grading logic (mirrors server + client)

// Extracted grading logic from routes/submit.js
function checkBlankMatch(given, expected, type, blank) {
    given = (given || '').trim();
    expected = (expected || '').trim();
    if (!given) return false;
    const tolerance = (blank && blank.tolerance) || undefined;

    if (type === 'int') return parseInt(given) === parseInt(expected);

    if (type === 'float') return Math.abs(parseFloat(given) - parseFloat(expected)) <= (tolerance || 0.01);

    if (type === 'fraction') {
        const evalFrac = (s) => { const p = String(s).split('/'); return p.length === 2 ? parseFloat(p[0]) / parseFloat(p[1]) : parseFloat(s); };
        const gv = evalFrac(given), ev = evalFrac(expected);
        if (isNaN(gv) || isNaN(ev)) return false;
        return Math.abs(gv - ev) <= (tolerance || 0.001);
    }

    // text / dropdown
    const caseSensitive = blank && blank.caseSensitive;
    const normalize = (s) => caseSensitive ? s.trim() : s.trim().toLowerCase();
    const allCorrect = [expected, ...(blank && blank.alternatives ? blank.alternatives : [])].filter(a => a);
    return allCorrect.some(ans => normalize(given) === normalize(ans));
}

describe('Fill-in-blank grading', () => {
    test('text match: exact', () => {
        expect(checkBlankMatch('hello', 'hello', 'text', {})).toBe(true);
    });

    test('text case-insensitive (default)', () => {
        expect(checkBlankMatch('Hello', 'hello', 'text', { caseSensitive: false })).toBe(true);
    });

    test('text case-sensitive: same case passes', () => {
        expect(checkBlankMatch('Hello', 'Hello', 'text', { caseSensitive: true })).toBe(true);
    });

    test('text case-sensitive: different case fails', () => {
        expect(checkBlankMatch('Hello', 'hello', 'text', { caseSensitive: true })).toBe(false);
    });

    test('int match: "42" === 42', () => {
        expect(checkBlankMatch('42', '42', 'int', {})).toBe(true);
    });

    test('int mismatch', () => {
        expect(checkBlankMatch('41', '42', 'int', {})).toBe(false);
    });

    test('float within tolerance', () => {
        expect(checkBlankMatch('3.14', '3.15', 'float', { tolerance: 0.02 })).toBe(true);
    });

    test('float outside tolerance', () => {
        expect(checkBlankMatch('3.14', '3.20', 'float', { tolerance: 0.01 })).toBe(false);
    });

    test('float default tolerance (0.01)', () => {
        expect(checkBlankMatch('3.14', '3.145', 'float', {})).toBe(true);
    });

    test('fraction: "1/3" ≈ 0.333', () => {
        expect(checkBlankMatch('1/3', '0.333', 'fraction', { tolerance: 0.001 })).toBe(true);
    });

    test('fraction: "3/4" === "3/4"', () => {
        expect(checkBlankMatch('3/4', '3/4', 'fraction', {})).toBe(true);
    });

    test('fraction: "2/4" === "1/2"', () => {
        expect(checkBlankMatch('2/4', '1/2', 'fraction', {})).toBe(true);
    });

    test('dropdown: exact match', () => {
        expect(checkBlankMatch('optionB', 'optionB', 'dropdown', {})).toBe(true);
    });

    test('dropdown: case-insensitive', () => {
        expect(checkBlankMatch('OptionB', 'optionb', 'dropdown', { caseSensitive: false })).toBe(true);
    });

    test('alternatives: primary answer matches', () => {
        expect(checkBlankMatch('ans1', 'ans1', 'text', { alternatives: ['ans2', 'ans3'] })).toBe(true);
    });

    test('alternatives: alternative answer matches', () => {
        expect(checkBlankMatch('ans2', 'ans1', 'text', { alternatives: ['ans2', 'ans3'] })).toBe(true);
    });

    test('alternatives: wrong answer does not match', () => {
        expect(checkBlankMatch('ans4', 'ans1', 'text', { alternatives: ['ans2', 'ans3'] })).toBe(false);
    });

    test('empty answer always fails', () => {
        expect(checkBlankMatch('', 'hello', 'text', {})).toBe(false);
    });

    test('whitespace trimmed', () => {
        expect(checkBlankMatch('  hello  ', 'hello', 'text', {})).toBe(true);
    });
});
