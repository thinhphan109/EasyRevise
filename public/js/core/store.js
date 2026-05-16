/* ========================================
   EasyRevise — Store
   Simple localStorage wrapper
   ======================================== */

const Store = {
    /**
     * Get item from localStorage, parsed as JSON
     * @param {string} key
     * @param {*} [fallback=null]
     * @returns {*}
     */
    get(key, fallback = null) {
        try {
            const val = localStorage.getItem(key);
            return val !== null ? JSON.parse(val) : fallback;
        } catch {
            return fallback;
        }
    },

    /**
     * Set item in localStorage as JSON
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },

    /**
     * Remove item from localStorage
     * @param {string} key
     */
    remove(key) {
        localStorage.removeItem(key);
    },

    // ── Convenience methods for common keys ──

    /** Get unlocked exams map */
    getUnlocked() {
        return this.get('easyrevise_unlocked', {});
    },

    /** Mark an exam as unlocked */
    setUnlocked(examId, code) {
        const map = this.getUnlocked();
        map[examId] = code;
        this.set('easyrevise_unlocked', map);
    },

    /** Get in-progress exams map */
    getInProgress() {
        return this.get('easyrevise_in_progress', {});
    },

    /** Get local history array */
    getHistory() {
        return this.get('easyrevise_history', []);
    }
};
