import { decode } from 'base64-arraybuffer';

import { supabase } from './supabase';
import { todayISODate } from './protein';
import type { Analysis, FoodItem, Confidence, Profile, ProteinLog } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;
const MAX_IMAGE_BASE64 = 3_500_000;

const AUTH_HEADER_TTL_MS = 60_000;
let authHeaderCache: { headers: Record<string, string>; expiresAt: number } | null = null;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const now = Date.now();
  if (authHeaderCache && now < authHeaderCache.expiresAt) {
    return authHeaderCache.headers;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? SUPABASE_KEY;
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
  };
  authHeaderCache = { headers, expiresAt: now + AUTH_HEADER_TTL_MS };
  return headers;
}

function cleanBase64(imageBase64: string): string {
  const raw = imageBase64.includes(',') ? imageBase64.split(',')[1]! : imageBase64;
  return raw.replace(/\s/g, '');
}

function friendlyAnalysisError(message: string): string {
  if (/failed to send|network|fetch|timeout|aborted/i.test(message)) {
    return 'Could not reach the analysis server. Check your connection and try again.';
  }
  if (/too large/i.test(message)) return message;
  if (/quota|RESOURCE_EXHAUSTED|high demand|overloaded|temporarily unavailable/i.test(message)) {
    return 'AI is busy right now. Try again in a moment.';
  }
  if (/suspended|permission denied|invalid.?api.?key|incorrect.?api.?key/i.test(message)) {
    return 'AI key is invalid or revoked. Update Supabase OPENAI_API_KEY (or GEMINI_API_KEY fallback).';
  }
  if (/billing|not active|postpay|payment/i.test(message)) {
    return 'AI billing is not active. Enable billing for OpenAI (or Gemini fallback) and try again.';
  }
  if (/malformed|Unterminated string|Unexpected token|JSON/i.test(message)) {
    return 'Analysis hit a glitch. Tap scan and try again.';
  }
  return message;
}

function isRetryableNetworkError(message: string): boolean {
  return /failed to send|network|fetch|timeout|aborted|ECONNRESET|ETIMEDOUT/i.test(message);
}

async function postAnalyzeFood(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { method: 'POST', headers, body });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : 'Network error';
      if (!isRetryableNetworkError(msg) || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : 'Network error';
  throw new Error(friendlyAnalysisError(msg));
}

export async function analyzeFoodPhoto(
  imageBase64: string,
  mimeType = 'image/jpeg',
  userNote?: string,
): Promise<Analysis> {
  const cleaned = cleanBase64(imageBase64);
  if (cleaned.length > MAX_IMAGE_BASE64) {
    throw new Error('Photo is too large. Move closer or retake with less background.');
  }

  const headers = await getAuthHeaders();
  const url = `${SUPABASE_URL}/functions/v1/analyze-food`;
  const note = typeof userNote === 'string' ? userNote.trim().slice(0, 280) : '';
  const payload: { image_base64: string; mime_type: string; user_note?: string } = {
    image_base64: cleaned,
    mime_type: mimeType,
  };
  if (note) payload.user_note = note;

  let res: Response;
  try {
    res = await postAnalyzeFood(url, headers, JSON.stringify(payload));
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(friendlyAnalysisError('Network error'));
  }

  let body: { analysis?: Analysis; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(friendlyAnalysisError(`Analysis server error (${res.status}).`));
  }

  if (!res.ok || body?.error) {
    throw new Error(friendlyAnalysisError(body?.error ?? `Analysis failed (${res.status}).`));
  }
  if (!body?.analysis) {
    throw new Error('No analysis returned. Please try again.');
  }
  return sanitizeAnalysis(body.analysis);
}

