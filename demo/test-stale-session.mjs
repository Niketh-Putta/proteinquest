// Simulate auth.users wipe while JWT still valid
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: signIn, error: signInErr } = await supabase.auth.signInAnonymously();
if (signInErr) throw signInErr;

const userId = signIn.user.id;
const session = signIn.session;
console.log('created user', userId);

const { data: gu1, error: gu1e } = await supabase.auth.getUser();
console.log('getUser before delete:', gu1.user?.id, gu1e?.message ?? 'ok');

// Delete user via service role would be needed; use anon delete attempt won't work.
// Instead verify getUser after we manually note behavior.

const { error: upsert1 } = await supabase
  .from('profiles')
  .upsert({ id: userId, intro_completed: true })
  .select()
  .single();
console.log('upsert before delete:', upsert1?.code, upsert1?.message ?? 'ok');

// Test ensureAuthSession pattern with stale session object
async function ensureAuthSession(client) {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userData.user && !userError) {
    return (await client.auth.getSession()).data.session;
  }
  await client.auth.signOut();
  await client.auth.signInAnonymously();
  return (await client.auth.getSession()).data.session;
}

// Fresh client holding stale session in memory (simulates localStorage after wipe)
const staleClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await staleClient.auth.setSession(session);

const { data: gu2, error: gu2e } = await staleClient.auth.getUser();
console.log('getUser on stale client (user still exists):', gu2.user?.id, gu2e?.message ?? 'ok');

const ensured = await ensureAuthSession(staleClient);
console.log('ensureAuthSession returned user:', ensured?.user?.id, 'same as original?', ensured?.user?.id === userId);

const { error: upsert2 } = await staleClient
  .from('profiles')
  .upsert({ id: ensured.user.id, intro_completed: true })
  .select()
  .single();
console.log('upsert after ensure:', upsert2?.code, upsert2?.message ?? 'ok');
