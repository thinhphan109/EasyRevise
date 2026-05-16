// EasyRevise — Multiple choice question renderer.
// Pure function — takes question + DOM elements + handlers, mutates DOM only.

import { renderMarkdown } from '../shared/markdown.js';

/**
 * Render multiple-choice question with options A/B/C/D.
 * @param {Object} question - { question, options, optionImages, passage, instruction, id }
 * @param {Object} elements - { instruction, passageContainer, questionText, optionGrid }
 * @param {Object} ctx - { state, handlers: { onSelect, renderMedia, updateGrid, navigate } }
 */
export function renderMultipleChoice(question, elements, ctx) {
    const { instruction, passageContainer, questionText, optionGrid } = elements;
    const { state, handlers } = ctx;

    const instr = question.instruction || '';
    instruction.innerHTML = instr ? renderMarkdown(instr) : '';
    instruction.style.display = instr ? '' : 'none';

    if (question.passage) {
        passageContainer.style.display = 'block';
        passageContainer.innerHTML = renderMarkdown(question.passage);
    }
    questionText.innerHTML = renderMarkdown(question.question);

    if (handlers.renderMedia) handlers.renderMedia(question);

    optionGrid.style.display = 'flex';
    optionGrid.innerHTML = '';

    const optImgs = question.optionImages || [];

    question.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        if (state.userAnswers[question.id] === index) btn.classList.add('selected');
        const labelKey = String.fromCharCode(65 + index);
        const imgHtml = optImgs[index]
            ? `<div style="margin-top:0.4rem;"><img src="${optImgs[index]}" alt="" style="max-width:160px;max-height:120px;border-radius:8px;object-fit:cover;pointer-events:none;"></div>`
            : '';
        btn.innerHTML = `<div class="option-label">${labelKey}</div><div class="option-text">${option}${imgHtml}</div>`;
        btn.addEventListener('click', () => {
            state.userAnswers[question.id] = index;
            if (handlers.saveProgress) handlers.saveProgress();
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            if (handlers.updateGrid) handlers.updateGrid();
            setTimeout(() => { if (handlers.navigate) handlers.navigate(1); }, 300);
        });
        optionGrid.appendChild(btn);
    });
}
