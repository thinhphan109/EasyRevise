// scripts/probe-whisper.mjs — try several models against the provider
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });
const r = await pool.query(`SELECT value FROM settings WHERE key = 'aiProviders'`);
await pool.end();
const v = r.rows[0].value;
const parsed = (typeof v === 'string') ? JSON.parse(v) : v;
const provider = Array.isArray(parsed) ? parsed[0] : parsed;
const baseUrl = provider.baseUrl.replace(/\/+$/, '');
const apiKey = provider.apiKey;

console.log(`Probing: ${baseUrl}\n`);

// Build a tiny WAV (440Hz, 1s mono)
function makeSineWav() {
    const sr = 16000, n = sr;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n*2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr*2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n*2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.sin(2*Math.PI*440*i/sr) * 0x6000, 44 + i*2);
    return buf;
}

// 1) GET /models — see what's available
console.log('1. GET /models');
try {
    const m = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    console.log(`   HTTP ${m.status}`);
    if (m.ok) {
        const j = await m.json();
        const models = (j.data || j.models || []).map(x => x.id || x.name || x).slice(0, 50);
        console.log(`   ${models.length} models. Sample:`);
        models.slice(0, 30).forEach(id => console.log(`     - ${id}`));
        const audio = models.filter(id => /whisper|audio|stt|transcrib/i.test(id));
        if (audio.length) {
            console.log(`\n   ✓ Audio-related: ${audio.join(', ')}`);
        } else {
            console.log(`\n   ✗ No audio/whisper model found`);
        }
    } else {
        console.log(`   Body: ${(await m.text()).slice(0, 200)}`);
    }
} catch (e) { console.log(`   error: ${e.message}`); }

// 2) Try transcription with a few model names
const wav = makeSineWav();
const modelsToTry = ['whisper-1', 'whisper-large-v3', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'];

for (const model of modelsToTry) {
    console.log(`\n2. POST /audio/transcriptions  model=${model}`);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
    form.append('model', model);
    form.append('language', 'en');
    try {
        const r = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form
        });
        const txt = await r.text();
        console.log(`   HTTP ${r.status}: ${txt.slice(0, 200)}`);
    } catch (e) { console.log(`   error: ${e.message}`); }
}
