-- migrations/101_normalize_tracnghiem.sql
-- Normalize the JSONB-heavy first cut of the schema. Splits exam.sections,
-- exam.access_codes, exam.open_submissions into proper relational tables
-- so we can query / index / lock them independently.
--
-- Question *payload* (type-specific fields like options/blanks/rubric) stays
-- JSONB because the shape varies per question type. Identity columns
-- (id, section_id, order, type) are normalized.
--
-- Backfills data from the existing JSONB columns and then drops them.
-- Idempotent.

-- ── Sections (1 exam → many sections, ordered) ───────────────────────────
CREATE TABLE IF NOT EXISTS exam_sections (
    id           text PRIMARY KEY,
    exam_id      text NOT NULL,
    "order"      integer NOT NULL,
    type         text NOT NULL,           -- 'multiple-choice', 'reading', 'fill-in-blank', 'writing-essay', 'free-form'
    title        text,
    instruction  text,
    metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_sections_exam_idx
    ON exam_sections (exam_id, "order");

-- ── Questions (1 section → many questions, ordered) ──────────────────────
CREATE TABLE IF NOT EXISTS exam_questions (
    id           text PRIMARY KEY,
    section_id   text NOT NULL,
    "order"      integer NOT NULL,
    payload      jsonb NOT NULL,           -- question, options, correctAnswer, explanation, media, etc.
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_questions_section_idx
    ON exam_questions (section_id, "order");

-- ── Access codes (1 exam → many codes) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS access_codes (
    code           text PRIMARY KEY,
    exam_id        text NOT NULL,
    max_uses       integer NOT NULL DEFAULT 1,
    max_attempts   integer NOT NULL DEFAULT 0,    -- 0 = unlimited attempts
    metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_codes_exam_idx ON access_codes (exam_id);

-- ── Code usages (1 code → many usages) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS code_usages (
    id              bigserial PRIMARY KEY,
    code            text NOT NULL,
    user_id         uuid,                   -- nullable for anonymous attempts
    display_name    text,
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    completed       boolean NOT NULL DEFAULT false,
    score           numeric,
    result          jsonb,                  -- full result envelope (answers, perQuestion, etc.)
    essay_grades    jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS code_usages_code_idx     ON code_usages (code);
CREATE INDEX IF NOT EXISTS code_usages_user_idx     ON code_usages (user_id);
CREATE INDEX IF NOT EXISTS code_usages_status_idx   ON code_usages (completed);
CREATE INDEX IF NOT EXISTS code_usages_completed_at ON code_usages (completed_at DESC);

-- ── Open submissions (no-code exams) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS open_submissions (
    id              bigserial PRIMARY KEY,
    exam_id         text NOT NULL,
    user_id         uuid,
    display_name    text,
    completed_at    timestamptz NOT NULL DEFAULT now(),
    score           numeric,
    result          jsonb,
    essay_grades    jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS open_submissions_exam_idx ON open_submissions (exam_id);
CREATE INDEX IF NOT EXISTS open_submissions_user_idx ON open_submissions (user_id);

-- ── Backfill from existing JSONB columns on `exams` ─────────────────────
-- Sections & questions
INSERT INTO exam_sections (id, exam_id, "order", type, title, instruction, metadata, created_at)
SELECT
    s->>'id'                            AS id,
    e.id                                AS exam_id,
    (idx - 1)::int                      AS "order",
    COALESCE(s->>'type', 'multiple-choice') AS type,
    s->>'title'                         AS title,
    s->>'instruction'                   AS instruction,
    (s - 'questions' - 'id' - 'type' - 'title' - 'instruction')  AS metadata,
    e.created_at
FROM exams e
CROSS JOIN LATERAL jsonb_array_elements(e.sections) WITH ORDINALITY AS s(s, idx)
ON CONFLICT (id) DO NOTHING;

INSERT INTO exam_questions (id, section_id, "order", payload, created_at)
SELECT
    q->>'id'        AS id,
    s->>'id'        AS section_id,
    (qidx - 1)::int AS "order",
    q               AS payload,
    e.created_at
FROM exams e
CROSS JOIN LATERAL jsonb_array_elements(e.sections) AS s(s)
CROSS JOIN LATERAL jsonb_array_elements(s->'questions') WITH ORDINALITY AS q(q, qidx)
WHERE q->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Access codes
INSERT INTO access_codes (code, exam_id, max_uses, max_attempts, metadata, created_at)
SELECT
    ac->>'code',
    e.id,
    COALESCE((ac->>'maxUses')::int, 1),
    COALESCE((ac->>'maxAttempts')::int, 0),
    (ac - 'code' - 'maxUses' - 'maxAttempts'),
    e.created_at
FROM exams e
CROSS JOIN LATERAL jsonb_array_elements(e.access_codes) AS ac(ac)
WHERE ac->>'code' IS NOT NULL
ON CONFLICT (code) DO NOTHING;

-- Open submissions (best-effort: timestamps + scores may be missing/garbage in legacy data)
INSERT INTO open_submissions (exam_id, user_id, display_name, completed_at, score, result, essay_grades)
SELECT
    e.id,
    CASE WHEN sub->>'userId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         THEN (sub->>'userId')::uuid ELSE NULL END,
    sub->>'displayName',
    CASE WHEN sub->>'completedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
         THEN (sub->>'completedAt')::timestamptz ELSE e.created_at END,
    CASE WHEN sub->>'score' ~ '^-?[0-9]+(\.[0-9]+)?$'
         THEN (sub->>'score')::numeric ELSE NULL END,
    sub->'result',
    COALESCE(sub->'essayGrades', '[]'::jsonb)
FROM exams e
CROSS JOIN LATERAL jsonb_array_elements(e.open_submissions) AS sub(sub)
WHERE jsonb_typeof(e.open_submissions) = 'array';

-- ── Drop now-redundant JSONB columns on exams ───────────────────────────
ALTER TABLE exams DROP COLUMN IF EXISTS sections;
ALTER TABLE exams DROP COLUMN IF EXISTS access_codes;
ALTER TABLE exams DROP COLUMN IF EXISTS open_submissions;
