// EasyRevise — Fill-blank match helper (mirrors server logic in lib/exam-normalizer.js)
// Supports: text, int, float, fraction, dropdown, alternatives, caseSensitive.

export function checkBlankMatch(given, expected, type, blank) {
    given = (given || '').trim();
    expected = (expected || '').trim();
    if (!given) return false;
    const tolerance = (blank && blank.tolerance) || undefined;
    if (type === 'int') return parseInt(given) === parseInt(expected);
    if (type === 'float') return Math.abs(parseFloat(given) - parseFloat(expected)) <= (tolerance || 0.01);
    if (type === 'fraction') {
        const evalFrac = (s) => {
            const p = String(s).split('/');
            return p.length === 2 ? parseFloat(p[0]) / parseFloat(p[1]) : parseFloat(s);
        };
        const gv = evalFrac(given), ev = evalFrac(expected);
        if (isNaN(gv) || isNaN(ev)) return false;
        return Math.abs(gv - ev) <= (tolerance || 0.001);
    }
    // text / dropdown: check main answer + alternatives
    const caseSensitive = blank && blank.caseSensitive;
    const normalize = (s) => caseSensitive ? s.trim() : s.trim().toLowerCase();
    const allCorrect = [expected, ...(blank && blank.alternatives ? blank.alternatives : [])].filter(a => a);
    return allCorrect.some(ans => normalize(given) === normalize(ans));
}
