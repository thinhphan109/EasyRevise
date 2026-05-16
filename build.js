/**
 * EasyRevise — Frontend bundler (Task 1)
 * Run: node build.js [--watch] [--prod]
 *
 * Entry points (one per page):
 *   home, exam, result, dashboard, admin
 *
 * Output: public/js/dist/<entry>.js (ESM, code-split, source-mapped in dev)
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isProd = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const isWatch = process.argv.includes('--watch');

const ENTRY_DIR = path.join(__dirname, 'public', 'js', 'pages');
const OUT_DIR = path.join(__dirname, 'public', 'js', 'dist');

// Ensure entries exist (create empty stubs if missing — Phase 0 bootstrap)
const entries = {};
for (const name of ['home', 'exam', 'result', 'dashboard', 'admin']) {
    const dir = path.join(ENTRY_DIR, name);
    const file = path.join(dir, 'index.js');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, `// Stub entry for ${name} — replace with real entry point\nexport default {};\n`);
    }
    entries[name] = file;
}

const buildOptions = {
    entryPoints: entries,
    bundle: true,
    minify: isProd,
    sourcemap: !isProd,
    format: 'esm',
    target: ['es2020'],
    outdir: OUT_DIR,
    splitting: true,
    metafile: true,
    logLevel: 'info',
    define: {
        'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development')
    },
    loader: {
        '.css': 'text',
        '.svg': 'text',
        '.png': 'file',
        '.jpg': 'file',
        '.woff2': 'file'
    }
};

async function run() {
    if (isWatch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[esbuild] Watching for changes...');
    } else {
        const result = await esbuild.build(buildOptions);
        // Print bundle sizes
        if (result.metafile) {
            const sizes = {};
            for (const [out, info] of Object.entries(result.metafile.outputs)) {
                sizes[path.basename(out)] = `${(info.bytes / 1024).toFixed(1)} KB`;
            }
            console.log('[esbuild] Bundle sizes:');
            for (const [name, size] of Object.entries(sizes)) {
                console.log(`  ${name.padEnd(40)} ${size}`);
            }
        }
        console.log(isProd ? '[esbuild] Production build complete' : '[esbuild] Dev build complete');
    }
}

run().catch(err => {
    console.error('[esbuild] Build failed:', err);
    process.exit(1);
});
