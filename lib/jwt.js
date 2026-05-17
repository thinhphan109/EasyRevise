// lib/jwt.js — JWT sign/verify wrapper
// H1: Replace opaque base64 tokens with HMAC-signed JWT
//     - Verifiable offline (không cần read users.json mỗi request)
//     - Có exp claim built-in
//     - Có jti (token ID) để revoke individual tokens nếu cần
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Secret rotates if not set in env. Production MUST set JWT_SECRET.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    const s = crypto.randomBytes(32).toString('hex');
    console.warn('[JWT] No JWT_SECRET in env. Generated random secret (all tokens invalidate on restart): ' + s.slice(0, 8) + '...');
    return s;
})();

const TTL_DAYS = parseInt(process.env.JWT_TTL_DAYS || '7', 10);

/**
 * Sign a JWT for a given user.
 * @param {object} payload - must include { id, role }; can include username, displayName.
 * @returns {{ token: string, tokenExpiry: number }}
 */
function sign(payload) {
    if (!payload || !payload.id) throw new Error('JWT payload must include id');
    const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;
    const tokenExpiry = Date.now() + ttlMs;
    const jti = crypto.randomBytes(8).toString('hex');
    const token = jwt.sign(
        { sub: payload.id, role: payload.role, jti },
        JWT_SECRET,
        { expiresIn: `${TTL_DAYS}d` }
    );
    return { token, tokenExpiry, jti };
}

/**
 * Verify a JWT. Returns the decoded payload or null on invalid/expired.
 * @param {string} token
 * @returns {object|null}
 */
function verify(token) {
    if (!token) return null;
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (e) {
        return null;
    }
}

/**
 * Detect whether a token is a JWT (3 dot-separated base64url segments) or legacy opaque base64.
 */
function isJwt(token) {
    if (typeof token !== 'string') return false;
    const parts = token.split('.');
    return parts.length === 3 && parts.every(p => /^[A-Za-z0-9_-]+$/.test(p));
}

module.exports = { sign, verify, isJwt, TTL_DAYS };
