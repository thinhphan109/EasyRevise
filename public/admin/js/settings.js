// ========================
// settings.js — Settings load/save
// ========================

async function loadSettings() {
    const s = await api('/api/settings');
    document.getElementById('settingsPin').value = s.adminPin || '';
    document.getElementById('settingsPinHours').value = s.pinSessionHours || 3;
    document.getElementById('settingsCodeExpire').value = s.codeExpireHours || 24;
    document.getElementById('settingsSiteName').value = s.siteName || '';
    document.getElementById('settingsSiteDesc').value = s.siteDescription || '';
    document.getElementById('settingsGenerateModel').value = s.generateModel || '';
    document.getElementById('settingsGradeModel').value = s.gradeModel || '';
    document.getElementById('settingsOcrModel').value = s.ocrModel || '';
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
    const msg = document.getElementById('settingsSaveStatus');
    msg.style.display = 'inline'; setTimeout(() => { msg.style.display = 'none'; }, 2000);
}
