/**
 * Generate Play Store feature graphic (1024×500) via Playwright HTML render.
 * Usage: node demo/generate-feature-graphic.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'store', 'play-feature-graphic.png');
const ICON = join(__dirname, '..', 'store', 'icon-512.png');
const W = 1024;
const H = 500;

const iconB64 = (await readFile(ICON)).toString('base64');

const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px;
    height: ${H}px;
    background: linear-gradient(135deg, #0C0B10 0%, #1a1520 40%, #0f0d14 100%);
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
  }
  .glow {
    position: absolute;
    width: 400px;
    height: 400px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(220,38,38,0.25) 0%, transparent 70%);
    top: -80px;
    left: -60px;
  }
  .glow2 {
    position: absolute;
    width: 300px;
    height: 300px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%);
    bottom: -100px;
    right: 200px;
  }
  .content {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 60px;
    gap: 48px;
    position: relative;
    z-index: 1;
  }
  .icon {
    width: 200px;
    height: 200px;
    border-radius: 36px;
    box-shadow: 0 20px 60px rgba(220,38,38,0.35);
    flex-shrink: 0;
  }
  .text-block h1 {
    font-size: 64px;
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.05;
    color: #fff;
    margin-bottom: 16px;
  }
  .text-block h1 span { color: #ef4444; }
  .tagline {
    font-size: 28px;
    color: rgba(255,255,255,0.75);
    font-weight: 500;
    max-width: 580px;
    line-height: 1.35;
  }
  .badges {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }
  .badge {
    background: rgba(239,68,68,0.15);
    border: 1px solid rgba(239,68,68,0.35);
    color: #fca5a5;
    padding: 8px 18px;
    border-radius: 999px;
    font-size: 16px;
    font-weight: 600;
  }
  .dragon-accent {
    position: absolute;
    right: 40px;
    bottom: 30px;
    font-size: 120px;
    opacity: 0.08;
    user-select: none;
  }
</style>
</head>
<body>
  <div class="glow"></div>
  <div class="glow2"></div>
  <div class="content">
    <img class="icon" src="data:image/png;base64,${iconB64}" alt="icon" />
    <div class="text-block">
      <h1>Protein<span>Quest</span></h1>
      <p class="tagline">Snap meals. Track protein. Evolve your dragon.</p>
      <div class="badges">
        <span class="badge">AI Meal Scanner</span>
        <span class="badge">Daily Dragon</span>
        <span class="badge">Protein Goals</span>
      </div>
    </div>
  </div>
  <div class="dragon-accent">🐉</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html, { waitUntil: 'networkidle' });
const buffer = await page.screenshot({ type: 'png' });
await browser.close();
await writeFile(OUT, buffer);
console.log(`Saved ${OUT} (${W}×${H})`);
