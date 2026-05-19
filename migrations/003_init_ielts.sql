-- migrations/003_init_ielts.sql
-- IELTS module schema. Reading first; structure ready for Listening,
-- Writing, Speaking. Idempotent.

-- ── ENUMs ───────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE ielts_skill AS ENUM (
        'reading', 'listening', 'writing', 'speaking'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ielts_module AS ENUM (
        'academic', 'general_training'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ielts_q_type AS ENUM (
        'tfng',                  -- True / False / Not Given
        'ynng',                  -- Yes / No / Not Given
        'mc_single',             -- Multiple choice (single answer)
        'mc_multi',              -- Multiple choice (pick N)
        'sentence_completion',   -- Fill the blank, ≤ N words
        'summary_completion',    -- Multi-blank summary, optional word bank
        'matching_headings',     -- Para A–E ↔ heading i–viii
        'matching_information',  -- Statement ↔ paragraph letter
        'matching_features',     -- Statement ↔ name/category
        'short_answer',          -- Free-text, ≤ N words
        'diagram_labelling',     -- Image hotspots
        'note_completion',       -- Note / table / flowchart
        'sentence_endings'       -- Match first half ↔ second half
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ielts_tests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_tests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    skill           ielts_skill NOT NULL,
    module          ielts_module NOT NULL DEFAULT 'academic',
    title           text NOT NULL,
    description     text,
    source          text,                    -- "Cambridge 18 Test 2"
    duration_sec    integer NOT NULL,        -- 3600 for Reading
    is_published    boolean NOT NULL DEFAULT false,
    created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ielts_tests_touch ON ielts_tests;
CREATE TRIGGER ielts_tests_touch BEFORE UPDATE ON ielts_tests
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS ielts_tests_skill_idx
    ON ielts_tests (skill, module, is_published);

-- ── ielts_passages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_passages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id     uuid NOT NULL REFERENCES ielts_tests(id) ON DELETE CASCADE,
    "order"     integer NOT NULL,
    title       text,
    body        text NOT NULL,           -- markdown
    audio_url   text,                    -- Listening only
    image_urls  jsonb NOT NULL DEFAULT '[]'::jsonb,
    UNIQUE (test_id, "order")
);

CREATE INDEX IF NOT EXISTS ielts_passages_test_idx
    ON ielts_passages (test_id);

-- ── ielts_questions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_questions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    passage_id      uuid NOT NULL REFERENCES ielts_passages(id) ON DELETE CASCADE,
    "order"         integer NOT NULL,    -- global question number 1..40
    type            ielts_q_type NOT NULL,
    prompt          text NOT NULL,
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    correct         jsonb NOT NULL,
    alternatives    jsonb NOT NULL DEFAULT '[]'::jsonb,
    config          jsonb NOT NULL DEFAULT '{}'::jsonb,
    explanation     text,
    UNIQUE (passage_id, "order")
);

CREATE INDEX IF NOT EXISTS ielts_questions_passage_idx
    ON ielts_questions (passage_id, "order");

-- ── ielts_band_tables ───────────────────────────────────────────
-- Raw → band lookup. Different per skill + module.
-- Seeded by 003a_seed_band_tables.sql.
CREATE TABLE IF NOT EXISTS ielts_band_tables (
    skill       ielts_skill NOT NULL,
    module      ielts_module NOT NULL,
    raw_score   integer NOT NULL,
    band_score  numeric(2,1) NOT NULL,
    PRIMARY KEY (skill, module, raw_score)
);

-- ── ielts_submissions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_submissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id         uuid NOT NULL REFERENCES ielts_tests(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at      timestamptz NOT NULL DEFAULT now(),
    submitted_at    timestamptz,
    duration_sec    integer,
    answers         jsonb NOT NULL DEFAULT '{}'::jsonb,
    flags           jsonb NOT NULL DEFAULT '[]'::jsonb,
    raw_score       integer,
    band_score      numeric(2,1),
    per_question    jsonb,
    ai_feedback     text,
    is_complete     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ielts_subs_user_idx
    ON ielts_submissions (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ielts_subs_test_idx
    ON ielts_submissions (test_id);
