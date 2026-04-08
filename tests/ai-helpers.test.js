// tests/ai-helpers.test.js — Test lib/ai-helpers.js
jest.mock('../lib/data', () => ({
    readSettings: () => ({ generateModel: 'claude-sonnet-test', gradeModel: 'claude-grade-test' })
}));

describe('ai-helpers', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            CLAUDE_API_KEY: 'test-key-123',
            CLAUDE_API_URL: 'https://test.example.com/',
            CLAUDE_SDK_TYPE: 'anthropic',
            CLAUDE_MODEL: 'claude-sonnet-4'
        };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('getAIConfig returns correct env values', () => {
        const { getAIConfig } = require('../lib/ai-helpers');
        const config = getAIConfig();
        expect(config.apiKey).toBe('test-key-123');
        expect(config.baseUrl).toBe('https://test.example.com');
        expect(config.sdkType).toBe('anthropic');
        expect(config.CUSTOM_HEADERS).toBeDefined();
        expect(config.CUSTOM_HEADERS['User-Agent']).toContain('Mozilla');
    });

    test('getAIConfig uses purposeModel override', () => {
        const { getAIConfig } = require('../lib/ai-helpers');
        const config = getAIConfig('my-custom-model');
        expect(config.model).toBe('my-custom-model');
    });

    test('getAIConfig falls back to settings model', () => {
        const { getAIConfig } = require('../lib/ai-helpers');
        const config = getAIConfig();
        // Should use settings.generateModel since no purposeModel
        expect(config.model).toBe('claude-sonnet-test');
    });

    test('getAIConfig strips trailing slashes from baseUrl', () => {
        process.env.CLAUDE_API_URL = 'https://api.example.com///';
        const { getAIConfig } = require('../lib/ai-helpers');
        const config = getAIConfig();
        expect(config.baseUrl).toBe('https://api.example.com');
    });

    test('parseJSONResponse handles raw JSON', () => {
        const { parseJSONResponse } = require('../lib/ai-helpers');
        const result = parseJSONResponse('{"key": "value"}');
        expect(result).toEqual({ key: 'value' });
    });

    test('parseJSONResponse handles fenced JSON', () => {
        const { parseJSONResponse } = require('../lib/ai-helpers');
        const result = parseJSONResponse('Some text\n```json\n{"key": "value"}\n```\nMore text');
        expect(result).toEqual({ key: 'value' });
    });

    test('parseJSONResponse handles JSON with surrounding text', () => {
        const { parseJSONResponse } = require('../lib/ai-helpers');
        const result = parseJSONResponse('Here is the result: {"score": 8.5, "feedback": "Good"} end');
        expect(result).toEqual({ score: 8.5, feedback: 'Good' });
    });

    test('parseJSONResponse throws on invalid JSON', () => {
        const { parseJSONResponse } = require('../lib/ai-helpers');
        expect(() => parseJSONResponse('not json at all')).toThrow();
    });

    test('CUSTOM_HEADERS exported correctly', () => {
        const { CUSTOM_HEADERS } = require('../lib/ai-helpers');
        expect(CUSTOM_HEADERS['User-Agent']).toBeDefined();
    });
});
