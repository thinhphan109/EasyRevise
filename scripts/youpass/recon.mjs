// scripts/youpass/recon.mjs — Phase 0 reconnaissance.
// Probes the Directus API behind youpass.vn using cookies you provided.
// Writes findings to docs/youpass-recon.md.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const TOKEN = process.env.YOUPASS_TOKEN;
const REFRESH = process.env.YOUPASS_REFRESH;
const DEVICE = process.env.YOUPASS_DEVICE;
if (!TOKEN) { console.error('Missing YOUPASS_TOKEN in .env'); process.exit(1); }

// Try common Directus base URLs in order
const CANDIDATE_BASES = [
    'https://api.youpass.vn',
    'https://youpass.vn/api',
    'https://app.youpass.vn/api',
    'https://cms.youpass.vn'
];

const HEADERS = {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    'Origin': 'https://youpass.vn',
    'Referer': 'https://youpass.vn/'
};
if (DEVICE) HEADERS['X-Device-Id'] = DEVICE;

async function probe(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
        return { ok: res.ok, status: res.status, body };
    } catch (e) {
        return { ok: false, status: 0, body: e.message };
    }
}

async function findBase() {
    for (const base of CANDIDATE_BASES) {
        const r = await probe(`${base}/server/info`);
        if (r.ok || r.status === 401 || r.status === 403) {
            console.log(`[base] ${base}  status=${r.status}`);
            return base;
        }
        console.log(`[skip] ${base}  status=${r.status}`);
    }
    return null;
}

async function listCollections(base) {
    const r = await probe(`${base}/collections`);
    return r;
}

async function listFields(base, collection) {
    return probe(`${base}/fields/${collection}`);
}

async function sampleItems(base, collection, limit = 3) {
    return probe(`${base}/items/${collection}?limit=${limit}`);
}

(async () => {
    console.log('─ Probing Directus base ─');
    const base = await findBase();
    if (!base) { console.error('No Directus base found'); process.exit(1); }

    console.log('\n─ /server/info ─');
    const info = await probe(`${base}/server/info`);
    console.log(JSON.stringify(info, null, 2).slice(0, 600));

    console.log('\n─ /users/me ─');
    const me = await probe(`${base}/users/me`);
    console.log(JSON.stringify(me, null, 2).slice(0, 600));

    console.log('\n─ /collections ─');
    const cols = await listCollections(base);
    if (cols.ok && cols.body && cols.body.data) {
        const names = cols.body.data.map(c => c.collection).sort();
        console.log(`Found ${names.length} collections:\n  ${names.join('\n  ')}`);

        // Sample each collection that looks IELTS-related
        const interesting = names.filter(n => /ielts|reading|listening|writing|speaking|test|question|passage|exam|task|skill/i.test(n));
        console.log(`\n─ Sampling ${interesting.length} interesting collections ─`);
        const samples = {};
        for (const c of interesting) {
            const fields = await listFields(base, c);
            const items = await sampleItems(base, c, 2);
            samples[c] = {
                fieldCount: fields.body?.data?.length || 0,
                fields: (fields.body?.data || []).map(f => ({ field: f.field, type: f.type })),
                sampleStatus: items.status,
                sample: items.body
            };
        }

        const outDir = path.join(process.cwd(), 'docs');
        await fs.mkdir(outDir, { recursive: true });
        const outFile = path.join(outDir, 'youpass-recon.json');
        await fs.writeFile(outFile, JSON.stringify({ base, info: info.body, me: me.body, collections: names, samples }, null, 2));
        console.log(`\nFull report written to: ${outFile}`);
    } else {
        console.log('Could not list collections:', cols);
    }
})();
