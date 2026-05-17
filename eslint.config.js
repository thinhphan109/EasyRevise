// eslint.config.js — ESLint flat config (v9+)
// Runs in CI via: npx eslint .
const js = require('@eslint/js');

const sharedRules = {
    // Relax rules for existing codebase (avoid 1000+ errors on first run)
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-undef': 'warn',           // Many frontend globals not declared
    'no-empty': 'warn',
    'no-constant-condition': 'off',
    'no-prototype-builtins': 'off',
    'no-useless-escape': 'warn',
    'no-fallthrough': 'warn',
    'no-redeclare': 'warn',
    'no-cond-assign': ['error', 'except-parens'],
    'no-debugger': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'eqeqeq': ['warn', 'smart'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error'
};

const browserNodeGlobals = {
    // Node.js globals
    require: 'readonly', module: 'readonly', exports: 'readonly',
    __dirname: 'readonly', __filename: 'readonly',
    process: 'readonly', console: 'readonly', Buffer: 'readonly',
    setTimeout: 'readonly', setInterval: 'readonly',
    clearTimeout: 'readonly', clearInterval: 'readonly',
    setImmediate: 'readonly', queueMicrotask: 'readonly',
    URL: 'readonly', URLSearchParams: 'readonly',
    AbortController: 'readonly', AbortSignal: 'readonly',
    TextEncoder: 'readonly', TextDecoder: 'readonly',
    globalThis: 'readonly',
    // Browser globals (for public/ frontend files)
    window: 'readonly', document: 'readonly',
    localStorage: 'readonly', sessionStorage: 'readonly',
    fetch: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
    history: 'readonly', location: 'readonly', navigator: 'readonly',
    FormData: 'readonly', FileReader: 'readonly', Image: 'readonly',
    HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly',
    MutationObserver: 'readonly', IntersectionObserver: 'readonly',
    ResizeObserver: 'readonly',
    Event: 'readonly', CustomEvent: 'readonly', KeyboardEvent: 'readonly',
    Blob: 'readonly', File: 'readonly',
    crypto: 'readonly', performance: 'readonly',
    MediaRecorder: 'readonly', MediaStream: 'readonly',
    requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
    btoa: 'readonly', atob: 'readonly',
    NodeFilter: 'readonly', Notification: 'readonly',
    AudioContext: 'readonly', SpeechSynthesisUtterance: 'readonly',
    speechSynthesis: 'readonly',
    global: 'readonly'
};

module.exports = [
    js.configs.recommended,

    // Default — Node.js (CommonJS) + browser globals
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: browserNodeGlobals
        },
        rules: sharedRules
    },

    // ESM scripts (.mjs) — same globals but as modules
    {
        files: ['**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: browserNodeGlobals
        }
    },

    // Frontend modules — public/**/*.js use ES modules
    {
        files: ['public/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: browserNodeGlobals
        }
    },

    // Admin frontend — classic <script> files share state via window globals
    // (api, showToast, escapeHtml, currentExamId, etc) loaded across multiple
    // script tags. Declared so ESLint stops flagging them.
    {
        files: ['public/admin/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...browserNodeGlobals,
                // Helpers (defined in helpers.js / admin-main.js)
                api: 'readonly', escapeHtml: 'readonly',
                showToast: 'readonly', NotificationManager: 'readonly',
                customConfirm: 'readonly', openModal: 'readonly', closeModal: 'readonly',
                checkListOverflow: 'readonly',
                // Cross-script state shared via window
                currentExamId: 'writable', currentExamData: 'writable',
                currentSectionId: 'writable', currentSectionType: 'writable',
                editingExamId: 'writable', editingSectionId: 'writable', editingQuestionId: 'writable',
                _editingUserId: 'writable',
                _dragSectionIdx: 'writable',
                aiGeneratedData: 'writable', aiSelectedFiles: 'writable',
                _aiGenerating: 'writable', _allExams: 'writable',
                adminToken: 'writable', currentUser: 'writable',
                fillBlanks: 'writable', freeformSubParts: 'writable',
                questionImages: 'writable', optionImages: 'writable',
                explanationImages: 'writable',
                questionImageUrl: 'writable', explanationImageUrl: 'writable',
                updateSectionCount: 'readonly', renderAIPreview: 'readonly',
                renderMarkdown: 'readonly', renderEmptyState: 'readonly',
                showView: 'readonly', EXAM_DATA: 'readonly',
                // Third-party libs loaded via <script>
                renderMathInElement: 'readonly', MathJax: 'readonly',
                Chart: 'readonly', QRCode: 'readonly',
                global: 'readonly'
            }
        }
    },

    // Test files — Jest globals
    {
        files: ['tests/**/*.js', '**/*.test.js'],
        languageOptions: {
            globals: {
                ...browserNodeGlobals,
                describe: 'readonly', test: 'readonly', it: 'readonly',
                expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
                beforeAll: 'readonly', afterAll: 'readonly', jest: 'readonly'
            }
        }
    },

    {
        // Ignore patterns
        ignores: [
            'node_modules/**',
            '_archive/**',
            '_legacy/**',
            'data/**',
            'public/uploads/**',
            'public/assets/**',
            '*.min.js',
            'package-lock.json'
        ]
    }
];
