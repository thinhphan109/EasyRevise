// lib/ai-helpers.js — Centralized AI SDK config
// DRY: used by routes/ai-generate.js, routes/ai-tools.js, routes/grading.js, routes/submit.js
const { readSettings } = require('./data');

const CUSTOM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

/**
 * Get AI configuration from env + settings
 * @param {string} purposeModel - Override model for specific purpose (e.g. 'gradeModel', 'ocrModel')
 * @returns {{ apiKey, baseUrl, sdkType, model, CUSTOM_HEADERS }}
 */
function getAIConfig(purposeModel) {
    const settings = readSettings();
    const apiKey = process.env.CLAUDE_API_KEY;
    const baseUrl = (process.env.CLAUDE_API_URL || process.env.CLAUDE_BASE_URL || 'https://chat.trollllm.xyz').replace(/\/+$/, '');
    const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
    const model = purposeModel || settings.generateModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
    return { apiKey, baseUrl, sdkType, model, CUSTOM_HEADERS };
}

/**
 * Create AI client based on SDK type
 * @param {object} config - from getAIConfig()
 * @param {object} opts - optional overrides { timeout }
 * @returns {object} - OpenAI or Anthropic client instance
 */
function createClient(config, opts = {}) {
    const timeout = opts.timeout || 60000;
    if (config.sdkType === 'openai') {
        const OpenAI = require('openai');
        return new OpenAI({
            baseURL: `${config.baseUrl}/v1`,
            apiKey: config.apiKey,
            timeout,
            defaultHeaders: CUSTOM_HEADERS
        });
    } else {
        const Anthropic = require('@anthropic-ai/sdk');
        return new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
            timeout,
            defaultHeaders: CUSTOM_HEADERS
        });
    }
}

/**
 * Parse JSON from AI response text (handles ```json``` fences)
 * @param {string} text - Raw AI response
 * @returns {object} - Parsed JSON object
 */
function parseJSONResponse(text) {
    let jsonStr = text;
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    const jStart = jsonStr.indexOf('{'), jEnd = jsonStr.lastIndexOf('}');
    if (jStart !== -1 && jEnd !== -1) jsonStr = jsonStr.substring(jStart, jEnd + 1);
    return JSON.parse(jsonStr);
}

/**
 * Call AI and get text response (handles both SDKs)
 * @param {object} config - from getAIConfig()
 * @param {object} client - from createClient()
 * @param {Array} messages - [{ role, content }]
 * @param {object} opts - { max_tokens, system, stream }
 * @returns {string} - AI response text
 */
async function callAI(config, client, messages, opts = {}) {
    const max_tokens = opts.max_tokens || 4096;

    if (config.sdkType === 'openai') {
        const msgList = [];
        if (opts.system) msgList.push({ role: 'system', content: opts.system });
        for (const m of messages) {
            // Convert Anthropic image format to OpenAI format
            if (Array.isArray(m.content)) {
                const converted = m.content.map(p => {
                    if (p.type === 'image') {
                        return { type: 'image_url', image_url: { url: `data:${p.source.media_type};base64,${p.source.data}` } };
                    }
                    return p;
                });
                msgList.push({ role: m.role, content: converted });
            } else {
                msgList.push(m);
            }
        }
        const completion = await client.chat.completions.create({
            model: config.model, max_tokens, messages: msgList
        });
        return completion.choices?.[0]?.message?.content || '';
    } else {
        if (opts.stream) {
            const stream = client.messages.stream({
                model: config.model, max_tokens,
                system: opts.system,
                messages
            });
            const finalMessage = await stream.finalMessage();
            return finalMessage.content?.[0]?.text || '';
        } else {
            const msg = await client.messages.create({
                model: config.model, max_tokens,
                system: opts.system,
                messages
            });
            return msg.content?.[0]?.text || '';
        }
    }
}

module.exports = { getAIConfig, createClient, parseJSONResponse, callAI, CUSTOM_HEADERS };
