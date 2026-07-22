import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { trackEvent } from '@/lib/analytics';
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
    // Default-on when key unset (see isMealRemindersEnabled).
    syncMealReminders(profile).catch(console.error);
  }, [loading, profile?.id, profile?.dragon_names, profile?.active_dragon_id, profile?.daily_dragon_id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        slotId?: string;
        kind?: string;
        screen?: string;
      };
      const id = response.notification.request.identifier;
      const isMeal =
        !!data?.slotId ||
        id.startsWith('meal-reminder-') ||
        id === 'second-meal-nudge' ||
        id === 'streak-at-risk';
      if (isMeal) {
        if (data?.kind === 'streak_at_risk') trackEvent('streak_at_risk_shown', { via: 'tap' });
        trackEvent('reminder_tapped', { id, kind: data?.kind ?? 'slot' });
        router.push('/scan');
      }
    });

    const onAppState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && profile) syncMealReminders(profile).catch(console.error);
    });

    return () => {
      onResponse.remove();
      onAppState.remove();
    };
  }, [profile?.id]);

  return null;
}
