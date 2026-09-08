import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google' | 'apple';

/** Redirect back into the app after Google/Apple browser OAuth. */
export function oauthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }
  return AuthSession.makeRedirectUri({
    scheme: 'proteinquest',
    path: 'auth/callback',
  });
}

export async function availableSocialProviders(): Promise<{ google: boolean; apple: boolean }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return { google: false, apple: false };
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
    // Google is known-enabled on this project; Apple must be confirmed.
    return { google: true, apple: false };
  }
}

/** Turn a deep-link / callback URL into a Supabase session (PKCE or implicit). */
export async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(String(errorCode));

  const errorDescription = params.error_description || params.error;
  if (errorDescription) throw new Error(String(errorDescription));

  const code = params.code;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
    if (error) throw error;
    return data.session;
  }

  const access_token = params.access_token;
  const refresh_token = params.refresh_token;
  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: String(access_token),
      refresh_token: String(refresh_token),
    });
    if (error) throw error;
    return data.session;
  }

  return null;
}

async function assertRegisteredSession(session: Session | null | undefined): Promise<Session> {
  if (!session?.user || session.user.is_anonymous) {
    throw new Error('Sign-in did not create a real account. Please try again.');
  }
  return session;
}

/**
 * Browser OAuth (Google always; Apple when provider enabled on non-iOS).
 * Links onto an anonymous guest when possible so the same user id is kept.
 */
async function signInWithOAuthBrowser(provider: SocialProvider): Promise<Session> {
  const providers = await availableSocialProviders();
  if (!providers[provider]) {
    throw new Error(
      provider === 'apple'
        ? 'Apple sign-in is not enabled in Supabase yet. Enable the Apple provider in Authentication → Providers, then try again.'
        : 'Google sign-in is not enabled in Supabase.',
    );
  }

  const redirectTo = oauthRedirectUri();
  const { data: current } = await supabase.auth.getSession();
  const isAnon = !!current.session?.user?.is_anonymous;

  const start = isAnon
    ? supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      })
    : supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
      });

  const { data, error } = await start;
  if (error) throw error;
  if (!data.url) throw new Error('Could not start sign-in.');

  if (Platform.OS === 'web') {
    // Full-page redirect; /auth/callback completes the PKCE exchange.
    if (typeof window !== 'undefined') window.location.assign(data.url);
    // Page unloads; keep the promise open so the UI stays on "signing in…".
    await new Promise<never>(() => {});
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    throw new Error('Sign-in was cancelled.');
  }

  const session = await createSessionFromUrl(result.url);
  return assertRegisteredSession(session);
}

/** Native Sign in with Apple → Supabase id_token session (iOS only). */
async function signInWithAppleNative(): Promise<Session> {
  const providers = await availableSocialProviders();
  if (!providers.apple) {
    throw new Error(
      'Apple sign-in is not enabled in Supabase yet. In the Supabase dashboard open Authentication → Providers → Apple, add your Services ID and secret, then try again.',
    );
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    return signInWithOAuthBrowser('apple');
  }

  const rawNonce =
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
  return assertRegisteredSession(data.session);
}

/** OAuth via system browser or native Apple. Never creates a guest on failure. */
export async function signInWithSocial(provider: SocialProvider): Promise<Session> {
  if (provider === 'apple' && Platform.OS === 'ios') {
    return signInWithAppleNative();
  }
  return signInWithOAuthBrowser(provider);
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

  if (guest) {
    try {
      const { data: linked, error: linkError } = await supabase.auth.updateUser({
        email,
        password,
      });
      if (!linkError && linked.user) {
        const { data: after } = await supabase.auth.getSession();
        if (after.session && !after.session.user.is_anonymous) {
          return { session: after.session, needsEmailConfirm: false };
        }
        return {
          session: after.session,
          needsEmailConfirm: !after.session || !!after.session.user.is_anonymous,
        };
      }
    } catch {
      // Fall through to normal signUp; do not create a new guest.
    }
  }

  const redirectTo = oauthRedirectUri();
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
  const redirectTo = oauthRedirectUri();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) throw error;
}

export function isRegisteredUser(user: User | null | undefined): boolean {
  return !!user && !user.is_anonymous;
}

/** Cold-start / deep-link helper for native auth returns. */
export function subscribeOAuthDeepLinks(
  onSession: (session: Session) => void,
  onError?: (message: string) => void,
): () => void {
  const handle = async (url: string | null) => {
    if (!url || !url.includes('auth/callback')) return;
    try {
      const session = await createSessionFromUrl(url);
      if (session && !session.user.is_anonymous) onSession(session);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Sign-in could not be completed.');
    }
  };

  void Linking.getInitialURL().then(handle);
  const sub = Linking.addEventListener('url', ({ url }) => {
    void handle(url);
  });
  return () => sub.remove();
}
