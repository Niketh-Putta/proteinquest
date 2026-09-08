import type { Session } from '@supabase/supabase-js';
import { useGlobalSearchParams } from 'expo-router';
import { AppState, Platform } from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  continueAsGuest,
  ensureAuthSession,
  readPersistedSession,
  recoverPersistedSession,
  resetAnonymousSignupAttempt,
} from './auth';
import { fetchProfile, isStaleProfileSaveError, upsertProfile } from './api';
import { withTimeout } from './async-utils';
import { mergeDragonProgressMaps } from './character';
import { acceptFriendInvite } from './leaderboard';
import { applyPendingDailyDragonLock } from './daily-dragon-lock';
import {
  loadCachedProfile,
  mergeProfiles,
  saveCachedProfile,
} from './profile-cache';
import { syncPremiumFromRevenueCat } from './payments';
import { resolvePremiumSync } from './premium-sync';
import { todayISODate } from './protein';
import { initRevenueCat, isRevenueCatConfigured, subscribeToProEntitlementChanges } from './revenuecat';
import { supabase } from './supabase';
import type { Profile } from './types';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authMessage: string | null;
  saveProfile: (
    updates: Partial<Profile>,
    opts?: {
      dragonProgressMode?: 'award' | 'replace';
      baseProfile?: Profile | null;
    },
  ) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  loading: true,
  authMessage: null,
  saveProfile: async () => {},
});

const AUTH_RETRY_MS = 2500;
/** Cap getSession() — it can hang while refreshing an expired token after days idle. */
const GET_SESSION_MS = 4_000;
/** Max wait for network auth on a cold start with no saved session. */
const AUTH_COLD_START_MS = 10_000;
/** Max wait for profile when we have a session but no local cache yet. */
const PROFILE_BOOTSTRAP_MS = 4_000;
/** Background validation timeouts — never block the UI. */
const AUTH_VALIDATE_MS = 8_000;
const PROFILE_VALIDATE_MS = 8_000;

/** Complimentary Pro: survives RevenueCat “no entitlement” downgrades. */
const FORCED_PRO_USER_IDS = new Set([
  'c1f09a00-e65f-4ad7-987c-83f601c11815', // Bigger N
  'a247ad33-40ae-4e3e-bd64-fb70882e3d59', // Lil B
]);

function isForcedProDisplayName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim().toLowerCase();
  return n === 'bigger n' || n === 'lil b';
}

function shouldForcePro(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  return FORCED_PRO_USER_IDS.has(profile.id) || isForcedProDisplayName(profile.display_name);
}

function withForcedPro(profile: Profile): Profile {
  if (!shouldForcePro(profile)) return profile;
  if (profile.is_premium && profile.paywall_dismissed) return profile;
  return { ...profile, is_premium: true, paywall_dismissed: true };
}

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    const profile = await fetchProfile(userId);
    if (!profile) return null;
    if (!shouldForcePro(profile)) return profile;
    if (profile.is_premium && profile.paywall_dismissed) return profile;
    try {
      const upgraded = await upsertProfile({
        id: userId,
        is_premium: true,
        paywall_dismissed: true,
      });
      return upgraded;
    } catch {
      return withForcedPro(profile);
    }
  } catch (e) {
    console.error('Failed to load profile:', e);
    return null;
  }
}

