/**
 * scripts/ielts/decode-existing-data.mjs
 *
 * One-shot data hygiene:
 *   • decode HTML entities (incl. double-encoded) in existing rows of
 *     ielts_passages, ielts_questions, ielts_writing_prompts,
 *     ielts_speaking_parts.
 *   • drop ielts_questions rows whose prompt is null/empty/whitespace
 *     after decoding — these are the "Question 5/6/7…" placeholders.
 *
 * Idempotent. Re-running on already-clean data is a no-op.
 *
 * Usage:
 *   node scripts/ielts/decode-existing-data.mjs           # apply
 *   node scripts/ielts/decode-existing-data.mjs --dry     # report only
 */
import 'dotenv/config';
import pg from 'pg';
import he from 'he';

const dry = process.argv.includes('--dry');

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }, max: 5
});

const stats = {
    passages: { scanned: 0, updated: 0 },
    questions: { scanned: 0, updated: 0, deleted: 0 },
    writing: { scanned: 0, updated: 0 },
    speaking: { scanned: 0, updated: 0 }
};

function decodeText(s) {
    if (s == null) return s;
    let str = String(s);
    for (let i = 0; i < 3; i++) {
        const next = he.decode(str);
        if (next === str) break;
        str = next;
    }
    return str;
}
function decodeKeepBreaks(s) {
    if (s == null) return s;
    let str = String(s);
    for (let i = 0; i < 3; i++) {
        const next = he.decode(str);
        if (next === str) break;
        str = next;
    }
    return str
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
function decodeDeep(obj) {
    if (obj == null) return obj;
    if (typeof obj === 'string') return decodeText(obj);
    if (Array.isArray(obj)) return obj.map(decodeDeep);
    if (typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) out[k] = decodeDeep(v);
        return out;
    }
    return obj;
}

async function decodePassages() {
    const { rows } = await pool.query(
        `SELECT id, title, body FROM ielts_passages`
    );
    stats.passages.scanned = rows.length;
    for (const r of rows) {
        const newTitle = decodeText(r.title);
        const newBody = decodeKeepBreaks(r.body);
        if (newTitle !== r.title || newBody !== r.body) {
            stats.passages.updated++;
            if (!dry) {
                await pool.query(
                    `UPDATE ielts_passages SET title = $1, body = $2 WHERE id = $3`,
                    [newTitle, newBody, r.id]
                );
            }
        }
    }
}

async function decodeQuestionsAndDropEmpty() {
    const { rows } = await pool.query(
        `SELECT id, prompt, payload, explanation FROM ielts_questions`
    );
    stats.questions.scanned = rows.length;
    for (const r of rows) {
        const newPrompt = decodeText(r.prompt);
        const newPayload = decodeDeep(r.payload || {});
        const newExpl = decodeText(r.explanation);

        // Drop empty/garbage prompts — these surfaced as "Question 5/6/7…"
        const isEmpty = !newPrompt || !newPrompt.trim();
        if (isEmpty) {
            stats.questions.deleted++;
            if (!dry) {
                await pool.query(`DELETE FROM ielts_questions WHERE id = $1`, [r.id]);
            }
            continue;
        }

        const payloadChanged = JSON.stringify(newPayload) !== JSON.stringify(r.payload || {});
        if (newPrompt !== r.prompt || payloadChanged || newExpl !== r.explanation) {
            stats.questions.updated++;
            if (!dry) {
                await pool.query(
                    `UPDATE ielts_questions
                        SET prompt = $1, payload = $2::jsonb, explanation = $3
                      WHERE id = $4`,
                    [newPrompt, JSON.stringify(newPayload), newExpl, r.id]
                );
            }
        }
    }
}

async function decodeWriting() {
    const { rows } = await pool.query(
        `SELECT id, instruction, prompt_text, sample_answers, metadata
           FROM ielts_writing_prompts`
    );
    stats.writing.scanned = rows.length;
    for (const r of rows) {
        const newInstr = decodeText(r.instruction);
        const newPrompt = decodeKeepBreaks(r.prompt_text);
        const newSamples = decodeDeep(r.sample_answers || []);
        const newMeta = decodeDeep(r.metadata || {});

        const samplesChanged = JSON.stringify(newSamples) !== JSON.stringify(r.sample_answers || []);
        const metaChanged = JSON.stringify(newMeta) !== JSON.stringify(r.metadata || {});
        if (newInstr !== r.instruction || newPrompt !== r.prompt_text || samplesChanged || metaChanged) {
            stats.writing.updated++;
            if (!dry) {
                await pool.query(
                    `UPDATE ielts_writing_prompts
                        SET instruction = $1, prompt_text = $2,
                            sample_answers = $3::jsonb, metadata = $4::jsonb
                      WHERE id = $5`,
                    [newInstr, newPrompt,
                     JSON.stringify(newSamples), JSON.stringify(newMeta), r.id]
                );
            }
        }
    }
}

async function decodeSpeaking() {
    const { rows } = await pool.query(
        `SELECT id, title, instruction, prompts, cue_card_text, sample_answers
           FROM ielts_speaking_parts`
    );
    stats.speaking.scanned = rows.length;
    for (const r of rows) {
        const newTitle = decodeText(r.title);
        const newInstr = decodeText(r.instruction);
        const newPrompts = decodeDeep(r.prompts || []);
        const newCue = decodeText(r.cue_card_text);
        const newSamples = decodeDeep(r.sample_answers || []);

        const promptsChanged = JSON.stringify(newPrompts) !== JSON.stringify(r.prompts || []);
        const samplesChanged = JSON.stringify(newSamples) !== JSON.stringify(r.sample_answers || []);
        if (newTitle !== r.title || newInstr !== r.instruction
            || promptsChanged || newCue !== r.cue_card_text || samplesChanged) {
            stats.speaking.updated++;
            if (!dry) {
                await pool.query(
                    `UPDATE ielts_speaking_parts
                        SET title = $1, instruction = $2,
                            prompts = $3::jsonb, cue_card_text = $4,
                            sample_answers = $5::jsonb
                      WHERE id = $6`,
                    [newTitle, newInstr,
                     JSON.stringify(newPrompts), newCue,
                     JSON.stringify(newSamples), r.id]
                );
            }
        }
    }
}

console.log(`▶ ielts decode-existing-data ${dry ? '(DRY-RUN)' : ''}`);
await decodePassages();
await decodeQuestionsAndDropEmpty();
await decodeWriting();
await decodeSpeaking();
console.log('\n── Result ──');
console.log(JSON.stringify(stats, null, 2));
await pool.end();
