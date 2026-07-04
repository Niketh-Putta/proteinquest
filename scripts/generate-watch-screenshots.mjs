#!/usr/bin/env node
/** Branded Apple Watch store screenshots from phone marketing art (1080×1920). */
import fs from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url).pathname;

const SOURCES = [
  { file: 'store/screenshots/04-evolve.png', name: '01-protein-goal', focusY: 0.22 },
  { file: 'store/screenshots/05-dragons.png', name: '02-take-photo', focusY: 0.19 },
  { file: 'store/screenshots/01-today.png', name: '03-breakdown', focusY: 0.2 },
  { file: 'store/screenshots/03-breakdown.png', name: '04-choose-dragon', focusY: 0.18 },
  { file: 'store/screenshots/02-scan.png', name: '05-evolve', focusY: 0.16 },
];

const SIZES = [
  { w: 422, h: 514, tag: 'ultra3-422x514' },
  { w: 410, h: 502, tag: 'ultra3-410x502' },
  { w: 416, h: 496, tag: 'series11-416x496' },
];

async function watchFrame(srcPath, { w, h, focusY }) {
  const meta = await sharp(srcPath).metadata();
  const scale = Math.max(w / meta.width, h / meta.height);
  const rw = Math.round(meta.width * scale);
  const rh = Math.round(meta.height * scale);
  const resized = await sharp(srcPath).resize(rw, rh, { fit: 'fill' }).toBuffer();
  const left = Math.max(0, Math.round((rw - w) / 2));
  const top = Math.max(0, Math.round((rh - h) * focusY));
  const cropped = await sharp(resized)
    .extract({ left, top, width: w, height: h })
    .modulate({ brightness: 1.03, saturation: 1.08 })
    .png()
    .toBuffer();

  const rx = Math.round(w * 0.13);
  const overlay = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="v" cx="50%" cy="42%" r="72%">
        <stop offset="50%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.5"/>
      </radialGradient>
      <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0C0B10" stop-opacity="0.4"/>
        <stop offset="22%" stop-color="#0C0B10" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#v)"/>
    <rect width="${w}" height="${h}" fill="url(#t)"/>
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${rx}" fill="none" stroke="#FF7A59" stroke-opacity="0.22" stroke-width="2"/>
  </svg>`);

  return sharp(cropped).composite([{ input: overlay, blend: 'over' }]).png({ compressionLevel: 9 }).toBuffer();
}

const outDir = `${ROOT}/store/screenshots/watch`;
fs.mkdirSync(outDir, { recursive: true });

for (const src of SOURCES) {
  const path = `${ROOT}/${src.file}`;
  if (!fs.existsSync(path)) {
    console.error('missing', path);
    continue;
  }
  for (const size of SIZES) {
    const buf = await watchFrame(path, { ...size, focusY: src.focusY });
    const out = `${outDir}/${src.name}-${size.tag}.png`;
    await sharp(buf).toFile(out);
    console.log('✓', out.replace(ROOT, '.'));
  }
}

console.log('\nUpload 422×514 set to App Store Connect → Apple Watch section.');
