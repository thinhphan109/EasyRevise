/**
 * SCRIPT LẤY GOOGLE REFRESH TOKEN
 * ------------------------------
 * Cách dùng:
 * 1. Đảm bảo .env đã có GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET
 * 2. Chạy lệnh: node scripts/get-drive-token.js
 * 3. Mở link hiện ra, đăng nhập Google, cho phép các quyền.
 * 4. Copy mã code dán lại vào terminal.
 */
require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Dùng cho app terminal

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ LỖI: Thiếu GOOGLE_CLIENT_ID hoặc GOOGLE_CLIENT_SECRET trong file .env');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Các quyền cần thiết cho Kho Media
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', 
    scope: SCOPES,
    prompt: 'select_account consent' // Thêm select_account để chọn acc 2
});

console.log('\n--- BƯỚC 1: CẤP QUYỀN ---');
console.log('1. Mở link dưới đây trên trình duyệt của bạn:');
console.log('\x1b[36m%s\x1b[0m', authUrl);
console.log('\n2. Sau khi bấm "Cho phép" (Allow), bạn sẽ nhận được một mã (code).');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question('3. Dán mã code bạn nhận được vào đây: ', (code) => {
    rl.close();
    oauth2Client.getToken(code, (err, token) => {
        if (err) {
            console.error('❌ LỖI khi lấy Token:', err.response ? err.response.data : err.message);
            return;
        }
        console.log('\n--- BƯỚC 2: KẾT QUẢ ---');
        console.log('Chúc mừng! Bạn đã lấy được mã thành công.');
        console.log('\nHãy cập nhật file .env với giá trị dưới đây:');
        console.log('\x1b[32m%s\x1b[0m', `GOOGLE_REFRESH_TOKEN=${token.refresh_token}`);
        console.log('\nSau đó hãy khởi động lại server (Restart server).');
    });
});
