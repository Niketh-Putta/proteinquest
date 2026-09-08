import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google' | 'apple';

function redirectUri() {
  return AuthSession.makeRedirectUri({
    scheme: 'proteinquest',
    path: 'auth/callback',
  });
}

export async function availableSocialProviders(): Promise<{ google: boolean; apple: boolean }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!url || !key) {
    return { google: false, apple: false };
  }
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
    });
    if (!response.ok) throw new Error('Could not check sign-in availability.');
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return {
      google: settings.external?.google === true,
      apple: settings.external?.apple === true,
    };
  } catch {
    return { google: true, apple: false };
  }
}

async function exchangeCodeForSession(url: string): Promise<Session> {
  const parsed = new URL(url.replace('#', '?'));
  const errorDescription =
    parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
  if (errorDescription) throw new Error(errorDescription);

  const code = parsed.searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    if (!data.session) throw new Error('Sign-in could not be completed.');
    return data.session;
  }

  const access_token = parsed.searchParams.get('access_token');
  const refresh_token = parsed.searchParams.get('refresh_token');
  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    if (!data.session) throw new Error('Sign-in could not be completed.');
    return data.session;
  }

  throw new Error('Sign-in could not be completed. Please try again.');
}

/** OAuth via system browser. Never creates a guest on failure. */
export async function signInWithSocial(provider: SocialProvider): Promise<Session> {
  const providers = await availableSocialProviders();
  if (!providers[provider]) {
    throw new Error(
      provider === 'apple'
        ? 'Apple sign-in still needs Apple Developer credentials enabled in Supabase.'
        : 'Google sign-in is not enabled in Supabase.',
    );
  }

  const redirectTo = redirectUri();

  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : redirectTo },
    });
    if (error) throw error;
    throw new Error('Redirecting to sign in…');
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not start sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    throw new Error('Sign-in was cancelled.');
  }
  return exchangeCodeForSession(result.url);
}

/**
 * Email signup / sign-in. If a guest (anonymous) session exists, try linking
 * credentials onto that user first so progress stays on the same id.
 * NEVER creates a new anonymous guest after failure.
 */
export async function signInWithEmail(opts: {
  email: string;
  password: string;
  mode: 'login' | 'signup';
}): Promise<{ session: Session | null; needsEmailConfirm: boolean }> {
  const email = opts.email.trim();
  const password = opts.password;
  if (!email || !password) throw new Error('Enter email and password.');
  if (opts.mode === 'signup' && password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const { data: current } = await supabase.auth.getSession();
  const guest = current.session?.user?.is_anonymous ? current.session.user : null;

  if (opts.mode === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('Sign-in could not be completed.');
    return { session: data.session, needsEmailConfirm: false };
  }

  // Signup: prefer linking identity onto existing anonymous user.
  if (guest) {
    try {
      const { data: linked, error: linkError } = await supabase.auth.updateUser({ email, password });
      if (!linkError && linked.user) {
        const { data: after } = await supabase.auth.getSession();
        if (after.session && !after.session.user.is_anonymous) {
          return { session: after.session, needsEmailConfirm: false };
        }
        // Email confirmation may still be required.
        return { session: after.session, needsEmailConfirm: !after.session || !!after.session.user.is_anonymous };
      }
    } catch {
      // Fall through to normal signUp; do not create a new guest.
    }
  }

  const redirectTo = redirectUri();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  if (data.session) return { session: data.session, needsEmailConfirm: false };
  return { session: null, needsEmailConfirm: true };
}

export async function resetPasswordForEmail(email: string): Promise<void> {
  const redirectTo = redirectUri();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) throw error;
}

export function isRegisteredUser(user: User | null | undefined): boolean {
  return !!user && !user.is_anonymous;
}
