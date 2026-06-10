// Test analyze-food accuracy on demo/meal-scan.jpg (grilled chicken + kale).
// Run: node demo/test-meal-scan.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const { error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) throw authErr;

const b64 = readFileSync('demo/meal-scan.jpg').toString('base64');
const started = Date.now();
const { data, error } = await supabase.functions.invoke('analyze-food', {
  body: { image_base64: b64, mime_type: 'image/jpeg' },
});
const elapsed = Date.now() - started;

if (error || data?.error) {
  console.error('FAILED:', data?.error ?? error.message);
  process.exit(1);
}

const a = data.analysis;
console.log(`Model: ${data.provider}/${data.model} (${elapsed}ms)`);
console.log(`Food: ${a.food_name}`);
console.log(`Total protein: ${a.total_protein_g}g (${a.confidence} confidence)`);
console.log('Items:');
for (const item of a.items) {
  console.log(`  - ${item.name}: ${item.protein_g}g (~${item.estimated_grams ?? '?'}g, ${item.portion})`);
}
console.log(`Notes: ${a.notes || '(none)'}`);

const inRange = a.total_protein_g >= 40 && a.total_protein_g <= 55;
console.log(`\nExpected ~40-55g for grilled chicken + kale: ${inRange ? 'PASS' : 'CHECK'}`);
