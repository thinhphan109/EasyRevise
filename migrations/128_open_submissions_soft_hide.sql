-- migrations/128_open_submissions_soft_hide.sql
--
-- Mirror of migration 127 for TracNghiem submissions: the user can hide
-- a completed quiz attempt from "my-results" without losing the audit
-- record. Admin retains full visibility.
--
-- Safe / additive only.

BEGIN;

ALTER TABLE open_submissions
    ADD COLUMN IF NOT EXISTS hidden_by_user_at timestamptz;

CREATE INDEX IF NOT EXISTS open_submissions_hidden_idx
    ON open_submissions (user_id) WHERE hidden_by_user_at IS NULL;

COMMIT;
