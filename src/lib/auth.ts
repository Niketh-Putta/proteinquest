import type { Session } from '@supabase/supabase-js';
import { AuthApiError } from '@supabase/supabase-js';

import { supabase } from './supabase';

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

/** Validate JWT with Supabase; replace stale local sessions (e.g. after auth.users purge). */
export async function ensureAuthSession(): Promise<Session | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const existing = sessionData.session;

  if (existing?.access_token) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError && userData.user?.id === existing.user.id) {
      return existing;
    }

    const userMsg = userError?.message ?? '';
    if (!isStaleAuthError(userMsg)) {
      return existing;
    }

    await supabase.auth.signOut({ scope: 'local' });
  }

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
    return null;
  }
}
