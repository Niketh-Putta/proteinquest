import type { Session } from '@supabase/supabase-js';
import { useGlobalSearchParams } from 'expo-router';
import { AppState, Platform } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  continueAsGuest,
  ensureAuthSession,
  resetAnonymousSignupAttempt,
} from './auth';
import { fetchProfile, isStaleProfileSaveError, upsertProfile } from './api';
import { acceptFriendInvite } from './leaderboard';
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
const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;
const PROFILE_BOOTSTRAP_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const bootstrapInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshProfile = useCallback(async (userId: string) => {
    const p = await loadProfile(userId);
    setProfile(p);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshProfileSafely = useCallback(
    async (userId: string) => {
      try {
        await withTimeout(refreshProfile(userId), PROFILE_BOOTSTRAP_TIMEOUT_MS, 'profile refresh');
      } catch (e) {
        console.warn('[session] profile refresh skipped:', e);
      }
    },
    [refreshProfile],
  );

  const runBootstrap = useCallback(
    async (showLoading: boolean) => {
      if (bootstrapInFlightRef.current) return;
      bootstrapInFlightRef.current = true;

      if (showLoading && mountedRef.current) {
        setLoading(true);
        setAuthMessage(null);
      }

      try {
        let nextSession: Session | null = null;

        try {
          nextSession = await withTimeout(
            ensureAuthSession(),
            AUTH_BOOTSTRAP_TIMEOUT_MS,
            'auth bootstrap',
          );
        } catch (e) {
          console.warn('[session] auth bootstrap failed:', e);
        }

        if (!nextSession) {
          if (showLoading && mountedRef.current) setAuthMessage('Connecting…');
          await sleep(AUTH_RETRY_MS);
          if (!mountedRef.current) return;
          resetAnonymousSignupAttempt();
          try {
            nextSession = await withTimeout(
              ensureAuthSession(),
              AUTH_BOOTSTRAP_TIMEOUT_MS,
              'auth bootstrap retry',
            );
          } catch (e) {
            console.warn('[session] auth bootstrap retry failed:', e);
          }
        }

        if (!nextSession) {
          try {
            const { data } = await withTimeout(
              supabase.auth.getSession(),
              AUTH_BOOTSTRAP_TIMEOUT_MS,
              'cached session fallback',
            );
            nextSession = data.session;
          } catch (e) {
            console.warn('[session] cached session fallback failed:', e);
          }
        }

        if (!mountedRef.current) return;
        setSession(nextSession);

        if (nextSession?.user.id) {
          await refreshProfileSafely(nextSession.user.id);
        } else {
          setProfile(null);
        }
      } finally {
        bootstrapInFlightRef.current = false;
        if (showLoading && mountedRef.current) {
          setLoading(false);
          setAuthMessage(null);
        }
      }
    },
    [refreshProfileSafely],
  );

  useEffect(() => {
    void runBootstrap(true);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mountedRef.current) return;
      setSession(next);
      if (next?.user) {
        void refreshProfileSafely(next.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refreshProfileSafely, runBootstrap]);

  useEffect(() => {
    if (loading || session) return;

    const timer = setTimeout(() => {
      resetAnonymousSignupAttempt();
      void runBootstrap(false);
    }, AUTH_RETRY_MS * 2);

    return () => {
      clearTimeout(timer);
    };
  }, [loading, runBootstrap, session]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      const becameActive =
        (previousState === 'inactive' || previousState === 'background') && nextState === 'active';
      previousState = nextState;
      if (!becameActive) return;

      resetAnonymousSignupAttempt();
      void runBootstrap(false);
    });

    return () => {
      sub.remove();
    };
  }, [runBootstrap]);

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
    let nextSession: Session | null = null;
    try {
      nextSession = await withTimeout(
        ensureAuthSession(),
        AUTH_BOOTSTRAP_TIMEOUT_MS,
        'save profile auth bootstrap',
      );
    } catch {
      nextSession = null;
    }

    if (!nextSession) {
      throw new Error('Still connecting — please wait a moment and try again.');
    }
    setSession(nextSession);
    const userId = nextSession.user.id;

    try {
      const saved = await upsertProfile({ ...updates, id: userId });
      setProfile(saved);
      return;
    } catch (e) {
      if (!isStaleProfileSaveError(e)) throw e;

      await supabase.auth.signOut({ scope: 'local' });
      resetAnonymousSignupAttempt();
      let recovered: Session | null = null;
      try {
        recovered = await withTimeout(
          continueAsGuest(),
          AUTH_BOOTSTRAP_TIMEOUT_MS,
          'save profile guest recovery',
        );
      } catch {
        recovered = null;
      }
      if (!recovered) throw e;
      setSession(recovered);
      const saved = await upsertProfile({ ...updates, id: recovered.user.id });
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
