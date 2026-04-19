// ========================
// settings.js — Settings load/save + AI provider management
// ========================

async function loadSettings() {
    const [s, aiInfo] = await Promise.all([
        api('/api/settings'),
        api('/api/ai-models').catch(() => null)
    ]);

    // General settings
    document.getElementById('settingsPin').value = s.adminPin || '';
    document.getElementById('settingsPinHours').value = s.pinSessionHours || 3;
    document.getElementById('settingsCodeExpire').value = s.codeExpireHours || 24;
    document.getElementById('settingsSiteName').value = s.siteName || '';
    document.getElementById('settingsSiteDesc').value = s.siteDescription || '';

    // ── AI Provider config ──────────────────────────────────────────
    document.getElementById('aiProviderName').value = s.aiProviderName || aiInfo?.provider || '';
    document.getElementById('aiBaseUrl').value = s.aiBaseUrl || aiInfo?.baseUrl || '';
    document.getElementById('aiApiKeyInput').value = s.aiApiKey || '';
    const sdkSel = document.getElementById('aiSdkTypeSel');
    if (sdkSel) sdkSel.value = s.aiSdkType || aiInfo?.sdkType || 'openai';

    // Textarea: one model per line
    if (aiInfo?.models?.length) {
        document.getElementById('aiModelsTextarea').value = aiInfo.models.map(m => m.id).join('\n');
        document.getElementById('aiDefaultModelSel').innerHTML = aiInfo.models.map(m =>
            `<option value="${m.id}">${m.name}</option>`
        ).join('');
        document.getElementById('aiDefaultModelSel').value = s.aiDefaultModel || aiInfo.defaultModel || aiInfo.models[0]?.id;
    }

    // Update provider badge
    _updateProviderBadge(aiInfo);

    // ── Per-feature model selects ───────────────────────────────────
    if (aiInfo?.models?.length) {
        ['settingsGenerateModel', 'settingsGradeModel', 'settingsOcrModel'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = `<option value="">(dùng model mặc định)</option>` +
                aiInfo.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        });
    }

    document.getElementById('settingsGenerateModel').value = s.generateModel || '';
    document.getElementById('settingsGradeModel').value = s.gradeModel || '';
    document.getElementById('settingsOcrModel').value = s.ocrModel || '';
}

function _updateProviderBadge(aiInfo) {
    const badges = ['aiProviderBadge', 'aiTabProviderBadge'];
    badges.forEach(id => {
        const el = document.getElementById(id);
        if (el && aiInfo?.provider) {
            el.textContent = `⚡ ${aiInfo.provider}`;
            el.style.display = 'inline-flex';
        }
    });
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
        ocrModel: document.getElementById('settingsOcrModel').value,
    };
    if (data.adminPin.length !== 6 || !/^\d{6}$/.test(data.adminPin)) {
        showToast('PIN phải là 6 chữ số', 'warning'); return;
    }
    await api('/api/settings', 'PUT', data);
    showToast('Đã lưu cài đặt chung', 'success');
}

async function saveAIProvider() {
    const btn = document.getElementById('saveAIProviderBtn');
    btn.disabled = true; btn.textContent = '⏳ Đang lưu...';
    try {
        const data = {
            aiProviderName: document.getElementById('aiProviderName').value.trim(),
            aiBaseUrl: document.getElementById('aiBaseUrl').value.trim(),
            aiApiKey: document.getElementById('aiApiKeyInput').value.trim(),
            aiSdkType: document.getElementById('aiSdkTypeSel').value,
            aiModelsJson: document.getElementById('aiModelsTextarea').value,
            aiDefaultModel: document.getElementById('aiDefaultModelSel').value,
            // Clear per-feature overrides so they pick up new models
            generateModel: '',
            gradeModel: '',
            ocrModel: '',
        };
        if (!data.aiBaseUrl) { showToast('Base URL không được để trống', 'warning'); return; }
        if (!data.aiApiKey) { showToast('API Key không được để trống', 'warning'); return; }

        const result = await api('/api/settings', 'PUT', data);
        showToast('✅ Lưu thành công — provider đã cập nhật!', 'success');

        // Refresh model dropdowns
        await loadSettings();

        // Refresh AI tab dropdown if open
        if (typeof loadAITabModels === 'function') loadAITabModels();

    } catch (e) {
        showToast('Lỗi: ' + (e.message || 'Không lưu được'), 'error');
    } finally {
        btn.disabled = false; btn.textContent = '💾 Lưu & áp dụng ngay';
    }
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('aiApiKeyInput');
    const btn = document.getElementById('toggleApiKeyBtn');
    if (input.type === 'password') {
        input.type = 'text'; btn.textContent = '🙈';
    } else {
        input.type = 'password'; btn.textContent = '👁';
    }
}

function updateDefaultModelOptions() {
    const textarea = document.getElementById('aiModelsTextarea');
    const sel = document.getElementById('aiDefaultModelSel');
    const current = sel.value;
    const lines = textarea.value.trim().split('\n').map(l => l.trim()).filter(Boolean);
    sel.innerHTML = lines.map(l => `<option value="${l}">${l}</option>`).join('');
    if (lines.includes(current)) sel.value = current;
}

async function testAIConnection() {
    const btn = document.getElementById('testAIBtn');
    const result = document.getElementById('aiTestResult');
    btn.disabled = true; btn.textContent = '⏳ Đang test...';
    result.style.display = 'none';
    try {
        const data = await api('/api/ai-test', 'POST', {});
        if (data.ok) {
            result.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.6rem 1rem;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;font-size:0.82rem;color:#10b981;margin-top:0.75rem;';
            result.innerHTML = `✅ Kết nối thành công! Model: <strong>${data.model}</strong> · ${data.ms}ms · "${data.response}"`;
        } else {
            result.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.6rem 1rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.82rem;color:#ef4444;margin-top:0.75rem;';
            result.innerHTML = `❌ Lỗi: ${data.error}`;
        }
    } catch (e) {
        result.style.cssText = 'display:flex;padding:0.6rem 1rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;font-size:0.82rem;color:#ef4444;margin-top:0.75rem;';
        result.innerHTML = `❌ ${e.message}`;
    } finally {
        btn.disabled = false; btn.textContent = '🔌 Test kết nối';
    }
}
