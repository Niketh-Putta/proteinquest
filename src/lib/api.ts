import { decode } from 'base64-arraybuffer';

import { resolveAnalysisProvider } from './ai-keys';
import { supabase } from './supabase';
import { todayISODate } from './protein';
import type { Analysis, FoodItem, Confidence, Profile, ProteinLog } from './types';

async function extractFunctionError(
  error: { message?: string; context?: Response },
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && (data as { error: string }).error) {
    return (data as { error: string }).error;
  }
  if (error?.context) {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch {
      try {
        const text = await error.context.text();
        const parsed = JSON.parse(text);
        if (parsed?.error) return String(parsed.error);
      } catch {
        /* fall through */
      }
    }
  }
  return error?.message ?? 'Could not analyze the photo. Please try again.';
}

function friendlyAnalysisError(message: string): string {
  if (/Invalid Gemini|aistudio\.google/i.test(message)) return message;
  if (/billing|not active|quota|insufficient/i.test(message)) {
    return 'AI service unavailable — add billing at platform.openai.com, then try again.';
  }
  if (/No AI provider|Gemini API key in Settings/i.test(message)) return message;
  if (/OPENAI_API_KEY|not configured/i.test(message)) {
    return 'Add your Gemini API key in Settings, or use server AI when available.';
  }
  return message;
}

async function invokeAnalyze(body: Record<string, unknown>): Promise<Analysis> {
  const { data, error } = await supabase.functions.invoke('analyze-food', { body });
  if (error) {
    const raw = await extractFunctionError(error, data);
    throw new Error(friendlyAnalysisError(raw));
  }
  if (data?.error) throw new Error(friendlyAnalysisError(data.error));
  if (!data?.analysis) throw new Error('No analysis returned. Please try again.');
  return data.analysis as Analysis;
}

export async function analyzeFoodPhoto(
  imageBase64: string,
  mimeType = 'image/jpeg',
): Promise<Analysis> {
  const { provider, geminiKey } = await resolveAnalysisProvider();
  if (provider === 'gemini' && geminiKey) {
    return invokeAnalyze({
      image_base64: imageBase64,
      mime_type: mimeType,
      gemini_api_key: geminiKey,
    });
  }
  return invokeAnalyze({ image_base64: imageBase64, mime_type: mimeType });
}

export async function uploadFoodPhoto(userId: string, imageBase64: string): Promise<string | null> {
  try {
    const path = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('food-photos')
      .upload(path, decode(imageBase64), { contentType: 'image/jpeg' });
    return error ? null : path;
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
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProteinLog[];
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

export async function countTodayScans(): Promise<number> {
  const { count, error } = await supabase
    .from('protein_logs')
    .select('id', { count: 'exact', head: true })
    .eq('logged_date', todayISODate())
    .eq('source', 'photo');
  if (error) throw error;
  return count ?? 0;
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

export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .single();
  if (error) throw error;
  return data as Profile;
}
