import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchDailyTotals } from '@/lib/api';
import { effectiveStreak } from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing, type } from '@/theme';

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
    const iso = todayISODate(-(DAYS - 1 - i));
    const d = new Date(iso + 'T12:00:00');
    return {
      iso,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      total: totals[iso] ?? 0,
    };
  });

  const maxValue = Math.max(goal, ...days.map((d) => d.total), 1);
  const hitDays = days.filter((d) => goal > 0 && d.total >= goal).length;
  const avg = Math.round(days.reduce((s, d) => s + d.total, 0) / DAYS);
  const streak = profile ? effectiveStreak(profile, todayISODate(), todayISODate(-1)) : 0;

  const stats = [
    { label: 'DAILY AVG', value: `${avg}g` },
    { label: 'GOALS HIT', value: `${hitDays}/${DAYS}` },
    { label: 'STREAK', value: `${streak}d` },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>LAST 7 DAYS</Text>
        <Text style={styles.title}>Trends</Text>

        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <Animated.View
              key={s.label}
              entering={FadeInDown.delay(i * 90).springify().damping(16)}
              style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeInDown.delay(280).springify().damping(16)}
          style={styles.chartCard}>
          <View style={styles.chart}>
            {goal > 0 ? (
              <View style={[styles.goalLine, { bottom: `${(goal / maxValue) * 78}%` }]} />
            ) : null}
            {days.map((d, i) => {
              const hit = goal > 0 && d.total >= goal;
              const isToday = i === DAYS - 1;
              return (
                <View key={d.iso} style={styles.barCol}>
                  <Text style={styles.barValue}>{d.total > 0 ? Math.round(d.total) : ''}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: `${Math.min((d.total / maxValue) * 100, 100)}%`,
                          backgroundColor: hit ? colors.accent : colors.surface2,
                          borderWidth: hit ? 0 : 1,
                          borderColor: colors.hairlineBright,
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
              daily goal {'\u00B7'} <Text style={{ color: colors.accent }}>{goal}g</Text>
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  kicker: { ...type.label, color: colors.accent },
  title: { fontFamily: fonts.displayHeavy, fontSize: 30, color: colors.text, marginTop: 2, marginBottom: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 21,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, color: colors.textTertiary, marginTop: 4 },
  chartCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  chart: { flexDirection: 'row', height: 230, gap: spacing.sm, alignItems: 'flex-end' },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.accentDeep,
    opacity: 0.7,
  },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textSecondary,
    height: 16,
    fontVariant: ['tabular-nums'],
  },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 9, minHeight: 4 },
  barLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, marginTop: spacing.sm },
  goalNote: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
});
