/**
 * scripts/build-logo-assets.mjs
 *
 * Crops & resizes EasyRevise logo source files into a standardized
 * web/PWA/social asset bundle in `public/assets/logo/`.
 *
 * Sources (LogoTemp/):
 *   - ER_LogoCorlorVer.png  (1254x1254, square color mark)
 *   - ER_LogoPNGVer.png     (1536x1024, color wordmark)
 *   - ER_DarkVer.png        (1536x1024, dark variant wordmark)
 *
 * Outputs (public/assets/logo/):
 *   mark-512.png, mark-256.png, mark-192.png, mark-96.png, mark-64.png
 *   wordmark-light.png, wordmark-light@2x.png
 *   wordmark-dark.png, wordmark-dark@2x.png
 *   favicon-32.png, favicon-16.png, apple-touch-icon.png (180px)
 *   og-cover.png (1200x630 social card)
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'LogoTemp');
const OUT = path.join(ROOT, 'public', 'assets', 'logo');

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

/** Trim near-transparent edges and resize while preserving aspect ratio. */
async function cropTrim(inputPath) {
    return sharp(inputPath, { failOnError: false })
        .trim({ threshold: 8 }) // remove transparent / near-white border
        .toBuffer({ resolveWithObject: true });
}

async function buildMark() {
    const src = path.join(SRC, 'ER_LogoCorlorVer.png');
    const { data } = await cropTrim(src);
    const sizes = [512, 256, 192, 96, 64];
    for (const s of sizes) {
        await sharp(data)
            .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ compressionLevel: 9, palette: false })
            .toFile(path.join(OUT, `mark-${s}.png`));
        console.log(`✓ mark-${s}.png`);
    }
    // Apple touch icon — 180px with safe padding
    await sharp(data)
        .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(OUT, 'apple-touch-icon.png'));
    console.log('✓ apple-touch-icon.png (180×180)');

    // Favicons
    for (const s of [32, 16]) {
        await sharp(data).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png().toFile(path.join(OUT, `favicon-${s}.png`));
        console.log(`✓ favicon-${s}.png`);
    }
}

async function buildWordmark(srcName, baseName) {
    const src = path.join(SRC, srcName);
    const { data, info } = await cropTrim(src);
    const aspect = info.width / info.height;
    // Target widths
    const widths = [
        { w: 360, suffix: '' },
        { w: 720, suffix: '@2x' },
    ];
    for (const { w, suffix } of widths) {
        const h = Math.round(w / aspect);
        await sharp(data).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ compressionLevel: 9 })
            .toFile(path.join(OUT, `${baseName}${suffix}.png`));
        console.log(`✓ ${baseName}${suffix}.png  (${w}×${h})`);
    }
}

async function buildOgCover() {
    // 1200×630 social card: center-mark on a brand gradient
    const markBuf = await sharp(path.join(SRC, 'ER_LogoCorlorVer.png'))
        .trim({ threshold: 8 })
        .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    // Solid background (white for light brand)
    const bg = sharp({
        create: {
            width: 1200,
            height: 630,
            channels: 4,
            background: { r: 248, g: 250, b: 255, alpha: 1 }
        }
    }).png();

    const composite = await bg
        .composite([{ input: markBuf, gravity: 'center' }])
        .toBuffer();

    await sharp(composite).png().toFile(path.join(OUT, 'og-cover.png'));
    console.log('✓ og-cover.png (1200×630)');
}

async function main() {
    await ensureDir(OUT);
    console.log('→ output:', OUT);
    await buildMark();
    await buildWordmark('ER_LogoPNGVer.png', 'wordmark-light');
    await buildWordmark('ER_DarkVer.png', 'wordmark-dark');
    await buildOgCover();
    console.log('\n✔ All logo assets built.');
}

main().catch(err => { console.error(err); process.exit(1); });
