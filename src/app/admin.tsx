import Head from 'expo-router/head';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  fetchGrowthCsv,
  fetchGrowthDashboard,
  getStoredAdminToken,
  type GrowthMetric,
  type GrowthSnapshot,
} from '@/lib/admin';
import { colors, fonts, noTextCaret, pressableWeb, radius, spacing, type } from '@/theme';

function metricLabel(metric: GrowthMetric): string {
  if (metric.status === 'not_connected') return 'Not connected';
  if (metric.status === 'unavailable') return 'Unavailable';
  if (metric.status === 'no_data' || metric.value == null) return 'No data';
  if (Math.abs(metric.value) > 0 && Math.abs(metric.value) < 1) {
    return `${(metric.value * 100).toFixed(1)}%`;
  }
  return Number.isInteger(metric.value)
    ? metric.value.toLocaleString()
    : metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function MetricCard({
  label,
  metric,
  featured,
}: {
  label: string;
  metric: GrowthMetric;
  featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={[styles.card, featured && styles.cardFeatured]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, featured && styles.cardValueFeatured]}>{metricLabel(metric)}</Text>
      <Text style={styles.cardDetail}>{metric.status.replaceAll('_', ' ')}</Text>
      {open ? (
        <View style={styles.details}>
          <Text style={styles.detailLine}>Source: {metric.source ?? '—'}</Text>
          <Text style={styles.detailLine}>Formula: {metric.formula ?? '—'}</Text>
          <Text style={styles.detailLine}>Denominator: {String(metric.denominator ?? '—')}</Text>
          <Text style={styles.detailLine}>Window: {metric.window ?? '—'}</Text>
          <Text style={styles.detailLine}>Last refresh: {metric.last_refresh ?? '—'}</Text>
          {metric.note ? <Text style={styles.detailLine}>{metric.note}</Text> : null}
        </View>
      ) : (
        <Text style={styles.hint}>Tap for definition</Text>
      )}
    </Pressable>
  );
}

