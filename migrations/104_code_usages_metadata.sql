-- migrations/104_code_usages_metadata.sql
-- Surface the existing metadata JSONB column (already declared in 101_normalize_tracnghiem.sql)
-- as a no-op safety net in case the running database started from an older
-- snapshot that pre-dates that file. Idempotent.
ALTER TABLE code_usages
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
