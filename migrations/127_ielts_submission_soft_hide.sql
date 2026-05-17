-- migrations/127_ielts_submission_soft_hide.sql
--
-- Soft-delete column so users can hide a submission from their own
-- "my-results" view without losing the audit record on admin side.
--
-- Semantics:
--   • hidden_by_user_at IS NULL → submission visible everywhere
--   • hidden_by_user_at IS NOT NULL → hidden in user-facing aggregates
--     (listMyResults, myResultsStats) but admin still sees it
--
-- Hard delete remains the admin-only action (cascade via DELETE on the
-- ielts_tests row, or per-submission DELETE via the new admin endpoint).
--
-- Idempotent. Safe to re-run.

BEGIN;

ALTER TABLE ielts_submissions
    ADD COLUMN IF NOT EXISTS hidden_by_user_at timestamptz;
ALTER TABLE ielts_writing_submissions
    ADD COLUMN IF NOT EXISTS hidden_by_user_at timestamptz;
ALTER TABLE ielts_speaking_submissions
    ADD COLUMN IF NOT EXISTS hidden_by_user_at timestamptz;

CREATE INDEX IF NOT EXISTS ielts_submissions_hidden_idx
    ON ielts_submissions (user_id) WHERE hidden_by_user_at IS NULL;
CREATE INDEX IF NOT EXISTS ielts_writing_submissions_hidden_idx
    ON ielts_writing_submissions (user_id) WHERE hidden_by_user_at IS NULL;
CREATE INDEX IF NOT EXISTS ielts_speaking_submissions_hidden_idx
    ON ielts_speaking_submissions (user_id) WHERE hidden_by_user_at IS NULL;

COMMIT;
