-- migrations/126_ielts_taxonomy.sql
--
-- IELTS catalog taxonomy — additive only, defaults preserve existing rows.
-- Lets admins classify tests by category / topic / level / tags / year and
-- lets students filter the catalog meaningfully.
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE ielts_tests
    ADD COLUMN IF NOT EXISTS category text,        -- 'cambridge','actual-test','online','custom',...
    ADD COLUMN IF NOT EXISTS topic    text,        -- 'environment','education','technology','health',...
    ADD COLUMN IF NOT EXISTS level    text,        -- 'foundation','target_5_5','target_6_5','target_7_plus'
    ADD COLUMN IF NOT EXISTS year     integer,     -- e.g. 2024
    ADD COLUMN IF NOT EXISTS tags     jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ielts_tests_category_idx ON ielts_tests (category);
CREATE INDEX IF NOT EXISTS ielts_tests_topic_idx    ON ielts_tests (topic);
CREATE INDEX IF NOT EXISTS ielts_tests_level_idx    ON ielts_tests (level);
CREATE INDEX IF NOT EXISTS ielts_tests_year_idx     ON ielts_tests (year);
CREATE INDEX IF NOT EXISTS ielts_tests_tags_gin     ON ielts_tests USING GIN (tags);

COMMIT;
