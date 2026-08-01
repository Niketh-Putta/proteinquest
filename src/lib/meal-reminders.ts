import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { displayDragonId, displayDragonName } from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import type { Profile } from '@/lib/types';

const ENABLED_KEY = 'pq:meal-reminders-enabled';
const ANDROID_CHANNEL = 'meal-reminders';

export type MealReminderKind = 'breakfast' | 'snack' | 'lunch' | 'dinner';

export interface MealReminderSlot {
  id: string;
  hour: number;
  minute: number;
  kind: MealReminderKind;
  label: string;
  messages: { title: string; body: string }[];
}

/** Daily meal + snack reminders. Gentle nudges to log and feed your dragon. */
export const MEAL_REMINDER_SLOTS: MealReminderSlot[] = [
  {
    id: 'breakfast',
    hour: 8,
    minute: 0,
    kind: 'breakfast',
    label: 'Breakfast',
    messages: [
      { title: 'Morning fuel', body: 'Time for breakfast. Log it and feed your dragon.' },
      { title: 'Rise & protein', body: 'Snap your breakfast. Your dragon is waking up hungry.' },
      { title: 'Start the streak', body: 'First meal of the day counts. Log breakfast now.' },
    ],
  },
  {
    id: 'morning-snack',
    hour: 10,
    minute: 30,
    kind: 'snack',
    label: 'Morning snack',
    messages: [
      { title: 'Morning snack time', body: 'Time for a morning snack. Quick scan keeps your streak alive.' },
      { title: 'Little bite?', body: 'Log your morning snack. Your dragon loves the attention.' },
    ],
  },
  {
    id: 'lunch',
    hour: 12,
    minute: 30,
    kind: 'lunch',
    label: 'Lunch',
    messages: [
      { title: 'Lunchtime', body: 'Time for lunch. Your dragon is ready for the meal.' },
      { title: 'Midday fuel', body: 'Time to scan lunch and stack protein.' },
      { title: 'Feed your dragon', body: 'Log lunch before the afternoon slump hits.' },
    ],
  },
  {
    id: 'afternoon-snack',
    hour: 15,
    minute: 30,
    kind: 'snack',
    label: 'Afternoon snack',
    messages: [
      { title: 'Afternoon snack time', body: 'Time for an afternoon snack. Log it and keep your dragon fed.' },
      { title: 'Protein pit stop', body: 'Grab an afternoon snack? A quick scan beats guessing later.' },
    ],
  },
  {
    id: 'dinner',
    hour: 18,
    minute: 30,
    kind: 'dinner',
    label: 'Dinner',
    messages: [
      { title: 'Dinner call', body: 'Time for dinner. Log tonight\'s meal and feed your dragon.' },
      { title: 'Evening plate', body: 'Scan dinner and close the day strong on protein.' },
      { title: 'Dragon\'s dinner bell', body: 'Time to log dinner before you unwind.' },
    ],
  },
  {
    id: 'evening-snack',
    hour: 21,
    minute: 0,
    kind: 'snack',
    label: 'Evening snack',
    messages: [
      { title: 'Evening snack time', body: 'Time for an evening snack so your day stays complete.' },
      { title: 'One more scan', body: 'Log your evening snack. Your dragon doesn\'t sleep on missed meals.' },
    ],
  },
];

