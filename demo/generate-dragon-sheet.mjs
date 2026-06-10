// Generate demo/dragon-transformations.png from dragon assets grid.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'dragon-sheet.html');
const outPath = path.join(__dirname, 'dragon-transformations.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2200, height: 1400 } });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log('Saved', outPath);
