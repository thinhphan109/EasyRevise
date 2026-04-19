// ========================
// settings.js — Settings load/save + AI provider model picker
// ========================

async function loadSettings() {
    const [s, aiInfo] = await Promise.all([
        api('/api/settings'),
        api('/api/ai-models').catch(() => null)
    ]);

    document.getElementById('settingsPin').value = s.adminPin || '';
    document.getElementById('settingsPinHours').value = s.pinSessionHours || 3;
    document.getElementById('settingsCodeExpire').value = s.codeExpireHours || 24;
    document.getElementById('settingsSiteName').value = s.siteName || '';
    document.getElementById('settingsSiteDesc').value = s.siteDescription || '';

    // Populate model dropdowns from provider config
    if (aiInfo && aiInfo.models && aiInfo.models.length > 0) {
        ['settingsGenerateModel', 'settingsGradeModel', 'settingsOcrModel'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const current = sel.value || '';
            sel.innerHTML = aiInfo.models.map(m =>
                `<option value="${m.id}">${m.name}</option>`
            ).join('');
            // Restore saved value or default
            sel.value = current || aiInfo.defaultModel || aiInfo.models[0]?.id || '';
        });

        // Show provider badge
        const badge = document.getElementById('aiProviderBadge');
        if (badge) {
            badge.textContent = `${aiInfo.provider || 'AI'} · ${aiInfo.baseUrl}`;
            badge.style.display = 'inline-flex';
        }
    }

    // Set saved model values
    document.getElementById('settingsGenerateModel').value = s.generateModel || document.getElementById('settingsGenerateModel').value;
    document.getElementById('settingsGradeModel').value = s.gradeModel || document.getElementById('settingsGradeModel').value;
    document.getElementById('settingsOcrModel').value = s.ocrModel || document.getElementById('settingsOcrModel').value;
}

async function saveSettings() {
    const data = {
        adminPin: document.getElementById('settingsPin').value.trim(),
        pinSessionHours: parseInt(document.getElementById('settingsPinHours').value) || 3,
        codeExpireHours: parseInt(document.getElementById('settingsCodeExpire').value) || 24,
        siteName: document.getElementById('settingsSiteName').value.trim(),
        siteDescription: document.getElementById('settingsSiteDesc').value.trim(),
        generateModel: document.getElementById('settingsGenerateModel').value,
        gradeModel: document.getElementById('settingsGradeModel').value,
        ocrModel: document.getElementById('settingsOcrModel').value
    };
    if (data.adminPin.length !== 6 || !/^\d{6}$/.test(data.adminPin)) { showToast('PIN phải là 6 chữ số', 'warning'); return; }
    await api('/api/settings', 'PUT', data);
    showToast('Đã lưu cài đặt', 'success');
    const msg = document.getElementById('settingsSaveStatus');
    if (msg) { msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
}
