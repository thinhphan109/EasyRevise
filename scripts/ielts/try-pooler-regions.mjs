/**
 * scripts/ielts/try-pooler-regions.mjs
 *
 * Tries to authenticate against the transaction pooler in each region.
 * The one that does not return "Tenant or user not found" is the right one.
 */
import 'dotenv/config';
import pg from 'pg';

const REGIONS = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-west-3',
    'eu-central-1', 'eu-north-1',
    'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
    'ap-northeast-1', 'ap-northeast-2',
    'sa-east-1', 'ca-central-1'
];

const projectRef = 'ioqkasahsgabfcekondy';
const password = encodeURIComponent('ERDBTT109!!');
const user = `postgres.${projectRef}`;
const PREFIXES = ['aws-0', 'aws-1'];

console.log(`Trying pooler in ${REGIONS.length * PREFIXES.length} host combos for project ${projectRef}…\n`);

for (const prefix of PREFIXES) {
for (const region of REGIONS) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const url = `postgresql://${user}:${password}@${host}:6543/postgres`;
    const c = new pg.Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });
    try {
        await c.connect();
        const r = await c.query('select current_database() db');
        console.log(`  ✓ ${region}  →  authenticated (db=${r.rows[0].db})`);
        console.log(`\n    SUPABASE_DB_URL=${url}\n`);
        await c.end();
        process.exit(0);
    } catch (e) {
        const msg = e.message.split('\n')[0];
        console.log(`  ✗ ${prefix}-${region.padEnd(18)} ${msg.slice(0, 70)}`);
        try { await c.end(); } catch {}
    }
}}

console.log('\nNo region authenticated. Possible causes:');
console.log('  - DB password wrong (check / reset in Dashboard → Settings → Database)');
console.log('  - Project paused (free tier auto-pauses after 7d idle — visit dashboard to wake)');
process.exit(1);
