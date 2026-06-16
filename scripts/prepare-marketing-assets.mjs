// Copy minimal assets for the static marketing landing page.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'marketing', 'assets');
const badgesDir = path.join(outDir, 'badges');

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

function resizePng(srcRel, destRel, maxPx) {
  const src = path.join(root, srcRel);
  const dest = path.join(outDir, destRel);
  ensureDir(path.dirname(dest));
  execFileSync('sips', ['-Z', String(maxPx), src, '--out', dest], { stdio: 'pipe' });
}

function download(url, dest) {
  execFileSync('curl', ['-fsSL', url, '-o', dest], { stdio: 'pipe' });
}

function main() {
  ensureDir(outDir);
  ensureDir(badgesDir);

  copyFile('assets/images/icon.png', 'icon.png');
  copyFile('store/screenshots/01-today.png', 'app-today.png');
  resizePng('store/screenshots/01-today.png', 'og-image.png', 1200);

  download(PLAY_BADGE_URL, path.join(badgesDir, 'google-play.png'));
  download(APP_STORE_BADGE_URL, path.join(badgesDir, 'app-store.svg'));

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

  console.log('Prepared marketing/assets (icon, app preview, official store badges)');
}

main();
