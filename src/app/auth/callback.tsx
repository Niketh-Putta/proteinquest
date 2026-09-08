import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

import { createSessionFromUrl, isRegisteredUser } from '@/lib/onboarding-auth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing } from '@/theme';

/**
 * OAuth return route for web + deep links.
 * Completes PKCE exchange, then sends the user back into onboarding.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [message, setMessage] = useState('Finishing sign-in…');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (params.error || params.error_description) {
          throw new Error(String(params.error_description || params.error));
        }

        let url: string | null = null;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          url = window.location.href;
        } else {
          url = await Linking.getInitialURL();
        }

        if (url) {
          const session = await createSessionFromUrl(url);
          if (session && isRegisteredUser(session.user)) {
            if (!alive) return;
            router.replace('/intro?auth=done');
            return;
          }
        }

        // detectSessionInUrl / already-exchanged session
        const { data } = await supabase.auth.getSession();
        if (data.session && isRegisteredUser(data.session.user)) {
          if (!alive) return;
          router.replace('/intro?auth=done');
          return;
        }

        throw new Error('Sign-in could not be completed. Please try again from the app.');
      } catch (e) {
        if (!alive) return;
        setFailed(true);
        setMessage(e instanceof Error ? e.message : 'Sign-in failed.');
      }
    })();

    return () => {
      alive = false;
    };
  }, [params.error, params.error_description, router]);

  if (failed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f6fa', padding: 24 }}>
        <Text style={{ fontFamily: fonts.body, color: '#b42318', textAlign: 'center', marginBottom: spacing.md }}>
          {message}
        </Text>
        <Redirect href="/intro" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f6fa' }}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={{ marginTop: spacing.md, fontFamily: fonts.body, color: '#555' }}>{message}</Text>
    </View>
  );
}
