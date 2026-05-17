// scripts/drive-status.mjs — diagnose Drive auth + quota
import 'dotenv/config';
import drive from '../lib/drive.js';

console.log('\n═══ Google Drive Status ═══\n');
console.log(`STORAGE_MODE:     ${process.env.STORAGE_MODE || '(unset → Drive disabled)'}`);
console.log(`GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? '<set>' : '(missing)'}`);
console.log(`CLIENT_SECRET:    ${process.env.GOOGLE_CLIENT_SECRET ? '<set>' : '(missing)'}`);
console.log(`REFRESH_TOKEN:    ${process.env.GOOGLE_REFRESH_TOKEN ? '<set>' : '(missing)'}`);
console.log(`DRIVE_ROOT:       ${process.env.DRIVE_ROOT_FOLDER_ID || '(unset)'}\n`);

const client = drive.getDrive();
if (!client) {
    console.log('✗ Drive not initialized.');
    console.log('  Run: node scripts/refresh-google-token.js\n');
    process.exit(1);
}

try {
    const info = await drive.getDriveQuota();
    console.log('✓ Drive working');
    if (info?.user) {
        console.log(`  Account:  ${info.user.emailAddress}`);
        console.log(`  Display:  ${info.user.displayName}`);
    }
    if (info?.usage) {
        const used = Number(info.usage);
        const limit = Number(info.limit);
        const pct = limit ? ((used / limit) * 100).toFixed(1) : '?';
        console.log(`  Storage:  ${(used / 1e9).toFixed(2)} GB / ${(limit / 1e9).toFixed(0)} GB (${pct}%)`);
    }
    console.log();
} catch (e) {
    console.error(`✗ Drive auth failed: ${e.message}`);
    if (/invalid_grant/.test(e.message)) {
        console.log('\n  Refresh token has been revoked or expired. Run:');
        console.log('  node scripts/refresh-google-token.js\n');
    }
    process.exit(1);
}
