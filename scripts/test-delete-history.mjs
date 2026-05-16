// Test DELETE /api/history endpoint flow
import fs from 'node:fs';

const HOST = 'http://localhost:3000';
const usersData = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
const student = usersData.users.find(u => u.role !== 'admin' && Array.isArray(u.history) && u.history.length);

if (!student) { console.log('No user with history found'); process.exit(1); }
console.log('Testing with user:', student.username, '- history len:', student.history.length);

const token = student.token;
const auth = { Authorization: `Bearer ${token}` };

// 1. GET history
let res = await fetch(`${HOST}/api/history`, { headers: auth });
let history = await res.json();
console.log('GET history:', res.status, '- entries:', history.length);
if (history.length === 0) { console.log('No history to test delete on'); process.exit(0); }

const first = history[0];
console.log('First entry:', { examId: first.examId, completedAt: first.completedAt });

// 2. DELETE specific entry
const url = `${HOST}/api/history/${encodeURIComponent(first.examId)}?completedAt=${encodeURIComponent(first.completedAt)}`;
res = await fetch(url, { method: 'DELETE', headers: auth });
const delResult = await res.json();
console.log('DELETE result:', res.status, delResult);

// 3. GET again to confirm
res = await fetch(`${HOST}/api/history`, { headers: auth });
history = await res.json();
console.log('After delete - entries:', history.length);

// Restore: write back the entry to keep test idempotent
const data = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
const u = data.users.find(uu => uu.id === student.id);
if (u) {
    u.history = u.history || [];
    u.history.unshift(first);
    fs.writeFileSync('./data/users.json', JSON.stringify(data, null, 2));
    console.log('Restored test entry');
}
