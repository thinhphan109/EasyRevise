// scripts/youpass/probe-public-quizzes.mjs
import 'dotenv/config';
import { api } from './client.mjs';

console.log('─ Distribution of public quizzes by type ─');

// quiz_type = 1 (Writing Task 1?), 2, ..., 8
// Try filter is_public=true
for (const qt of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = await api(`/items/quiz?filter[is_public][_eq]=true&filter[quiz_type][_eq]=${qt}&aggregate[count]=*`);
    const n = r?.data?.[0]?.count?.id || r?.data?.[0]?.count || 0;
    console.log(`  is_public=true  quiz_type=${qt}  → ${n}`);
}

console.log('\n─ Sample 3 public quizzes per type ─');
for (const qt of [1, 7, 8]) {
    const r = await api(`/items/quiz?filter[is_public][_eq]=true&filter[quiz_type][_eq]=${qt}&fields=id,title,quiz_type,type,writing_task_type,speaking_part_type,mock_test_type,is_test,parts,questions&limit=3`);
    console.log(`\nquiz_type=${qt}`);
    (r.data || []).forEach(q => console.log(`  [${q.id}] type=${q.type} writing=${q.writing_task_type} speaking=${q.speaking_part_type} mock=${q.mock_test_type} parts=${(q.parts||[]).length} q=${(q.questions||[]).length}  "${(q.title||'').slice(0, 60)}"`));
}

console.log('\n─ Speaking_part_type distribution ─');
for (const spt of [1, 2, 3]) {
    const r = await api(`/items/quiz?filter[speaking_part_type][_eq]=${spt}&aggregate[count]=*`);
    const n = r?.data?.[0]?.count?.id || r?.data?.[0]?.count || 0;
    console.log(`  speaking_part_type=${spt}  → ${n}`);
}

console.log('\n─ Writing_task_type distribution ─');
for (const wtt of [1, 2]) {
    const r = await api(`/items/quiz?filter[writing_task_type][_eq]=${wtt}&aggregate[count]=*`);
    const n = r?.data?.[0]?.count?.id || r?.data?.[0]?.count || 0;
    console.log(`  writing_task_type=${wtt}  → ${n}`);
}

console.log('\n─ Mock_test_type distribution ─');
for (const m of [1, 2, 3, 4]) {
    const r = await api(`/items/quiz?filter[mock_test_type][_eq]=${m}&aggregate[count]=*`);
    const n = r?.data?.[0]?.count?.id || r?.data?.[0]?.count || 0;
    console.log(`  mock_test_type=${m}  → ${n}`);
}

// Also check if we can read a public quiz that we couldn't via course path
console.log('\n─ Try reading one public quiz part fully ─');
const sample = await api('/items/quiz?filter[is_public][_eq]=true&filter[writing_task_type][_eq]=1&fields=id,title,parts,questions&limit=1');
const q = sample.data?.[0];
if (q) {
    console.log(`Quiz ${q.id}: ${q.title}`);
    if ((q.parts || []).length) {
        try {
            const p = await api(`/items/part/${q.parts[0]}?fields=*`);
            console.log(`  part keys with values: ${Object.entries(p.data).filter(([k, v]) => v != null && v !== '').map(([k]) => k).join(', ')}`);
        } catch (e) { console.log(`  ! part: ${e.message.slice(0, 100)}`); }
    }
    if ((q.questions || []).length) {
        try {
            const qq = await api(`/items/question/${q.questions[0]}?fields=*`);
            const populated = Object.entries(qq.data).filter(([k, v]) => v != null && v !== '' && (!Array.isArray(v) || v.length));
            console.log(`  question populated fields:`);
            populated.forEach(([k, v]) => {
                let val = v;
                if (typeof v === 'string' && v.length > 80) val = v.slice(0, 80) + '…';
                if (typeof v === 'object') val = JSON.stringify(v).slice(0, 80) + '…';
                console.log(`    ${k.padEnd(28)} = ${val}`);
            });
        } catch (e) { console.log(`  ! question: ${e.message.slice(0, 100)}`); }
    }
}
