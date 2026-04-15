// routes/avatar.js — Deterministic SVG Avatar generation endpoint
const express = require('express');
const router = express.Router();

// Premium modern gradient colors
const COLORS = [
    ['#3b82f6', '#93c5fd'], // Blue
    ['#10b981', '#6ee7b7'], // Emerald
    ['#f59e0b', '#fcd34d'], // Amber
    ['#ec4899', '#f9a8d4'], // Pink
    ['#8b5cf6', '#c4b5fd'], // Violet
    ['#ef4444', '#fca5a5'], // Red
    ['#06b6d4', '#67e8f9'], // Cyan
    ['#f97316', '#fdba74'], // Orange
    ['#6366f1', '#a5b4fc'], // Indigo
    ['#14b8a6', '#5eead4']  // Teal
];

function stringHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

// GET /api/avatar?name=username&size=64
router.get('/avatar', (req, res) => {
    try {
        const name = (req.query.name || 'Anonymous').toString().trim();
        const size = parseInt(req.query.size) || 64;
        
        let initial = '?';
        // Get first alphanumeric char or just first char
        const match = name.match(/[a-zA-Z0-9]/);
        if (match) initial = match[0].toUpperCase();
        else if (name.length > 0) initial = name.charAt(0).toUpperCase();

        const hash = stringHash(name);
        const colorPair = COLORS[hash % COLORS.length];

        // Generate deterministic abstract shapes based on hash
        const shapeTypes = ['circle', 'rect', 'triangle', 'rotated_rect', 'diamond'];
        const shapeType = shapeTypes[hash % shapeTypes.length];
        
        let backgroundShape = '';
        if (shapeType === 'circle') {
            backgroundShape = `<circle cx="${size/2}" cy="${size/2}" r="${size*0.48}" fill="url(#grad)" opacity="0.9" />`;
        } else if (shapeType === 'rect') {
            backgroundShape = `<rect x="${size*0.05}" y="${size*0.05}" width="${size*0.9}" height="${size*0.9}" rx="${size*0.15}" fill="url(#grad)" opacity="0.9" />`;
        } else if (shapeType === 'rotated_rect') {
            backgroundShape = `<rect x="${size*0.1}" y="${size*0.1}" width="${size*0.8}" height="${size*0.8}" rx="${size*0.1}" fill="url(#grad)" opacity="0.9" transform="rotate(45 ${size/2} ${size/2})" />`;
        } else if (shapeType === 'diamond') {
            backgroundShape = `<polygon points="${size/2},${size*0.05} ${size*0.95},${size/2} ${size/2},${size*0.95} ${size*0.05},${size/2}" fill="url(#grad)" opacity="0.9" />`;
        } else {
            // Triangle
            backgroundShape = `<path d="M${size/2} ${size*0.1} L${size*0.9} ${size*0.85} L${size*0.1} ${size*0.85} Z" fill="url(#grad)" opacity="0.9" />`;
        }

        // We use a clean SVG approach so it works inside standard <img> tags perfectly in all browsers
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${colorPair[1]}" />
                    <stop offset="100%" stop-color="${colorPair[0]}" />
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="${colorPair[0]}" opacity="0.15" />
            ${backgroundShape}
            <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="${size * 0.45}" font-weight="700" style="text-shadow: 0px 1px 2px rgba(0,0,0,0.3);">${initial}</text>
        </svg>`;

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(svg);
    } catch (err) {
        console.error('Avatar error:', err.message);
        const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="100%" height="100%" fill="#ccc"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="sans-serif">?</text></svg>`;
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(fallback);
    }
});

module.exports = router;
