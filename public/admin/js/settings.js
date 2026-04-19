// ========================
// settings.js — General settings + AI Provider Profiles manager
// ========================

// ─── General settings ─────────────────────────────────────────────

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

    // Per-feature model selects
    if (aiInfo?.models?.length) {
        ['settingsGenerateModel', 'settingsGradeModel', 'settingsOcrModel'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = `<option value="">(dùng model mặc định)</option>` +
                aiInfo.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        });
        // Update badges
        ['aiProviderBadge', 'aiTabProviderBadge'].forEach(id => {
            const el = document.getElementById(id);
            if (el && aiInfo.provider) { el.textContent = `⚡ ${aiInfo.provider}`; el.style.display = 'inline-flex'; }
        });
    }

    document.getElementById('settingsGenerateModel').value = s.generateModel || '';
    document.getElementById('settingsGradeModel').value = s.gradeModel || '';
    document.getElementById('settingsOcrModel').value = s.ocrModel || '';

    // Load provider profiles
    await loadProviderProfiles();
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

// ─── Provider Profiles ─────────────────────────────────────────────

let _editingProviderId = null; // null = adding new

async function loadProviderProfiles() {
    const { providers, activeId } = await api('/api/ai-providers');
    const container = document.getElementById('providerProfilesList');
    if (!container) return;

    if (!providers.length) {
        container.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.875rem;">
            Chưa có provider nào. Bấm <strong>"+ Thêm provider"</strong> để bắt đầu.
        </div>`;
        return;
    }

    container.innerHTML = providers.map(p => {
        const isActive = p.isActive;
        const sdkLabel = p.sdkType === 'anthropic' ? '🔶 Anthropic' : '🟢 OpenAI';
        const modelLines = (p.models || '').trim().split('\n').filter(l => l && !l.startsWith('#'));
        const modelCount = modelLines.length;
        return `<div class="provider-card ${isActive ? 'provider-card--active' : ''}" data-id="${p.id}">
            <div class="provider-card-header">
                <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;">
                    <div class="provider-icon">${isActive ? '✦' : '○'}</div>
                    <div style="min-width:0;">
                        <div class="provider-name">${escapeHtml(p.name)}</div>
                        <div class="provider-url">${escapeHtml(p.baseUrl)}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
                    ${isActive
                        ? `<span class="provider-active-badge">✓ Đang dùng</span>`
                        : `<button class="btn btn-sm btn-primary" onclick="activateProvider('${p.id}','${escapeHtml(p.name)}')">Kích hoạt</button>`
                    }
                    <button class="btn btn-sm btn-ghost" onclick="editProvider('${p.id}')" title="Chỉnh sửa">✏️</button>
                    <button class="btn btn-sm btn-ghost provider-del-btn" onclick="deleteProvider('${p.id}','${escapeHtml(p.name)}')" title="Xoá">🗑</button>
                </div>
            </div>
            <div class="provider-card-meta">
                <span class="provider-meta-chip">${sdkLabel}</span>
                <span class="provider-meta-chip">⚙ ${modelCount} model${modelCount !== 1 ? 's' : ''}</span>
                ${p.defaultModel ? `<span class="provider-meta-chip">⭐ ${escapeHtml(p.defaultModel)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

async function activateProvider(id, name) {
    try {
        await api(`/api/ai-providers/${id}/activate`, 'POST', {});
        showToast(`✅ Đã chuyển sang provider: ${name}`, 'success');
        await loadProviderProfiles();
        // Refresh model dropdowns everywhere
        const aiInfo = await api('/api/ai-models').catch(() => null);
        if (aiInfo) {
            ['aiProviderBadge', 'aiTabProviderBadge'].forEach(bid => {
                const el = document.getElementById(bid);
                if (el) { el.textContent = `⚡ ${aiInfo.provider}`; el.style.display = 'inline-flex'; }
            });
            if (typeof loadAITabModels === 'function') loadAITabModels();
        }
        // Refresh per-feature selects
        ['settingsGenerateModel', 'settingsGradeModel', 'settingsOcrModel'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel && aiInfo?.models) {
                sel.innerHTML = `<option value="">(dùng model mặc định)</option>` +
                    aiInfo.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
            }
        });
    } catch (e) {
        showToast('Lỗi: ' + e.message, 'error');
    }
}

function showProviderModal(provider = null) {
    _editingProviderId = provider?.id || null;
    document.getElementById('providerModalTitle').textContent = provider ? '✏️ Chỉnh sửa Provider' : '+ Thêm Provider';
    document.getElementById('pmName').value = provider?.name || '';
    document.getElementById('pmBaseUrl').value = provider?.baseUrl || '';
    document.getElementById('pmApiKey').value = '';  // never pre-fill masked key
    document.getElementById('pmApiKey').placeholder = provider ? '(giữ nguyên nếu không đổi)' : 'sk-...';
    document.getElementById('pmSdkType').value = provider?.sdkType || 'openai';
    document.getElementById('pmModels').value = provider?.models || '';
    document.getElementById('pmDefaultModel').value = provider?.defaultModel || '';
    document.getElementById('pmTestResult').style.display = 'none';
    document.getElementById('providerModal').style.display = 'flex';
}

function editProvider(id) {
    api('/api/ai-providers').then(({ providers }) => {
        // server masked apiKey — load fresh for edit
        const p = providers.find(x => x.id === id);
        if (p) showProviderModal(p);
    });
}

function closeProviderModal() {
    document.getElementById('providerModal').style.display = 'none';
    _editingProviderId = null;
}

async function saveProviderModal() {
    const btn = document.getElementById('pmSaveBtn');
    btn.disabled = true; btn.textContent = '⏳ Đang lưu...';
    try {
        const body = {
            name: document.getElementById('pmName').value.trim(),
            baseUrl: document.getElementById('pmBaseUrl').value.trim(),
            apiKey: document.getElementById('pmApiKey').value.trim(),
            sdkType: document.getElementById('pmSdkType').value,
            models: document.getElementById('pmModels').value,
            defaultModel: document.getElementById('pmDefaultModel').value.trim(),
        };
        if (!body.name || !body.baseUrl) { showToast('Tên và Base URL không được để trống', 'warning'); return; }

        if (_editingProviderId) {
            await api(`/api/ai-providers/${_editingProviderId}`, 'PUT', body);
            showToast('Đã cập nhật provider', 'success');
        } else {
            if (!body.apiKey) { showToast('API Key không được để trống', 'warning'); return; }
            await api('/api/ai-providers', 'POST', body);
            showToast('Đã thêm provider mới', 'success');
        }
        closeProviderModal();
        await loadProviderProfiles();
    } catch (e) {
        showToast('Lỗi: ' + e.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '💾 Lưu';
    }
}

async function deleteProvider(id, name) {
    if (!confirm(`Xoá provider "${name}"? Hành động này không thể hoàn tác.`)) return;
    try {
        await api(`/api/ai-providers/${id}`, 'DELETE', {});
        showToast(`Đã xoá provider: ${name}`, 'success');
        await loadProviderProfiles();
    } catch (e) {
        showToast('Lỗi: ' + e.message, 'error');
    }
}

async function testProviderModal() {
    const btn = document.getElementById('pmTestBtn');
    const result = document.getElementById('pmTestResult');
    btn.disabled = true; btn.textContent = '⏳ Testing...';
    result.style.display = 'none';
    try {
        const data = await api('/api/ai-test', 'POST', {});
        result.style.cssText = `display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;
            background:${data.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};
            border:1px solid ${data.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};
            border-radius:8px;font-size:0.8rem;
            color:${data.ok ? '#10b981' : '#ef4444'};margin-top:0.75rem;`;
        result.innerHTML = data.ok
            ? `✅ OK · ${data.ms}ms · model: <strong>${data.model}</strong>`
            : `❌ ${data.error}`;
    } catch (e) {
        result.style.cssText = 'display:flex;padding:0.5rem;background:rgba(239,68,68,0.1);border-radius:8px;font-size:0.8rem;color:#ef4444;margin-top:0.75rem;';
        result.innerHTML = `❌ ${e.message}`;
    } finally {
        btn.disabled = false; btn.textContent = '🔌 Test';
    }
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('pmApiKey');
    const btn = document.getElementById('pmToggleKey');
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
}
