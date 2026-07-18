import { decode } from 'base64-arraybuffer';

import { supabase } from './supabase';
import { todayISODate } from './protein';
import type { Analysis, FoodItem, Confidence, Profile, ProteinLog } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;
const MAX_IMAGE_BASE64 = 3_500_000;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? SUPABASE_KEY;

  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
  };
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
  if (/suspended|permission denied/i.test(message)) {
    return 'AI key was revoked by Google. Create a new key in AI Studio and update Supabase GEMINI_API_KEY.';
  }
  if (/billing|not active|postpay|payment/i.test(message)) {
    return 'AI billing is not active. Enable billing in Google AI Studio (or OpenAI) and try again.';
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
): Promise<Analysis> {
  const cleaned = cleanBase64(imageBase64);
  if (cleaned.length > MAX_IMAGE_BASE64) {
    throw new Error('Photo is too large. Move closer or retake with less background.');
  }

  const headers = await getAuthHeaders();
  const url = `${SUPABASE_URL}/functions/v1/analyze-food`;

  let res: Response;
  try {
    res = await postAnalyzeFood(url, headers, JSON.stringify({ image_base64: cleaned, mime_type: mimeType }));
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
  return {
    ...raw,
    total_protein_g: safeProtein,
    calories: safeCalories,
    food_name: raw.food_name?.trim() || 'Meal',
    items: Array.isArray(raw.items) ? raw.items : [],
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

export async function fetchLogsForDate(date: string): Promise<ProteinLog[]> {
  const { data, error } = await supabase
    .from('protein_logs')
    .select('*')
    .eq('logged_date', date)
    .in('source', ['photo', 'manual'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProteinLog[];
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
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  const sinceISO = since.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('protein_logs')
    .select('logged_date, protein_g')
    .gte('logged_date', sinceISO);
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
