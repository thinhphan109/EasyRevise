-- migrations/001_init_shared.sql
-- Shared infrastructure used by both TracNghiem and IELTS modules.
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- belt & suspenders

-- ────────────────────────────────────────────────────────────────
-- updated_at auto-touch trigger function. Tables that want it just
-- attach `BEFORE UPDATE FOR EACH ROW EXECUTE FUNCTION touch_updated_at()`.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────────
-- USERS (shared) — keeps the existing custom JWT model;
-- Supabase Auth is intentionally NOT used.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username        text UNIQUE NOT NULL,
    password_hash   text NOT NULL,
    display_name    text,
    role            text NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student', 'admin')),
    avatar_url      text,
    metadata        jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- ────────────────────────────────────────────────────────────────
-- SETTINGS (shared) — flat key/value, JSON-typed values.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS settings_touch ON settings;
CREATE TRIGGER settings_touch BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ────────────────────────────────────────────────────────────────
-- SESSIONS (optional — used only if we move JWT blocklist server-side
-- for log-out / token revocation). Lazy create.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    token_jti   text PRIMARY KEY,
    user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
    revoked_at  timestamptz,
    expires_at  timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
