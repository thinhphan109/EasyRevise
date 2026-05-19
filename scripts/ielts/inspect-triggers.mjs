import 'dotenv/config';
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const tg = await c.query(`
    SELECT n.nspname as schema, t.tgname as trigger,
           pg_get_triggerdef(t.oid) as def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'users' AND n.nspname = 'public' AND NOT t.tgisinternal
`);
console.log('Triggers on public.users:');
tg.rows.forEach(r => console.log(' ', r.def));

const ev = await c.query(`
    SELECT evtname, evtevent, pg_get_userbyid(evtowner) as owner, evtenabled
    FROM pg_event_trigger
`);
console.log('\nEvent triggers:');
ev.rows.forEach(r => console.log(' ', r));

await c.end();
