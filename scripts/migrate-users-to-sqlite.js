// scripts/migrate-users-to-sqlite.js
// Sprint 3 Phase A: Migrate users.json → SQLite users table.
// Safe to re-run (idempotent — skips existing users by ID).
//
// Usage: node scripts/migrate-users-to-sqlite.js
//
// Prerequisites:
//   - npm install sql.js pino (already done)
//   - data/users.json exists with user data
//
// After running:
//   - data/easyrevise.db will contain users + user_history tables populated
//   - users.json is NOT deleted (kept as backup)
//   - Routes can be switched to use userRepo instead of readUsers/writeUsers

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), override: true });

async function main() {
    console.log('=== Migrate users.json → SQLite ===\n');

    // 1. Init SQLite
    const { initDb, getDb, saveDb, closeDb } = require('../lib/db');
    await initDb();
    const db = getDb();

    // 2. Read users.json
    const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
    if (!fs.existsSync(USERS_FILE)) {
        console.log('No users.json found. Nothing to migrate.');
        closeDb();
        return;
    }
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const users = usersData.users || [];
    console.log(`Found ${users.length} users in users.json`);

    // 3. Insert users
    let inserted = 0, skipped = 0, historyCount = 0;

    db.run('BEGIN TRANSACTION');
    for (const u of users) {
        // Check if already exists
        const existing = db.exec(`SELECT id FROM users WHERE id = '${u.id.replace(/'/g, "''")}'`);
        if (existing.length > 0 && existing[0].values.length > 0) {
            skipped++;
            continue;
        }

        const now = u.createdAt || new Date().toISOString();
        const stmt = db.prepare(
            `INSERT INTO users (id, username, password_hash, display_name, role, requires_password_reset, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        stmt.run([
            u.id,
            u.username || u.name || 'unknown',
            u.passwordHash || 'EXPIRED',
            u.displayName || u.username || u.name || 'Unknown',
            u.role || 'student',
            u.requiresPasswordReset ? 1 : 0,
            now,
            now
        ]);
        stmt.free();
        inserted++;

        // Migrate history
        if (Array.isArray(u.history) && u.history.length > 0) {
            const histStmt = db.prepare(
                'INSERT INTO user_history (user_id, payload, created_at) VALUES (?, ?, ?)'
            );
            for (const h of u.history) {
                histStmt.run([
                    u.id,
                    JSON.stringify(h),
                    h.completedAt || h.date || now
                ]);
                historyCount++;
            }
            histStmt.free();
        }
    }
    db.run('COMMIT');
    saveDb();

    // 4. Verify
    const countResult = db.exec('SELECT COUNT(*) as cnt FROM users');
    const totalInDb = countResult[0]?.values[0]?.[0] || 0;
    const histResult = db.exec('SELECT COUNT(*) as cnt FROM user_history');
    const totalHist = histResult[0]?.values[0]?.[0] || 0;

    console.log(`\nMigration complete:`);
    console.log(`  Inserted:  ${inserted}`);
    console.log(`  Skipped:   ${skipped} (already in DB)`);
    console.log(`  History:   ${historyCount} entries`);
    console.log(`  Total in DB: ${totalInDb} users, ${totalHist} history entries`);
    console.log(`\nusers.json kept as backup. Routes can now switch to userRepo.`);

    closeDb();
}

main().catch(e => {
    console.error('Migration failed:', e.message);
    console.error(e.stack);
    process.exit(1);
});
