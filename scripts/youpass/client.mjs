// scripts/youpass/client.mjs — Directus client with auto-refresh
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://cms.youpass.vn';
const ENV_PATH = path.resolve(process.cwd(), '.env');

let TOKEN = process.env.YOUPASS_TOKEN;
const REFRESH = process.env.YOUPASS_REFRESH;

function jwtExp(jwt) {
    try {
        const [, body] = jwt.split('.');
        const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
        return decoded.exp * 1000;
    } catch { return 0; }
}

async function refreshToken() {
    if (!REFRESH) throw new Error('YOUPASS_REFRESH missing');
    const r = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: REFRESH, mode: 'json' })
    });
    if (!r.ok) throw new Error(`refresh failed: ${r.status}`);
    const j = await r.json();
    const newTok = j.data.access_token;
    TOKEN = newTok;

    // Persist to .env so subsequent runs reuse it
    try {
        const envText = await fs.readFile(ENV_PATH, 'utf8');
        const updated = envText.replace(/^YOUPASS_TOKEN=.*/m, `YOUPASS_TOKEN=${newTok}`);
        await fs.writeFile(ENV_PATH, updated);
        console.log('  [auth] refreshed + persisted token');
    } catch (e) {
        console.warn('  [auth] could not write .env:', e.message);
    }
    return newTok;
}

async function ensureToken() {
    if (!TOKEN || jwtExp(TOKEN) < Date.now() + 60_000) {
        await refreshToken();
    }
    return TOKEN;
}

function headers() {
    return {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://youpass.vn',
        'Referer': 'https://youpass.vn/'
    };
}

let _calls = 0;
const RATE_DELAY_MS = Number(process.env.YOUPASS_RATE_MS || 200);
async function rateLimit() {
    if (_calls++ > 0) await new Promise(r => setTimeout(r, RATE_DELAY_MS));
}

export async function api(path_, { retry = 1 } = {}) {
    await ensureToken();
    await rateLimit();
    const r = await fetch(`${BASE}${path_}`, { headers: headers() });
    if (r.status === 401 && retry > 0) {
        await refreshToken();
        return api(path_, { retry: retry - 1 });
    }
    if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`${r.status} ${path_} :: ${text.slice(0, 200)}`);
    }
    return r.json();
}

/** Paginated fetch. Returns all rows by walking offset until exhausted. */
export async function paginate(path_, { pageSize = 100, max = Infinity, onPage } = {}) {
    const out = [];
    const sep = path_.includes('?') ? '&' : '?';
    let offset = 0;
    while (out.length < max) {
        const limit = Math.min(pageSize, max - out.length);
        const j = await api(`${path_}${sep}limit=${limit}&offset=${offset}&meta=*`);
        const data = j?.data || [];
        out.push(...data);
        if (onPage) await onPage(data, offset, j.meta);
        if (data.length < limit) break;
        offset += data.length;
    }
    return out;
}

/** Download a Directus file. Returns { buffer, mime, size }. */
export async function downloadFile(fileId) {
    await ensureToken();
    const r = await fetch(`${BASE}/assets/${fileId}`, { headers: headers() });
    if (!r.ok) throw new Error(`asset ${fileId} → ${r.status}`);
    const buffer = Buffer.from(await r.arrayBuffer());
    return {
        buffer,
        mime: r.headers.get('content-type'),
        size: buffer.length
    };
}

export const BASE_URL = BASE;
