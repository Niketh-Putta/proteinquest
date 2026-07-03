import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? (extra.supabaseUrl as string | undefined) ?? '';
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? (extra.supabaseKey as string | undefined) ?? '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY at build time.',
  );
}

const webAuthStorage =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) =>
          typeof window === 'undefined' ? null : window.localStorage.getItem(key),
        setItem: (key: string, value: string) => {
          if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
        },
        removeItem: (key: string) => {
          if (typeof window !== 'undefined') window.localStorage.removeItem(key);
        },
      }
    : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: webAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
