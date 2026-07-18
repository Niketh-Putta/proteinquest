#!/usr/bin/env node
/**
 * Reuse the approved iPhone App Store previews for larger screenshot slots.
 * Only dimensions change: no new copy, device frames, or visual compositions.
 *
 * Source: store/screenshots/iphone67/01.png … 05.png (1290×2796)
 * Output: store/screenshots/ipad13/ (2064×2752)
 *         store/screenshots/mac/ (2880×1800)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SOURCE_DIR = path.join(root, 'store/screenshots/iphone67');
const BACKGROUND = '#0C0B10';

const FORMATS = {
  ipad13: { width: 2064, height: 2752 },
  mac: { width: 2880, height: 1800 },
};

async function adaptScreenshot(fileName, formatKey, outDir) {
  const fmt = FORMATS[formatKey];
  const srcPath = path.join(SOURCE_DIR, fileName);
  if (!fs.existsSync(srcPath)) throw new Error(`missing source: ${srcPath}`);

  const outPath = path.join(outDir, fileName);
  await sharp(srcPath)
    .resize(fmt.width, fmt.height, {
      fit: 'contain',
      position: 'centre',
      background: BACKGROUND,
    })
    .flatten({ background: BACKGROUND })
    .png()
    .toFile(outPath);

  const info = await sharp(outPath).metadata();
  console.log(`  ${fileName} ← iphone67/${fileName} → ${info.width}×${info.height}`);
  return outPath;
}

async function main() {
  const files = fs
    .readdirSync(SOURCE_DIR)
    .filter((file) => /^\d{2}\.png$/.test(file))
    .sort();
  if (files.length === 0) throw new Error(`No iPhone previews in ${SOURCE_DIR}`);

  const outDirs = {
    ipad13: path.join(root, 'store/screenshots/ipad13'),
    mac: path.join(root, 'store/screenshots/mac'),
  };
  for (const dir of Object.values(outDirs)) fs.mkdirSync(dir, { recursive: true });

  for (const [key, dir] of Object.entries(outDirs)) {
    console.log(`\n${key}:`);
    for (const file of files) {
      await adaptScreenshot(file, key, dir);
    }
  }
  console.log('\nDone — iPhone preview content adapted for iPad and Mac.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
