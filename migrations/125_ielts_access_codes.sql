-- migrations/125_ielts_access_codes.sql
--
-- IELTS activation codes — mirrors the TracNghiem `access_codes` /
-- `code_usages` pattern but in *separate* tables so that the quiz core
-- table is left completely untouched (production-critical, must not move).
--
-- Idempotent. Safe to run multiple times.

BEGIN;

-- ── Per-test toggle: does the test require a code to start? ──
ALTER TABLE ielts_tests
    ADD COLUMN IF NOT EXISTS requires_code boolean NOT NULL DEFAULT false;

-- ── access_codes (IELTS) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_access_codes (
    code           text PRIMARY KEY,
    test_id        uuid NOT NULL REFERENCES ielts_tests(id) ON DELETE CASCADE,
    max_uses       integer NOT NULL DEFAULT 1,
    max_attempts   integer NOT NULL DEFAULT 0,    -- 0 = unlimited per-user
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ielts_access_codes_test_idx
    ON ielts_access_codes (test_id);

-- ── code_usages (IELTS) — 1 code → many usages ─────────────────
CREATE TABLE IF NOT EXISTS ielts_code_usages (
    id              bigserial PRIMARY KEY,
    code            text NOT NULL REFERENCES ielts_access_codes(code) ON DELETE CASCADE,
    user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
    display_name    text,
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    completed       boolean NOT NULL DEFAULT false,
    -- Soft link to IELTS submission (any of: ielts_submissions.id,
    -- ielts_writing_submissions.id, ielts_speaking_submissions.id).
    submission_kind text,                          -- 'reading' | 'listening' | 'writing' | 'speaking'
    submission_id   uuid,
    score           numeric,
    result          jsonb
);
CREATE INDEX IF NOT EXISTS ielts_code_usages_code_idx
    ON ielts_code_usages (code);
CREATE INDEX IF NOT EXISTS ielts_code_usages_user_idx
    ON ielts_code_usages (user_id);
CREATE INDEX IF NOT EXISTS ielts_code_usages_started_idx
    ON ielts_code_usages (started_at DESC);

COMMIT;