export function formatReminderTime(hour: number, minute: number): string {
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const mm = minute.toString().padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

export function reminderScheduleSummary(): string {
  return MEAL_REMINDER_SLOTS.map((s) => `${s.label} ${formatReminderTime(s.hour, s.minute)}`).join(
    ' · ',
  );
}

function pickMessage(slot: MealReminderSlot): { title: string; body: string } {
  const idx = new Date().getDay() % slot.messages.length;
  return slot.messages[idx]!;
}

function personalizeReminderMessage(
  slot: MealReminderSlot,
  dragonName: string,
  base: { title: string; body: string },
): { title: string; body: string } {
  const day = new Date().getDay();
  const hungryTitles: Partial<Record<MealReminderKind, string[]>> = {
    breakfast: [`${dragonName} is getting hungry`, 'Morning fuel', 'Rise & protein'],
    lunch: [`${dragonName} wants lunch`, 'Lunchtime', 'Midday fuel'],
    dinner: [`${dragonName} is ready for dinner`, 'Dinner call', 'Evening plate'],
    snack: [`${dragonName} wants a snack`, base.title],
  };
  const titles = hungryTitles[slot.kind] ?? [base.title];
  const title = titles[day % titles.length]!;

  const body = base.body
    .replace(/your dragon/gi, dragonName)
    .replace(/Dragon's/g, `${dragonName}'s`);

  return { title, body };
}

export async function isMealRemindersEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(ENABLED_KEY);
  if (stored === null) return true;
  return stored === '1';
}

export async function setMealRemindersEnabled(
  enabled: boolean,
  profile?: Profile | null,
): Promise<boolean> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  if (!enabled) {
    await cancelMealReminders();
    return false;
  }
  // Explicit user/onboarding action may show the OS prompt.
  const granted = await requestMealReminderPermission();
  if (!granted) return false;
  return syncMealReminders(profile);
}

export async function getNotificationPermissionStatus(): Promise<Notifications.PermissionStatus> {
  if (Platform.OS === 'web') return Notifications.PermissionStatus.UNDETERMINED;
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Meal reminders',
    description: 'Friendly nudges to log meals and feed your dragon',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#FF7A59',
    sound: 'default',
  });
}

export async function requestMealReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) return false;

  await ensureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== Notifications.PermissionStatus.GRANTED) {
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    status = requested.status;
  }
  return status === Notifications.PermissionStatus.GRANTED;
}

export async function cancelMealReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function syncMealReminders(profile?: Profile | null): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const enabled = await isMealRemindersEnabled();
  if (!enabled) {
    await cancelMealReminders();
    return false;
  }

  // Background sync must never request permission (Guideline 5.1.1).
  // Prompting only happens from setMealRemindersEnabled / explicit toggles.
  if (!Device.isDevice) return false;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== Notifications.PermissionStatus.GRANTED) return false;

  await cancelMealReminders();

  const todayISO = todayISODate();
  const dragonId = profile ? displayDragonId(profile, todayISO) : 'fire';
  const dragonName = profile ? displayDragonName(profile, dragonId) : 'your dragon';

  for (const slot of MEAL_REMINDER_SLOTS) {
    const base = pickMessage(slot);
    const copy = personalizeReminderMessage(slot, dragonName, base);
    await Notifications.scheduleNotificationAsync({
      identifier: `meal-reminder-${slot.id}`,
      content: {
        title: copy.title,
        body: copy.body,
        data: { screen: 'scan', slotId: slot.id },
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: slot.hour,
        minute: slot.minute,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
      },
    });
  }

  return true;
}

async function hasNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === Notifications.PermissionStatus.GRANTED;
}

/** One-shot: ~3h after first meal — “peckish again”. */
export async function scheduleSecondMealNudge(dragonName: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const enabled = await isMealRemindersEnabled();
  if (!enabled) return;
  // Do not prompt from post-log side effects.
  if (!(await hasNotificationPermission())) return;

  await Notifications.cancelScheduledNotificationAsync('second-meal-nudge').catch(() => {});
  const when = new Date(Date.now() + 3 * 60 * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    identifier: 'second-meal-nudge',
    content: {
      title: `${dragonName} is peckish again`,
      body: 'Log another meal to keep them glowing.',
      data: { screen: 'scan', kind: 'second_meal' },
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
  });
}

/** Evening streak-at-risk if no meals today (fires once around 8pm local). */
export async function scheduleStreakAtRiskNudge(
  dragonName: string,
  hasMealToday: boolean,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync('streak-at-risk').catch(() => {});
  if (hasMealToday) return;

  const enabled = await isMealRemindersEnabled();
  if (!enabled) return;
  if (!(await hasNotificationPermission())) return;

  const when = new Date();
  when.setHours(20, 0, 0, 0);
  if (when.getTime() <= Date.now()) {
    // Too late tonight — nudge in 20 minutes instead.
    when.setTime(Date.now() + 20 * 60 * 1000);
  }

  await Notifications.scheduleNotificationAsync({
    identifier: 'streak-at-risk',
    content: {
      title: 'Streak dies at midnight',
      body: `${dragonName} goes to sleep hungry. One scan saves the day.`,
      data: { screen: 'scan', kind: 'streak_at_risk' },
      sound: 'default',
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL } : {}),
    },
  });
}
