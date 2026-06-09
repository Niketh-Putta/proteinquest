import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchDailyTotals } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing } from '@/theme';

const DAYS = 7;

export default function TrendsScreen() {
  const { profile } = useSession();
  const [totals, setTotals] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      fetchDailyTotals(DAYS).then(setTotals).catch(console.error);
    }, []),
  );

  const goal = profile?.protein_goal_g ?? 0;

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (DAYS - 1 - i));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      iso,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      total: totals[iso] ?? 0,
    };
  });

  const maxValue = Math.max(goal, ...days.map((d) => d.total), 1);
  const hitDays = days.filter((d) => goal > 0 && d.total >= goal).length;
  const avg = Math.round(days.reduce((s, d) => s + d.total, 0) / DAYS);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Last 7 days</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{avg}g</Text>
            <Text style={styles.statLabel}>Daily average</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {hitDays}/{DAYS}
            </Text>
            <Text style={styles.statLabel}>Goals hit</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chart}>
            {days.map((d, i) => {
              const hit = goal > 0 && d.total >= goal;
              const isToday = i === DAYS - 1;
              return (
                <View key={d.iso} style={styles.barCol}>
                  <Text style={styles.barValue}>
                    {d.total > 0 ? Math.round(d.total) : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.min((d.total / maxValue) * 100, 100)}%`,
                          backgroundColor: hit ? colors.accent : colors.border,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.barLabel, isToday && { color: colors.accent }]}>
                    {d.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {goal > 0 ? (
            <Text style={styles.goalNote}>
              Daily goal: <Text style={{ color: colors.accent }}>{goal}g</Text>
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    fontFamily: fonts?.rounded,
    marginBottom: spacing.lg,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  chartCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  chart: {
    flexDirection: 'row',
    height: 220,
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    height: 16,
    fontVariant: ['tabular-nums'],
  },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 8, minHeight: 4 },
  barLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  goalNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
