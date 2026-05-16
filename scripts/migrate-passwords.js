// scripts/migrate-passwords.js
// H7: Force-expire all simpleHash passwords. After running, those users must reset password via admin.
//
// Usage: node scripts/migrate-passwords.js
// Safe to re-run (idempotent).
//
// Workflow:
//   1. Sprint 2: Deploy với DROP_SIMPLEHASH=false → auto-upgrade khi user login
//   2. Sau 30 ngày: chạy script này → các user chưa login bị mark EXPIRED → admin reset password
//   3. Set DROP_SIMPLEHASH=true → reject mọi simpleHash leftover

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { readUsers, writeUsers } = require('../lib/data');

const data = readUsers();
let migrated = 0;
let already = 0;
let total = data.users.length;

for (const u of data.users) {
    if (!u.passwordHash) {
        console.warn(`[skip] User ${u.username} (${u.id}) has no passwordHash`);
        continue;
    }
    if (u.passwordHash === 'EXPIRED') {
        already++;
        continue;
    }
    if (!u.passwordHash.startsWith('pbkdf2:')) {
        u.passwordHash = 'EXPIRED';
        u.token = null;
        u.tokenExpiry = null;
        u.tokens = [];
        u.requiresPasswordReset = true;
        u.expiredAt = new Date().toISOString();
        migrated++;
        console.log(`[expired] ${u.username} (${u.id}) — admin must reset password`);
    }
}

writeUsers(data);
console.log(`\nMigration done.`);
console.log(`  Total users:      ${total}`);
console.log(`  Newly expired:    ${migrated}`);
console.log(`  Already EXPIRED:  ${already}`);
console.log(`  Already pbkdf2:   ${total - migrated - already}`);
console.log(`\nNext step: ask expired users to contact admin for password reset.`);
console.log(`After 30 days, set DROP_SIMPLEHASH=true in .env to fully reject simpleHash.`);
