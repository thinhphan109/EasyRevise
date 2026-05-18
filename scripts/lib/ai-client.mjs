// scripts/lib/ai-client.mjs
// Thin wrapper around the OpenAI-compatible chat completions API hosted
// at process.env.AI_BASE_URL. Used by repair scripts to generate IELTS
// content (options pools, distractors, stems) for questions where the
// upstream youpass data is too sparse to recover.
//
// Defaults to non-streaming + JSON-mode for deterministic parsing.

const BASE = process.env.AI_BASE_URL || 'https://9router.thinhme.tech/v1';
const KEY  = process.env.AI_API_KEY || process.env.CLAUDE_API_KEY || process.env.API_KEY_FIXED;
const MODEL = process.env.AI_MODEL || 'Claude-Opus';

if (!KEY) throw new Error('AI_API_KEY not set');

export async function chat(messages, {
    model = MODEL,
    temperature = 0.2,
    maxTokens = 1024,
    json = false,
    retries = 2,
    timeoutMs = 60_000
} = {}) {
    const body = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        ...(json ? { response_format: { type: 'json_object' } } : {})
    };

    let lastErr;
    for (let i = 0; i <= retries; i++) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const r = await fetch(`${BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${KEY}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body),
                signal: ctrl.signal
            });
            clearTimeout(t);

            if (!r.ok) {
                const txt = await r.text();
                throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
            }

            // Some proxies send SSE even when stream:false. Detect & coalesce.
            const ct = r.headers.get('content-type') || '';
            if (ct.includes('text/event-stream') || ct.includes('stream')) {
                const text = await r.text();
                let out = '';
                for (const line of text.split('\n')) {
                    if (!line.startsWith('data:')) continue;
                    const data = line.slice(5).trim();
                    if (!data || data === '[DONE]') continue;
                    try {
                        const j = JSON.parse(data);
                        const piece = j.choices?.[0]?.delta?.content
                                   ?? j.choices?.[0]?.message?.content
                                   ?? '';
                        out += piece;
                    } catch { /* ignore malformed chunks */ }
                }
                return out.trim();
            }

            const j = await r.json();
            return j.choices?.[0]?.message?.content?.trim() || '';
        } catch (e) {
            clearTimeout(t);
            lastErr = e;
            if (i < retries) {
                await new Promise(res => setTimeout(res, 1000 * (i + 1)));
                continue;
            }
        }
    }
    throw lastErr;
}

// Helper: ask for JSON, retry once if not parseable
export async function chatJson(messages, opts = {}) {
    const out = await chat(messages, { json: true, ...opts });
    // Try a few cleanup strategies
    const candidates = [
        out,
        // Strip code fences
        out.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim(),
        // Extract first balanced {...}
        (() => {
            const start = out.indexOf('{');
            if (start < 0) return null;
            let depth = 0, end = -1;
            for (let i = start; i < out.length; i++) {
                if (out[i] === '{') depth++;
                else if (out[i] === '}' && --depth === 0) { end = i; break; }
            }
            return end > start ? out.slice(start, end + 1) : null;
        })()
    ].filter(Boolean);

    for (const c of candidates) {
        try { return JSON.parse(c); } catch { /* try next */ }
    }
    throw new Error(`Bad JSON from AI: ${out.slice(0, 200)}`);
}
