/* ========================================
   EasyRevise — API Client
   Fetch wrapper for all API calls
   ======================================== */

const EasyAPI = {
    /**
     * Get auth token from localStorage
     * @returns {string|null}
     */
    getToken() {
        return localStorage.getItem('easyrevise_token');
    },

    /**
     * Build headers with optional auth token
     * @param {boolean} [auth=false]
     * @returns {object}
     */
    _headers(auth = false) {
        const h = { 'Content-Type': 'application/json' };
        if (auth) {
            const token = this.getToken();
            if (token) h['Authorization'] = `Bearer ${token}`;
        }
        return h;
    },

    /**
     * GET request
     * @param {string} url
     * @param {boolean} [auth=false]
     * @returns {Promise<any>}
     */
    async get(url, auth = false) {
        const res = await fetch(url, {
            headers: auth ? this._headers(true) : {}
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },

    /**
     * POST request
     * @param {string} url
     * @param {object} body
     * @param {boolean} [auth=false]
     * @returns {Promise<any>}
     */
    async post(url, body, auth = false) {
        const res = await fetch(url, {
            method: 'POST',
            headers: this._headers(auth),
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok && data.error) throw new Error(data.error);
        return data;
    },

    /**
     * PUT request
     * @param {string} url
     * @param {object} body
     * @param {boolean} [auth=true]
     * @returns {Promise<any>}
     */
    async put(url, body, auth = true) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: this._headers(auth),
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok && data.error) throw new Error(data.error);
        return data;
    },

    /**
     * DELETE request
     * @param {string} url
     * @param {boolean} [auth=true]
     * @returns {Promise<any>}
     */
    async del(url, auth = true) {
        const res = await fetch(url, {
            method: 'DELETE',
            headers: this._headers(auth)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }
};
