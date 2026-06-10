import { supabase } from './supabase';

async function extractInvokeError(
  error: { message?: string; context?: Response },
  data: unknown,
): Promise<string> {
  if (data && typeof data === 'object') {
    if ('error' in data && (data as { error: string }).error) {
      return (data as { error: string }).error;
    }
    if ('ok' in data && !(data as { ok: boolean }).ok && 'error' in data) {
      return String((data as { error: string }).error);
    }
  }
  if (error?.context) {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch {
      /* fall through */
    }
  }
  return error?.message ?? 'Gemini request failed.';
}

export async function validateGeminiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { validate_gemini_key: apiKey.trim() },
  });
  if (error) {
    const msg = await extractInvokeError(error, data);
    return { ok: false, error: msg };
  }
  if (data?.ok) return { ok: true };
  return { ok: false, error: data?.error ?? 'Invalid Gemini API key.' };
}
