-- migrations/121_ielts_rate_limits.sql
CREATE TABLE IF NOT EXISTS ielts_rate_limits (
    user_id     uuid NOT NULL,
    kind        text NOT NULL,
    day         date NOT NULL,
    count       integer NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, day)
);

CREATE INDEX IF NOT EXISTS ielts_rate_limits_day_idx
    ON ielts_rate_limits (day);
