// lib/signed-url.js — HMAC-signed URL helpers for sensitive uploads
// C9: ngăn IDOR + URL leak — mọi access tới /uploads/submissions/* phải có ?sig= và ?exp= hợp lệ
const crypto = require('crypto');

// Secret rotates if not set in env. In production set SIGN_SECRET.
const SIGN_SECRET = process.env.SIGN_SECRET || (() => {
    const s = crypto.randomBytes(32).toString('hex');
    console.warn('[SIGN] No SIGN_SECRET in env. Generated random secret (signed URLs will invalidate on restart): ' + s.slice(0, 8) + '...');
    return s;
})();

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Build query string `?sig=...&exp=...` for a given filename.
 * Filename should be JUST the basename (e.g. "sub_123_abc.jpg"), no directory.
 */
function signFilename(filename, ttlMs = DEFAULT_TTL_MS) {
    const exp = Date.now() + ttlMs;
    const payload = `${filename}|${exp}`;
    const sig = crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex').slice(0, 32);
    return `?sig=${sig}&exp=${exp}`;
}

/**
 * Verify a signed request.
 */
function verifySignature(filename, sig, exp) {
    if (!sig || !exp || !filename) return false;
    const expNum = Number(exp);
    if (!Number.isFinite(expNum) || Date.now() > expNum) return false;
    const payload = `${filename}|${expNum}`;
    const expected = crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex').slice(0, 32);
    if (sig.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
        return false;
    }
}

/**
 * Wrap a submission URL (e.g. "/uploads/submissions/sub_x.jpg") with signed query.
 * Returns the URL unchanged if it's not a submission URL (idempotent).
 * Strips any pre-existing query first.
 */
function signSubmissionUrl(url, ttlMs = DEFAULT_TTL_MS) {
    if (!url || typeof url !== 'string') return url;
    const cleanUrl = url.split('?')[0];
    if (!cleanUrl.startsWith('/uploads/submissions/')) return url;
    const filename = cleanUrl.split('/').pop();
    return cleanUrl + signFilename(filename, ttlMs);
}

/**
 * Strip signed query from URL → return clean path for filesystem access.
 */
function stripSignedQuery(url) {
    if (!url || typeof url !== 'string') return url;
    return url.split('?')[0];
}

/**
 * Recursively walk an object/array and re-sign any string starting with /uploads/submissions/.
 * Returns a deep-cloned new object — does NOT mutate input.
 */
function reSignAttachmentsDeep(obj, ttlMs) {
    if (obj == null) return obj;
    if (typeof obj === 'string') {
        return signSubmissionUrl(obj, ttlMs);
    }
    if (Array.isArray(obj)) {
        return obj.map(v => reSignAttachmentsDeep(v, ttlMs));
    }
    if (typeof obj === 'object') {
        const out = {};
        for (const k of Object.keys(obj)) out[k] = reSignAttachmentsDeep(obj[k], ttlMs);
        return out;
    }
    return obj;
}

module.exports = { signFilename, verifySignature, signSubmissionUrl, stripSignedQuery, reSignAttachmentsDeep };
