// EasyRevise — Web Audio beep helper for timer warnings (no external files).

/**
 * Play short beep(s) via Web Audio API.
 * @param {number} freq - frequency in Hz (default 880)
 * @param {number} duration - seconds (default 0.15)
 * @param {number} count - number of beeps (default 1)
 */
export function playBeep(freq = 880, duration = 0.15, count = 1) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < count; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + duration);
            osc.start(ctx.currentTime + i * 0.3);
            osc.stop(ctx.currentTime + i * 0.3 + duration);
        }
    } catch (e) {
        /* Audio not supported — silent fallback */
    }
}
