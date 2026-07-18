import { supabase } from './supabase';

export const DISPLAY_NAME_TAKEN = 'This username already exists. Please choose another.';

export async function isDisplayNameAvailable(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return true;

  const { data, error } = await supabase.rpc('is_display_name_available', { p_name: trimmed });
  if (error) throw new Error(error.message);
  return data === true;
}

export function isDisplayNameTakenError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    /display_name_taken/i.test(msg) ||
    /duplicate key.*display_name/i.test(msg) ||
    /username already exists/i.test(msg)
  );
}
