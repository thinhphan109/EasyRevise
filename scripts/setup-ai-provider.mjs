// scripts/setup-ai-provider.mjs — register the loadip provider profile
import 'dotenv/config';
import pg from 'pg';
const p = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL_TX, ssl: { rejectUnauthorized: false } });

const provider = {
    id: 'loadip-claude',
    name: 'LoadIP Claude',
    baseUrl: process.env.BASE_URL || 'https://api.loadip.com/v1',
    apiKey: process.env.API_KEY_FIXED || process.env.CLAUDE_API_KEY,
    defaultModel: 'claude_sonet_4.5',
    sdkType: 'openai',
    models: 'claude_sonet_4.5'
};

async function setKey(key, val) {
    await p.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(val)]
    );
    console.log(`  set ${key}`);
}

await setKey('aiProviders', [provider]);
await setKey('aiActiveProviderId', provider.id);
await setKey('aiDefaultModel', provider.defaultModel);
await setKey('aiBaseUrl', provider.baseUrl);
await setKey('aiApiKey', provider.apiKey);
await setKey('aiSdkType', 'openai');
await setKey('generateModel', provider.defaultModel);

console.log('\n✓ AI provider configured');

// Verify
const r = await p.query(`SELECT key, value FROM settings WHERE key LIKE 'ai%' OR key = 'generateModel'`);
console.log('\nCurrent settings:');
r.rows.forEach(row => console.log(`  ${row.key} = ${String(row.value).slice(0, 80)}`));

await p.end();
