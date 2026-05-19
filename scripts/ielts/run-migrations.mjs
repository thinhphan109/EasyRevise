/**
 * scripts/ielts/run-migrations.mjs
 *
 * Lightweight migration runner. Walks `migrations/*.sql` in lexical
 * order, applies each in a single transaction, records success in a
 * `_migrations` ledger so re-running is a no-op.
 *
 * Run:
 *   node scripts/ielts/run-migrations.mjs
 *
 * Options:
 *   --dry-run    parse + print the plan, don't execute
 *   --reset      drop the ledger first (use with --dry-run to see what would happen)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const MIG_DIR = path.join(ROOT, 'migrations');

const args = new Set(process.argv.slice(2));
const isDry = args.has('--dry-run');
const isReset = args.has('--reset');

if (!process.env.SUPABASE_DB_URL) {
    console.error('SUPABASE_DB_URL not set in .env');
    process.exit(2);
}

const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

await client.connect().catch(e => {
    console.error('Cannot connect to Postgres:', e.message);
    if (/ENETUNREACH|ETIMEDOUT|EAI_AGAIN/.test(e.message)) {
        console.error('→ Use the *pooler* connection string (port 6543).');
        console.error('  Settings → Database → Connection string → Transaction.');
    }
    process.exit(2);
});

const log = (icon, msg) => console.log(`${icon} ${msg}`);

if (isReset) {
    if (!isDry) await client.query('DROP TABLE IF EXISTS _migrations');
    log('✗', 'dropped _migrations ledger' + (isDry ? ' (dry-run)' : ''));
}

await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
        filename     text PRIMARY KEY,
        sha          text NOT NULL,
        applied_at   timestamptz NOT NULL DEFAULT now()
    )
`);

const applied = (await client.query('SELECT filename, sha FROM _migrations')).rows
    .reduce((m, r) => (m[r.filename] = r.sha, m), {});

const files = fs.readdirSync(MIG_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

console.log(`\nMigrations directory: ${MIG_DIR}`);
console.log(`Found ${files.length} migration(s).\n`);

let applyCount = 0, skipCount = 0;

for (const f of files) {
    const full = path.join(MIG_DIR, f);
    const sql = fs.readFileSync(full, 'utf8');
    const hash = sha(sql);
    const prev = applied[f];

    if (prev === hash) {
        log('=', `${f}  (already applied)`);
        skipCount++;
        continue;
    }
    if (prev && prev !== hash) {
        log('!', `${f}  CHANGED since last apply (was ${prev}, now ${hash})`);
        log(' ', '   migrations should be append-only — refusing to re-run.');
        process.exit(3);
    }

    if (isDry) {
        log('»', `${f}  would apply (${sql.length} bytes)`);
        applyCount++;
        continue;
    }

    process.stdout.write(`+ ${f}  applying… `);
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
            'INSERT INTO _migrations (filename, sha) VALUES ($1, $2)',
            [f, hash]
        );
        await client.query('COMMIT');
        console.log('✓');
        applyCount++;
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('FAILED');
        console.error('  ', e.message);
        process.exit(1);
    }
}

console.log(`\nApplied: ${applyCount}   Skipped: ${skipCount}\n`);
await client.end();
