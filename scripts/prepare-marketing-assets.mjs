// Copy minimal assets for the static marketing landing page.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'marketing', 'assets');
const badgesDir = path.join(outDir, 'badges');
const SHARE_PREVIEW = 'share-preview.png';

const PLAY_BADGE_URL =
  'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
const APP_STORE_BADGE_URL =
  'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(srcRel, destRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(outDir, destRel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

async function resizePreview(srcRel, destRel, maxPx) {
  const src = path.join(root, srcRel);
  const dest = path.join(outDir, destRel);
  ensureDir(path.dirname(dest));
  await sharp(src).resize(maxPx, maxPx, { fit: 'inside' }).png().toFile(dest);
}

async function resizeScreenshot(srcRel, destRel, maxWidth) {
  const src = path.join(root, srcRel);
  const dest = path.join(outDir, destRel);
  ensureDir(path.dirname(dest));
  await sharp(src).resize(maxWidth, null, { withoutEnlargement: true }).png().toFile(dest);
}

const STORE_SCREENSHOTS = [
  { src: 'marketing/source/screenshots/ios-01.png', dest: 'screenshots/ios-01.png' },
  { src: 'marketing/source/screenshots/ios-02.png', dest: 'screenshots/ios-02.png' },
  { src: 'marketing/source/screenshots/ios-03.png', dest: 'screenshots/ios-03.png' },
  { src: 'marketing/source/screenshots/ios-04.png', dest: 'screenshots/ios-04.png' },
  { src: 'marketing/source/screenshots/ios-05.png', dest: 'screenshots/ios-05.png' },
];

function download(url, dest) {
  execFileSync('curl', ['-fsSL', url, '-o', dest], { stdio: 'pipe' });
}

async function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDir(outDir);
  ensureDir(badgesDir);

  copyFile('assets/images/icon.png', 'icon.png');
  copyFile('marketing/source/hero-promo.jpg', 'hero-promo.jpg');
  await resizePreview('marketing/source/hero-promo.jpg', SHARE_PREVIEW, 1200);

  // Keep legacy OG URLs serving the same current preview image.
  for (const legacy of ['og-image.png', 'hero-og.png']) {
    fs.copyFileSync(path.join(outDir, SHARE_PREVIEW), path.join(outDir, legacy));
  }

  download(PLAY_BADGE_URL, path.join(badgesDir, 'google-play.png'));
  download(APP_STORE_BADGE_URL, path.join(badgesDir, 'app-store.svg'));
  download(
    'https://cdn.jsdelivr.net/npm/simple-icons@16/icons/apple.svg',
    path.join(badgesDir, 'apple-mark.svg'),
  );
  download(
    'https://cdn.jsdelivr.net/npm/simple-icons@16/icons/googleplay.svg',
    path.join(badgesDir, 'google-play-mark.svg'),
  );

  for (const shot of STORE_SCREENSHOTS) {
    await resizeScreenshot(shot.src, shot.dest, 540);
  }
  for (const name of ['today', 'scan', 'trends', 'dragons', 'league']) {
    copyFile(
      'marketing/source/screenshots/phone-' + name + '.png',
      'screenshots/phone-' + name + '.png',
    );
  }

  const fontsDir = path.join(outDir, 'fonts');
  ensureDir(fontsDir);
  for (const weight of [400, 600, 700]) {
    copyFile('marketing/source/fonts/manrope-' + weight + '.ttf', 'fonts/manrope-' + weight + '.ttf');
  }
  download(
    'https://fonts.gstatic.com/s/sora/v17/xMQ9uFFYT72X5wkB_18qmnndmSdSnh2BAfO5mnuyOo1lfiQAVaW2gaU.woff2',
    path.join(fontsDir, 'sora-latin.woff2'),
  );

  copyFile('public/favicon.ico', '../favicon.ico');
  copyFile('public/favicon-32.png', '../favicon-32.png');
  copyFile('public/apple-touch-icon.png', '../apple-touch-icon.png');

  for (const slug of ['privacy', 'terms']) {
    const destDir = path.join(root, 'marketing', slug);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(
      path.join(root, 'marketing/legal', `${slug}.html`),
      path.join(destDir, 'index.html'),
    );
  }

  console.log(
    `Prepared marketing/assets (${SHARE_PREVIEW}, ${STORE_SCREENSHOTS.length} store screenshots)`,
  );
}

await main();
