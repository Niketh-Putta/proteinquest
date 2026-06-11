// Package expo export (dist/) into Vercel Build Output API v3 for `vercel deploy --prebuilt`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
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

function main() {
  if (!fs.existsSync(distDir)) {
    console.error('dist/ not found — run expo export first');
    process.exit(1);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  copyRecursive(distDir, staticDir);

  const config = {
    version: 3,
    routes: [
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  };

  fs.writeFileSync(path.join(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
  console.log('Prepared .vercel/output from dist/ (SPA rewrites included)');
}

main();
