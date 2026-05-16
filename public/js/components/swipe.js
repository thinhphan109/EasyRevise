/* ========================================
   EasyRevise — Touch/Swipe Navigation
   Swipe left/right to navigate questions
   ======================================== */

(function () {
    'use strict';

    // Only run on touch devices
    if (!('ontouchstart' in window)) return;

    // Wait for exam page to be ready
    const questionWrapper = document.getElementById('questionWrapper');
    if (!questionWrapper) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isSwipe = false;

    const SWIPE_THRESHOLD = 50;  // min px distance
    const SWIPE_TIMEOUT = 300;    // max ms
    const ANGLE_THRESHOLD = 30;   // max degrees from horizontal

    questionWrapper.addEventListener('touchstart', (e) => {
        // Don't hijack scrolling in passage boxes or textareas
        if (e.target.closest('.passage-box, textarea, input, .essay-input')) return;

        const touch = e.changedTouches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        isSwipe = true;
    }, { passive: true });

    questionWrapper.addEventListener('touchmove', (e) => {
        if (!isSwipe) return;

        const touch = e.changedTouches[0];
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);

        // If vertical movement exceeds horizontal, this is a scroll not a swipe
        if (dy > dx) {
            isSwipe = false;
        }
    }, { passive: true });

    questionWrapper.addEventListener('touchend', (e) => {
        if (!isSwipe) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const elapsed = Date.now() - startTime;
        const distance = Math.abs(dx);
        const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

        // Check: fast enough, far enough, and horizontal enough
        if (distance > SWIPE_THRESHOLD && elapsed < SWIPE_TIMEOUT && (angle < ANGLE_THRESHOLD || angle > 180 - ANGLE_THRESHOLD)) {
            if (dx < 0) {
                // Swipe left → next question
                if (typeof goNext === 'function') {
                    goNext();
                    haptic('light');
                }
            } else {
                // Swipe right → previous question
                if (typeof goPrev === 'function') {
                    goPrev();
                    haptic('light');
                }
            }
        }

        isSwipe = false;
    }, { passive: true });

    /**
     * Haptic feedback (if available)
     * @param {'light'|'medium'|'heavy'} intensity
     */
    function haptic(intensity) {
        if (!window.navigator || !navigator.vibrate) return;
        switch (intensity) {
            case 'light': navigator.vibrate(10); break;
            case 'medium': navigator.vibrate(25); break;
            case 'heavy': navigator.vibrate(50); break;
        }
    }

    // Show swipe hint on first visit
    if (!localStorage.getItem('easyrevise_swipe_hint_shown')) {
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.textContent = '← Vuốt để chuyển câu →';
        document.body.appendChild(hint);
        localStorage.setItem('easyrevise_swipe_hint_shown', '1');

        // Remove after animation ends
        setTimeout(() => hint.remove(), 10000);
    }
})();
