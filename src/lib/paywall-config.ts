import AsyncStorage from '@react-native-async-storage/async-storage';

import { todayISODate } from './protein';
import { supabase } from './supabase';

/** Bundled defaults (used until remote loads, or if fetch fails). */
export const DEFAULT_PAYWALL_CONFIG = {
  freeDailyScans: 1,
  habitGraceDays: 1,
  grandfatherFreeDailyScans: 1,
  /**
   * Inclusive local YYYY-MM-DD; null = promo off.
   * Weekend promo: free unlimited scans through end of 2026-07-27 local
   * (auto-expires via todayISODate() comparison; remote row is source of truth).
   */
  promoUnlimitedUntil: '2026-07-27' as string | null,
} as const;

export type PaywallConfig = {
  freeDailyScans: number;
  habitGraceDays: number;
  grandfatherFreeDailyScans: number;
  promoUnlimitedUntil: string | null;
};

const CACHE_KEY = 'pq_paywall_config_v1';
const FRESH_MS = 60_000;

let cached: PaywallConfig = { ...DEFAULT_PAYWALL_CONFIG };
let loadedAt = 0;
let fetchInFlight: Promise<PaywallConfig> | null = null;

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function normalizeDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseConfig(row: Record<string, unknown> | null | undefined): PaywallConfig {
  if (!row) return { ...DEFAULT_PAYWALL_CONFIG };
  return {
    freeDailyScans: clampInt(
      row.free_daily_scans,
      DEFAULT_PAYWALL_CONFIG.freeDailyScans,
      0,
      100,
    ),
    habitGraceDays: clampInt(
      row.habit_grace_days,
      DEFAULT_PAYWALL_CONFIG.habitGraceDays,
      0,
      30,
    ),
    grandfatherFreeDailyScans: clampInt(
      row.grandfather_free_daily_scans,
      DEFAULT_PAYWALL_CONFIG.grandfatherFreeDailyScans,
      0,
      100,
    ),
    promoUnlimitedUntil: normalizeDate(row.promo_unlimited_until),
  };
}

async function readDisk(): Promise<PaywallConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseConfig({
      free_daily_scans: parsed.freeDailyScans,
      habit_grace_days: parsed.habitGraceDays,
      grandfather_free_daily_scans: parsed.grandfatherFreeDailyScans,
      promo_unlimited_until: parsed.promoUnlimitedUntil,
    });
  } catch {
    return null;
  }
}

async function writeDisk(cfg: PaywallConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

/** Current config (sync). Safe defaults until refresh completes. */
export function getPaywallConfig(): PaywallConfig {
  return cached;
}

/** True while local today is on/before promo_unlimited_until. */
export function isPromoUnlimitedActive(nowISO = todayISODate()): boolean {
  const until = cached.promoUnlimitedUntil;
  if (!until) return false;
  return nowISO <= until;
}

/** Fetch remote singleton; disk cache first, then network. */
export async function refreshPaywallConfig(opts?: {
  force?: boolean;
}): Promise<PaywallConfig> {
  const force = opts?.force === true;
  const now = Date.now();
  if (!force && loadedAt > 0 && now - loadedAt < FRESH_MS) return cached;
  if (!force && fetchInFlight) return fetchInFlight;

  fetchInFlight = (async () => {
    if (loadedAt === 0) {
      const disk = await readDisk();
      if (disk) {
        cached = disk;
        loadedAt = Date.now();
      }
    }

    try {
      const { data, error } = await supabase
        .from('app_paywall_config')
        .select(
          'free_daily_scans, habit_grace_days, grandfather_free_daily_scans, promo_unlimited_until',
        )
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      const next = parseConfig((data ?? undefined) as Record<string, unknown> | undefined);
      cached = next;
      loadedAt = Date.now();
      void writeDisk(next);
      return next;
    } catch (e) {
      console.warn('Paywall config fetch failed:', e);
      return cached;
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
}
