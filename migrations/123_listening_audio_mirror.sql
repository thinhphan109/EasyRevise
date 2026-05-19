-- migrations/123_listening_audio_mirror.sql
-- Track Drive mirror state per listening passage so we can resume large jobs.

ALTER TABLE ielts_passages
    ADD COLUMN IF NOT EXISTS audio_drive_id text,
    ADD COLUMN IF NOT EXISTS audio_mirror_status text,  -- 'pending' | 'done' | 'error'
    ADD COLUMN IF NOT EXISTS audio_mirror_error text,
    ADD COLUMN IF NOT EXISTS audio_mirror_at timestamptz;

CREATE INDEX IF NOT EXISTS ielts_passages_mirror_idx
    ON ielts_passages (audio_mirror_status)
    WHERE audio_url IS NOT NULL;
