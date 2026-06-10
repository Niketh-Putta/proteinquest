import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export function authRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return makeRedirectUri({ scheme: 'proteinlens', path: 'auth/callback' });
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = authRedirectUri();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;

  if (Platform.OS !== 'web' && data?.url) {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      throw new Error('Google sign-in was cancelled.');
    }
    const params = new URL(result.url);
    const code = params.searchParams.get('code');
    if (!code) throw new Error('No auth code returned from Google.');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function continueAsGuest(): Promise<void> {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export function userEmail(session: { user: { email?: string; is_anonymous?: boolean } } | null) {
  if (!session?.user.email) return null;
  return session.user.email;
}

export function isAnonymous(session: { user: { is_anonymous?: boolean } } | null) {
  return session?.user?.is_anonymous ?? true;
}
