# Database migrations

Plain SQL files, applied in lexical order against the Supabase Postgres
database.

## How to run

### Option A — node runner (preferred)
```bash
node scripts/ielts/run-migrations.mjs
```

The runner walks `migrations/*.sql` in lexical order, runs each inside a single
transaction, and tracks state in the `schema_migrations` ledger table. It's
idempotent — re-running it is safe.

### Option B — psql against the session pooler
```bash
psql "$SUPABASE_DB_URL" -f migrations/100_init_tracnghiem.sql
```

Use the **session pooler** (`SUPABASE_DB_URL`, port 5432) for DDL because
some statements require session-level settings. Runtime queries from the app
go through the **transaction pooler** (`SUPABASE_DB_URL_TX`, port 6543).

## Conventions

- Files are **idempotent** (`CREATE … IF NOT EXISTS`, `INSERT … ON CONFLICT`,
  etc).
- Numbered prefixes:
  - `001-099` shared infrastructure (pgcrypto, helpers, `touch_updated_at()`)
  - `003_…` IELTS schema (legacy numbering, will renumber later)
  - `100-199` TracNghiem / EasyRevise schema
- `lowercase_snake_case` table & column names.
- Always include `created_at`, and `updated_at` with the `touch_updated_at()`
  trigger when the row is mutable.
- Avoid foreign keys to `auth.users` — Supabase blocks DDL there. Mirror the
  data into `public.users` (or a side table) instead.

## Current ledger

| Migration | What it does |
|---|---|
| `001_init_shared.sql` | Common helpers (`gen_random_uuid()`, `touch_updated_at`) |
| `003_init_ielts.sql` | IELTS-specific tables |
| `003a_seed_band_tables.sql` | IELTS band-score seed data |
| `100_init_tracnghiem.sql` | Core TracNghiem tables (users, exams, settings, …) |
| `101_normalize_tracnghiem.sql` | Split exam JSONB into `exam_sections` / `exam_questions` / `access_codes` / `code_usages` / `open_submissions` |
| `102_exams_visible.sql` | Per-exam visibility flag |
| `103_activation_codes.sql` | One-time activation codes |
| `104_code_usages_metadata.sql` | Safety net for `code_usages.metadata` JSONB |

