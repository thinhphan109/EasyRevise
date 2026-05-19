-- migrations/102_exams_visible.sql
-- The original schema modeled "hidden / draft" state via implicit conventions
-- (e.g. requireCode set without published codes). Routes use a `visible`
-- boolean. Codify it in the schema. Idempotent.

ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

-- Sort order for the dashboard view. Allow drag-and-drop reorder.
ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS exams_sort_idx ON exams (sort_order, updated_at DESC);
