import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;
const VISIT_FLAG = 'pl_visit_tracked';

/** Fire once per browser session; hashes IP server-side in track-visit. */
export function trackPageVisitOnce(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  try {
    if (window.sessionStorage.getItem(VISIT_FLAG)) return;
    window.sessionStorage.setItem(VISIT_FLAG, '1');
  } catch {
    return;
  }

  fetch(`${SUPABASE_URL}/functions/v1/track-visit`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  }).catch(() => {});
}
