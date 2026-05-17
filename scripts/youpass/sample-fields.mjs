// scripts/youpass/sample-fields.mjs
// Print field names + 1 sample row for each accessible collection
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://cms.youpass.vn';
const TOKEN = process.env.YOUPASS_TOKEN;
const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
    'Origin': 'https://youpass.vn',
    'Referer': 'https://youpass.vn/'
};

const COLLECTIONS = ['lesson', 'quiz', 'question', 'course', 'transcript', 'part', 'section', 'class', 'tag'];

const results = {};
for (const c of COLLECTIONS) {
    const r = await fetch(`${BASE}/items/${c}?limit=2&meta=*`, { headers: HEADERS });
    if (r.status !== 200) { console.log(`✗ ${c} → ${r.status}`); continue; }
    const body = await r.json();
    const rows = body.data || [];
    if (!rows.length) { console.log(`(empty) ${c}`); continue; }
    const fields = Object.keys(rows[0]);
    results[c] = { total: body.meta?.total_count, fields, sample: rows[0] };
    console.log(`\n─ ${c} (total=${body.meta?.total_count}) ─`);
    console.log('  fields:', fields.join(', '));
    console.log('  sample row keys with values:');
    for (const [k, v] of Object.entries(rows[0])) {
        let val = v;
        if (typeof v === 'string' && v.length > 80) val = v.slice(0, 80) + '…';
        if (typeof v === 'object' && v !== null) val = JSON.stringify(v).slice(0, 80) + '…';
        console.log(`    ${k.padEnd(24)} = ${val}`);
    }
}

const outDir = path.join(process.cwd(), 'docs');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'youpass-fields.json'), JSON.stringify(results, null, 2));
console.log(`\nSaved to docs/youpass-fields.json`);
