/* ===========================================================
   Admin — emoji → SVG sprite swap
   Replaces decorative emoji in admin UI with sprite icons.
   Locked decision Q2: no emoji decorative; SVG sprite only.
   =========================================================== */

(function () {
    const SPRITE = '/assets/icons/sprite.svg';

    // Map emoji → sprite icon id
    const ICON_MAP = {
        '📝': 'file-text',
        '📋': 'file-text',
        '📚': 'book-open',
        '✏️': 'pen-line',
        '🖊️': 'pen-line',
        '🎯': 'target',
        '⭐': 'star',
        '⏱️': 'timer',
        '⏰': 'timer',
        '🕐': 'clock',
        '🔐': 'shield-check',
        '🔑': 'key',
        '🛡️': 'shield-check',
        '🧠': 'sparkles',
        '🤖': 'sparkles',
        '✨': 'sparkles',
        '🚀': 'send',
        '📊': 'bar-chart-3',
        '📈': 'bar-chart-3',
        '👤': 'user',
        '👥': 'users',
        '⚙️': 'settings-2',
        '🔧': 'settings-2',
        '🔍': 'search',
        '➕': 'plus',
        '🗑️': 'trash-2',
        '✅': 'check-circle',
        '❌': 'x-circle',
        '⚠️': 'alert-triangle',
        'ℹ️': 'info',
        '💡': 'sparkles',
        '🏠': 'home',
        '←': 'arrow-left',
        '→': 'arrow-right',
        '🔥': 'flame',
        '🏆': 'trophy',
        '🎖️': 'medal',
        '📤': 'upload-cloud',
        '📥': 'download',
        '🖼️': 'image',
        '🎨': 'pen-line',
        '📑': 'file-text'
    };

    function makeSvg(iconId, sizeClass = 'icon icon-sm') {
        return `<svg class="${sizeClass}" aria-hidden="true"><use href="${SPRITE}#${iconId}"/></svg>`;
    }

    /**
     * Walk text nodes and replace ONLY pure-emoji text
     * Skip: <code>, <pre>, [contenteditable], elements with data-keep-emoji
     */
    function shouldSkip(el) {
        if (!el) return true;
        const tag = el.nodeName;
        if (tag === 'CODE' || tag === 'PRE' || tag === 'TEXTAREA' || tag === 'SCRIPT' || tag === 'STYLE') return true;
        if (el.closest && el.closest('[contenteditable]')) return true;
        if (el.closest && el.closest('[data-keep-emoji]')) return true;
        return false;
    }

    function isEmojiOnly(text) {
        const trimmed = text.trim();
        if (!trimmed) return false;
        return Object.prototype.hasOwnProperty.call(ICON_MAP, trimmed);
    }

    function findReplaceableText(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
                if (isEmojiOnly(node.nodeValue)) return NodeFilter.FILTER_ACCEPT;
                return NodeFilter.FILTER_SKIP;
            }
        });
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        return nodes;
    }

    function processElement(root) {
        if (!root || shouldSkip(root)) return;

        // 1) Replace pure-emoji text nodes
        const nodes = findReplaceableText(root);
        nodes.forEach(textNode => {
            const emoji = textNode.nodeValue.trim();
            const iconId = ICON_MAP[emoji];
            if (!iconId) return;
            const span = document.createElement('span');
            span.className = 'icon-swap';
            span.style.display = 'inline-flex';
            span.style.alignItems = 'center';
            span.innerHTML = makeSvg(iconId, 'icon');
            textNode.parentNode.replaceChild(span, textNode);
        });

        // 2) For elements whose textContent is "<emoji> <text>" pattern
        //    (e.g. button label "📝 Tạo đề"), swap leading emoji
        const candidates = root.querySelectorAll('button, .btn, .sidebar-item, .tab, h1, h2, h3, label');
        candidates.forEach(el => {
            if (shouldSkip(el)) return;
            // Only operate if first child is text node starting with an emoji
            const first = el.firstChild;
            if (!first || first.nodeType !== Node.TEXT_NODE) return;
            const txt = first.nodeValue;
            // Match leading emoji (any in our map) followed by space
            const trimmed = txt.replace(/^\s+/, '');
            for (const [emoji, iconId] of Object.entries(ICON_MAP)) {
                if (trimmed.startsWith(emoji)) {
                    const remainder = trimmed.slice(emoji.length).replace(/^\s+/, '');
                    // Replace text node with SVG span + remaining text
                    const svgSpan = document.createElement('span');
                    svgSpan.className = 'icon-swap';
                    svgSpan.style.display = 'inline-flex';
                    svgSpan.style.alignItems = 'center';
                    svgSpan.style.marginRight = remainder ? '6px' : '0';
                    svgSpan.innerHTML = makeSvg(iconId, 'icon icon-sm');
                    el.replaceChild(document.createTextNode(remainder), first);
                    el.insertBefore(svgSpan, el.firstChild);
                    break;
                }
            }
        });
    }

    // Run on DOMContentLoaded + observe future additions (admin renders many tabs dynamically)
    function init() {
        processElement(document.body);

        // Observe new content (tab switches, dynamic lists)
        const obs = new MutationObserver(mutations => {
            for (const m of mutations) {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        processElement(node);
                    }
                });
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
