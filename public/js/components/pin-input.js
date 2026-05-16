/* ========================================================
   pin-input.js — 6-digit PIN input with auto-advance (Task 27 helper)
   - Auto-focus next on type
   - Backspace empties current → focus prev
   - Paste 6-digit code distributes correctly across inputs
   - Number-only on numeric inputs
   ======================================================== */

/**
 * Init PIN input behavior on a container.
 * @param {HTMLElement|string} target - container with .pin-input children
 * @param {object} [options]
 * @param {(value: string, complete: boolean) => void} [options.onChange]
 * @param {(value: string) => void} [options.onComplete] - fires when all filled
 * @param {boolean} [options.numeric=true]
 */
export function initPinInput(target, options = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) return;
    const inputs = Array.from(root.querySelectorAll('.pin-input'));
    if (inputs.length === 0) return;
    const opts = { numeric: true, ...options };

    const getValue = () => inputs.map(i => i.value).join('');

    const emitChange = () => {
        const v = getValue();
        const complete = v.length === inputs.length;
        if (typeof opts.onChange === 'function') opts.onChange(v, complete);
        if (complete && typeof opts.onComplete === 'function') opts.onComplete(v);
    };

    inputs.forEach((input, idx) => {
        input.setAttribute('inputmode', opts.numeric ? 'numeric' : 'text');
        input.setAttribute('maxlength', '1');
        input.setAttribute('autocomplete', idx === 0 ? 'one-time-code' : 'off');

        input.addEventListener('input', (e) => {
            let val = e.target.value;
            if (opts.numeric) val = val.replace(/\D/g, '');
            // Take only the last char (in case user types fast)
            val = val.slice(-1);
            e.target.value = val;
            if (val && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
                inputs[idx + 1].select();
            }
            emitChange();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace') {
                if (e.target.value === '') {
                    if (idx > 0) {
                        e.preventDefault();
                        inputs[idx - 1].focus();
                        inputs[idx - 1].select();
                    }
                }
            } else if (e.key === 'ArrowLeft' && idx > 0) {
                e.preventDefault();
                inputs[idx - 1].focus();
                inputs[idx - 1].select();
            } else if (e.key === 'ArrowRight' && idx < inputs.length - 1) {
                e.preventDefault();
                inputs[idx + 1].focus();
                inputs[idx + 1].select();
            } else if (e.key === 'Home') {
                e.preventDefault();
                inputs[0].focus(); inputs[0].select();
            } else if (e.key === 'End') {
                e.preventDefault();
                inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select();
            }
        });

        input.addEventListener('focus', () => input.select());

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const data = (e.clipboardData || window.clipboardData).getData('text');
            if (!data) return;
            let chars = data.split('');
            if (opts.numeric) chars = chars.filter(c => /\d/.test(c));
            chars = chars.slice(0, inputs.length);
            inputs.forEach((inp, i) => { inp.value = chars[i] || ''; });
            const lastIdx = Math.min(chars.length, inputs.length) - 1;
            if (lastIdx >= 0) inputs[Math.min(chars.length, inputs.length - 1)].focus();
            emitChange();
        });
    });

    return {
        getValue,
        clear: () => { inputs.forEach(i => { i.value = ''; }); inputs[0].focus(); },
        focus: () => inputs[0].focus(),
        setValue: (v) => {
            const chars = String(v).split('').slice(0, inputs.length);
            inputs.forEach((inp, i) => { inp.value = chars[i] || ''; });
            emitChange();
        }
    };
}
