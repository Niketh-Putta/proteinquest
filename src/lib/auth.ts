import type { Session } from '@supabase/supabase-js';
import { AuthApiError } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { supabase } from './supabase';

function supabaseAuthStorageKey(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const projectRef = new URL(url).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

/** Read saved auth from device storage without triggering a network token refresh. */
export async function readPersistedSession(): Promise<Session | null> {
  try {
    const key = supabaseAuthStorageKey();
    const raw =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.localStorage.getItem(key)
        : await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as
      | Session
      | { currentSession?: Session | null; session?: Session | null };

    if (parsed && typeof parsed === 'object') {
      if ('access_token' in parsed && typeof parsed.access_token === 'string') {
        return parsed as Session;
      }
      if ('currentSession' in parsed && parsed.currentSession?.access_token) {
        return parsed.currentSession;
      }
      if ('session' in parsed && parsed.session?.access_token) {
        return parsed.session;
      }
    }
    return null;
  } catch {
    return null;
  }
}

let anonymousSignupAttempted = false;

function isStaleAuthError(message: string): boolean {
  return (
    /user from sub claim|user_not_found|session missing|invalid.*token|jwt expired/i.test(
      message,
    ) || message.includes('Auth session missing')
  );
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof AuthApiError && error.status === 429) return true;
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /rate limit/i.test(msg);
}

/** Allow one retry after a rate-limit backoff. */
export function resetAnonymousSignupAttempt(): void {
  anonymousSignupAttempted = false;
}

export async function continueAsGuest(): Promise<Session | null> {
  if (anonymousSignupAttempted) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    anonymousSignupAttempted = false;
  }

  anonymousSignupAttempted = true;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (isRateLimitError(error)) {
      anonymousSignupAttempted = false;
      const { data: cached } = await supabase.auth.getSession();
      return cached.session;
    }
    throw error;
  }
  return data.session;
}

/** Validate JWT with Supabase; refresh stale tokens without wiping local storage. */
export async function recoverPersistedSession(): Promise<Session | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const active = sessionData.session;
  if (active?.access_token) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData.user?.id === active.user.id) return active;

    const userMsg = userError?.message ?? '';
    if (!isStaleAuthError(userMsg)) return active;

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) return refreshed.session;
  }

  const persisted = await readPersistedSession();
  if (!persisted?.access_token) return active ?? null;

  const { data: setData, error: setError } = await supabase.auth.setSession({
    access_token: persisted.access_token,
    refresh_token: persisted.refresh_token ?? '',
  });
  if (!setError && setData.session) return setData.session;

  if (persisted.refresh_token) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshed.session) return refreshed.session;
  }

  // Offline or slow network after an app update — keep the on-disk session.
  return persisted;
}

/** Validate JWT with Supabase; replace stale local sessions (e.g. after auth.users purge). */
export async function ensureAuthSession(): Promise<Session | null> {
  const recovered = await recoverPersistedSession();
  if (recovered) return recovered;

  if (anonymousSignupAttempted) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    anonymousSignupAttempted = false;
  }

  try {
    return await continueAsGuest();
  } catch (error) {
    if (isRateLimitError(error)) {
      const { data } = await supabase.auth.getSession();
      return data.session;
    }
    console.error('[ensureAuthSession]', error);
    return readPersistedSession();
  }
}
