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

export type MetricStatus = 'ok' | 'no_data' | 'not_connected' | 'unavailable';

export interface GrowthMetric {
  status: MetricStatus;
  value: number | null;
  source?: string;
  formula?: string;
  denominator?: string | number;
  window?: string;
  last_refresh?: string | null;
  note?: string;
  sample_size?: number;
}

export interface GrowthSnapshot {
  meta: {
    timezone: string;
    from: string;
    to: string;
    platform: string;
    channel: string;
    activation_window_days: number;
    paid_window_days: number;
    analytics_start_date: string;
    generated_at: string;
  };
  connections: Array<{
    provider: string;
    status: string;
    scopes: string[];
    last_success_at: string | null;
    last_attempt_at: string | null;
    error_summary: string | null;
    notes: string | null;
  }>;
  overview: {
    first_opens: GrowthMetric;
    first_meal_activation: GrowthMetric;
    new_paid_subscribers: GrowthMetric;
    net_proceeds: GrowthMetric;
    largest_loss: { from: string; to: string; drop: number | null; note: string };
    growth_action: { action: string; sample_size: number; window: string; step: string | null };
  };
  funnel: Array<{ id: string; label: string; metric: GrowthMetric }>;
  acquisition: Record<string, GrowthMetric>;
  retention: { d1: GrowthMetric; d7: GrowthMetric; d30: GrowthMetric; definition: string };
  revenue: Record<string, unknown>;
  quality: { scan_failure_rate: GrowthMetric };
  definitions: Array<GrowthMetric & { id: string }>;
}

export async function fetchGrowthDashboard(
  token?: string,
  query = '',
): Promise<GrowthSnapshot> {
  const adminToken = token ?? getStoredAdminToken();
  if (!adminToken) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/growth-dashboard${query}`, {
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
  if (!res.ok) throw new Error(body.error ?? 'Could not load dashboard');
  return body as GrowthSnapshot;
}

export async function fetchGrowthCsv(token?: string, query = ''): Promise<string> {
  const adminToken = token ?? getStoredAdminToken();
  if (!adminToken) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/growth-dashboard${query}&export=csv`, {
    method: 'GET',
    headers: {
      ...baseHeaders(),
      'X-Admin-Token': adminToken,
    },
  });
  if (res.status === 401) {
    clearAdminToken();
    throw new Error('Session expired. Sign in again.');
  }
  if (!res.ok) throw new Error('Could not export CSV');
  return res.text();
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
