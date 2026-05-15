/* ========================================================
   confirm.js + prompt.js — Custom dialog replacements (Task 12)
   - customConfirm(title, message, options) → Promise<boolean>
   - customPrompt(title, message, options) → Promise<string|null>
   ======================================================== */

import { openModal } from './modal.js';

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

let _idCounter = 0;
function uniqueId(prefix) {
    return `${prefix}-${++_idCounter}-${Date.now()}`;
}

/**
 * Custom confirmation dialog.
 * @param {string} title
 * @param {string} message - HTML allowed; sanitized via escapeHtml unless options.allowHtml
 * @param {object} [options]
 * @param {string} [options.confirmText='Xác nhận']
 * @param {string} [options.cancelText='Hủy']
 * @param {boolean} [options.danger=false] - red confirm button
 * @param {boolean} [options.allowHtml=false]
 * @returns {Promise<boolean>}
 */
export function customConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const id = uniqueId('confirm-modal');
        const opts = {
            confirmText: 'Xác nhận',
            cancelText: 'Hủy',
            danger: false,
            allowHtml: false,
            ...options
        };
        const messageHtml = opts.allowHtml ? message : escapeHtml(message);

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = id;
        overlay.innerHTML = `
            <div class="modal modal-sm" role="alertdialog" aria-labelledby="${id}-title" aria-describedby="${id}-msg">
                <div class="modal-header">
                    <h3 class="modal-title" id="${id}-title">${escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    <p id="${id}-msg" style="margin:0;color:var(--text-2);text-align:center;line-height:var(--leading-relaxed);">
                        ${messageHtml}
                    </p>
                </div>
                <div class="modal-actions modal-actions-stretch">
                    <button class="btn btn-secondary" data-action="cancel">${escapeHtml(opts.cancelText)}</button>
                    <button class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${escapeHtml(opts.confirmText)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const cleanup = (result) => {
            handle.close();
            setTimeout(() => overlay.remove(), 250);
            resolve(result);
        };

        overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));

        const handle = openModal(overlay, { onClose: () => resolve(false) });
    });
}

/**
 * Custom prompt input dialog.
 * @param {string} title
 * @param {string} message
 * @param {object} [options]
 * @param {string} [options.defaultValue='']
 * @param {string} [options.placeholder='']
 * @param {string} [options.confirmText='OK']
 * @param {string} [options.cancelText='Hủy']
 * @param {string} [options.inputType='text']
 * @returns {Promise<string|null>}
 */
export function customPrompt(title, message, options = {}) {
    return new Promise((resolve) => {
        const id = uniqueId('prompt-modal');
        const opts = {
            defaultValue: '',
            placeholder: '',
            confirmText: 'OK',
            cancelText: 'Hủy',
            inputType: 'text',
            ...options
        };

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = id;
        overlay.innerHTML = `
            <div class="modal modal-sm" role="dialog" aria-labelledby="${id}-title">
                <div class="modal-header">
                    <h3 class="modal-title" id="${id}-title">${escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    ${message ? `<p style="margin:0 0 var(--space-3);color:var(--text-2);text-align:center;">${escapeHtml(message)}</p>` : ''}
                    <input type="${escapeHtml(opts.inputType)}" class="form-input" id="${id}-input" value="${escapeHtml(opts.defaultValue)}" placeholder="${escapeHtml(opts.placeholder)}" autocomplete="off">
                </div>
                <div class="modal-actions modal-actions-stretch">
                    <button class="btn btn-secondary" data-action="cancel">${escapeHtml(opts.cancelText)}</button>
                    <button class="btn btn-primary" data-action="confirm">${escapeHtml(opts.confirmText)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector(`#${id}-input`);
        setTimeout(() => { input.focus(); input.select(); }, 50);

        const cleanup = (value) => {
            handle.close();
            setTimeout(() => overlay.remove(), 250);
            resolve(value);
        };

        overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(input.value));
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') cleanup(input.value);
        });

        const handle = openModal(overlay, { onClose: () => resolve(null) });
    });
}
