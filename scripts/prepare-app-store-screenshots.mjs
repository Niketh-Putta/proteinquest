#!/usr/bin/env node
/**
 * Premium App Store screenshots — contain/letterbox on dark gradient, never stretch.
 * Source: store/screenshots/0*.png (1080×1920 phone captures)
 * Output: store/screenshots/iphone67/ and store/screenshots/ipad13/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const BG = '#0C0B10';
const BG_END = '#151320';

const SCREENS = [
  { src: '01-today.png', headline: 'Hit your protein goal today', sub: 'One clear daily target' },
  { src: '02-scan.png', headline: 'Scan any meal instantly', sub: 'AI estimates protein in seconds' },
  { src: '03-breakdown.png', headline: 'See every macro at a glance', sub: 'Calories, protein, and more' },
  { src: '04-evolve.png', headline: 'Evolve your daily dragon', sub: 'Earn XP when you hit your goal' },
  { src: '05-dragons.png', headline: 'Pick your dragon each morning', sub: 'Ember, Frost, or Moss' },
];

const FORMATS = {
  iphone67: { width: 1290, height: 2796, phoneMaxW: 920, headlineSize: 72, subSize: 36, topPad: 180 },
  ipad13: { width: 2064, height: 2752, phoneMaxW: 1100, headlineSize: 88, subSize: 42, topPad: 220 },
};

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gradientSvg(w, h) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${BG}"/>
          <stop offset="100%" stop-color="${BG_END}"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="30%" r="60%">
          <stop offset="0%" stop-color="#1E1A2E" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <rect width="${w}" height="${h}" fill="url(#glow)"/>
    </svg>`,
  );
}

function headlineSvg(w, { headline, sub, headlineSize, subSize, topPad }) {
  const cx = w / 2;
  return Buffer.from(
    `<svg width="${w}" height="${topPad + 120}" xmlns="http://www.w3.org/2000/svg">
      <text x="${cx}" y="${topPad}" text-anchor="middle"
        font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
        font-weight="700" font-size="${headlineSize}" fill="#FFFFFF">${escapeXml(headline)}</text>
      <text x="${cx}" y="${topPad + headlineSize + 16}" text-anchor="middle"
        font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
        font-weight="400" font-size="${subSize}" fill="#9CA3AF">${escapeXml(sub)}</text>
    </svg>`,
  );
}

function frameSvg(w, h, radius) {
  const stroke = 3;
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${stroke / 2}" y="${stroke / 2}" width="${w - stroke}" height="${h - stroke}"
        rx="${radius}" ry="${radius}" fill="none" stroke="#2A2738" stroke-width="${stroke}"/>
      <rect x="${stroke + 2}" y="${stroke + 2}" width="${w - stroke * 2 - 4}" height="${h - stroke * 2 - 4}"
        rx="${radius - 2}" ry="${radius - 2}" fill="none" stroke="#1A1824" stroke-width="1"/>
    </svg>`,
  );
}

async function containPhone(srcPath, maxW, maxH) {
  const meta = await sharp(srcPath).metadata();
  const scale = Math.min(maxW / meta.width, maxH / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const buf = await sharp(srcPath).resize(w, h, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  return { buf, w, h };
}

async function renderScreen(screen, formatKey, outDir) {
  const fmt = FORMATS[formatKey];
  const srcPath = path.join(root, 'store/screenshots', screen.src);
  if (!fs.existsSync(srcPath)) throw new Error(`missing source: ${srcPath}`);

  const headlineH = fmt.topPad + fmt.headlineSize + fmt.subSize + 60;
  const phoneAreaH = fmt.height - headlineH - 80;
  const phoneMaxH = phoneAreaH - 40;

  const { buf: phoneBuf, w: phoneW, h: phoneH } = await containPhone(srcPath, fmt.phoneMaxW, phoneMaxH);
  const radius = Math.round(Math.min(phoneW, phoneH) * 0.045);
  const frameW = phoneW + 24;
  const frameH = phoneH + 24;

  const phoneRounded = await sharp(phoneBuf)
    .composite([{ input: Buffer.from(`<svg><rect x="0" y="0" width="${phoneW}" height="${phoneH}" rx="${radius}" ry="${radius}"/></svg>`), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const frame = await sharp(frameSvg(frameW, frameH, radius + 4)).png().toBuffer();
  const framed = await sharp({
    create: { width: frameW, height: frameH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: phoneRounded, top: 12, left: 12 },
      { input: frame, top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  const phoneX = Math.round((fmt.width - frameW) / 2);
  const phoneY = headlineH + Math.round((phoneAreaH - frameH) / 2);

  const idx = SCREENS.indexOf(screen) + 1;
  const outFile = `${String(idx).padStart(2, '0')}.png`;
  const outPath = path.join(outDir, outFile);

  await sharp(gradientSvg(fmt.width, fmt.height))
    .composite([
      { input: headlineSvg(fmt.width, { ...screen, ...fmt }), top: 0, left: 0 },
      { input: framed, top: phoneY, left: phoneX },
    ])
    .png()
    .toFile(outPath);

  const info = await sharp(outPath).metadata();
  console.log(`  ${outFile} → ${info.width}×${info.height}`);
  return outPath;
}

async function main() {
  const outDirs = {
    iphone67: path.join(root, 'store/screenshots/iphone67'),
    ipad13: path.join(root, 'store/screenshots/ipad13'),
  };
  for (const dir of Object.values(outDirs)) fs.mkdirSync(dir, { recursive: true });

  for (const [key, dir] of Object.entries(outDirs)) {
    console.log(`\n${key}:`);
    for (const screen of SCREENS) {
      await renderScreen(screen, key, dir);
    }
  }
  console.log('\nDone — premium letterboxed screenshots ready.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
