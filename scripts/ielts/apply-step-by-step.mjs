import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');

const file = path.join(ROOT, 'migrations', '100_init_tracnghiem.sql');
const sql = fs.readFileSync(file, 'utf8');

// Split on `;` followed by newline (naive — but our migrations don't use ; in strings)
const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s.length > 5);

console.log(`${statements.length} statement(s) to run.\n`);

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const head = stmt.split('\n')[0].slice(0, 70);
    process.stdout.write(`[${i + 1}/${statements.length}] ${head}…  `);
    try {
        await c.query(stmt);
        console.log('✓');
    } catch (e) {
        console.log(`FAILED: ${e.message}`);
        console.log('  Statement was:\n', stmt.split('\n').map(l => '    ' + l).join('\n'));
        await c.end();
        process.exit(1);
    }
}

await c.end();
console.log('\nAll statements applied.');
