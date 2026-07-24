// Build static marketing landing into dist/ for local preview only.
// Production domains (proteinquest.app) ship the Expo app — marketing is suppressed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const staticDir = path.join(root, '.vercel', 'output', 'static');
const distDir = path.join(root, 'dist');

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

execFileSync('node', [path.join(root, 'scripts/prepare-vercel-output.mjs')], {
  stdio: 'inherit',
});

fs.rmSync(distDir, { recursive: true, force: true });
copyRecursive(staticDir, distDir);
console.log(
  'Prepared dist/ — marketing preview only (production uses Expo app on proteinquest.app)',
);
