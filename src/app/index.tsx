import { Redirect } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { SkeletonMedia } from '@/components/LoadingSkeleton';
import { useSession } from '@/lib/session';
import { colors, fonts, spacing } from '@/theme';

function BootPlaceholder({ message }: { message?: string | null }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg,
        paddingHorizontal: spacing.xl,
      }}>
      <View style={{ width: 120 }}>
        <SkeletonMedia />
      </View>
      {message ? (
        <Text
          style={{
            marginTop: spacing.md,
            color: colors.textSecondary,
            fontFamily: fonts.body,
            fontSize: 14,
            textAlign: 'center',
          }}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export default function Index() {
  const { loading, session, profile, authMessage } = useSession();

  if (loading) {
    return <BootPlaceholder message={authMessage} />;
  }

  if (!session) {
    return <Redirect href="/intro" />;
  }

  if (!profile) {
    return <BootPlaceholder message={authMessage ?? 'Restoring your account…'} />;
  }

  if (!profile.intro_completed) {
    return <Redirect href="/intro" />;
  }

  if (!profile.onboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/today" />;
}
