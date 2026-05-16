// routes/avatar.js — FaceHash avatar endpoint using the ACTUAL facehash library
// Uses react-dom/server renderToStaticMarkup to render the React component
// Then wraps in SVG foreignObject for <img> tag compatibility
const express = require('express');
const router = express.Router();

// ── Lazy-loaded modules (ESM) ──────────────────────────────────────
let _Facehash = null;
let _React = null;
let _renderToStaticMarkup = null;
let _loadPromise = null;

function ensureModules() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = Promise.all([
        import('facehash'),
        import('react'),
        import('react-dom/server')
    ]).then(([fh, react, rds]) => {
        _Facehash = fh.Facehash;
        _React = react.default || react;
        _renderToStaticMarkup = rds.renderToStaticMarkup;
    });
    return _loadPromise;
}

// ── SVG cache ──────────────────────────────────────────────────────
const cache = new Map();
const MAX_CACHE = 500;

// ── Route: GET /api/avatar?name=xxx&size=64&mode=html|img ─────────
router.get('/avatar', async (req, res) => {
    try {
        const name = (req.query.name || 'anonymous').toString().trim();
        const size = Math.min(Math.max(parseInt(req.query.size) || 64, 16), 256);
        const mode = req.query.mode || 'img'; // 'img' = SVG wrapper, 'html' = raw HTML

        const cacheKey = `${name}:${size}:${mode}`;
        if (cache.has(cacheKey)) {
            const { content, type } = cache.get(cacheKey);
            res.setHeader('Content-Type', type);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(content);
        }

        await ensureModules();

        // Render the ACTUAL facehash React component
        const element = _React.createElement(_Facehash, {
            name,
            size,
            showInitial: true,
            variant: 'gradient',
            intensity3d: 'dramatic'
        });

        const reactHtml = _renderToStaticMarkup(element);

        let content, contentType;

        if (mode === 'html') {
            // Raw HTML mode — for inline injection via fetch + innerHTML
            content = reactHtml;
            contentType = 'text/html; charset=utf-8';
        } else {
            // IMG mode — wrap in SVG foreignObject for <img src="..."> compatibility
            content = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}">
<style>
.facehash{border-radius:50%;}
@keyframes facehash-blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.05)}}
</style>
<foreignObject width="${size}" height="${size}">
<div xmlns="http://www.w3.org/1999/xhtml">
${reactHtml}
</div>
</foreignObject>
</svg>`;
            contentType = 'image/svg+xml';
        }

        // Cache
        if (cache.size >= MAX_CACHE) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
        cache.set(cacheKey, { content, type: contentType });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(content);
    } catch (err) {
        console.error('Avatar error:', err.message);
        // Fallback: simple colored circle with initial
        const name = (req.query.name || 'A').toString();
        const size = parseInt(req.query.size) || 64;
        const initial = name.charAt(0).toUpperCase();
        const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
        const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="hsl(${hue},60%,50%)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="${size*0.4}" font-weight="700">${initial}</text></svg>`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(fallback);
    }
});

module.exports = router;
