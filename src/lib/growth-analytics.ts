import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { getInstallId } from '@/lib/install-id';
import { supabase } from '@/lib/supabase';

const QUEUE_KEY = 'pq_growth_event_queue_v1';
const FIRST_OPEN_KEY = 'pq_growth_first_open_sent';
const MAX_QUEUE = 200;
const SCHEMA_VERSION = 1;

export type GrowthEventName =
  | 'first_open'
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'account_created'
  | 'sign_in_succeeded'
  | 'meal_scan_started'
  | 'meal_scan_succeeded'
  | 'meal_scan_failed'
  | 'meal_logged'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'app_session_started';

type QueuedEvent = {
  event_id: string;
  event_name: GrowthEventName;
  event_time: string;
  schema_version: number;
  environment: 'production' | 'sandbox';
  platform: 'ios' | 'android' | 'web';
  app_version?: string;
  build_number?: string;
  install_id: string;
  user_id?: string;
  channel?: string;
  properties?: Record<string, unknown>;
  attempts: number;
};

const FORBIDDEN = /email|password|age|weight|birthday|height|image|photo|health|token/i;

function newId(): string {
  return Crypto.randomUUID();
}

function platform(): 'ios' | 'android' | 'web' {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web') return Platform.OS;
  return 'web';
}

function environment(): 'production' | 'sandbox' {
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'sandbox' : 'production';
}

function cleanProps(props: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN.test(key)) continue;
    if (typeof value === 'string' && value.includes('@')) continue;
    out[key] = value;
  }
  return out;
}

async function readQueue(): Promise<QueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedEvent[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
}

let flushing = false;

export async function flushGrowthEvents(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const queue = await readQueue();
    if (!queue.length) return;
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
    if (!url || !key) return;

    const res = await fetch(`${url}/functions/v1/ingest-analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ events: queue.map(({ attempts: _a, ...event }) => event) }),
    });
    if (!res.ok) {
      const next = queue.map((item) => ({ ...item, attempts: item.attempts + 1 }));
      await writeQueue(next.filter((item) => item.attempts < 8));
      return;
    }
    await writeQueue([]);
  } catch {
    // stay queued
  } finally {
    flushing = false;
  }
}

export function trackGrowth(
  eventName: GrowthEventName,
  properties: Record<string, unknown> = {},
): void {
  void (async () => {
    try {
      const installId = await getInstallId();
      const { data } = await supabase.auth.getSession();
      const extra = Constants.expoConfig?.version;
      const event: QueuedEvent = {
        event_id: newId(),
        event_name: eventName,
        event_time: new Date().toISOString(),
        schema_version: SCHEMA_VERSION,
        environment: environment(),
        platform: platform(),
        app_version: extra,
        build_number: String(Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? ''),
        install_id: installId,
        user_id: data.session?.user?.id,
        properties: cleanProps(properties),
        attempts: 0,
      };
      const queue = await readQueue();
      queue.push(event);
      await writeQueue(queue);
      await flushGrowthEvents();
    } catch {
      // never block UX
    }
  })();
}

export async function trackFirstOpenOnce(): Promise<void> {
  try {
    const sent = await AsyncStorage.getItem(FIRST_OPEN_KEY);
    if (sent) {
      trackGrowth('app_session_started');
      return;
    }
    await AsyncStorage.setItem(FIRST_OPEN_KEY, '1');
    trackGrowth('first_open');
    trackGrowth('app_session_started');
  } catch {
    trackGrowth('app_session_started');
  }
}
