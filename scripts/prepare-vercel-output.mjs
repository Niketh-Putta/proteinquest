// Package marketing landing + static legal pages into Vercel Build Output API v3.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const marketingDir = path.join(root, 'marketing');
const outputDir = path.join(root, '.vercel', 'output');
const staticDir = path.join(outputDir, 'static');

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function copyLegalPage(slug) {
  const destDir = path.join(staticDir, slug);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(
    path.join(marketingDir, 'legal', `${slug}.html`),
    path.join(destDir, 'index.html'),
  );
}

function main() {
  execFileSync('node', [path.join(root, 'scripts/prepare-marketing-assets.mjs')], {
    stdio: 'inherit',
  });

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(staticDir, { recursive: true });

  // Marketing landing
  fs.copyFileSync(path.join(marketingDir, 'index.html'), path.join(staticDir, 'index.html'));
  fs.copyFileSync(path.join(marketingDir, 'styles.css'), path.join(staticDir, 'styles.css'));
  fs.copyFileSync(path.join(marketingDir, 'legal.css'), path.join(staticDir, 'legal.css'));
  fs.copyFileSync(path.join(marketingDir, 'main.js'), path.join(staticDir, 'main.js'));
  copyRecursive(path.join(marketingDir, 'assets'), path.join(staticDir, 'assets'));

  for (const file of ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png']) {
    const src = path.join(marketingDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(staticDir, file));
    }
  }

  // Static legal pages at /privacy and /terms
  copyLegalPage('privacy');
  copyLegalPage('terms');

  const config = {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  };

  fs.writeFileSync(path.join(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
  console.log('Prepared .vercel/output — marketing landing + static privacy/terms');
}

main();
