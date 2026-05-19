-- migrations/122_drive_health.sql — Drive health checks history

CREATE TABLE IF NOT EXISTS drive_health_checks (
    id           bigserial PRIMARY KEY,
    checked_at   timestamptz NOT NULL DEFAULT now(),
    ok           boolean NOT NULL,
    account      text,
    quota_used   bigint,
    quota_limit  bigint,
    error        text,
    duration_ms  integer
);

CREATE INDEX IF NOT EXISTS drive_health_checked_idx
    ON drive_health_checks (checked_at DESC);
