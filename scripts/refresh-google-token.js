/**
 * scripts/refresh-google-token.js — refresh GOOGLE_REFRESH_TOKEN
 *
 * The ONLY OAuth tool in this project. Uses port 3333 with redirect
 * http://localhost:3333/callback (already registered in Google Console).
 *
 * Usage:
 *   node scripts/refresh-google-token.js               # auto (browser)
 *   node scripts/refresh-google-token.js --playground  # use oauthplayground
 *
 * Modes:
 *   1. Auto: opens browser → redirect to localhost:3333 → captures code
 *   2. Playground: prints URL for https://developers.google.com/oauthplayground
 *      You paste the auth code back into the terminal.
 *
 * Required redirect URIs in Google Cloud Console (Credentials → OAuth 2.0):
 *   - http://localhost:3333/callback                       (auto mode)
 *   - https://developers.google.com/oauthplayground        (playground fallback)
 */
require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { exec } = require('child_process');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
    process.exit(1);
}

// Full Drive scope is needed because the app uploads files (audio mirror)
// + reads files + manages folders. Bigger scope = same refresh token works
// for everything the app does.
const SCOPES = [
    'https://www.googleapis.com/auth/drive'
];

const usePlayground = process.argv.includes('--playground');
const REDIRECT_URI = usePlayground
    ? 'https://developers.google.com/oauthplayground'
    : 'http://localhost:3333/callback';

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'  // force re-issuing of refresh_token
});

async function persist(tokens) {
    if (!tokens.refresh_token) {
        console.error('\n❌ No refresh_token returned. Try revoking previous access at:');
        console.error('   https://myaccount.google.com/permissions');
        console.error('   then re-run this script.');
        process.exit(1);
    }

    const envPath = path.join(__dirname, '..', '.env');
    let envText = fs.readFileSync(envPath, 'utf8');
    if (envText.match(/^GOOGLE_REFRESH_TOKEN=.*/m)) {
        envText = envText.replace(/^GOOGLE_REFRESH_TOKEN=.*/m, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    } else {
        envText += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
    }
    fs.writeFileSync(envPath, envText);

    // Verify by hitting Drive API
    try {
        const drive = google.drive({ version: 'v3', auth: oauth2 });
        oauth2.setCredentials(tokens);
        const about = await drive.about.get({ fields: 'user,storageQuota' });
        const u = about.data.user;
        const q = about.data.storageQuota || {};
        console.log('\n✓ Token saved to .env');
        console.log(`  Account:  ${u?.emailAddress}`);
        console.log(`  Storage:  ${(Number(q.usage || 0) / 1e9).toFixed(2)} GB / ${(Number(q.limit || 0) / 1e9).toFixed(0)} GB`);
        console.log('\n✓ Restart the server to pick up the new token.\n');
    } catch (e) {
        console.warn('\n⚠ Token saved but verification call failed:', e.message);
    }
}

if (usePlayground) {
    // ── Manual: user pastes the code ─────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║  GOOGLE OAUTH (playground mode)                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
    console.log('1. Mở link sau trong trình duyệt:\n');
    console.log('   ' + authUrl + '\n');
    console.log('2. Login + click Allow.');
    console.log('3. Bạn sẽ được redirect tới developers.google.com/oauthplayground.');
    console.log('   Ở đó, nhìn URL — copy phần `code=...` (chỉ phần code, decode URL nếu cần).');
    console.log('4. Paste code vào đây:\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('   Authorization code: ', async code => {
        rl.close();
        try {
            const { tokens } = await oauth2.getToken(code.trim());
            await persist(tokens);
            process.exit(0);
        } catch (e) {
            console.error('\n❌ Token exchange failed:', e.response?.data || e.message);
            process.exit(1);
        }
    });
} else {
    // ── Auto: spin up local HTTP server ──────────────────────────────
    const server = http.createServer(async (req, res) => {
        if (!req.url.startsWith('/callback')) {
            res.writeHead(404).end('Not found');
            return;
        }
        const q = url.parse(req.url, true).query;
        if (q.error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>OAuth error: ${q.error}</h1>`);
            console.error('\n❌ User denied:', q.error);
            server.close();
            process.exit(1);
        }
        if (!q.code) {
            res.writeHead(400).end('Missing code');
            return;
        }
        try {
            const { tokens } = await oauth2.getToken(q.code);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html><body style="font-family:system-ui;max-width:600px;margin:3rem auto;padding:2rem;">
                    <h1 style="color:#16a34a;">✓ Thành công</h1>
                    <p>Refresh token đã được lưu vào <code>.env</code>.</p>
                    <p>Bạn có thể đóng tab này.</p>
                </body></html>
            `);
            await persist(tokens);
            server.close();
            process.exit(0);
        } catch (e) {
            res.writeHead(500).end('Error: ' + e.message);
            console.error('\n❌', e.response?.data || e.message);
            server.close();
            process.exit(1);
        }
    });

    server.listen(3333, 'localhost', () => {
        console.log('\n╔══════════════════════════════════════════════════════════════════╗');
        console.log('║  GOOGLE OAUTH REFRESH (auto)                                     ║');
        console.log('╚══════════════════════════════════════════════════════════════════╝\n');
        console.log('Listening on http://localhost:3333/callback');
        console.log('Opening browser...\n');
        console.log('If browser does not open, paste this URL manually:');
        console.log('   ' + authUrl + '\n');
        exec(`start "" "${authUrl}"`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error('\n❌ Port 3333 is already in use.');
            console.error('   Stop other instances or run with: --playground');
        } else {
            console.error('\n❌', err.message);
        }
        process.exit(1);
    });
}