function londonDate(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [data, setData] = useState<GrowthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(londonDate(-29));
  const [to, setTo] = useState(londonDate(0));
  const [platform, setPlatform] = useState('all');
  const [channel, setChannel] = useState('all');

  const query = useMemo(
    () => `?from=${from}&to=${to}&platform=${platform}&channel=${channel}`,
    [from, to, platform, channel],
  );

  const load = useCallback(
    async (existingToken?: string | null) => {
      const t = existingToken ?? getStoredAdminToken();
      if (!t) return;
      setLoading(true);
      setError(null);
      try {
        const snapshot = await fetchGrowthDashboard(t, query);
        setData(snapshot);
        setToken(t);
      } catch (err) {
        setData(null);
        setToken(null);
        setError(err instanceof Error ? err.message : 'Could not load dashboard');
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (token) void load(token);
  }, [token, load]);

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const t = await adminLogin(password.trim());
      setPassword('');
      setToken(t);
      await load(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const csv = await fetchGrowthCsv(undefined, query);
      if (typeof window !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proteinquest-growth-${from}-${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenShell>
          <Text style={type.heading}>Growth OS</Text>
          <Text style={[type.body, { marginTop: spacing.md }]}>
            Open /admin on https://proteinquest.vercel.app
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
      <Head>
        <title>ProteinQuest Growth OS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <ScreenShell>
        <Text style={type.label}>Private</Text>
        <Text style={[type.title, { marginTop: spacing.xs }]}>Growth OS</Text>
        <Text style={[type.body, { marginTop: spacing.xs }]}>
          Production analytics. Sample numbers are never shown.
        </Text>

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
              <Pressable onPress={() => void load()} disabled={loading} style={pressableWeb}>
                <Text selectable={false} style={styles.link}>
                  {loading ? 'Refreshing…' : 'Refresh'}
                </Text>
              </Pressable>
              <Pressable onPress={() => void handleExport()} style={pressableWeb}>
                <Text selectable={false} style={styles.link}>
                  Export CSV
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  clearAdminToken();
                  setToken(null);
                  setData(null);
                }}
                style={pressableWeb}>
                <Text selectable={false} style={styles.linkMuted}>
                  Sign out
                </Text>
              </Pressable>
            </View>

            <View style={styles.filters}>
              <TextField value={from} onChange={setFrom} placeholder="From YYYY-MM-DD" />
              <TextField value={to} onChange={setTo} placeholder="To YYYY-MM-DD" />
              <TextField value={platform} onChange={setPlatform} placeholder="platform all|ios|android|web" />
              <TextField value={channel} onChange={setChannel} placeholder="channel all|unknown" />
            </View>
            <Text style={styles.footnote}>
              Filters apply to every KPI, chart, funnel and CSV. Timezone Europe/London. Storage UTC.
              Event collection started {data?.meta.analytics_start_date ?? '2026-09-10'}.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && !data ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
            ) : data ? (
              <View style={styles.grid}>
                <Text style={styles.sectionLabel}>Overview</Text>
                <MetricCard featured label="New first opens" metric={data.overview.first_opens} />
                <MetricCard label="First-meal activation" metric={data.overview.first_meal_activation} />
                <MetricCard label="New paid subscribers" metric={data.overview.new_paid_subscribers} />
                <MetricCard label="Net proceeds" metric={data.overview.net_proceeds} />
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Largest evidenced loss</Text>
                  <Text style={styles.cardValue}>{data.overview.largest_loss.from} → {data.overview.largest_loss.to}</Text>
                  <Text style={styles.cardDetail}>{data.overview.largest_loss.note}</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardLabel}>Growth action</Text>
                  <Text style={styles.bodyCopy}>{data.overview.growth_action.action}</Text>
                  <Text style={styles.cardDetail}>
                    Sample {data.overview.growth_action.sample_size} · {data.overview.growth_action.window}
                  </Text>
                </View>

                <Text style={styles.sectionLabel}>Funnel</Text>
                {data.funnel.map((step) => (
                  <MetricCard key={step.id} label={step.label} metric={step.metric} />
                ))}

                <Text style={styles.sectionLabel}>Acquisition</Text>
                <MetricCard label="Website visitors" metric={data.acquisition.website_visitors} />
                <MetricCard label="Store clickers" metric={data.acquisition.store_clicks} />
                <MetricCard label="Apple downloads" metric={data.acquisition.apple_downloads} />
                <MetricCard label="Google downloads" metric={data.acquisition.google_downloads} />
                <MetricCard label="Unknown channel" metric={data.acquisition.unknown_channel} />
                <MetricCard label="Attribution coverage" metric={data.acquisition.attribution_coverage} />
                <MetricCard label="CAC" metric={data.acquisition.cac} />

                <Text style={styles.sectionLabel}>Retention (meal return)</Text>
                <MetricCard label="D1" metric={data.retention.d1} />
                <MetricCard label="D7" metric={data.retention.d7} />
                <MetricCard label="D30" metric={data.retention.d30} />
                <Text style={styles.footnote}>{data.retention.definition}</Text>

                <Text style={styles.sectionLabel}>Quality</Text>
                <MetricCard label="Scan failure rate" metric={data.quality.scan_failure_rate} />

                <Text style={styles.sectionLabel}>Connections</Text>
                {data.connections.map((c) => (
                  <View key={c.provider} style={styles.card}>
                    <Text style={styles.cardLabel}>{c.provider}</Text>
                    <Text style={styles.cardValue}>{c.status.replaceAll('_', ' ')}</Text>
                    <Text style={styles.cardDetail}>{c.notes ?? 'No notes'}</Text>
                    <Text style={styles.detailLine}>Last success: {c.last_success_at ?? '—'}</Text>
                    <Text style={styles.detailLine}>Last error: {c.error_summary ?? 'none'}</Text>
                  </View>
                ))}
                <Text style={styles.footnote}>
                  implemented / connected / verified / requires owner access are separate.
                  Credentials are never shown.
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
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1 },
  form: { marginTop: spacing.xl, gap: spacing.sm },
  toolbar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  filters: { marginTop: spacing.md, gap: spacing.sm },
  link: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  linkMuted: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  error: { marginTop: spacing.sm, fontFamily: fonts.body, fontSize: 14, color: colors.danger },
  grid: { marginTop: spacing.lg, gap: spacing.md },
  sectionLabel: { ...type.label, color: colors.textTertiary, marginTop: spacing.sm },
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
  cardFeatured: { borderColor: colors.accent },
  cardLabel: { ...type.label, color: colors.textTertiary },
  cardValue: { fontFamily: fonts.displayHeavy, fontSize: 32, lineHeight: 38, color: colors.text },
  cardValueFeatured: { fontSize: 44, lineHeight: 50, color: colors.accent },
  cardDetail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textTertiary },
  hint: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },
  details: { marginTop: spacing.sm, gap: 4 },
  detailLine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.textSecondary },
  bodyCopy: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
});
