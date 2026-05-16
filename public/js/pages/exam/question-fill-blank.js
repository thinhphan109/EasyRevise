// EasyRevise — Fill-in-blank question renderer.
// Supports text/int/float/dropdown blank types.

import { renderMarkdown } from '../shared/markdown.js';

/**
 * Save a single blank answer back to state.
 */
export function saveFillBlank(state, questionId, blankIndex, value, debouncedSave) {
    if (!state.userAnswers[questionId]) state.userAnswers[questionId] = {};
    state.userAnswers[questionId][blankIndex] = value;
    if (debouncedSave) debouncedSave();
}

/**
 * Render fill-in-blank question with inline inputs/selects.
 * @param {Object} question
 * @param {Object} elements - { instruction, questionText, optionGrid }
 * @param {Object} ctx - { state, handlers: { renderMedia, debouncedSave } }
 */
export function renderFillInBlank(question, elements, ctx) {
    const { instruction, questionText, optionGrid } = elements;
    const { state, handlers } = ctx;

    const instr = question.instruction || '';
    instruction.innerHTML = instr ? renderMarkdown(instr) : '';
    instruction.style.display = instr ? '' : 'none';

    const blanks = question.blanks || [];

    // Flexible blank marker: support ___, __, and space-padded _
    const rawQ = question.question || '';
    let parts;
    if (rawQ.includes('___')) parts = rawQ.split('___');
    else if (rawQ.includes('__')) parts = rawQ.split('__');
    else {
        parts = rawQ.split(/(?<!\S)_(?!\S)/);
        if (parts.length === 1) parts = rawQ.split('_');
    }

    questionText.innerHTML = '';
    let blankIndex = 0;
    const inputs = [];

    parts.forEach((part, i) => {
        const span = document.createElement('span');
        span.innerHTML = part.replace(/\n/g, '<br>');
        questionText.appendChild(span);

        if (i < parts.length - 1) {
            const blank = blanks[blankIndex] || { index: blankIndex, answer: '', type: 'text' };
            const savedAns = state.userAnswers[question.id];
            const savedVal = (savedAns && savedAns[blankIndex] !== undefined) ? savedAns[blankIndex] : '';
            const idx = blankIndex; // capture for closure

            if (blank.type === 'dropdown' && blank.dropdownOptions && blank.dropdownOptions.length > 0) {
                const select = document.createElement('select');
                select.className = 'fill-blank-input';
                select.dataset.blankIndex = idx;
                select.style.cssText = 'display:inline-block;min-width:100px;max-width:200px;border:none;border-bottom:2px solid var(--primary,#6366f1);padding:0.15rem 0.4rem;background:transparent;font-size:inherit;font-family:inherit;color:inherit;outline:none;margin:0 0.2rem;text-align:center;cursor:pointer;';
                select.innerHTML = `<option value="" ${!savedVal ? 'selected' : ''}>-- chọn --</option>` +
                    blank.dropdownOptions.map(opt => {
                        const escaped = opt.replace(/"/g, '&quot;');
                        const sel = savedVal === opt ? 'selected' : '';
                        return `<option value="${escaped}" ${sel}>${opt}</option>`;
                    }).join('');
                select.addEventListener('change', () => saveFillBlank(state, question.id, idx, select.value, handlers.debouncedSave));
                questionText.appendChild(select);
                inputs.push(select);
            } else {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'fill-blank-input';
                input.dataset.blankIndex = idx;
                input.value = savedVal;
                input.placeholder = '...';
                input.style.cssText = 'display:inline-block;min-width:80px;max-width:180px;border:none;border-bottom:2px solid var(--primary,#6366f1);padding:0.1rem 0.4rem;background:transparent;font-size:inherit;font-family:inherit;color:inherit;outline:none;margin:0 0.2rem;text-align:center;';
                input.addEventListener('input', () => saveFillBlank(state, question.id, idx, input.value, handlers.debouncedSave));
                questionText.appendChild(input);
                inputs.push(input);
            }
            blankIndex++;
        }
    });

    optionGrid.style.display = 'none';
    if (handlers.renderMedia) handlers.renderMedia(question);
}
