// lib/file-validate.js — Magic-byte file type verification
// Verifies actual file content (magic bytes), not the client-provided MIME type.
// Required because multer's fileFilter only checks Content-Type header which is spoofable.

const FileType = require('file-type');
const crypto = require('crypto');

// Force-correct extension from verified MIME type (do NOT trust client originalname)
const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/zip': '.zip' // file-type detects .docx as zip; manual override below
};

/**
 * Verify a Buffer's actual content type via magic bytes.
 * @param {Buffer} buffer
 * @param {string[]} allowedMimes  e.g. ['image/jpeg','image/png','application/pdf']
 * @param {string} [originalName]  optional, used only to disambiguate docx-vs-zip
 * @returns {Promise<{ ok: boolean, mime?: string, ext?: string, error?: string }>}
 */
async function verifyFileBuffer(buffer, allowedMimes, originalName = '') {
    if (!buffer || buffer.length === 0) {
        return { ok: false, error: 'File rỗng' };
    }
    if (buffer.length < 12) {
        return { ok: false, error: 'File quá nhỏ hoặc bị cắt cụt' };
    }
    let result;
    try {
        result = await FileType.fromBuffer(buffer);
    } catch (err) {
        return { ok: false, error: 'Không đọc được nội dung file' };
    }
    if (!result) {
        return { ok: false, error: 'Không xác định được loại file (magic bytes không hợp lệ)' };
    }

    let detectedMime = result.mime;

    // file-type detects .docx as application/zip; verify by file signature inside
    // Real .docx is application/vnd.openxmlformats-officedocument.wordprocessingml.document
    if (detectedMime === 'application/zip' && /\.docx$/i.test(originalName)) {
        // Quick sniff: docx zip starts with PK\x03\x04 and has [Content_Types].xml inside.
        // For simple cases, accept it as docx if originalName ends .docx.
        // For stricter check, parse the central directory.
        const looksLikeDocx = buffer.includes(Buffer.from('word/document.xml'));
        if (looksLikeDocx) {
            detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
    }

    if (!allowedMimes.includes(detectedMime)) {
        return { ok: false, error: `Loại file không hỗ trợ: ${detectedMime}` };
    }

    return {
        ok: true,
        mime: detectedMime,
        ext: MIME_TO_EXT[detectedMime] || `.${result.ext}`
    };
}

/**
 * Generate a safe random filename. Does NOT trust any client-provided string.
 * @param {string} prefix - e.g. 'sub', 'img'
 * @param {string} ext - extension WITH leading dot, e.g. '.jpg'
 * @returns {string}
 */
function safeFilename(prefix, ext) {
    const random = crypto.randomBytes(16).toString('hex');
    return `${prefix}_${Date.now()}_${random}${ext}`;
}

module.exports = { verifyFileBuffer, safeFilename, MIME_TO_EXT };
