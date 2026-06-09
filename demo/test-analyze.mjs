// Direct end-to-end test of the analyze-food edge function.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const url = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const key = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

const supabase = createClient(url, key);
const { data: auth, error: authErr } = await supabase.auth.signInAnonymously();
if (authErr) {
  console.error('AUTH FAILED:', authErr.message);
  process.exit(1);
}
console.log('signed in anonymously:', auth.user.id);

const b64 = fs.readFileSync('demo/demo-meal.jpg').toString('base64');
console.log('image bytes (base64):', b64.length);

const started = Date.now();
const { data, error } = await supabase.functions.invoke('analyze-food', {
  body: { image_base64: b64 },
});
console.log('elapsed ms:', Date.now() - started);
if (error) {
  console.error('INVOKE ERROR:', error.name, error.message);
  const body = error.context ? await error.context.text().catch(() => null) : null;
  console.error('response body:', body);
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));
