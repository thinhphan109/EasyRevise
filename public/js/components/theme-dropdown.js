/* ============================================================
   theme-dropdown.js — global helpers for custom dropdowns
   + fetchModelsFromBaseUrl for AI providers
   ============================================================ */
(function () {
    'use strict';

    // Close any open dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.theme-dropdown.is-open').forEach(dd => {
            if (!dd.contains(e.target)) {
                dd.classList.remove('is-open');
                const trigger = dd.querySelector('.theme-dropdown-trigger');
                trigger?.setAttribute('aria-expanded', 'false');
            }
        });
    });
    // Esc closes
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        document.querySelectorAll('.theme-dropdown.is-open').forEach(dd => {
            dd.classList.remove('is-open');
            dd.querySelector('.theme-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
        });
    });

    window._themeDropdownToggle = function (id) {
        const dd = document.getElementById(id);
        if (!dd) return;
        const willOpen = !dd.classList.contains('is-open');
        // Close others first
        document.querySelectorAll('.theme-dropdown.is-open').forEach(o => {
            if (o !== dd) o.classList.remove('is-open');
        });
        dd.classList.toggle('is-open', willOpen);
        dd.querySelector('.theme-dropdown-trigger')?.setAttribute('aria-expanded', String(willOpen));
        // Sync option highlight
        if (willOpen) {
            const v = dd.dataset.value;
            dd.querySelectorAll('.theme-dropdown-option').forEach(opt => {
                opt.classList.toggle('is-selected', opt.dataset.value === v);
            });
        }
    };

    window._themeDropdownPick = function (id, optionEl) {
        const dd = document.getElementById(id);
        if (!dd || !optionEl) return;
        const v = optionEl.dataset.value;
        dd.dataset.value = v;
        // Update trigger label/emoji
        const emoji = optionEl.querySelector('.theme-dropdown-emoji')?.textContent || '';
        const title = optionEl.querySelector('.theme-dropdown-option-title')?.textContent
                     || optionEl.querySelector('.theme-dropdown-label')?.textContent
                     || optionEl.textContent.trim();
        const trgEmoji = dd.querySelector('.theme-dropdown-current .theme-dropdown-emoji');
        const trgLabel = dd.querySelector('.theme-dropdown-current .theme-dropdown-label');
        if (trgEmoji) trgEmoji.textContent = emoji;
        if (trgLabel) trgLabel.textContent = title;
        // Sync hidden input (backward compat)
        const sink = dd.querySelector('input[type="hidden"]');
        if (sink) {
            sink.value = v;
            sink.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // Mark selected
        dd.querySelectorAll('.theme-dropdown-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt === optionEl);
        });
        // Close
        dd.classList.remove('is-open');
        dd.querySelector('.theme-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
        // Fire custom event so callers can react
        dd.dispatchEvent(new CustomEvent('theme-dropdown:change', { detail: { value: v } }));
    };

    /**
     * Set the value of a theme dropdown programmatically.
     * Used by editProvider() to populate when opening the modal.
     */
    window._themeDropdownSetValue = function (id, value) {
        const dd = document.getElementById(id);
        if (!dd) return;
        const opt = dd.querySelector(`.theme-dropdown-option[data-value="${CSS.escape(value)}"]`);
        if (opt) window._themeDropdownPick(id, opt);
    };

    // ============================================================
    // Fetch models from OpenAI-compatible /v1/models
    // ============================================================
    window.fetchModelsFromBaseUrl = async function () {
        const btn = document.getElementById('pmFetchModelsBtn');
        const baseUrlEl = document.getElementById('pmBaseUrl');
        const apiKeyEl  = document.getElementById('pmApiKey');
        const modelsEl  = document.getElementById('pmModels');
        const sdkType   = document.getElementById('pmSdkType')?.value || 'openai';

        const baseUrl = (baseUrlEl?.value || '').trim().replace(/\/+$/, '');
        if (!baseUrl) {
            (window.showToast || alert)('Nhập Base URL trước', 'warning');
            return;
        }
        if (sdkType !== 'openai') {
            (window.showToast || alert)('Anthropic không cung cấp /v1/models. Hãy dán models thủ công.', 'info');
            return;
        }

        // Construct URL: append /models if URL doesn't already end with v1
        const url = /\/v\d+\/?$/.test(baseUrl)
            ? baseUrl + '/models'
            : baseUrl + '/v1/models';

        const orig = btn?.innerHTML;
        if (btn) {
            btn.innerHTML = '⏳ Đang tải...';
            btn.disabled = true;
        }
        try {
            const headers = { 'Accept': 'application/json' };
            const apiKey = (apiKeyEl?.value || '').trim();
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const res = await fetch(url, { method: 'GET', headers, mode: 'cors' });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            // OpenAI shape: { data: [{ id, ... }] }
            const list = Array.isArray(data?.data) ? data.data
                       : Array.isArray(data?.models) ? data.models
                       : Array.isArray(data) ? data
                       : [];
            const ids = list.map(m => m.id || m.name || m).filter(Boolean);
            if (!ids.length) {
                (window.showToast || alert)('Không có model nào trong response', 'warning');
                return;
            }

            // Merge with existing (preserve user comments + manual additions)
            const existing = (modelsEl.value || '').split('\n').map(l => l.trim());
            const existingIds = new Set(existing.filter(l => l && !l.startsWith('#')));
            const merged = [...existing];
            const newOnes = [];
            ids.forEach(id => {
                if (!existingIds.has(id)) {
                    newOnes.push(id);
                    existingIds.add(id);
                }
            });
            if (newOnes.length) {
                if (merged.length && merged[merged.length - 1] !== '') merged.push('');
                merged.push(`# Loaded from ${url} (${new Date().toLocaleTimeString('vi-VN')})`);
                merged.push(...newOnes);
                modelsEl.value = merged.join('\n');
            }

            (window.showToast || alert)(
                newOnes.length
                    ? `✓ Tìm thấy ${ids.length} models, đã thêm ${newOnes.length} mới`
                    : `✓ Tất cả ${ids.length} models đã có sẵn`,
                'success'
            );
        } catch (err) {
            console.error('[fetchModels]', err);
            (window.showToast || alert)(
                `Lỗi: ${err.message}. Server có hỗ trợ CORS + /v1/models?`,
                'error'
            );
        } finally {
            if (btn) {
                btn.innerHTML = orig;
                btn.disabled = false;
            }
        }
    };
})();
