// Simulate web localStorage stale session + ensureAuthSession + saveProfile flow
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const mem = new Map();

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => mem.set(k, v),
        removeItem: (k) => mem.delete(k),
      },
    },
  });
}

async function continueAsGuest(supabase) {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

async function ensureAuthSession(supabase) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  console.log('ensureAuthSession getUser:', userData.user?.id ?? 'null', '| err:', userError?.message ?? 'none');
  if (userData.user && !userError) {
    return (await supabase.auth.getSession()).data.session;
  }
  await supabase.auth.signOut();
  await continueAsGuest(supabase);
  return (await supabase.auth.getSession()).data.session;
}

function profileSaveError(error) {
  const msg = error.message ?? '';
  if (msg.includes('profiles_id_fkey') || msg.includes('foreign key constraint')) {
    return new Error('Your session expired. Refresh the page and try again.');
  }
  if (msg.includes('row-level security')) {
    return new Error('Could not save — please refresh and try again.');
  }
  return new Error(msg || 'Could not save progress');
}

async function upsertProfile(supabase, profile) {
  const { data, error } = await supabase.from('profiles').upsert(profile).select().single();
  if (error) throw profileSaveError(error);
  return data;
}

async function saveProfile(supabase, session, setSession, updates) {
  let userId = session?.user.id;
  if (!userId) {
    const nextSession = await ensureAuthSession(supabase);
    if (!nextSession) throw new Error('Not signed in yet — please wait and try again.');
    setSession(nextSession);
    userId = nextSession.user.id;
  }

  try {
    return await upsertProfile(supabase, { ...updates, id: userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    const stale =
      msg.includes('session expired') ||
      msg.includes('refresh') ||
      msg.includes('row-level security');
    console.log('saveProfile catch:', msg, '| stale?', stale);
    if (!stale) throw e;

    await supabase.auth.signOut();
    await continueAsGuest(supabase);
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw e;
    setSession(data.session);
    return await upsertProfile(supabase, { ...updates, id: data.session.user.id });
  }
}

// --- Test with stale JWT in storage (deleted user) ---
const stale = JSON.parse(readFileSync('/tmp/pq-stale-test.json', 'utf8'));
mem.set(STORAGE_KEY, JSON.stringify(stale.session));

const supabase = makeClient();
let session = (await supabase.auth.getSession()).data.session;
console.log('1. getSession from storage user:', session?.user?.id);

// Simulate SessionProvider init
session = await ensureAuthSession(supabase);
console.log('2. after ensureAuthSession init:', session?.user?.id);

// Simulate saveProfile WITHOUT calling ensureAuthSession first (current bug when session exists)
try {
  await saveProfile(supabase, session, (s) => { session = s; }, { intro_completed: true });
  console.log('3. saveProfile: OK');
} catch (e) {
  console.log('3. saveProfile FAILED:', e.message);
}

// --- Test saveProfile when session still stale (skip init ensure) ---
console.log('\n--- Skip init ensure, stale session in React state ---');
mem.set(STORAGE_KEY, JSON.stringify(stale.session));
const supabase2 = makeClient();
const staleSession = (await supabase2.auth.getSession()).data.session;
console.log('stale session user:', staleSession?.user?.id);

try {
  await saveProfile(supabase2, staleSession, () => {}, { intro_completed: true });
  console.log('saveProfile: OK');
} catch (e) {
  console.log('saveProfile FAILED:', e.message);
}
