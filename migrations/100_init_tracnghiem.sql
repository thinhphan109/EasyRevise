-- migrations/100_init_tracnghiem.sql
-- TracNghiem (Vietnamese-school exam) schema, ported from lib/db/schema.sql.
-- Strategy: keep nested data as JSONB to match existing read*/write* API in
-- lib/data.js. Routes can keep operating on full objects.
-- Idempotent.

-- ── User-attached data (history, tokens) — separate tables.
-- We intentionally avoid foreign keys to public.users because the Supabase
-- DDL watcher event trigger (pgrst_ddl_watch) needs auth-schema access when
-- evaluating FKs that reference auth-managed tables, which our pooler user
-- doesn't have. Application code enforces referential integrity instead.
CREATE TABLE IF NOT EXISTS user_history (
    id          bigserial PRIMARY KEY,
    user_id     uuid NOT NULL,
    payload     jsonb NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_history_user_idx ON user_history (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_tokens (
    jti         text PRIMARY KEY,                    -- JWT id
    user_id     uuid NOT NULL,
    token       text NOT NULL,                       -- raw JWT for legacy compatibility
    expiry      bigint NOT NULL,                     -- ms epoch
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_tokens_user_idx ON user_tokens (user_id);
CREATE INDEX IF NOT EXISTS user_tokens_expiry_idx ON user_tokens (expiry);

-- ── Subjects ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    icon        text,
    color       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Exams (sections + questions stored as JSONB inside the exam row) ────
CREATE TABLE IF NOT EXISTS exams (
    id                 text PRIMARY KEY,
    title              text NOT NULL,
    subject            text,
    year               text,
    time_limit         integer NOT NULL DEFAULT 0,
    require_code       boolean NOT NULL DEFAULT false,
    auto_grade         boolean NOT NULL DEFAULT true,
    ai_explain_limit   integer DEFAULT 0,
    sections           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{id,title,type,instruction,questions[]}]
    access_codes       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{code,maxUses,uses,maxAttempts,...}]
    open_submissions   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{userId,name,score,result,...}]
    settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS exams_touch ON exams;
CREATE TRIGGER exams_touch BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS exams_subject_idx ON exams (subject);
CREATE INDEX IF NOT EXISTS exams_updated_idx ON exams (updated_at);

-- ── Question bank ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_bank (
    id              text PRIMARY KEY,
    subject         text,
    section_type    text,
    payload         jsonb NOT NULL,
    tags            jsonb NOT NULL DEFAULT '[]'::jsonb,
    difficulty      text,
    source          text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qb_subject_idx ON question_bank (subject);
CREATE INDEX IF NOT EXISTS qb_difficulty_idx ON question_bank (difficulty);

-- ── Media library ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_folders (
    id                text PRIMARY KEY,
    name              text NOT NULL,
    parent_id         text,
    drive_folder_id   text,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_files (
    id              text PRIMARY KEY,
    name            text NOT NULL,
    folder_id       text,
    drive_file_id   text,
    mime_type       text,
    size            bigint,
    tags            jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_protected    boolean NOT NULL DEFAULT false,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS media_files_touch ON media_files;
CREATE TRIGGER media_files_touch BEFORE UPDATE ON media_files
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS media_files_folder_idx ON media_files (folder_id);

-- ── Audit log (admin actions) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id                bigserial PRIMARY KEY,
    actor_id          uuid,
    actor_username    text,
    action            text NOT NULL,
    target_type       text,
    target_id         text,
    ip                text,
    user_agent        text,
    metadata          jsonb,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_actor_idx   ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx  ON audit_log (action);
