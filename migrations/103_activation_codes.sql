-- migrations/103_activation_codes.sql
-- One-time codes that grant student account creation. Used by
-- routes/activation.js. Idempotent.

CREATE TABLE IF NOT EXISTS activation_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text UNIQUE NOT NULL,
    batch_name      text,
    student_name    text,
    student_id      uuid,            -- public.users.id once redeemed
    used_at         timestamptz,
    expires_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activation_codes_batch_idx
    ON activation_codes (batch_name);
CREATE INDEX IF NOT EXISTS activation_codes_used_idx
    ON activation_codes (used_at);
