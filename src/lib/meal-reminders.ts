import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

/** Daily meal + snack reminders — gentle nudges to log and feed your dragon. */
export const MEAL_REMINDER_SLOTS: MealReminderSlot[] = [
  {
    id: 'breakfast',
    hour: 8,
    minute: 0,
    kind: 'breakfast',
    label: 'Breakfast',
    messages: [
      { title: 'Morning fuel', body: 'Log breakfast and feed your dragon.' },
      { title: 'Rise & protein', body: 'Snap your breakfast — your dragon is waking up hungry.' },
      { title: 'Start the streak', body: 'First meal of the day counts. Log it now.' },
    ],
  },
  {
    id: 'morning-snack',
    hour: 10,
    minute: 30,
    kind: 'snack',
    label: 'Morning snack',
    messages: [
      { title: 'Snack check-in', body: 'Quick scan keeps your protein streak alive.' },
      { title: 'Little bite?', body: 'Log a snack — your dragon loves the attention.' },
    ],
  },
  {
    id: 'lunch',
    hour: 12,
    minute: 30,
    kind: 'lunch',
    label: 'Lunch',
    messages: [
      { title: 'Lunchtime', body: 'Your dragon is ready — log the meal.' },
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
      { title: 'Snack o\'clock', body: 'Grab something? Log it and keep your dragon fed.' },
      { title: 'Protein pit stop', body: 'A quick scan now beats guessing later.' },
    ],
  },
  {
    id: 'dinner',
    hour: 18,
    minute: 30,
    kind: 'dinner',
    label: 'Dinner',
    messages: [
      { title: 'Dinner call', body: 'Log tonight\'s meal and feed your dragon.' },
      { title: 'Evening plate', body: 'Scan dinner — close the day strong on protein.' },
      { title: 'Dragon\'s dinner bell', body: 'Time to log your meal before you unwind.' },
    ],
  },
  {
    id: 'evening-snack',
    hour: 21,
    minute: 0,
    kind: 'snack',
    label: 'Evening snack',
    messages: [
      { title: 'Late bite?', body: 'Log a snack so your day stays complete.' },
      { title: 'One more scan', body: 'Your dragon doesn\'t sleep on missed meals.' },
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

export async function isMealRemindersEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(ENABLED_KEY);
  if (stored === null) return true;
  return stored === '1';
}

export async function setMealRemindersEnabled(enabled: boolean): Promise<boolean> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  if (enabled) return syncMealReminders();
  await cancelMealReminders();
  return false;
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

export async function syncMealReminders(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const enabled = await isMealRemindersEnabled();
  if (!enabled) {
    await cancelMealReminders();
    return false;
  }

  const granted = await requestMealReminderPermission();
  if (!granted) return false;

  await cancelMealReminders();

  for (const slot of MEAL_REMINDER_SLOTS) {
    const copy = pickMessage(slot);
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
