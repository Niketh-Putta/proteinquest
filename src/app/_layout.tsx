import {
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SessionProvider } from '@/lib/session';
import { trackPageVisitOnce } from '@/lib/track-visit';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  useEffect(() => {
    trackPageVisitOnce();
  }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'fade_from_bottom',
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="intro" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen
            name="paywall"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen
            name="league"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="scan"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="admin" options={{ animation: 'fade' }} />
          <Stack.Screen name="privacy" options={{ animation: 'fade' }} />
          <Stack.Screen name="terms" options={{ animation: 'fade' }} />
        </Stack>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}
