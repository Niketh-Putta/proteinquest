import { decode } from 'base64-arraybuffer';

import { supabase } from './supabase';
import { todayISODate } from './protein';
import type { Analysis, FoodItem, Confidence, Profile, ProteinLog } from './types';

export async function analyzeFoodPhoto(imageBase64: string): Promise<Analysis> {
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { image_base64: imageBase64 },
  });
  if (error) throw new Error('Could not analyze the photo. Check your connection and try again.');
  if (data?.error) throw new Error(data.error);
  return data.analysis as Analysis;
}

export async function uploadFoodPhoto(userId: string, imageBase64: string): Promise<string | null> {
  try {
    const path = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('food-photos')
      .upload(path, decode(imageBase64), { contentType: 'image/jpeg' });
    return error ? null : path;
  } catch {
    return null; // photo upload is best-effort; the log itself matters more
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