/** Text-only meal estimate (no photo). Uses the same analyze-food edge function. */
export async function analyzeFoodText(userNote: string): Promise<Analysis> {
  const note = typeof userNote === 'string' ? userNote.trim().slice(0, 280) : '';
  if (note.length < 2) {
    throw new Error('Describe your meal in a few words first.');
  }

  const headers = await getAuthHeaders();
  const url = `${SUPABASE_URL}/functions/v1/analyze-food`;
  const payload = { text_only: true, user_note: note };

  let res: Response;
  try {
    res = await postAnalyzeFood(url, headers, JSON.stringify(payload));
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(friendlyAnalysisError('Network error'));
  }

  let body: { analysis?: Analysis; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    throw new Error(friendlyAnalysisError(`Analysis server error (${res.status}).`));
  }

  if (!res.ok || body?.error) {
    throw new Error(friendlyAnalysisError(body?.error ?? `Analysis failed (${res.status}).`));
  }
  if (!body?.analysis) {
    throw new Error('No analysis returned. Please try again.');
  }
  return sanitizeAnalysis(body.analysis);
}

/** Coerce AI macros to finite numbers so the UI never shows blank / "...". */
function sanitizeAnalysis(raw: Analysis): Analysis {
  const protein = Number(raw.total_protein_g);
  const calories = Number(raw.calories);
  const safeProtein = Number.isFinite(protein) && protein >= 0 ? protein : 1;
  let safeCalories = Number.isFinite(calories) && calories > 0 ? calories : 0;
  if (safeCalories <= 0) {
    safeCalories = Math.max(Math.round(safeProtein * 8), 50);
  }
  const items = Array.isArray(raw.items) ? raw.items : [];
  const proteinSum = items.reduce((s, i) => s + (Number(i.protein_g) || 0), 0);
  const normalizedItems = items.map((item) => {
    const protein_g = Number(item.protein_g);
    const safeItemProtein = Number.isFinite(protein_g) && protein_g >= 0 ? protein_g : 0;
    const rawCal = Number(item.calories_g);
    let calories_g =
      Number.isFinite(rawCal) && rawCal >= 0 ? Math.round(rawCal) : undefined;
    if (calories_g == null) {
      if (proteinSum > 0 && safeItemProtein > 0) {
        calories_g = Math.max(0, Math.round(safeCalories * (safeItemProtein / proteinSum)));
      } else if (items.length > 0) {
        calories_g = Math.max(0, Math.round(safeCalories / items.length));
      } else {
        calories_g = 0;
      }
    }
    const grams = Number(item.estimated_grams);
    return {
      ...item,
      protein_g: safeItemProtein,
      calories_g,
      estimated_grams:
        Number.isFinite(grams) && grams > 0 ? Math.round(grams) : item.estimated_grams,
    };
  });
  return {
    ...raw,
    total_protein_g: safeProtein,
    calories: safeCalories,
    food_name: raw.food_name?.trim() || 'Meal',
    items: normalizedItems,
  };
}

export async function uploadFoodPhoto(userId: string, imageBase64: string): Promise<string | null> {
  try {
    const path = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('food-photos')
      .upload(path, decode(cleanBase64(imageBase64)), { contentType: 'image/jpeg' });
    return error ? null : path;
  } catch {
    return null;
  }
}

/** Signed URLs last 1h; cache in memory so Today thumbs don't re-sign on every focus. */
const FOOD_PHOTO_URL_TTL_MS = 50 * 60 * 1000;
const foodPhotoUrlCache = new Map<string, { url: string; expiresAt: number }>();
const foodPhotoUrlInflight = new Map<string, Promise<string | null>>();

/** Sync peek for already-signed paths (avoids thumb flash on remount). */
export function peekFoodPhotoUrl(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const hit = foodPhotoUrlCache.get(imagePath);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    foodPhotoUrlCache.delete(imagePath);
    return null;
  }
  return hit.url;
}

/** Signed URL for a private food-photos object (null if missing). */
export async function getFoodPhotoUrl(imagePath: string | null | undefined): Promise<string | null> {
  if (!imagePath) return null;
  const cached = peekFoodPhotoUrl(imagePath);
  if (cached) return cached;

  const inflight = foodPhotoUrlInflight.get(imagePath);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const { data, error } = await supabase.storage
        .from('food-photos')
        .createSignedUrl(imagePath, 60 * 60);
      if (error || !data?.signedUrl) return null;
      foodPhotoUrlCache.set(imagePath, {
        url: data.signedUrl,
        expiresAt: Date.now() + FOOD_PHOTO_URL_TTL_MS,
      });
      return data.signedUrl;
    } catch {
      return null;
    } finally {
      foodPhotoUrlInflight.delete(imagePath);
    }
  })();

  foodPhotoUrlInflight.set(imagePath, request);
  return request;
}

