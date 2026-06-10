import type { Session } from '@supabase/supabase-js';
import { useGlobalSearchParams } from 'expo-router';
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

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    return await fetchProfile(userId);
  } catch (e) {
    console.error('Failed to load profile:', e);
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const params = useGlobalSearchParams<{ checkout?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const refreshProfile = useCallback(async (userId: string) => {
    const p = await loadProfile(userId);
    setProfile(p);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        let nextSession = await ensureAuthSession();
        if (!nextSession && mounted) {
          setAuthMessage('Connecting…');
          await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_MS));
          if (!mounted) return;
          resetAnonymousSignupAttempt();
          nextSession = await ensureAuthSession();
        }

        if (!mounted) return;
        setSession(nextSession);
        if (nextSession) await refreshProfile(nextSession.user.id);
      } catch (e) {
        console.error('Auth init failed:', e);
        if (mounted) {
          const { data } = await supabase.auth.getSession();
          setSession(data.session);
          if (data.session) await refreshProfile(data.session.user.id);
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

  const saveProfile = useCallback(async (updates: Partial<Profile>) => {
    const nextSession = await ensureAuthSession();
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
      const recovered = await continueAsGuest();
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
