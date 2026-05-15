// routes/media.js — Image upload (admin only)
// C3: SVG removed (XSS risk)
// C4: Magic-byte verify, safe filename
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { adminOnly } = require('../lib/auth');
const { verifyFileBuffer, safeFilename } = require('../lib/file-validate');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const IMAGE_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // First-pass: client-claimed mime. Real verify after upload.
        if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files allowed (jpeg, png, gif, webp)'));
    }
});

// POST /api/upload — admin upload image
router.post('/upload', adminOnly, upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // C4: Verify magic bytes — reject mime spoofing
    const verify = await verifyFileBuffer(req.file.buffer, IMAGE_ALLOWED_MIMES, req.file.originalname);
    if (!verify.ok) {
        return res.status(400).json({ error: verify.error || 'File không hợp lệ' });
    }

    const filename = safeFilename('img', verify.ext);
    const filePath = path.join(uploadsDir, filename);
    try {
        fs.writeFileSync(filePath, req.file.buffer);
    } catch (e) {
        console.error('[Upload] Write error:', e.message);
        return res.status(500).json({ error: 'Lỗi lưu file' });
    }
    res.json({ url: `/uploads/${filename}` });
});

module.exports = router;
