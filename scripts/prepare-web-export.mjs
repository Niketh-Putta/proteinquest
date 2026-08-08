// Patch dist/index.html with full favicon link tags after expo export.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const indexPath = path.join(distDir, 'index.html');

/** Vercel always ignores `node_modules` paths — Expo puts fonts under assets/node_modules. */
const ASSETS_NM = path.join(distDir, 'assets', 'node_modules');
const ASSETS_BUNDLED = path.join(distDir, 'assets', 'bundled');
const NM_URL_FROM = 'assets/node_modules';
const NM_URL_TO = 'assets/bundled';

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
  for (const file of PUBLIC_ICONS) {
    const src = path.join(publicDir, file);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(distDir, file));
  }
  console.log('Copied public favicon assets to dist/');
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

/** Rename assets/node_modules → assets/bundled and rewrite URLs in the export. */
function relocateBundledAssets() {
  if (!fs.existsSync(ASSETS_NM)) {
    console.log('No assets/node_modules to relocate');
    return;
  }
  if (fs.existsSync(ASSETS_BUNDLED)) {
    fs.rmSync(ASSETS_BUNDLED, { recursive: true, force: true });
  }
  fs.renameSync(ASSETS_NM, ASSETS_BUNDLED);

  const textExt = new Set(['.js', '.html', '.json', '.css', '.map', '.txt']);
  for (const file of walkFiles(distDir)) {
    if (!textExt.has(path.extname(file))) continue;
    const before = fs.readFileSync(file, 'utf8');
    if (!before.includes(NM_URL_FROM)) continue;
    fs.writeFileSync(file, before.split(NM_URL_FROM).join(NM_URL_TO));
  }
  console.log('Relocated assets/node_modules → assets/bundled for Vercel upload');
}

function main() {
  if (!fs.existsSync(indexPath)) {
    console.error('dist/index.html not found — run expo export first');
    process.exit(1);
  }

  copyPublicIcons();
  relocateBundledAssets();

  let html = fs.readFileSync(indexPath, 'utf8');

  // iPhone Safari: without viewport-fit=cover, safe-area insets stay 0 and chrome
  // sits under the status bar / Dynamic Island.
  if (!html.includes('viewport-fit=cover')) {
    html = html.replace(
      /(<meta\s+name="viewport"\s+content=")([^"]*)("\s*\/?>)/i,
      (_, open, content, close) => {
        const next = content.includes('viewport-fit=cover')
          ? content
          : `${content.replace(/,?\s*$/, '')}, viewport-fit=cover`;
        return `${open}${next}${close}`;
      },
    );
  }

  // Zero webkit input vertical padding so placeholders center in fixed-height fields.
  if (!html.includes('data-pq-input-pad')) {
    const inputCss = `<style data-pq-input-pad>
input, textarea, [contenteditable="true"] {
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
</style>`;
    html = html.includes('</head>')
      ? html.replace('</head>', `${inputCss}\n</head>`)
      : html;
  }

  // Remove any existing favicon / apple-touch-icon links injected by Expo.
  html = html.replace(/<link rel="(?:icon|apple-touch-icon)[^>]*>\s*/g, '');

  const block = ICON_LINKS.join('\n  ');
  if (!html.includes('</head>')) {
    console.error('dist/index.html has no </head> tag');
    process.exit(1);
  }

  html = html.replace('</head>', `  ${block}\n</head>`);
  fs.writeFileSync(indexPath, html);
  console.log('Updated dist/index.html with branded favicon links + viewport-fit=cover');

  // SPA fallback only — existing static files win on Vercel.
  const vercelConfig = {
    buildCommand: '',
    installCommand: '',
    framework: null,
    rewrites: [{ source: '/((?!_expo/|assets/).*)', destination: '/index.html' }],
  };
  fs.writeFileSync(path.join(distDir, 'vercel.json'), `${JSON.stringify(vercelConfig, null, 2)}\n`);
  console.log('Wrote dist/vercel.json for SPA routing');
}

main();
