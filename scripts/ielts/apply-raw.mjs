import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) { console.error('usage: node apply-raw.mjs <sql-file>'); process.exit(2); }

const sql = fs.readFileSync(file, 'utf8');

// Strip block of leading line-comments and blank lines, then split on ';' that ends a line.
const cleaned = sql
    .split('\n')
    .filter(l => !/^\s*--/.test(l))
    .join('\n');

const statements = cleaned.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0);

console.log(`${statements.length} statement(s).\n`);

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const head = stmt.split('\n')[0].slice(0, 78).replace(/\s+/g, ' ');
    process.stdout.write(`[${i + 1}/${statements.length}] ${head}…  `);
    try {
        await c.query(stmt);
        console.log('✓');
    } catch (e) {
        console.log(`FAILED: ${e.message}`);
        console.log('  position:', e.position, 'detail:', e.detail);
        // Dump statement for inspection
        console.log('--- begin statement ---');
        console.log(stmt);
        console.log('--- end statement ---');
        await c.end();
        process.exit(1);
    }
}

await c.end();
console.log('\nAll applied (without ledger update).');
