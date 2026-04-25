// ========================
// subjects.js — Subject CRUD
// ========================

async function loadSubjects() {
    const subjects = await api('/api/subjects');
    const c = document.getElementById('subjectListContainer');
    if (!subjects.length) {
        c.innerHTML = `<div class="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" style="margin:0 auto 1rem;opacity:0.4;"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <p>Chưa có môn. Bấm <strong>"+ Thêm môn"</strong></p>
        </div>`;
        return;
    }
    c.innerHTML = subjects.map(s => `<div class="subject-item">
        <span style="font-weight:600;font-size:0.95rem;">${s.icon} ${escapeHtml(s.name)}</span>
        <div style="display:flex;gap:0.4rem;">
            <button class="btn btn-sm btn-ghost" onclick="showEditSubjectModal('${s.id}','${escapeHtml(s.name).replace(/'/g,"\\'")}','${s.icon}')" title="Sửa">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteSubject('${s.id}')" title="Xóa">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        </div>
    </div>`).join('');
}

function showAddSubjectModal() {
    document.getElementById('inputSubjectName').value = '';
    document.getElementById('inputSubjectIcon').value = '📚';
    const titleEl = document.getElementById('modalSubjectTitle');
    if (titleEl) titleEl.textContent = 'Thêm môn học';
    const saveBtn = document.getElementById('modalSubjectSaveBtn');
    if (saveBtn) saveBtn.onclick = saveSubject;
    openModal('modalSubject');
}

function showEditSubjectModal(id, name, icon) {
    document.getElementById('inputSubjectName').value = name;
    document.getElementById('inputSubjectIcon').value = icon;
    const titleEl = document.getElementById('modalSubjectTitle');
    if (titleEl) titleEl.textContent = 'Sửa môn học';
    const saveBtn = document.getElementById('modalSubjectSaveBtn');
    if (saveBtn) saveBtn.onclick = () => updateSubject(id);
    openModal('modalSubject');
}

async function saveSubject() {
    await api('/api/subjects', 'POST', {
        name: document.getElementById('inputSubjectName').value,
        icon: document.getElementById('inputSubjectIcon').value
    });
    closeModal('modalSubject');
    loadSubjects();
}

async function updateSubject(id) {
    await api(`/api/subjects/${id}`, 'PUT', {
        name: document.getElementById('inputSubjectName').value,
        icon: document.getElementById('inputSubjectIcon').value
    });
    closeModal('modalSubject');
    loadSubjects();
}

async function deleteSubject(id) {
    if (!(await customConfirm('Xóa môn học', 'Xóa môn này? Thao tác không thể hoàn tác.', 'Xóa', true))) return;
    await api(`/api/subjects/${id}`, 'DELETE');
    loadSubjects();
}
