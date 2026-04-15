// routes/avatar.js — FaceHash avatar generation endpoint
// Renders deterministic SVG avatars server-side using facehash + react-dom/server
const express = require('express');
const router = express.Router();

// Cache rendered SVGs in memory (up to 500)
const svgCache = new Map();
const MAX_CACHE = 500;

let _facehash = null;
let _react = null;
let _renderToStaticMarkup = null;

async function ensureModules() {
    if (_facehash) return;
    const [fh, react, rds] = await Promise.all([
        import('facehash'),
        import('react'),
        import('react-dom/server')
    ]);
    _facehash = fh;
    _react = react.default || react;
    _renderToStaticMarkup = rds.renderToStaticMarkup;
}

// GET /api/avatar?name=username&size=64&format=svg
router.get('/avatar', async (req, res) => {
    try {
        const name = (req.query.name || 'anonymous').toString();
        const size = parseInt(req.query.size) || 64;
        const format = req.query.format || 'svg';

        const cacheKey = `${name}:${size}`;
        if (svgCache.has(cacheKey)) {
            const cached = svgCache.get(cacheKey);
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            return res.send(cached);
        }

        await ensureModules();

        const element = _react.createElement(_facehash.Facehash, {
            name,
            size: Math.min(Math.max(size, 16), 256), // clamp 16-256
        });

        const svg = _renderToStaticMarkup(element);

        // Cache result
        if (svgCache.size >= MAX_CACHE) {
            const firstKey = svgCache.keys().next().value;
            svgCache.delete(firstKey);
        }
        svgCache.set(cacheKey, svg);

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(svg);
    } catch (err) {
        console.error('Avatar error:', err.message);
        // Fallback: simple colored circle with initial
        const name = (req.query.name || 'A').toString();
        const size = parseInt(req.query.size) || 64;
        const initial = name.charAt(0).toUpperCase();
        const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
        const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="hsl(${hue},60%,50%)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="white" font-family="Arial" font-size="${size*0.4}" font-weight="700">${initial}</text></svg>`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(fallback);
    }
});

module.exports = router;
