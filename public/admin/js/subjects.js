// ========================
// subjects.js — Subject CRUD
// ========================

async function loadSubjects() {
    const subjects = await api('/api/subjects');
    const c = document.getElementById('subjectListContainer');
    if (!subjects.length) { c.innerHTML = '<div class="empty-state"><div class="emoji">📚</div><p>Chưa có môn. Bấm <strong>"+ Thêm môn"</strong></p></div>'; return; }
    c.innerHTML = subjects.map(s => `<div class="subject-item">
        <span style="font-weight:600;">${s.icon} ${s.name}</span>
        <button class="btn btn-sm btn-danger" onclick="deleteSubject('${s.id}')">Xóa</button>
    </div>`).join('');
}

function showAddSubjectModal() { document.getElementById('inputSubjectName').value = ''; document.getElementById('inputSubjectIcon').value = '📚'; openModal('modalSubject'); }
async function saveSubject() { await api('/api/subjects', 'POST', { name: document.getElementById('inputSubjectName').value, icon: document.getElementById('inputSubjectIcon').value }); closeModal('modalSubject'); loadSubjects(); }
async function deleteSubject(id) { if (!confirm('Xóa môn này?')) return; await api(`/api/subjects/${id}`, 'DELETE'); loadSubjects(); }
