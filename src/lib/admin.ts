const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

const ADMIN_TOKEN_KEY = 'pl_admin_token';

function baseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

export interface AdminStats {
  supabase_accounts: number;
  anonymous_accounts: number;
  signed_in_accounts: number;
  real_users: number;
  zero_log_accounts: number;
  total_meals: number;
  total_protein_g: number;
  unique_visitors_today: number;
  unique_visitors_all_time: number;
}

export function getStoredAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function storeAdminToken(token: string): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  }
}

export function clearAdminToken(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

export async function adminLogin(password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-auth`, {
    method: 'POST',
    headers: baseHeaders(),
    body: JSON.stringify({ password }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? 'Login failed');
  }

  storeAdminToken(body.token);
  return body.token as string;
}

export async function fetchAdminStats(token?: string): Promise<AdminStats> {
  const adminToken = token ?? getStoredAdminToken();
  if (!adminToken) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-stats`, {
    method: 'GET',
    headers: {
      ...baseHeaders(),
      'X-Admin-Token': adminToken,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAdminToken();
    throw new Error('Session expired. Sign in again.');
  }
  if (!res.ok) {
    throw new Error(body.error ?? 'Could not load stats');
  }

  return body as AdminStats;
}
