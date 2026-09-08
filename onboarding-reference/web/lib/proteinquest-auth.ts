'use client';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://csxdkvpvcasuknhnprxp.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Zg6Jj70nqJcd7OGof5iP6w_9My7yS9F';

export const proteinQuestAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function availableSocialProviders() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
  });
  if (!response.ok) throw new Error('Could not check sign-in availability.');
  const settings = await response.json() as { external?: Record<string, boolean> };
  return {
    google: settings.external?.google === true,
    apple: settings.external?.apple === true,
  };
}

export async function startSocialSignIn(provider: 'google' | 'apple', returnTo: string) {
  const providers = await availableSocialProviders();
  if (!providers[provider]) {
    throw new Error(provider === 'apple'
      ? 'Apple sign-in still needs its Apple Developer credentials enabled in Supabase.'
      : 'Google sign-in is not enabled in Supabase.');
  }
  const { error } = await proteinQuestAuth.auth.signInWithOAuth({
    provider,
    options: { redirectTo: returnTo },
  });
  if (error) throw error;
}