/** Warm signed URLs for a list of meal photos (Today list). */
export async function prefetchFoodPhotoUrls(
  imagePaths: Array<string | null | undefined>,
): Promise<void> {
  const unique = [...new Set(imagePaths.filter((p): p is string => !!p))];
  await Promise.all(unique.map((path) => getFoodPhotoUrl(path)));
}

export async function fetchLogById(id: string): Promise<ProteinLog | null> {
  const { data, error } = await supabase
    .from('protein_logs')
    .select('*')
    .eq('id', id)
    .in('source', ['photo', 'manual'])
    .maybeSingle();
  if (error) throw error;
  return (data as ProteinLog | null) ?? null;
}

export async function updateLog(
  id: string,
  updates: {
    foodName: string;
    proteinG: number;
    calories: number | null;
    items?: FoodItem[];
  },
): Promise<ProteinLog> {
  const payload: Record<string, unknown> = {
    food_name: updates.foodName,
    protein_g: updates.proteinG,
    calories: updates.calories,
  };
  if (updates.items) {
    payload.items = updates.items.map((item) => ({
      name: String(item.name || 'Ingredient'),
      portion: String(item.portion || '1 serving'),
      protein_g: Number(item.protein_g) || 0,
      ...(item.calories_g != null && Number.isFinite(Number(item.calories_g))
        ? { calories_g: Math.max(0, Math.round(Number(item.calories_g))) }
        : {}),
      ...(item.estimated_grams != null && Number.isFinite(Number(item.estimated_grams))
        ? { estimated_grams: Math.max(0, Math.round(Number(item.estimated_grams))) }
        : {}),
      ...(item.confidence ? { confidence: item.confidence } : {}),
    }));
  }

  const { data, error } = await supabase
    .from('protein_logs')
    .update(payload)
    .eq('id', id)
    .in('source', ['photo', 'manual'])
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Meal update returned no row');
  return data as ProteinLog;
}

/**
 * Uploads a square avatar to the public `avatars` bucket under the user's own
 * folder and returns a cache-busted public URL. Returns null on failure so the
 * caller can keep the existing picture.
 */
export async function uploadAvatar(userId: string, imageBase64: string): Promise<string | null> {
  try {
    const path = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, decode(cleanBase64(imageBase64)), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) return null;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    if (!data?.publicUrl) return null;
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}

