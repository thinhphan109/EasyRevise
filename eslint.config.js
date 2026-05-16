// eslint.config.js — ESLint flat config (v9+)
// Runs in CI via: npx eslint .
const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node.js globals
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                // Browser globals (for public/ frontend files)
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                fetch: 'readonly',
                alert: 'readonly',
                history: 'readonly',
                location: 'readonly',
                navigator: 'readonly',
                FormData: 'readonly',
                FileReader: 'readonly',
                Image: 'readonly',
                HTMLElement: 'readonly',
                MutationObserver: 'readonly',
                IntersectionObserver: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                Blob: 'readonly',
                crypto: 'readonly',
            }
        },
        rules: {
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
            'no-new-func': 'error',
        }
    },
    {
        // Ignore patterns
        ignores: [
            'node_modules/**',
            '_archive/**',
            'data/**',
            'public/uploads/**',
            'public/assets/**',
            '*.min.js',
            'package-lock.json'
        ]
    }
];
