import type { Session } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { continueAsGuest, signInWithGoogle, signOut as authSignOut } from './auth';
import { fetchProfile, upsertProfile } from './api';
import { supabase } from './supabase';
import type { Profile } from './types';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  saveProfile: (updates: Partial<Profile>) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  loading: true,
  saveProfile: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  continueAsGuest: async () => {},
});

async function loadProfile(userId: string): Promise<Profile | null> {
  try {
    return await fetchProfile(userId);
  } catch (e) {
    console.error('Failed to load profile:', e);
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async (userId: string) => {
    const p = await loadProfile(userId);
    setProfile(p);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      let active = data.session;
      if (!active) {
        const { data: anon, error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error('Anonymous sign-in failed:', error.message);
          if (mounted) setLoading(false);
          return;
        }
        active = anon.session;
      }
      if (!mounted) return;
      setSession(active);
      if (active) await refreshProfile(active.user.id);
      if (mounted) setLoading(false);
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

  const saveProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!session) throw new Error('Not signed in yet');
      const saved = await upsertProfile({ ...updates, id: session.user.id });
      setProfile(saved);
    },
    [session],
  );

  const handleGoogleSignIn = useCallback(async () => {
    // Upgrade from anonymous: sign out guest session first so Google creates a real account.
    if (session?.user?.is_anonymous) {
      await authSignOut();
    }
    await signInWithGoogle();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setSession(data.session);
      await refreshProfile(data.session.user.id);
    }
  }, [session, refreshProfile]);

  const handleSignOut = useCallback(async () => {
    await authSignOut();
    const { data: anon } = await supabase.auth.signInAnonymously();
    setSession(anon.session);
    if (anon.session) await refreshProfile(anon.session.user.id);
  }, [refreshProfile]);

  const handleGuest = useCallback(async () => {
    await continueAsGuest();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setSession(data.session);
      await refreshProfile(data.session.user.id);
    }
  }, [refreshProfile]);

  return (
    <SessionContext.Provider
      value={{
        session,
        profile,
        loading,
        saveProfile,
        signInWithGoogle: handleGoogleSignIn,
        signOut: handleSignOut,
        continueAsGuest: handleGuest,
      }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
