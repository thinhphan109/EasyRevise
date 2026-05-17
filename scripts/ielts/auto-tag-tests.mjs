/**
 * scripts/ielts/auto-tag-tests.mjs
 *
 * One-shot taxonomy inference: parse `ielts_tests.title` and fill in
 * category / year / tags for legacy rows. Idempotent — only updates
 * fields that are currently NULL.
 *
 * Run:
 *   node scripts/ielts/auto-tag-tests.mjs --dry    # preview
 *   node scripts/ielts/auto-tag-tests.mjs          # apply
 */
import 'dotenv/config';
import pg from 'pg';

const dry = process.argv.includes('--dry');

const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL_TX || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }, max: 5
});

const stats = { scanned: 0, tagged: 0, byCategory: {}, byYear: {} };

// ── Title-pattern → taxonomy rules ────────────────────────────────
function inferTaxonomy(title) {
    const t = String(title || '').trim();
    const out = { category: null, topic: null, level: null, year: null, tags: [] };
    if (!t) return out;

    const tags = new Set();

    // [C14T1] / [C20T2] / [C7T1]  (Cambridge book + test number)
    const camMatch = t.match(/\[C(\d{1,2})T(\d)\]/i);
    if (camMatch) {
        out.category = 'cambridge';
        const book = Number(camMatch[1]);
        tags.add(`cambridge${book}`);
        tags.add(`test${camMatch[2]}`);
        // Cambridge book → publication year heuristic (rough)
        // C18 ≈ 2023, C17 ≈ 2022, …, C14 ≈ 2019, C13 ≈ 2018
        if (book >= 4 && book <= 25) out.year = 2005 + (book - 4);
    }

    // [Trainer]
    if (/\[Trainer\]/i.test(t))           { out.category = out.category || 'trainer';           tags.add('trainer'); }
    // [Actual Test]
    if (/\[Actual Test\]/i.test(t))       { out.category = out.category || 'actual-test';       tags.add('actual-test'); }
    // [Practice Tests Plus]
    if (/\[Practice Tests Plus\]/i.test(t)) { out.category = out.category || 'practice-tests-plus'; tags.add('ptp'); }
    // [Other sources]
    if (/\[Other sources?\]/i.test(t))    { out.category = out.category || 'other'; }
    // [YouPass Collect]
    if (/\[YouPass Collect\]/i.test(t))   { out.category = out.category || 'youpass-collect';   tags.add('youpass-collect'); }

    // [Forecast Quý X-YYYY] or [Forecast TM-TN/YYYY]
    const fcMatch = t.match(/\[Forecast[^\]]*?(\d{4})\]/i);
    if (fcMatch) {
        out.category = out.category || 'forecast';
        out.year = out.year || Number(fcMatch[1]);
        tags.add('forecast');
    }

    // [DD/MM/YYYY] — explicit exam date
    const dateMatch = t.match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    if (dateMatch) {
        out.year = out.year || Number(dateMatch[3]);
        tags.add('exam-' + dateMatch[3]);
    }

    // VOL N Test M (legacy collection)
    const volMatch = t.match(/VOL\s*(\d+)\s+Test\s*(\d+)/i);
    if (volMatch) {
        out.category = out.category || 'volume';
        tags.add(`vol${volMatch[1]}`);
        tags.add(`test${volMatch[2]}`);
    }

    // Orange N Listening - Test M (Orange book series)
    const orMatch = t.match(/Orange\s*(\d+)/i);
    if (orMatch) {
        out.category = out.category || 'orange';
        tags.add(`orange${orMatch[1]}`);
    }

    // Root W5 Listening N (course material)
    const rootMatch = t.match(/Root\s+W(\d+)/i);
    if (rootMatch) {
        out.category = out.category || 'root';
        tags.add(`week${rootMatch[1]}`);
    }

    // Bare year in title
    const yMatch = t.match(/\b(20\d{2})\b/);
    if (!out.year && yMatch) out.year = Number(yMatch[1]);

    // ── Topic keywords (very rough — best-effort) ──
    const topicMap = {
        environment: /\b(environment|pollution|climate|recycl|forest|wildlife|conservation|ocean|aluminum|solar|volcano|fuel)\b/i,
        education:   /\b(school|student|university|teach|education|class|study|exam|homework|learning|registration)\b/i,
        technology:  /\b(technology|robot|computer|internet|digital|smartphone|app|software|AI|machine|household.*technology)\b/i,
        health:      /\b(health|medic|hospital|doctor|disease|exercise|diet|nutrition|wellness|drug)\b/i,
        society:     /\b(society|government|culture|community|family|migration|crime|policy|generation)\b/i,
        travel:      /\b(travel|tourist|tourism|trip|vacation|holiday|aquarium|horizon|adventure)\b/i,
        work:        /\b(work|career|job|employee|workplace|management|business|company|office)\b/i,
        food:        /\b(food|cookery|cuisine|cooking|recipe|packaging|drink|restaurant)\b/i,
        history:     /\b(history|ancient|medieval|war|empire|civilization|historic|century|castle)\b/i
    };
    for (const [topic, re] of Object.entries(topicMap)) {
        if (re.test(t)) { out.topic = topic; break; }
    }

    out.tags = [...tags];
    return out;
}

async function run() {
    const { rows } = await pool.query(
        `SELECT id, title, category, topic, year, tags
           FROM ielts_tests`
    );
    stats.scanned = rows.length;

    for (const r of rows) {
        const inferred = inferTaxonomy(r.title);

        // Only fill nulls — don't overwrite admin choices.
        const updates = {};
        if (!r.category && inferred.category) updates.category = inferred.category;
        if (!r.topic    && inferred.topic)    updates.topic    = inferred.topic;
        if (!r.year     && inferred.year)     updates.year     = inferred.year;

        // Merge tags (existing ∪ inferred), preserve existing.
        const existing = Array.isArray(r.tags) ? r.tags : [];
        const merged = Array.from(new Set([...existing, ...inferred.tags]));
        if (merged.length > existing.length) updates.tags = merged;

        if (!Object.keys(updates).length) continue;
        stats.tagged++;
        if (updates.category) stats.byCategory[updates.category] = (stats.byCategory[updates.category] || 0) + 1;
        if (updates.year)     stats.byYear[updates.year]         = (stats.byYear[updates.year]     || 0) + 1;

        if (dry) continue;

        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(updates)) {
            params.push(k === 'tags' ? JSON.stringify(v) : v);
            sets.push(`${k} = $${params.length}${k === 'tags' ? '::jsonb' : ''}`);
        }
        params.push(r.id);
        await pool.query(
            `UPDATE ielts_tests SET ${sets.join(', ')} WHERE id = $${params.length}`,
            params
        );
    }
}

console.log(`▶ ielts auto-tag-tests ${dry ? '(DRY-RUN)' : ''}`);
await run();
console.log('\n── Result ──');
console.log(JSON.stringify(stats, null, 2));
await pool.end();
