// Patch dist/index.html with full favicon link tags after expo export.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'dist', 'index.html');

const ICON_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="any" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />',
  '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
];

const PUBLIC_ICONS = [
  'favicon.ico',
  'favicon-32.png',
  'favicon-48.png',
  'apple-touch-icon.png',
];

function copyPublicIcons() {
  const publicDir = path.join(root, 'public');
  const distDir = path.join(root, 'dist');
  for (const file of PUBLIC_ICONS) {
    const src = path.join(publicDir, file);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(distDir, file));
  }
  console.log('Copied public favicon assets to dist/');
}

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error('dist/index.html not found — run expo export first');
    process.exit(1);
  }

  copyPublicIcons();

  let html = fs.readFileSync(indexPath, 'utf8');

  // Remove any existing favicon / apple-touch-icon links injected by Expo.
  html = html.replace(/<link rel="(?:icon|apple-touch-icon)[^>]*>\s*/g, '');

  const block = ICON_LINKS.join('\n  ');
  if (!html.includes('</head>')) {
    console.error('dist/index.html has no </head> tag');
    process.exit(1);
  }

  html = html.replace('</head>', `  ${block}\n</head>`);
  fs.writeFileSync(indexPath, html);
  console.log('Updated dist/index.html with branded favicon links');
}

main();
