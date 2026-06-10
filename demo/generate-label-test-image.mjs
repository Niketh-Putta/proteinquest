// Generate a synthetic nutrition-label test image (50g protein per serving).
// Run: node demo/generate-label-test-image.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 480, height: 640 } });
await page.goto(pathToFileURL('demo/label-50g-protein.html').href);
await page.screenshot({ path: 'demo/label-50g-protein.png', type: 'png' });
await browser.close();
console.log('Wrote demo/label-50g-protein.png');
