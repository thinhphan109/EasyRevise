-- migrations/120_ielts_full_skills.sql
-- Extend IELTS schema for Listening / Writing / Speaking + youpass staging.
-- Idempotent.

-- ── Audio assets (Listening) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_audio_assets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    youpass_file_id text UNIQUE,        -- raw Directus file id (for re-import)
    drive_file_id   text,               -- Google Drive id once mirrored
    duration_sec    integer,
    transcript      text,               -- full transcript JSON or plain text
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ielts_audio_youpass_idx ON ielts_audio_assets (youpass_file_id);

-- ── Writing prompts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_writing_prompts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id         uuid REFERENCES ielts_tests(id) ON DELETE CASCADE,
    task_type       smallint NOT NULL CHECK (task_type IN (1, 2)),
    instruction     text NOT NULL,
    prompt_text     text NOT NULL,
    graph_image_url text,                  -- chart/letter image for Task 1
    graph_type      text,                  -- bar/line/pie/etc
    min_words       integer NOT NULL DEFAULT 150,
    max_words       integer,
    time_limit_sec  integer NOT NULL DEFAULT 1200,
    sample_answers  jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ band, text, notes }]
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    youpass_quiz_id text UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ielts_writing_touch ON ielts_writing_prompts;
CREATE TRIGGER ielts_writing_touch BEFORE UPDATE ON ielts_writing_prompts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS ielts_writing_test_idx ON ielts_writing_prompts (test_id);

-- ── Speaking parts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_speaking_parts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id         uuid REFERENCES ielts_tests(id) ON DELETE CASCADE,
    part_number     smallint NOT NULL CHECK (part_number BETWEEN 1 AND 3),
    title           text,
    instruction     text,
    prompts         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ id, text, follow_ups: [] }]
    cue_card_text   text,                                -- Part 2 cue card
    prep_time_sec   integer NOT NULL DEFAULT 60,         -- Part 2 prep
    talk_time_sec   integer NOT NULL DEFAULT 120,        -- Part 2 talk
    sample_answers  jsonb NOT NULL DEFAULT '[]'::jsonb,
    sample_vocab    jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    youpass_quiz_id text UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ielts_speaking_touch ON ielts_speaking_parts;
CREATE TRIGGER ielts_speaking_touch BEFORE UPDATE ON ielts_speaking_parts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX IF NOT EXISTS ielts_speaking_test_idx ON ielts_speaking_parts (test_id);

-- ── Writing submissions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_writing_submissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id       uuid NOT NULL REFERENCES ielts_writing_prompts(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    submitted_at    timestamptz,
    duration_sec    integer,
    essay_text      text NOT NULL DEFAULT '',
    word_count      integer,
    band_overall    numeric(2,1),
    band_tr         numeric(2,1),
    band_cc         numeric(2,1),
    band_lr         numeric(2,1),
    band_gra        numeric(2,1),
    ai_feedback     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { tr, cc, lr, gra, overall_comment, suggestions[] }
    is_complete     boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ielts_writing_subs_user_idx ON ielts_writing_submissions (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ielts_writing_subs_prompt_idx ON ielts_writing_submissions (prompt_id);

-- ── Speaking submissions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ielts_speaking_submissions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    speaking_part_id   uuid NOT NULL REFERENCES ielts_speaking_parts(id) ON DELETE CASCADE,
    user_id            uuid NOT NULL,
    started_at         timestamptz NOT NULL DEFAULT now(),
    submitted_at       timestamptz,
    duration_sec       integer,
    audio_drive_id     text,        -- Google Drive file id of recording
    audio_url          text,        -- public URL
    transcript         text,        -- Whisper transcript
    band_overall       numeric(2,1),
    band_fc            numeric(2,1),
    band_lr            numeric(2,1),
    band_gra           numeric(2,1),
    band_pron          numeric(2,1),
    ai_feedback        jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_complete        boolean NOT NULL DEFAULT false,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ielts_speaking_subs_user_idx ON ielts_speaking_submissions (user_id, submitted_at DESC);

-- ── Listening: extend ielts_passages with audio reference ──────
ALTER TABLE ielts_passages
    ADD COLUMN IF NOT EXISTS audio_id uuid REFERENCES ielts_audio_assets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS section_number smallint;       -- 1..4 for Listening

-- ── youpass.vn staging ──────────────────────────────────────────
-- Raw dumps for traceability + idempotent re-import.
CREATE TABLE IF NOT EXISTS youpass_courses (
    id              integer PRIMARY KEY,                -- youpass course id
    raw             jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS youpass_sections (
    id              integer PRIMARY KEY,
    course_id       integer,
    raw             jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS youpass_parts (
    id              integer PRIMARY KEY,
    section_id      integer,
    quiz_id         integer,
    raw             jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS youpass_quizzes (
    id              integer PRIMARY KEY,
    type            integer,
    quiz_type       integer,
    raw             jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS youpass_questions (
    id              integer PRIMARY KEY,
    part_id         integer,
    quiz_id         integer,
    raw             jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS youpass_files (
    id              text PRIMARY KEY,                   -- Directus uuid
    drive_file_id   text,
    file_path       text,                                -- if downloaded locally
    mime            text,
    size_bytes      bigint,
    raw             jsonb NOT NULL,
    fetched_at      timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes for the importer
CREATE INDEX IF NOT EXISTS youpass_sections_course_idx ON youpass_sections (course_id);
CREATE INDEX IF NOT EXISTS youpass_parts_section_idx ON youpass_parts (section_id);
CREATE INDEX IF NOT EXISTS youpass_parts_quiz_idx ON youpass_parts (quiz_id);
CREATE INDEX IF NOT EXISTS youpass_questions_part_idx ON youpass_questions (part_id);
CREATE INDEX IF NOT EXISTS youpass_questions_quiz_idx ON youpass_questions (quiz_id);
