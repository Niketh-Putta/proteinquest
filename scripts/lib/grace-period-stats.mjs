const HABIT_GRACE_DAYS = 2;

export async function fetchGracePeriodStats() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    return {
      completed: null,
      active: null,
      graceDays: HABIT_GRACE_DAYS,
      error: 'Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel',
    };
  }

  const res = await fetch(`${url}/rest/v1/rpc/get_grace_period_stats`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase grace stats failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return {
    completed: data.grace_completed ?? null,
    active: data.grace_active ?? null,
    graceDays: HABIT_GRACE_DAYS,
    source: 'profiles.created_at, non-premium, calendar days (UTC)',
  };
}
