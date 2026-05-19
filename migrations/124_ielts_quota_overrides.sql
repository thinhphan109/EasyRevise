-- migrations/124_ielts_quota_overrides.sql
-- Per-user overrides for IELTS rate limits.
-- NULL value = inherit global default; -1 = unlimited; otherwise = explicit limit.

CREATE TABLE IF NOT EXISTS ielts_quota_overrides (
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind      text NOT NULL CHECK (kind IN ('writing', 'speaking', 'transcription')),
    limit_per_day integer,  -- nullable; -1 = unlimited
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind)
);

CREATE INDEX IF NOT EXISTS ielts_quota_overrides_user_idx
    ON ielts_quota_overrides (user_id);
