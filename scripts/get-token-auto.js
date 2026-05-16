require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3333; // Đã đổi sang 3333
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'select_account consent'
});

const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/callback')) {
        const q = url.parse(req.url, true).query;
        if (q.code) {
            try {
                const { tokens } = await oauth2Client.getToken(q.code);
                console.log('\n✅ Lấy token thành công!');
                
                // Cập nhật .env
                const envPath = path.join(__dirname, '..', '.env');
                let envContent = fs.readFileSync(envPath, 'utf8');
                
                if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                    envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
                } else {
                    envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
                }
                
                fs.writeFileSync(envPath, envContent);
                console.log('📝 Đã tự động cập nhật GOOGLE_REFRESH_TOKEN vào file .env');
                
                res.end('<h1>Thanh cong!</h1><p>Ban co the dong trinh duyet va quay lai terminal.</p>');
                
                console.log('\n--- XONG! ---');
                console.log('Hay khoi dong lai server de ap dung thay doi.');
                process.exit(0);
            } catch (e) {
                res.end('Loi: ' + e.message);
                process.exit(1);
            }
        }
    }
}).listen(PORT, () => {
    console.log('\n--- TU DONG LAY TOKEN ---');
    console.log('Dang mo trinh duyet...');
    // Mo trinh duyet tu dong (Windows)
    exec(`start "" "${authUrl}"`);
    console.log('Neu trinh duyet khong tu mo, hay copy link nay va dan vao trinh duyet:');
    console.log(authUrl);
});
