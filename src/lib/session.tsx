import type { Session } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { fetchProfile, upsertProfile } from './api';
import { supabase } from './supabase';
import type { Profile } from './types';

interface SessionContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  saveProfile: (updates: Partial<Profile>) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  profile: null,
  loading: true,
  saveProfile: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (active) {
        try {
          const p = await fetchProfile(active.user.id);
          if (mounted) setProfile(p);
        } catch (e) {
          console.error('Failed to load profile:', e);
        }
      }
      if (mounted) setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const saveProfile = useCallback(
    async (updates: Partial<Profile>) => {
      if (!session) throw new Error('Not signed in yet');
      const saved = await upsertProfile({ ...updates, id: session.user.id });
      setProfile(saved);
    },
    [session],
  );

  return (
    <SessionContext.Provider value={{ session, profile, loading, saveProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