/** Always attaches meals to real today. Never accept a viewed/past date. */
export async function insertLog(params: {
  userId: string;
  foodName: string;
  items: FoodItem[];
  proteinG: number;
  calories: number | null;
  confidence: Confidence | null;
  imagePath: string | null;
  source: 'photo' | 'manual';
}): Promise<ProteinLog> {
  const { data, error } = await supabase
    .from('protein_logs')
    .insert({
      user_id: params.userId,
      logged_date: todayISODate(),
      food_name: params.foodName,
      items: params.items,
      protein_g: params.proteinG,
      calories: params.calories,
      confidence: params.confidence,
      image_path: params.imagePath,
      source: params.source,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProteinLog;
}

/** Patch image_path after a background upload (non-blocking save path). */
export async function updateLogImagePath(id: string, imagePath: string): Promise<void> {
  const { error } = await supabase
    .from('protein_logs')
    .update({ image_path: imagePath })
    .eq('id', id);
  if (error) throw error;
}

/** Lightweight today totals for Log it (avoids selecting full meal rows). */
export async function fetchTodayMealSummary(
  date = todayISODate(),
): Promise<{ proteinSum: number; mealCount: number }> {
  const { data, error } = await supabase
    .from('protein_logs')
    .select('protein_g')
    .eq('logged_date', date)
    .in('source', ['photo', 'manual']);
  if (error) throw error;
  const rows = data ?? [];
  return {
    proteinSum: rows.reduce((s, r) => s + Number(r.protein_g), 0),
    mealCount: rows.length,
  };
}

/** Columns needed for Today meal list (avoid selecting unused wide fields). */
const LOG_LIST_SELECT =
  'id, user_id, created_at, logged_date, food_name, items, protein_g, calories, confidence, image_path, source';

export async function fetchLogsForDate(date: string): Promise<ProteinLog[]> {
  const { data, error } = await supabase
    .from('protein_logs')
    .select(LOG_LIST_SELECT)
    .eq('logged_date', date)
    .in('source', ['photo', 'manual'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProteinLog[];
}

/** Most recent meal log timestamp (for dragon hunger). */
export async function fetchLatestMealAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from('protein_logs')
    .select('created_at')
    .in('source', ['photo', 'manual'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

/** Lifetime meal logs (photo + manual) for grandfathering / paywall value checks. */
export async function countLifetimeMeals(): Promise<number> {
  const { count, error } = await supabase
    .from('protein_logs')
    .select('*', { count: 'exact', head: true })
    .in('source', ['photo', 'manual']);
  if (error) throw error;
  return count ?? 0;
}

/** Records one AI analysis for free-tier daily scan limits (not a logged meal). */
export async function recordPhotoScan(userId: string, date = todayISODate()): Promise<void> {
  const { error } = await supabase.from('protein_logs').insert({
    user_id: userId,
    logged_date: date,
    food_name: 'Scan',
    items: [],
    protein_g: 0,
    source: 'photo_scan',
  });
  if (error) throw error;
}

export async function countTodayPhotoScans(date = todayISODate()): Promise<number> {
  const { count, error } = await supabase
    .from('protein_logs')
    .select('*', { count: 'exact', head: true })
    .eq('logged_date', date)
    .eq('source', 'photo_scan');
  if (error) throw error;
  return count ?? 0;
}

export async function fetchDailyTotals(days: number): Promise<Record<string, number>> {
  // Local calendar window (matches logged_date / todayISODate), not UTC.
  const sinceISO = todayISODate(-(Math.max(1, days) - 1));
  const { data, error } = await supabase
    .from('protein_logs')
    .select('logged_date, protein_g')
    .gte('logged_date', sinceISO)
    .in('source', ['photo', 'manual']);
  if (error) throw error;
  const totals: Record<string, number> = {};
  for (const row of data ?? []) {
    totals[row.logged_date] = (totals[row.logged_date] ?? 0) + Number(row.protein_g);
  }
  return totals;
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('protein_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function isStaleProfileSaveError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code ?? '')
      : '';
  return (
    code === '23503' ||
    msg.includes('profiles_id_fkey') ||
    msg.includes('foreign key constraint') ||
    msg.includes('row-level security') ||
    msg.includes('session expired') ||
    msg.includes('user_not_found') ||
    msg.includes('User from sub claim')
  );
}

function profileSaveError(error: { message?: string; code?: string; details?: string }): Error {
  const msg = error.message ?? '';
  if (__DEV__) {
    console.error('[upsertProfile]', error.code, msg, error.details);
  }
  if (isStaleProfileSaveError(error)) {
    return new Error('Your session expired. Refresh the page and try again.');
  }
  if (/display_name_taken/i.test(msg) || (error.code === '23505' && /display_name/i.test(msg))) {
    return new Error('This username already exists. Please choose another.');
  }
  const detail = __DEV__ && error.details ? ` (${error.details})` : '';
  return new Error(msg ? `${msg}${detail}` : 'Could not save progress');
}

function isDuplicateProfileError(error: { code?: string; message?: string; status?: number }): boolean {
  const msg = error.message ?? '';
  return (
    error.code === '23505' ||
    error.status === 409 ||
    /duplicate key/i.test(msg) ||
    /already exists/i.test(msg)
  );
}

/** Save profile fields. Prefer UPDATE (trigger creates row on signup) to avoid upsert 409s. */
export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<Profile> {
  const { id, ...updates } = profile;

  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select();

  if (updateError) throw profileSaveError(updateError);
  if (updated && updated.length > 0) return updated[0] as Profile;

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({ id, ...updates })
    .select()
    .single();

  if (insertError) {
    if (isDuplicateProfileError(insertError)) {
      const { data: retry, error: retryError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (retryError) throw profileSaveError(retryError);
      return retry as Profile;
    }
    throw profileSaveError(insertError);
  }
  return inserted as Profile;
}
