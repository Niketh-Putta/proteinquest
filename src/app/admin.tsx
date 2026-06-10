import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { FieldLabel, TextField } from '@/components/forms';
import { ScreenShell } from '@/components/ScreenShell';
import {
  adminLogin,
  clearAdminToken,
  fetchAdminStats,
  getStoredAdminToken,
  type AdminStats,
} from '@/lib/admin';
import { colors, fonts, radius, spacing, type } from '@/theme';

function StatCard({
  label,
  value,
  detail,
  featured,
}: {
  label: string;
  value: string;
  detail?: string;
  featured?: boolean;
}) {
  return (
    <View style={[styles.card, featured && styles.cardFeatured]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, featured && styles.cardValueFeatured]}>{value}</Text>
      {detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}
    </View>
  );
}

function formatProtein(g: number): string {
  if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(1)}M g`;
  if (g >= 10_000) return `${Math.round(g / 1000)}k g`;
  return `${Math.round(g).toLocaleString()} g`;
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (existingToken?: string | null) => {
    const t = existingToken ?? getStoredAdminToken();
    if (!t) return;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminStats(t);
      setStats(data);
      setToken(t);
    } catch (err) {
      setStats(null);
      setToken(null);
      setError(err instanceof Error ? err.message : 'Could not load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) void loadStats(token);
  }, [token, loadStats]);

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const t = await adminLogin(password.trim());
      setPassword('');
      setToken(t);
      await loadStats(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    clearAdminToken();
    setToken(null);
    setStats(null);
    setPassword('');
    setError(null);
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenShell>
          <Text style={type.heading}>Admin</Text>
          <Text style={[type.body, { marginTop: spacing.md }]}>
            Open /admin on the web app.
          </Text>
        </ScreenShell>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
      ]}>
      <ScreenShell>
        <Text style={type.label}>Internal</Text>
        <Text style={[type.title, { marginTop: spacing.xs }]}>ProteinQuest</Text>
        <Text style={[type.body, { marginTop: spacing.xs }]}>Usage overview</Text>

        {!token ? (
          <View style={styles.form}>
            <FieldLabel>Admin password</FieldLabel>
            <TextField
              value={password}
              onChange={setPassword}
              placeholder="Enter password"
              secureTextEntry
              autoComplete="password"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Sign in" onPress={handleLogin} loading={loading} style={{ marginTop: spacing.md }} />
          </View>
        ) : (
          <>
            <View style={styles.toolbar}>
              <Pressable onPress={() => void loadStats()} disabled={loading}>
                <Text style={styles.link}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
              </Pressable>
              <Pressable onPress={handleSignOut}>
                <Text style={styles.linkMuted}>Sign out</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading && !stats ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
            ) : stats ? (
              <View style={styles.grid}>
                <StatCard
                  featured
                  label="Real users"
                  value={stats.real_users.toLocaleString()}
                  detail="Accounts with ≥1 meal logged"
                />

                <Text style={styles.sectionLabel}>Engagement</Text>
                <StatCard
                  label="Meals logged"
                  value={stats.total_meals.toLocaleString()}
                  detail={`${stats.real_users.toLocaleString()} accounts contributed`}
                />
                <StatCard
                  label="Protein logged"
                  value={formatProtein(Number(stats.total_protein_g))}
                  detail="Sum of protein_g"
                />

                <Text style={styles.sectionLabel}>Visitors</Text>
                <StatCard
                  label="Visitors today"
                  value={stats.unique_visitors_today.toLocaleString()}
                  detail="Distinct hashed IPs (UTC day); same IP = one visitor"
                />
                <StatCard
                  label="Visitors all time"
                  value={stats.unique_visitors_all_time.toLocaleString()}
                  detail="Distinct hashed IPs across all days"
                />

                <Text style={styles.sectionLabel}>Supabase accounts</Text>
                <StatCard
                  label="All auth.users"
                  value={stats.supabase_accounts.toLocaleString()}
                  detail="Includes anonymous sessions; each browser/device often creates one"
                />
                <StatCard
                  label="Anonymous"
                  value={stats.anonymous_accounts.toLocaleString()}
                  detail={`${stats.zero_log_accounts.toLocaleString()} accounts never logged a meal`}
                />
                <StatCard
                  label="Signed in"
                  value={stats.signed_in_accounts.toLocaleString()}
                  detail="Non-anonymous accounts (OAuth/email when enabled)"
                />

                <Text style={styles.footnote}>
                  Account count ≠ unique people. Anonymous sign-in creates a new auth.users row
                  when storage is cleared, incognito is used, or demo/Playwright scripts run.
                  Sessions normally persist in localStorage on repeat visits. Use Real users or
                  Visitors for honest reach.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScreenShell>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
  },
  form: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  toolbar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  link: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  linkMuted: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  error: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.danger,
  },
  grid: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  sectionLabel: {
    ...type.label,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  footnote: {
    marginTop: spacing.md,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textTertiary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardLabel: {
    ...type.label,
    color: colors.textTertiary,
  },
  cardFeatured: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  cardValue: {
    fontFamily: fonts.displayHeavy,
    fontSize: 36,
    lineHeight: 42,
    color: colors.text,
  },
  cardValueFeatured: {
    fontSize: 48,
    lineHeight: 54,
    color: colors.accent,
  },
  cardDetail: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
  },
});
