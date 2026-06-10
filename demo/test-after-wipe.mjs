import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const { userId, session } = JSON.parse(readFileSync('/tmp/pq-stale-test.json', 'utf8'));
const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await client.auth.setSession(session);

console.log('=== After auth.users delete ===');
const { data: gu, error: guErr } = await client.auth.getUser();
console.log('getUser:', gu.user?.id ?? 'null', '| error:', guErr?.message ?? 'none', '| code:', guErr?.code ?? '');

const { error: upsertErr } = await client
  .from('profiles')
  .upsert({ id: userId, intro_completed: true })
  .select()
  .single();
console.log('upsert:', upsertErr?.code, upsertErr?.message ?? 'ok');

async function ensureAuthSession(supabase) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  console.log('ensureAuthSession getUser:', userData.user?.id ?? 'null', userError?.message ?? 'ok');
  if (userData.user && !userError) {
    return (await supabase.auth.getSession()).data.session;
  }
  console.log('ensureAuthSession: signing out + new anonymous');
  await supabase.auth.signOut();
  await supabase.auth.signInAnonymously();
  return (await supabase.auth.getSession()).data.session;
}

const client2 = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await client2.auth.setSession(session);

const next = await ensureAuthSession(client2);
console.log('ensureAuthSession result:', next?.user?.id);
const { error: upsert2 } = await client2
  .from('profiles')
  .upsert({ id: next.user.id, intro_completed: true })
  .select()
  .single();
console.log('upsert after ensure:', upsert2?.code, upsert2?.message ?? 'ok');
