import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing } from '@/theme';

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function finish() {
      try {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          // Hash-based tokens (implicit flow fallback)
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (!data.session) throw new Error('Sign-in did not complete. Try again.');
        }
        if (mounted) router.replace('/');
      } catch (e: any) {
        if (mounted) setError(e.message ?? 'Sign-in failed');
      }
    }

    finish();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.wrap}>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.text}>Signing you in{'\u2026'}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  text: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  error: { fontFamily: fonts.body, fontSize: 14, color: colors.danger, textAlign: 'center' },
});
