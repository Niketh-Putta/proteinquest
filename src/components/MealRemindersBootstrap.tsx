import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { syncMealReminders } from '@/lib/meal-reminders';
import { useSession } from '@/lib/session';

/** Wires daily meal reminders and opens scan when a reminder is tapped. */
export function MealRemindersBootstrap() {
  const { profile, loading } = useSession();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || loading || !profile) return;
    syncMealReminders().catch(console.error);
  }, [loading, profile?.id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const slotId = response.notification.request.content.data?.slotId;
      if (slotId || response.notification.request.identifier.startsWith('meal-reminder-')) {
        router.push('/scan');
      }
    });

    const onAppState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile) syncMealReminders().catch(console.error);
    });

    return () => {
      onResponse.remove();
      onAppState.remove();
    };
  }, [profile?.id]);

  return null;
}
