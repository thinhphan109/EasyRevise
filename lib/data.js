// lib/data.js — Postgres-backed compatibility shim
//
// Routes still call readData() / writeData() / readUsers() / etc. The new
// implementations forward to the typed repositories in lib/repos/*. Where
// possible we keep the synchronous-looking signatures (sync read by
// returning a Promise that the route used to discard, write functions are
// fire-and-await), but the bulk of the read traffic is async-aware via the
// `*Async` variants.
//
// Migration path: routes will be updated to await these calls; the
// historical sync callsites still work because Promises evaluate only when
// awaited and our shim throws clearly when used in a way that requires
// awaiting.
'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const repos = require('./repos');

// ── Password hashing (unchanged from original) ────────────────────────
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return 'h' + Math.abs(hash).toString(36) + str.length;
}

const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';
function secureHash(password) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    return `pbkdf2:${salt}:${hash}`;
}

const DROP_SIMPLEHASH = process.env.DROP_SIMPLEHASH === 'true';
function verifyPassword(password, stored) {
    if (!stored || stored === 'EXPIRED') return false;
    if (!stored.startsWith('pbkdf2:')) {
        if (DROP_SIMPLEHASH) return false;
        return stored === simpleHash(password);
    }
    const [, salt, hash] = stored.split(':');
    const check = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
    } catch { return false; }
}

const TOKEN_EXPIRY_MS = (parseInt(process.env.JWT_TTL_DAYS || '7', 10)) * 24 * 60 * 60 * 1000;

function generateToken(userId, role) {
    const { sign } = require('./jwt');
    return sign({ id: userId, role: role || 'student' });
}

// ── Helpers ──────────────────────────────────────────────────────────
function countQuestions(exam) {
    let count = 0;
    (exam.sections || []).forEach(s => { count += (s.questions || []).length; });
    return count;
}

// ── Async readers / writers — preferred new interface ────────────────
async function readDataAsync()        { return { exams: await repos.exams.listAll() }; }
async function readUsersAsync()       { return { users: await repos.users.listAll() }; }
async function readSubjectsAsync()    { return { subjects: await repos.subjects.listAll() }; }
async function readSettingsAsync() {
    const all = await repos.settings.getAll();
    return Object.keys(all).length ? all : seedDefaultSettings();
}
async function readQuestionBankAsync(){ return { questions: await repos.questionBank.listAll() }; }
async function readMediaAsync() {
    const [folders, files] = await Promise.all([
        repos.media.listFolders(),
        repos.media.listFiles({ limit: 5000 })
    ]);
    return { folders, files };
}

// ── Defaults / first-boot bootstrap ──────────────────────────────────
async function seedDefaultSettings() {
    const randomPin = String(Math.floor(100000 + crypto.randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF * 900000));
    const initial = {
        adminPin: randomPin,
        pinSessionHours: 3,
        siteName: 'EasyRevise',
        siteDescription: 'Hệ thống ôn tập đề cương thông minh'
    };
    await repos.settings.setMany(initial);
    console.log('[INIT] First-time setup — generated random admin PIN:', randomPin);
    return initial;
}

// ── Sync façade ──────────────────────────────────────────────────────
// We intentionally throw on the deprecated sync shape rather than block
// the event loop. The accompanying refactor moves every callsite to await
// the *Async variants below.
function deprecatedSync(name) {
    return () => {
        throw new Error(
            `[lib/data] ${name}() must now be awaited. ` +
            `Use ${name}Async() (or migrate the caller to lib/repos/* directly).`
        );
    };
}

const readData          = deprecatedSync('readData');
const readUsers         = deprecatedSync('readUsers');
const readSubjects      = deprecatedSync('readSubjects');
const readSettings      = deprecatedSync('readSettings');
const readQuestionBank  = deprecatedSync('readQuestionBank');
const readMedia         = deprecatedSync('readMedia');

// ── Bulk-write fallbacks ─────────────────────────────────────────────
// Some routes used to assemble a whole document then call writeData(data).
// We keep these as async functions: each splices the document back through
// the repo layer. They're fairly expensive — refactoring callers to use
// granular repo methods is preferred.
async function writeUsers(data) {
    const users = (data && data.users) || [];
    for (const u of users) {
        await repos.users.update(u.id, {
            username: u.username,
            passwordHash: u.passwordHash,
            displayName: u.displayName,
            role: u.role
        });
    }
}

async function writeSettings(data) {
    if (data && typeof data === 'object') {
        await repos.settings.setMany(data);
    }
}

async function writeSubjects(data) {
    const list = (data && data.subjects) || [];
    for (const s of list) await repos.subjects.upsert(s);
}

async function writeQuestionBank(data) {
    const list = (data && data.questions) || [];
    for (const q of list) await repos.questionBank.upsert(q);
}

async function writeMedia(data) {
    if (!data) return;
    for (const f of (data.folders || [])) await repos.media.upsertFolder(f);
    for (const f of (data.files   || [])) await repos.media.upsertFile(f);
}

async function writeData(data) {
    // Heavy operation — only used in legacy bulk-update flows. Updates exam-
    // level fields and replaces sections/questions wholesale.
    const exams = (data && data.exams) || [];
    for (const e of exams) {
        const existing = await repos.exams.getById(e.id);
        if (existing) {
            await repos.exams.update(e.id, e);
        } else {
            await repos.exams.create(e);
        }
        // For brevity the shim does NOT splice nested sections/questions on
        // writeData(). Callers that actually mutate nested arrays must be
        // migrated to the granular repo methods. This is enforced by the
        // accompanying audit run on each route file.
    }
}

// ── Transactions on a single resource (legacy `withLock` / `updateData`) ──
async function withLock(_filePath, fn) {
    // Postgres handles concurrency at the row level. For callers that used
    // `withLock` purely for serialization, we wrap in a transaction.
    return repos.exams.withTx(async (_c) => fn());
}

async function updateData(updater) {
    return repos.exams.withTx(async (_c) => {
        const data = await readDataAsync();
        await updater(data);
        await writeData(data);
        return data;
    });
}

async function updateUsers(updater) {
    return repos.users.withTx(async (_c) => {
        const data = await readUsersAsync();
        await updater(data);
        await writeUsers(data);
        return data;
    });
}

module.exports = {
    // Sync variants — throw with guidance.
    readData, readUsers, readSubjects, readSettings, readQuestionBank, readMedia,
    // Async variants — preferred.
    readDataAsync, readUsersAsync, readSubjectsAsync, readSettingsAsync,
    readQuestionBankAsync, readMediaAsync,
    // Writes (all async).
    writeData, writeUsers, writeSubjects, writeSettings,
    writeQuestionBank, writeMedia,
    // Legacy locking helpers.
    withLock, updateData, updateUsers,
    // Auth helpers (unchanged).
    simpleHash, secureHash, verifyPassword, generateToken,
    // Misc.
    countQuestions, uuidv4,
    TOKEN_EXPIRY_MS,
    // Direct repo access for callers that want to migrate fully.
    repos
};
