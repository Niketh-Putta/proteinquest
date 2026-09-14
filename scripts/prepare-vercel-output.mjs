// Package marketing landing + static legal pages into Vercel Build Output API v3.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lockMarketingPageTitles } from './lib/marketing-page-title.mjs';

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

function copyStatsPage() {
  const slug = 'pqx-stats-k7m2n9';
  const destDir = path.join(staticDir, slug);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(path.join(marketingDir, `${slug}.html`), path.join(destDir, 'index.html'));
  fs.copyFileSync(path.join(marketingDir, `${slug}.js`), path.join(staticDir, `${slug}.js`));
}

function prepareStatsFunction() {
  const funcDir = path.join(outputDir, 'functions', 'api', 'pqx-stats-k7m2n9.func');
  fs.mkdirSync(funcDir, { recursive: true });
  fs.copyFileSync(path.join(root, 'api', 'pqx-stats-k7m2n9.mjs'), path.join(funcDir, 'index.mjs'));
  fs.copyFileSync(
    path.join(root, 'scripts/lib/store-download-stats.mjs'),
    path.join(funcDir, 'store-download-stats.mjs'),
  );
  fs.writeFileSync(
    path.join(funcDir, '.vc-config.json'),
    `${JSON.stringify(
      {
        runtime: 'nodejs20.x',
        handler: 'index.mjs',
        launcherType: 'Nodejs',
        maxDuration: 30,
      },
      null,
      2,
    )}\n`,
  );
}

function main() {
  execFileSync('node', [path.join(root, 'scripts/prepare-marketing-assets.mjs')], {
    stdio: 'inherit',
  });

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(staticDir, { recursive: true });

  // Marketing landing. Force tab/og title to use | so em dashes cannot sneak back in.
  const landingHtml = lockMarketingPageTitles(
    fs.readFileSync(path.join(marketingDir, 'index.html'), 'utf8'),
  );
  fs.writeFileSync(path.join(staticDir, 'index.html'), landingHtml);
  fs.copyFileSync(path.join(marketingDir, 'fonts.css'), path.join(staticDir, 'fonts.css'));
  fs.copyFileSync(path.join(marketingDir, 'styles.css'), path.join(staticDir, 'styles.css'));
  fs.copyFileSync(path.join(marketingDir, 'refinements.css'), path.join(staticDir, 'refinements.css'));
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

  // Private download stats dashboard (obscure URL, noindex)
  copyStatsPage();
  prepareStatsFunction();

  const securityHeaderMap = {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; " +
      "script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'",
  };

  const config = {
    version: 3,
    routes: [
      {
        src: '/(.*)',
        has: [{ type: 'host', value: 'www.proteinquest.app' }],
        status: 308,
        headers: { Location: 'https://proteinquest.app/$1' },
      },
      {
        src: '/(.*)',
        headers: securityHeaderMap,
        continue: true,
      },
      { handle: 'filesystem' },
      { src: '/api/pqx-stats-k7m2n9', dest: '/api/pqx-stats-k7m2n9' },
      { src: '/(.*)', dest: '/index.html' },
    ],
  };

  fs.writeFileSync(path.join(outputDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
  console.log(
    'Prepared .vercel/output — marketing landing + stats dashboard + API',
  );
}

main();
