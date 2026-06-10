import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const supabase = createClient(url, key);
await supabase.auth.signInAnonymously();

const { data, error } = await supabase.functions.invoke('analyze-food', {
  body: { validate_gemini_key: 'AIza-invalid-test-key' },
});
console.log('error:', error?.message ?? null);
console.log('data:', JSON.stringify(data));
