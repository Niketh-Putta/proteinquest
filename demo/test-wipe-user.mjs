// Full stale-JWT reproduction: create user, delete from auth.users, retry save
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: signIn } = await supabase.auth.signInAnonymously();
const userId = signIn.user.id;
const session = signIn.session;
console.log('1. created user', userId);

// Store session, then delete user (requires service role - run via MCP separately)
console.log('2. DELETE THIS USER IN SQL:', userId);
console.log('   Then re-run with USER_ID env set');

if (process.env.USER_ID && process.env.ACCESS_TOKEN) {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.setSession({
    access_token: process.env.ACCESS_TOKEN,
    refresh_token: process.env.REFRESH_TOKEN ?? '',
  });

  const { data: gu, error: guErr } = await client.auth.getUser();
  console.log('3. getUser after wipe:', gu.user?.id, 'error:', guErr?.message ?? 'none');

  const { error: upsertErr } = await client
    .from('profiles')
    .upsert({ id: process.env.USER_ID, intro_completed: true })
    .select()
    .single();
  console.log('4. upsert after wipe:', upsertErr?.code, upsertErr?.message ?? 'ok');
}

// Export tokens for step 2
console.log('\nTokens for step 2:');
console.log('USER_ID=' + userId);
console.log('ACCESS_TOKEN=' + session.access_token.slice(0, 40) + '...');
console.log('REFRESH_TOKEN=' + session.refresh_token.slice(0, 40) + '...');

// Write full tokens to temp file for next step
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/pq-stale-test.json', JSON.stringify({ userId, session }, null, 2));