async function resolveLocalSession(): Promise<Session | null> {
  const empty = { data: { session: null as Session | null } };
  const { data } = await withTimeout(supabase.auth.getSession(), GET_SESSION_MS, empty);
  if (data.session) return data.session;
  const persisted = await readPersistedSession();
  if (persisted) return persisted;
  return null;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const params = useGlobalSearchParams<{ checkout?: string; invite?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const bootstrapInFlightRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<Profile | null>(null);

  sessionRef.current = session;
  profileRef.current = profile;

  const applyProfile = useCallback((incoming: Profile | null) => {
    if (!incoming) {
      profileRef.current = null;
      setProfile(null);
      return;
    }
    setProfile((prev) => {
      const merged = mergeProfiles(prev, withForcedPro(incoming));
      // Pending Lock in always wins over a lagging network profile.
      const next = applyPendingDailyDragonLock(merged, todayISODate());
      profileRef.current = next;
      return next;
    });
  }, []);

  const refreshProfile = useCallback(async (userId: string) => {
    const p = await loadProfile(userId);
    if (p) {
      await saveCachedProfile(p);
      applyProfile(p);
    } else {
      setProfile(null);
    }
  }, [applyProfile]);

  const validateInBackground = useCallback(
    async (cachedSession: Session, fallbackProfile: Profile | null) => {
      if (bootstrapInFlightRef.current) return;
      bootstrapInFlightRef.current = true;

      try {
        const validated = await withTimeout(
          recoverPersistedSession(),
          AUTH_VALIDATE_MS,
          cachedSession,
        );
        if (!mountedRef.current) return;
        if (validated) setSession(validated);

        const fresh = await withTimeout(
          loadProfile((validated ?? cachedSession).user.id),
          PROFILE_VALIDATE_MS,
          fallbackProfile,
        );
        if (!mountedRef.current || !fresh) return;
        // Merge before disk write so a stale fetch cannot erase today's dragon lock.
        const merged = applyPendingDailyDragonLock(
          mergeProfiles(profileRef.current, withForcedPro(fresh)),
          todayISODate(),
        );
        applyProfile(merged);
        await saveCachedProfile(merged);
      } finally {
        bootstrapInFlightRef.current = false;
      }
    },
    [applyProfile],
  );

  const refreshProfileSafely = useCallback(
    async (userId: string) => {
      try {
        await withTimeout(refreshProfile(userId), PROFILE_VALIDATE_MS, undefined);
      } catch (e) {
        console.warn('[session] profile refresh skipped:', e);
      }
    },
    [refreshProfile],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const cachedSession = await resolveLocalSession();

        if (cachedSession) {
          const cachedProfile = await loadCachedProfile(cachedSession.user.id);
          if (!mounted) return;
          setSession(cachedSession);
          if (cachedProfile) applyProfile(cachedProfile);

          if (cachedProfile) {
            // Returning user — restore from disk and open immediately.
            setLoading(false);
            void validateInBackground(cachedSession, cachedProfile);
            return;
          }

          // Session on disk but no profile cache (first open after update).
          setAuthMessage('Loading…');
          const bootProfile = await withTimeout(
            loadProfile(cachedSession.user.id),
            PROFILE_BOOTSTRAP_MS,
            null,
          );
          if (!mounted) return;
          if (bootProfile) {
            applyProfile(bootProfile);
            await saveCachedProfile(bootProfile);
          }
          setLoading(false);
          setAuthMessage(null);
          void validateInBackground(cachedSession, bootProfile);
          return;
        }

        // No saved session — open UI immediately (intro), auth guest in background.
        // Blocking here used to hold splash/index spinner for up to ~20s.
        if (mounted) {
          setLoading(false);
          setAuthMessage(null);
        }
        void (async () => {
          let nextSession = await withTimeout(ensureAuthSession(), AUTH_COLD_START_MS, null);
          if (!nextSession && mountedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_MS));
            if (!mountedRef.current) return;
            resetAnonymousSignupAttempt();
            nextSession = await withTimeout(ensureAuthSession(), AUTH_COLD_START_MS, null);
          }
          if (!nextSession) nextSession = await readPersistedSession();
          if (!mountedRef.current || !nextSession) return;
          setSession(nextSession);
          const p = await withTimeout(loadProfile(nextSession.user.id), PROFILE_BOOTSTRAP_MS, null);
          if (!mountedRef.current) return;
          if (p) {
            applyProfile(p);
            await saveCachedProfile(p);
          }
        })();
        return;
      } catch (e) {
        console.error('Auth init failed:', e);
        if (mounted) {
          const fallbackSession = await readPersistedSession();
          setSession(fallbackSession);
          if (fallbackSession) {
            const cached = await loadCachedProfile(fallbackSession.user.id);
            if (cached) applyProfile(cached);
            else await refreshProfileSafely(fallbackSession.user.id);
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

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mountedRef.current) return;
      // Ignore transient sign-out during token refresh — keep cached account.
      if (!next && event === 'SIGNED_OUT' && profileRef.current) return;
      setSession(next);
      if (next?.user) {
        void refreshProfileSafely(next.user.id);
      } else if (!profileRef.current) {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applyProfile, refreshProfileSafely, validateInBackground]);

  useEffect(() => {
    if (loading || session) return;

    const timer = setTimeout(() => {
      resetAnonymousSignupAttempt();
      void (async () => {
        const persisted = await readPersistedSession();
        const next = persisted
          ? await withTimeout(recoverPersistedSession(), AUTH_COLD_START_MS, persisted)
          : await withTimeout(ensureAuthSession(), AUTH_COLD_START_MS, null);
        if (!mountedRef.current || !next) return;
        setSession(next);
        await refreshProfileSafely(next.user.id);
      })();
    }, AUTH_RETRY_MS * 2);

    return () => {
      clearTimeout(timer);
    };
  }, [loading, refreshProfileSafely, session]);

  useEffect(() => {
    if (loading) return;
    // Never warm the multi-megabyte food catalog on boot — freezes every Android tap.
    void import('@/lib/paywall-config')
      .then((m) => m.refreshPaywallConfig())
      .catch(() => {});
  }, [loading]);

  useEffect(() => {
    if (loading || !session?.user.id || profile) return;

    const userId = session.user.id;
    const timer = setInterval(() => {
      void refreshProfileSafely(userId);
    }, AUTH_RETRY_MS);

    return () => clearInterval(timer);
  }, [loading, profile, refreshProfileSafely, session?.user.id]);

  useEffect(() => {
    let previousState = AppState.currentState;
    const sub = AppState.addEventListener('change', (nextState) => {
      const becameActive =
        (previousState === 'inactive' || previousState === 'background') &&
        nextState === 'active';
      previousState = nextState;
      if (!becameActive || !mountedRef.current) return;

      // Resume after hours/days — never re-show the startup spinner.
      resetAnonymousSignupAttempt();
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      void validateInBackground(currentSession, profileRef.current);
    });

    return () => {
      sub.remove();
    };
  }, [validateInBackground]);

  useEffect(() => {
    if (params.checkout !== 'success' || !session?.user.id) return;
    refreshProfile(session.user.id).catch(() => {});
  }, [params.checkout, session?.user.id, refreshProfile]);

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

    async function syncPremiumFlag(isProNow: boolean) {
      const current = profileRef.current;
      if (shouldForcePro(current)) return;
      const decision = resolvePremiumSync(current?.is_premium === true, isProNow);
      if (cancelled || !decision.changed) return;
      // Trust the DB row after upsert (triggers / complimentary Pro), not RC alone.
      const saved = await upsertProfile({
        id: uid,
        is_premium: decision.is_premium,
        paywall_dismissed: decision.paywall_dismissed,
      });
      if (cancelled) return;
      await saveCachedProfile(saved);
      applyProfile(saved);
    }

    (async () => {
      try {
        await initRevenueCat(uid);
        // Only trust the RevenueCat entitlement when RC is actually configured
        // (native build + keys). On web/Expo Go, premium is owned by Stripe
        // webhooks — never downgrade based on an unconfigured RC returning false.
        if (!isRevenueCatConfigured()) return;
        const isProNow = await syncPremiumFromRevenueCat();
        if (!cancelled) await syncPremiumFlag(isProNow);
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
  }, [session?.user.id, applyProfile]);

  const saveProfile = useCallback(async (
    updates: Partial<Profile>,
    opts?: {
      dragonProgressMode?: 'award' | 'replace';
      /** Caller already fetched; skip a second profile round-trip on XP saves. */
      baseProfile?: Profile | null;
    },
  ) => {
    const mode = opts?.dragonProgressMode ?? 'award';
    const lockingToday = !!(updates.daily_dragon_id && updates.daily_dragon_date);

    // Stamp lock fields onto any saved row so a sparse DB response cannot drop them.
    const withLockStamp = (row: Profile, id: string): Profile => {
      if (!lockingToday) return { ...row, id };
      return {
        ...row,
        id,
        daily_dragon_id: updates.daily_dragon_id ?? row.daily_dragon_id,
        daily_dragon_date: updates.daily_dragon_date ?? row.daily_dragon_date,
        active_dragon_id:
          updates.active_dragon_id ?? row.active_dragon_id ?? updates.daily_dragon_id ?? null,
      };
    };

    // Optimistic FIRST (before auth await): Lock in must open Today even if network is slow.
    const current = profileRef.current;
    if (lockingToday && current) {
      const locked = applyPendingDailyDragonLock(
        withLockStamp({ ...current, ...updates, id: current.id }, current.id),
        todayISODate(),
      );
      applyProfile(locked);
      void saveCachedProfile(locked);
    }

    let nextSession = sessionRef.current;
    if (!nextSession) {
      nextSession = await withTimeout(ensureAuthSession(), AUTH_VALIDATE_MS, null);
    }
    if (!nextSession) {
      throw new Error('Still connecting. Please wait a moment and try again.');
    }
    if (nextSession !== sessionRef.current) setSession(nextSession);
    const userId = nextSession.user.id;

    let payload: Partial<Profile> & { id: string } = { ...updates, id: userId };
    if (updates.retention) {
      const latest = await fetchProfile(userId);
      payload.retention = { ...latest?.retention, ...updates.retention };
      // Reward saves often send the entire cached blob. Keep newer profile edits.
      if (JSON.stringify(updates.retention.onboarding) === JSON.stringify(current?.retention?.onboarding)) {
        payload.retention.onboarding = latest?.retention?.onboarding;
      }
      if (updates.retention.calorie_goal_kcal === current?.retention?.calorie_goal_kcal) {
        payload.retention.calorie_goal_kcal = latest?.retention?.calorie_goal_kcal;
      }
    }
    if (updates.dragon_progress) {
      try {
        const latest = opts?.baseProfile ?? (await fetchProfile(userId));
        if (latest) {
          const mergedProgress = mergeDragonProgressMaps(
            latest.dragon_progress,
            updates.dragon_progress,
            mode,
          );
          const maxDragonXp = Object.values(mergedProgress).reduce(
            (m, d) => Math.max(m, Number(d?.xp) || 0),
            0,
          );
          payload = {
            ...payload,
            dragon_progress: mergedProgress,
            xp:
              mode === 'award'
                ? Math.max(Number(latest.xp) || 0, Number(updates.xp) || 0, maxDragonXp)
                : updates.xp ?? latest.xp,
          };
        }
      } catch {
        // Fall through with client payload if refresh fails.
      }
    }

    try {
      const saved = applyPendingDailyDragonLock(
        withLockStamp(await upsertProfile(payload), userId),
        todayISODate(),
      );
      await saveCachedProfile(saved);
      applyProfile(saved);
      return;
    } catch (e) {
      if (!isStaleProfileSaveError(e)) throw e;
      // A registered user's answers must never be redirected into a new guest account.
      if (!nextSession.user.is_anonymous) throw e;

      await supabase.auth.signOut({ scope: 'local' });
      resetAnonymousSignupAttempt();
      const recovered = await withTimeout(continueAsGuest(), AUTH_VALIDATE_MS, null);
      if (!recovered) throw e;
      setSession(recovered);
      const saved = applyPendingDailyDragonLock(
        withLockStamp(
          await upsertProfile({ ...payload, id: recovered.user.id }),
          recovered.user.id,
        ),
        todayISODate(),
      );
      await saveCachedProfile(saved);
      applyProfile(saved);
    }
  }, [applyProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      authMessage,
      saveProfile,
    }),
    [session, profile, loading, authMessage, saveProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
