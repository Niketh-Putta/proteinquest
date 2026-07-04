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
  { src: '04-evolve.png' }, // Hit your protein goal every day
  { src: '05-dragons.png' }, // Just take a photo
  { src: '01-today.png' }, // See where protein comes from
  { src: '03-breakdown.png' }, // Choose your dragon
  { src: '02-scan.png' }, // Feed your dragon to evolve
];

const FORMATS = {
  iphone67: { width: 1290, height: 2796, phoneMaxW: 1180, edgePad: 56 },
  ipad13: { width: 2064, height: 2752, phoneMaxW: 1400, edgePad: 72 },
};


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

  const phoneMaxW = fmt.width - fmt.edgePad * 2;
  const phoneMaxH = fmt.height - fmt.edgePad * 2;

  const { buf: phoneBuf, w: phoneW, h: phoneH } = await containPhone(srcPath, phoneMaxW, phoneMaxH);
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
  const phoneY = Math.round((fmt.height - frameH) / 2);

  const idx = SCREENS.indexOf(screen) + 1;
  const outFile = `${String(idx).padStart(2, '0')}.png`;
  const outPath = path.join(outDir, outFile);

  await sharp(gradientSvg(fmt.width, fmt.height))
    .composite([{ input: framed, top: phoneY, left: phoneX }])
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
