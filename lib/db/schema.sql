-- EasyRevise SQLite schema (Sprint 3)
-- Apply with: lib/db/index.js runs migrations on first boot.

-- ============================================================
-- Users + sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'admin')),
    requires_password_reset INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS user_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,  -- JSON: { examId, score, completedAt, ... }
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_history_user ON user_history(user_id);

-- ============================================================
-- Subjects
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at TEXT NOT NULL
);

-- ============================================================
-- Exams (sections + questions stored as JSONB inside payload)
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT,
    year TEXT,
    time_limit INTEGER DEFAULT 0,
    require_code INTEGER DEFAULT 0,
    auto_grade INTEGER DEFAULT 1,
    sections TEXT NOT NULL DEFAULT '[]',  -- JSON array
    settings TEXT DEFAULT '{}',           -- JSON: theme, customConfig, etc.
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject);
CREATE INDEX IF NOT EXISTS idx_exams_updated ON exams(updated_at);

-- ============================================================
-- Access codes (1 row per code, easier indexing)
-- ============================================================
CREATE TABLE IF NOT EXISTS access_codes (
    code TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    max_uses INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codes_exam ON access_codes(exam_id);

CREATE TABLE IF NOT EXISTS code_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL REFERENCES access_codes(code) ON DELETE CASCADE,
    user_id TEXT,                      -- nullable for anonymous
    display_name TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    completed INTEGER DEFAULT 0,       -- 0=in-progress, 1=done
    score REAL,
    result TEXT,                       -- JSON: full result dict
    essay_grades TEXT DEFAULT '[]'     -- JSON: [{questionId, aiScore, ...}]
);
CREATE INDEX IF NOT EXISTS idx_usages_code ON code_usages(code);
CREATE INDEX IF NOT EXISTS idx_usages_user ON code_usages(user_id);
CREATE INDEX IF NOT EXISTS idx_usages_status ON code_usages(completed);

-- ============================================================
-- Open submissions (no-code exams)
-- ============================================================
CREATE TABLE IF NOT EXISTS open_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_id TEXT,
    display_name TEXT,
    completed_at TEXT NOT NULL,
    score REAL,
    result TEXT,
    essay_grades TEXT DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_open_subs_exam ON open_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_open_subs_user ON open_submissions(user_id);

-- ============================================================
-- Question bank (separate from exam-embedded questions)
-- ============================================================
CREATE TABLE IF NOT EXISTS question_bank (
    id TEXT PRIMARY KEY,
    subject TEXT,
    section_type TEXT,
    payload TEXT NOT NULL,  -- JSON: full question object
    tags TEXT,              -- JSON array
    difficulty TEXT,
    source TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qb_subject ON question_bank(subject);
CREATE INDEX IF NOT EXISTS idx_qb_difficulty ON question_bank(difficulty);

-- ============================================================
-- Settings (key-value)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- ============================================================
-- Media library
-- ============================================================
CREATE TABLE IF NOT EXISTS media_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    drive_folder_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    folder_id TEXT,
    drive_file_id TEXT,
    mime_type TEXT,
    size INTEGER,
    tags TEXT,
    is_protected INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_folder ON media_files(folder_id);

-- ============================================================
-- Audit log (M4 supplement — track admin actions)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    actor_username TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    ip TEXT,
    user_agent TEXT,
    metadata TEXT,                   -- JSON
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ============================================================
-- Schema version tracking (for future migrations)
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, datetime('now'));
