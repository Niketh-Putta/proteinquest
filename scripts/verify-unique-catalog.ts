/**
 * Quick check for UNIQUE_FOODS search hits.
 *   npx --yes tsx scripts/verify-unique-catalog.ts
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const mock = path.join(root, 'scripts/lib/rn-mock-module.mjs');
const supabaseStub = path.join(root, 'scripts/lib/supabase-stub.mjs');

function bundle() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'pq-unique-'));
  const outfile = path.join(outDir, 'food-catalog.mjs');
  const entry = path.join(outDir, 'entry.ts');
  const original = readFileSync(path.join(root, 'src/lib/food-catalog.ts'), 'utf8');
  const absRewritten = original
    .replace(/from ['"]\.\/supabase['"]/, `from ${JSON.stringify(supabaseStub)}`)
    .replace(
      /from ['"]\.\/(food-catalog[^'"]+)['"]/g,
      (_m, file: string) => `from ${JSON.stringify(path.join(root, 'src/lib', file))}`,
    );
  writeFileSync(entry, absRewritten);
  execFileSync(
    'npx',
    [
      '--yes',
      'esbuild',
      entry,
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--outfile=${outfile}`,
      `--alias:@react-native-async-storage/async-storage=${mock}`,
      `--alias:react-native=${mock}`,
      `--alias:react-native-url-polyfill=${mock}`,
      `--alias:react-native-url-polyfill/auto=${mock}`,
      `--alias:expo-constants=${mock}`,
      `--alias:@supabase/supabase-js=${supabaseStub}`,
      '--log-level=warning',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  return outfile;
}

async function main() {
  const outfile = bundle();
  const mod = await import(pathToFileURL(outfile).href);
  const { searchCatalog } = mod as { searchCatalog: (q: string) => { name: string }[] };
  const uniqueSrc = readFileSync(path.join(root, 'src/lib/food-catalog-unique.ts'), 'utf8');
  const uniqueCount = (uniqueSrc.match(/^\s*f\(/gm) || []).length;
  console.log(`UNIQUE_FOODS entries: ${uniqueCount}`);
  for (const q of [
    'orange',
    'orange zest',
    'lemon zest',
    'garlic paste',
    'kasuri methi',
    'fish sauce',
    'gochujang',
    'cocoa powder',
  ]) {
    const hits = searchCatalog(q)
      .slice(0, 8)
      .map((f) => f.name);
    console.log(`${q} -> ${hits.join(' | ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
