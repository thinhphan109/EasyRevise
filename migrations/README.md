# Database migrations

Plain SQL files, applied in alphabetical order.

## How to run

### Option A — psql against the pooler
```bash
psql "$SUPABASE_DB_URL" -f migrations/001_init_shared.sql
psql "$SUPABASE_DB_URL" -f migrations/003_init_ielts.sql
psql "$SUPABASE_DB_URL" -f migrations/003a_seed_band_tables.sql
```

### Option B — node runner (preferred — used by CI)
```bash
node scripts/ielts/run-migrations.mjs
```

The runner walks `migrations/*.sql` in lexical order, runs each inside
a single transaction, and tracks state in a `_migrations` ledger table.

## Conventions

- Files are **idempotent** (every `CREATE` uses `IF NOT EXISTS`,
  every `INSERT` clears its scope first).
- Numbered prefixes:
  - `001-099` shared infrastructure
  - `100-199` TracNghiem schema (next milestone)
  - `200-299` IELTS schema (`003_…` is exception, will renumber later)
- Lowercase snake_case table & column names.
- Always include `created_at` and (when mutable) `updated_at` with the
  `touch_updated_at()` trigger from `001_init_shared.sql`.
