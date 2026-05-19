// lib/utils/decode-entities.js
// Robust HTML-entity decoder for crawl-imported text.
// Handles double-encoded entities (e.g. "&amp;agrave;" → "à") and tag stripping.
const he = require('he');

const SAFE_TAGS_RE = /<\/?(b|i|em|strong|u|sub|sup|br)(\s[^>]*)?>/gi;

function decodeText(input) {
    if (input == null) return input;
    let s = String(input);
    // Decode entities up to 3 times (double-encoded crawl payloads)
    for (let i = 0; i < 3; i++) {
        const next = he.decode(s);
        if (next === s) break;
        s = next;
    }
    return s;
}

function stripUnsafeHtml(input) {
    if (input == null) return input;
    const decoded = decodeText(input);
    // Remove all tags except a safe subset, keep whitespace as-is
    return decoded.replace(/<[^>]+>/g, (tag) => {
        return SAFE_TAGS_RE.test(tag) ? tag : '';
    }).trim();
}

/** Recursively decode all string fields in an object. Mutates in place for speed. */
function decodeDeep(obj, opts = {}) {
    if (obj == null) return obj;
    const strip = !!opts.strip;
    if (typeof obj === 'string') {
        return strip ? stripUnsafeHtml(obj) : decodeText(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map((v) => decodeDeep(v, opts));
    }
    if (typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            out[k] = decodeDeep(v, opts);
        }
        return out;
    }
    return obj;
}

module.exports = { decodeText, stripUnsafeHtml, decodeDeep };
