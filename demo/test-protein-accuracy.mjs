// Protein accuracy regression: visual meal + synthetic nutrition label (50g).
// Run: node demo/generate-label-test-image.mjs && node demo/test-protein-accuracy.mjs
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY');
  process.exit(1);
}

if (!existsSync('demo/label-50g-protein.png')) {
  spawnSync('node', ['demo/generate-label-test-image.mjs'], { stdio: 'inherit' });
}

const supabase = createClient(url, key);
const { error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) throw authErr;

const CASES = [
  {
    id: 'meal-scan',
    file: 'demo/meal-scan.jpg',
    mime: 'image/jpeg',
    description: 'Grilled chicken + kale (visual portion estimate)',
    expectMin: 40,
    expectMax: 65,
    expectSource: 'visual',
  },
  {
    id: 'label-50g',
    file: 'demo/label-50g-protein.png',
    mime: 'image/png',
    description: 'Synthetic nutrition label showing Protein 50g',
    expectMin: 45,
    expectMax: 55,
    expectSource: 'label',
  },
];

const results = [];

for (const c of CASES) {
  process.stdout.write(`\n=== ${c.id}: ${c.description} ===\n`);
  const b64 = readFileSync(c.file).toString('base64');
  const started = Date.now();
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { image_base64: b64, mime_type: c.mime },
  });
  const elapsed = Date.now() - started;

  if (error || data?.error) {
    console.error('FAILED:', data?.error ?? error.message);
    results.push({ ...c, ok: false, error: data?.error ?? error.message });
    continue;
  }

  const a = data.analysis;
  const inRange = a.total_protein_g >= c.expectMin && a.total_protein_g <= c.expectMax;
  const notes = a.notes || '';
  const labelHint = /label|nutrition|packaging|screen|per serving/i.test(notes);

  console.log(`Model: ${data.provider}/${data.model} (${elapsed}ms)`);
  console.log(`Food: ${a.food_name}`);
  console.log(`Total protein: ${a.total_protein_g}g (${a.confidence})`);
  console.log('Items:');
  for (const item of a.items) {
    console.log(`  - ${item.name}: ${item.protein_g}g (${item.portion})`);
  }
  console.log(`Notes: ${notes || '(none)'}`);

  const ok = inRange && (c.expectSource !== 'label' || labelHint || a.total_protein_g >= 45);
  console.log(
    `Expected ${c.expectMin}-${c.expectMax}g: ${inRange ? 'RANGE OK' : 'RANGE FAIL'} | ${ok ? 'PASS' : 'CHECK'}`,
  );

  results.push({
    id: c.id,
    ok,
    inRange,
    total_protein_g: a.total_protein_g,
    confidence: a.confidence,
    notes,
    model: `${data.provider}/${data.model}`,
    elapsed,
  });
}

console.log('\n--- Summary ---');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}: ${r.total_protein_g ?? 'error'}g`);
}
const allOk = results.every((r) => r.ok);
process.exit(allOk ? 0 : 1);
