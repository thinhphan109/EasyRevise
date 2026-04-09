// lib/data.js — Read/Write JSON helpers
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'exams.json');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const SUBJECTS_FILE = path.join(__dirname, '..', 'data', 'subjects.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');
const QUESTIONS_FILE = path.join(__dirname, '..', 'data', 'questions.json');
const MEDIA_FILE = path.join(__dirname, '..', 'data', 'media.json');

function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { exams: [] };
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (err) { return { exams: [] }; }
}

function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return { users: [] };
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (err) { return { users: [] }; }
}

function writeUsers(data) { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readSubjects() {
    try {
        if (!fs.existsSync(SUBJECTS_FILE)) return { subjects: [] };
        return JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf-8'));
    } catch (err) { return { subjects: [] }; }
}

function writeSubjects(data) { fs.writeFileSync(SUBJECTS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readQuestionBank() {
    try {
        if (!fs.existsSync(QUESTIONS_FILE)) return { questions: [] };
        return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf-8'));
    } catch (err) { return { questions: [] }; }
}

function writeQuestionBank(data) { fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readSettings() {
    const defaultSettings = { adminPin: '123456', pinSessionHours: 3, siteName: 'EasyRevise', siteDescription: 'Hệ thống ôn tập đề cương thông minh' };
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return defaultSettings;
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (err) { return defaultSettings; }
}

function writeSettings(data) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readMedia() {
    try {
        if (!fs.existsSync(MEDIA_FILE)) return { folders: [], files: [] };
        return JSON.parse(fs.readFileSync(MEDIA_FILE, 'utf-8'));
    } catch (err) { return { folders: [], files: [] }; }
}

function writeMedia(data) { fs.writeFileSync(MEDIA_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

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

function verifyPassword(password, stored) {
    // Support old simpleHash format (migration)
    if (!stored.startsWith('pbkdf2:')) {
        return stored === simpleHash(password);
    }
    const [, salt, hash] = stored.split(':');
    const check = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString('hex');
    return check === hash;
}

const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(userId) {
    return {
        token: Buffer.from(`${userId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`).toString('base64'),
        tokenExpiry: Date.now() + TOKEN_EXPIRY_MS
    };
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
    DATA_FILE, USERS_FILE, SUBJECTS_FILE, SETTINGS_FILE, QUESTIONS_FILE, MEDIA_FILE
};
