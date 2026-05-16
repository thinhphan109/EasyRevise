// lib/data.js — Read/Write JSON helpers
// C8: Atomic writes prevent partial-file corruption khi process bị kill giữa write.
//     Lock helper (withLock) cho hot paths cần serialize (submit, code-result).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const lockfile = require('proper-lockfile');

const DATA_FILE = path.join(__dirname, '..', 'data', 'exams.json');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const SUBJECTS_FILE = path.join(__dirname, '..', 'data', 'subjects.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');
const QUESTIONS_FILE = path.join(__dirname, '..', 'data', 'questions.json');
const MEDIA_FILE = path.join(__dirname, '..', 'data', 'media.json');

// ── Atomic write: write to .tmp then rename. Rename is atomic on POSIX & NTFS.
function atomicWriteSync(filePath, content) {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    fs.writeFileSync(tmpPath, content, 'utf-8');
    try {
        fs.renameSync(tmpPath, filePath);
    } catch (e) {
        // On Windows, rename may fail if target locked; fallback to direct write
        // (still better than partial-state since tmp file was complete)
        try { fs.unlinkSync(tmpPath); } catch {}
        fs.writeFileSync(filePath, content, 'utf-8');
    }
}

// ── Lock helper for serialized read-modify-write transactions
async function withLock(filePath, fn) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '{}', 'utf-8');
    }
    const release = await lockfile.lock(filePath, {
        retries: { retries: 8, factor: 1.5, minTimeout: 50, maxTimeout: 800 },
        stale: 10000,
        realpath: false
    });
    try {
        return await fn();
    } finally {
        try { await release(); } catch {}
    }
}

function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) atomicWriteSync(DATA_FILE, JSON.stringify({ exams: [] }, null, 2));
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (err) { return { exams: [] }; }
}

function writeData(data) { atomicWriteSync(DATA_FILE, JSON.stringify(data, null, 2)); }

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) atomicWriteSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) { return { users: [] }; }
}

function writeUsers(data) { atomicWriteSync(USERS_FILE, JSON.stringify(data, null, 2)); }

function readSubjects() {
    try {
        if (!fs.existsSync(SUBJECTS_FILE)) atomicWriteSync(SUBJECTS_FILE, JSON.stringify({ subjects: [] }, null, 2));
        return JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf-8'));
    } catch (err) { return { subjects: [] }; }
}

function writeSubjects(data) { atomicWriteSync(SUBJECTS_FILE, JSON.stringify(data, null, 2)); }

function readQuestionBank() {
    try {
        if (!fs.existsSync(QUESTIONS_FILE)) atomicWriteSync(QUESTIONS_FILE, JSON.stringify({ questions: [] }, null, 2));
        return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
    } catch (err) { return { questions: [] }; }
}

function writeQuestionBank(data) { atomicWriteSync(QUESTIONS_FILE, JSON.stringify(data, null, 2)); }

function readSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            // H6: Random PIN khi init thay vì hardcode '123456'
            const randomPin = String(Math.floor(100000 + crypto.randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF * 900000));
            const initial = {
                adminPin: randomPin,
                pinSessionHours: 3,
                siteName: 'EasyRevise',
                siteDescription: 'Hệ thống ôn tập đề cương thông minh'
            };
            atomicWriteSync(SETTINGS_FILE, JSON.stringify(initial, null, 2));
            console.log('============================================================');
            console.log('[INIT] First-time setup — generated random admin PIN:', randomPin);
            console.log('[INIT] LƯU NGAY — không được hiển thị lại sau khi restart.');
            console.log('============================================================');
            return initial;
        }
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (err) {
        // Fallback for read errors only — DON'T overwrite a real existing file
        return { adminPin: '000000', pinSessionHours: 3, siteName: 'EasyRevise', siteDescription: 'Hệ thống ôn tập' };
    }
}

function writeSettings(data) { atomicWriteSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); }

function readMedia() {
    try {
        if (!fs.existsSync(MEDIA_FILE)) atomicWriteSync(MEDIA_FILE, JSON.stringify({ folders: [], files: [] }, null, 2));
        return JSON.parse(fs.readFileSync(MEDIA_FILE, 'utf-8'));
    } catch (err) { return { folders: [], files: [] }; }
}

function writeMedia(data) { atomicWriteSync(MEDIA_FILE, JSON.stringify(data, null, 2)); }

// ── Transaction helpers: serialized read-modify-write with file lock ──
// Use these in hot paths where multiple concurrent requests modify the same file.
// Example:
//   await updateData(async (data) => {
//     data.exams.find(e => e.id === id).field = value;
//   });

async function updateData(updater) {
    return withLock(DATA_FILE, async () => {
        const data = readData();
        await updater(data);
        atomicWriteSync(DATA_FILE, JSON.stringify(data, null, 2));
        return data;
    });
}

async function updateUsers(updater) {
    return withLock(USERS_FILE, async () => {
        const data = readUsers();
        await updater(data);
        atomicWriteSync(USERS_FILE, JSON.stringify(data, null, 2));
        return data;
    });
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return 'h' + Math.abs(hash).toString(36) + str.length;
}

// Secure password hashing with pbkdf2
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

function secureHash(password) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    return `pbkdf2:${salt}:${hash}`;
}

// H7: Drop simpleHash support after Sprint 2 migration period.
// During transition (current sprint), still accept simpleHash for backward compat,
// but routes/auth.js auto-upgrades to pbkdf2 on successful login.
// To force-drop: set DROP_SIMPLEHASH=true in .env after running scripts/migrate-passwords.js
const DROP_SIMPLEHASH = process.env.DROP_SIMPLEHASH === 'true';

function verifyPassword(password, stored) {
    if (!stored || stored === 'EXPIRED') return false;
    if (!stored.startsWith('pbkdf2:')) {
        // Reject simpleHash if migration period over
        if (DROP_SIMPLEHASH) return false;
        return stored === simpleHash(password);
    }
    const [, salt, hash] = stored.split(':');
    const check = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
    } catch {
        return false;
    }
}

const TOKEN_EXPIRY_MS = (parseInt(process.env.JWT_TTL_DAYS || '7', 10)) * 24 * 60 * 60 * 1000;

// H1: JWT-signed token (verifiable offline)
// Backward compat: existing opaque base64 tokens trong users.json vẫn được auth.js fallback nhận diện.
function generateToken(userId, role) {
    const { sign } = require('./jwt');
    return sign({ id: userId, role: role || 'student' });
}

function countQuestions(exam) {
    let count = 0;
    exam.sections.forEach(s => {
        count += (s.questions || []).length;
    });
    return count;
}

module.exports = {
    readData, writeData, readUsers, writeUsers,
    readSubjects, writeSubjects, readQuestionBank, writeQuestionBank,
    readSettings, writeSettings, readMedia, writeMedia,
    simpleHash, secureHash, verifyPassword, generateToken, countQuestions, uuidv4,
    TOKEN_EXPIRY_MS,
    DATA_FILE, USERS_FILE, SUBJECTS_FILE, SETTINGS_FILE, QUESTIONS_FILE, MEDIA_FILE,
    // C8: transactional helpers + atomic write
    atomicWriteSync, withLock, updateData, updateUsers
};
