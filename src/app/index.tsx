import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { shouldShowPostOnboardingPaywall } from '@/lib/paywall-gate';
import { useSession } from '@/lib/session';
import { colors, fonts, spacing } from '@/theme';

export default function Index() {
  const { loading, session, profile, authMessage } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
        {authMessage ? (
          <Text
            style={{
              marginTop: spacing.md,
              color: colors.textSecondary,
              fontFamily: fonts.body,
              fontSize: 14,
            }}>
            {authMessage}
          </Text>
        ) : null}
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/intro" />;
  }

  if (!profile?.intro_completed) {
    return <Redirect href="/intro" />;
  }

  if (!profile?.onboarded) {
    return <Redirect href="/onboarding" />;
  }

  if (shouldShowPostOnboardingPaywall(profile)) {
    return <Redirect href="/paywall" />;
  }

  return <Redirect href="/(tabs)/today" />;
}
