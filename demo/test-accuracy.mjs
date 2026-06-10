// Tests analyze-food with diverse images. Run: node demo/test-accuracy.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

// Small public-domain / CC food photos (Wikimedia Commons thumbnails)
const CASES = [
  { id: 'cake', label: 'Birthday cake', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Pound_layer_cake.jpg/320px-Pound_layer_cake.jpg', expectFood: true },
  { id: 'burger', label: 'Cheeseburger', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cheeseburger.jpg/320px-Cheeseburger.jpg', expectFood: true },
  { id: 'salad', label: 'Garden salad', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Garden_salad.jpg/320px-Garden_salad.jpg', expectFood: true },
  { id: 'curry', label: 'Chicken curry', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Indian_Chicken_Curry.jpg/320px-Indian_Chicken_Curry.jpg', expectFood: true },
  { id: 'protein-bar', label: 'Protein bar', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Protein_bar.jpg/320px-Protein_bar.jpg', expectFood: true },
  { id: 'empty-plate', label: 'Empty white plate', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/White_plate.jpg/320px-White_plate.jpg', expectFood: false },
  { id: 'keyboard', label: 'Computer keyboard (non-food)', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Computer_keyboard.png/320px-Computer_keyboard.png', expectFood: false },
];

const outDir = path.resolve('demo/accuracy-results');
mkdirSync(outDir, { recursive: true });

const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) throw authErr;

const results = [];

for (const c of CASES) {
  process.stdout.write(`Testing ${c.label}... `);
  try {
    const res = await fetch(c.url);
    const buf = Buffer.from(await res.arrayBuffer());
    const b64 = buf.toString('base64');
    const { data, error } = await supabase.functions.invoke('analyze-food', {
      body: { image_base64: b64, mime_type: c.url.endsWith('.png') ? 'image/png' : 'image/jpeg' },
    });
    if (error || data?.error) {
      const msg = data?.error ?? error.message;
      console.log('API ERROR:', msg.slice(0, 80));
      results.push({ ...c, ok: false, error: msg });
      continue;
    }
    const a = data.analysis;
    const pass =
      c.expectFood
        ? a.is_food && a.items.length > 0 && a.total_protein_g >= 0
        : !a.is_food;
    console.log(pass ? 'PASS' : 'FAIL', a.is_food ? `"${a.food_name}" ${a.total_protein_g}g (${a.items.length} items)` : `not food: ${a.notes?.slice(0, 50)}`);
    results.push({
      ...c,
      ok: pass,
      is_food: a.is_food,
      food_name: a.food_name,
      total_protein_g: a.total_protein_g,
      items: a.items?.map((i) => `${i.name} ${i.protein_g}g`),
      confidence: a.confidence,
      notes: a.notes,
      model: data.model,
    });
  } catch (e) {
    console.log('ERR', e.message);
    results.push({ ...c, ok: false, error: e.message });
  }
}

writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} cases passed`);
console.log(`Full results: demo/accuracy-results/results.json`);
