// Reproduce intro save: anonymous signup + profile upsert with intro_completed
// Run: node demo/test-intro-save.mjs
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function testFreshAnonymous() {
  console.log('\n=== Fresh anonymous sign-in + upsert ===');
  const { data: signIn, error: signInErr } = await supabase.auth.signInAnonymously();
  if (signInErr) {
    console.error('signInAnonymously failed:', signInErr);
    return;
  }
  const userId = signIn.user?.id;
  console.log('user id:', userId);

  const { data: getUser, error: getUserErr } = await supabase.auth.getUser();
  console.log('getUser ok:', !!getUser.user, getUserErr?.message ?? '');

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  console.log('profile exists (trigger):', !!existing);

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, intro_completed: true }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('upsert error:', error.code, error.message, error.details, error.hint);
  } else {
    console.log('upsert ok:', data.id, 'intro_completed=', data.intro_completed);
  }
}

async function testStaleJwt() {
  console.log('\n=== Stale JWT (fake user id) + upsert ===');
  // Simulate wiped auth.users with lingering session by using anon key + fabricated JWT is hard;
  // instead sign in, capture id, sign out, sign in again as new user, upsert with OLD id
  const { data: first } = await supabase.auth.signInAnonymously();
  const staleId = first.user?.id;
  await supabase.auth.signOut();

  const { data: second } = await supabase.auth.signInAnonymously();
  const liveId = second.user?.id;
  console.log('stale id:', staleId, 'live session id:', liveId);

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: staleId, intro_completed: true }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('upsert with stale id:', error.code, error.message);
  }
}

async function testGetUserAfterWipeSimulation() {
  console.log('\n=== getUser with valid session ===');
  const { data: signIn } = await supabase.auth.signInAnonymously();
  const token = signIn.session?.access_token;
  const userId = signIn.user?.id;

  const client2 = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client2.auth.setSession(signIn.session);

  const { data: gu, error: guErr } = await client2.auth.getUser();
  console.log('getUser after setSession:', gu.user?.id, guErr?.message ?? 'ok');

  const { error } = await client2
    .from('profiles')
    .upsert({ id: userId, intro_completed: true }, { onConflict: 'id' })
    .select()
    .single();
  console.log('upsert:', error ? `${error.code} ${error.message}` : 'ok');
}

await testFreshAnonymous();
await testStaleJwt();
await testGetUserAfterWipeSimulation();
