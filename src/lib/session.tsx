import type { Session } from '@supabase/supabase-js';
import { useGlobalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  continueAsGuest,
  ensureAuthSession,
  resetAnonymousSignupAttempt,
} from './auth';
import { fetchProfile, isStaleProfileSaveError, upsertProfile } from './api';
import { withTimeout } from './async-utils';
import { acceptFriendInvite } from './leaderboard';
import { clearCachedProfile, loadCachedProfile, saveCachedProfile } from './profile-cache';
import { syncPremiumFromRevenueCat } from './payments';
import { initRevenueCat, subscribeToProEntitlementChanges } from './revenuecat';
import { supabase } from './supabase';
import type { Profile } from './types';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authMessage: string | null;
  saveProfile: (updates: Partial<Profile>) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  loading: true,
  authMessage: null,
  saveProfile: async () => {},
});

const AUTH_RETRY_MS = 2500;
/** Max wait for network auth on a cold start with no saved session. */
const AUTH_COLD_START_MS = 10_000;
/** Max wait for profile when we have a session but no local cache yet. */
const PROFILE_BOOTSTRAP_MS = 4_000;
/** Background validation timeouts — never block the UI. */
const AUTH_VALIDATE_MS = 8_000;
const PROFILE_VALIDATE_MS = 8_000;

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    return await fetchProfile(userId);
  } catch (e) {
    console.error('Failed to load profile:', e);
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const params = useGlobalSearchParams<{ checkout?: string; invite?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const refreshProfile = useCallback(async (userId: string) => {
    const p = await loadProfile(userId);
    if (p) await saveCachedProfile(p);
    setProfile(p);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function validateInBackground(
      cachedSession: NonNullable<Awaited<ReturnType<typeof ensureAuthSession>>>,
      fallbackProfile: Profile | null,
    ) {
      const validated = await withTimeout(ensureAuthSession(), AUTH_VALIDATE_MS, cachedSession);
      if (!mounted) return;
      setSession(validated);
      if (!validated) {
        await clearCachedProfile();
        setProfile(null);
        return;
      }

      const fresh = await withTimeout(
        loadProfile(validated.user.id),
        PROFILE_VALIDATE_MS,
        fallbackProfile,
      );
      if (!mounted || !fresh) return;
      setProfile(fresh);
      await saveCachedProfile(fresh);
    }

    async function init() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const cachedSession = sessionData.session;

        if (cachedSession) {
          const cachedProfile = await loadCachedProfile(cachedSession.user.id);
          if (!mounted) return;
          setSession(cachedSession);
          if (cachedProfile) setProfile(cachedProfile);

          if (cachedProfile) {
            // Returning user — restore from disk and open immediately.
            setLoading(false);
            void validateInBackground(cachedSession, cachedProfile);
            return;
          }

          // Session on disk but no profile cache (first open after update).
          // Fetch profile only — skip blocking getUser() validation.
          setAuthMessage('Loading…');
          const bootProfile = await withTimeout(
            loadProfile(cachedSession.user.id),
            PROFILE_BOOTSTRAP_MS,
            null,
          );
          if (!mounted) return;
          if (bootProfile) {
            setProfile(bootProfile);
            await saveCachedProfile(bootProfile);
          }
          setLoading(false);
          setAuthMessage(null);
          void validateInBackground(cachedSession, bootProfile);
          return;
        }

        // No saved session — need network for guest sign-in, but cap the wait.
        setAuthMessage('Connecting…');
        let nextSession = await withTimeout(ensureAuthSession(), AUTH_COLD_START_MS, null);
        if (!nextSession && mounted) {
          await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_MS));
          if (!mounted) return;
          resetAnonymousSignupAttempt();
          nextSession = await withTimeout(ensureAuthSession(), AUTH_COLD_START_MS, null);
        }

        if (!mounted) return;
        setSession(nextSession);
        if (nextSession) {
          const p = await withTimeout(loadProfile(nextSession.user.id), PROFILE_BOOTSTRAP_MS, null);
          if (p) {
            setProfile(p);
            await saveCachedProfile(p);
          }
        }
      } catch (e) {
        console.error('Auth init failed:', e);
        if (mounted) {
          const { data } = await supabase.auth.getSession();
          setSession(data.session);
          if (data.session) {
            const cached = await loadCachedProfile(data.session.user.id);
            if (cached) setProfile(cached);
            else await refreshProfile(data.session.user.id);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
          setAuthMessage(null);
        }
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) {
        await refreshProfile(next.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  useEffect(() => {
    if (loading || session) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      resetAnonymousSignupAttempt();
      const next = await ensureAuthSession();
      if (cancelled || !next) return;
      setSession(next);
      await refreshProfile(next.user.id);
    }, AUTH_RETRY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loading, session, refreshProfile]);

  useEffect(() => {
    if (params.checkout !== 'success' || !session?.user.id) return;
    refreshProfile(session.user.id).catch(() => {});
  }, [params.checkout, session?.user.id, refreshProfile]);

  // Capture the invite code as soon as it appears in the URL. Root redirects
  // (/?invite=X -> /intro or /today) can strip the query before the session is
  // ready, so we hold the code in state until we can act on it.
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);

  useEffect(() => {
    let invite = Array.isArray(params.invite) ? params.invite[0] : params.invite;
    if (!invite && Platform.OS === 'web' && typeof window !== 'undefined') {
      invite = new URLSearchParams(window.location.search).get('invite') ?? undefined;
    }
    if (invite) setPendingInvite(invite);
  }, [params.invite]);

  useEffect(() => {
    if (!pendingInvite || !session?.user.id) return;

    let cancelled = false;
    acceptFriendInvite(pendingInvite)
      .then(() => {
        if (cancelled) return;
        setPendingInvite(null);
        refreshProfile(session.user.id).catch(() => {});
      })
      .catch((e) => {
        if (__DEV__) console.warn('[friends] invite accept skipped:', e);
        // Clear self-invites / bad codes so they don't retry forever.
        if (!cancelled) setPendingInvite(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pendingInvite, session?.user.id, refreshProfile]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const uid = userId;

    let cancelled = false;

    async function syncPremiumFlag(isPro: boolean) {
      const current = await loadProfile(uid);
      if (cancelled || current?.is_premium === isPro) return;
      await upsertProfile({
        id: uid,
        is_premium: isPro,
        ...(isPro ? { paywall_dismissed: true } : {}),
      });
      if (!cancelled) await refreshProfile(uid);
    }

    (async () => {
      try {
        await initRevenueCat(uid);
        const isPro = await syncPremiumFromRevenueCat();
        if (!cancelled && isPro) await syncPremiumFlag(true);
      } catch (e) {
        console.warn('[RevenueCat] init/sync skipped:', e);
      }
    })();

    const unsubscribe = subscribeToProEntitlementChanges((isPro) => {
      syncPremiumFlag(isPro).catch((e) => {
        console.warn('[RevenueCat] entitlement sync failed:', e);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session?.user.id, refreshProfile]);

  const saveProfile = useCallback(async (updates: Partial<Profile>) => {
    const nextSession = await ensureAuthSession();
    if (!nextSession) {
      throw new Error('Still connecting — please wait a moment and try again.');
    }
    setSession(nextSession);
    const userId = nextSession.user.id;

    try {
      const saved = await upsertProfile({ ...updates, id: userId });
      await saveCachedProfile(saved);
      setProfile(saved);
      return;
    } catch (e) {
      if (!isStaleProfileSaveError(e)) throw e;

      await supabase.auth.signOut({ scope: 'local' });
      resetAnonymousSignupAttempt();
      const recovered = await continueAsGuest();
      if (!recovered) throw e;
      setSession(recovered);
      const saved = await upsertProfile({ ...updates, id: recovered.user.id });
      await saveCachedProfile(saved);
      setProfile(saved);
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        profile,
        loading,
        authMessage,
        saveProfile,
      }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
