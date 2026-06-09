import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function Index() {
  const { loading, profile } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!profile?.onboarded) {
    return <Redirect href="/onboarding" />;
  }
  return <Redirect href="/(tabs)/today" />;
}
