import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageCanvas } from '@/components/PageCanvas';
import { fetchDailyTotals } from '@/lib/api';
import { goalHitStreakDays } from '@/lib/character';
import { flexFill, useContentColumn, useLayout, useTabBarScrollInset } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { canUseStreakFreeze } from '@/lib/retention';
import { useSession } from '@/lib/session';
import { colors, displayLH, fonts, spacing, type } from '@/theme';

const WINDOW = 7;

export default function TrendsScreen() {
  const { profile } = useSession();
  const { titleSize, typeScale, isDesktop, isNarrow } = useLayout();
  const column = useContentColumn('form');
  const tabBarScrollInset = useTabBarScrollInset(isNarrow);
  const heroNumSize = Math.round(72 * typeScale);
  const plotHeight = isDesktop ? 200 : 168;
  const [totals, setTotals] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      fetchDailyTotals(WINDOW).then(setTotals).catch(console.error);
    }, []),
  );

  const goal = profile?.protein_goal_g ?? 0;
  const todayISO = todayISODate();

  const days = useMemo(
    () =>
      Array.from({ length: WINDOW }, (_, i) => {
        const iso = todayISODate(-(WINDOW - 1 - i));
        const d = new Date(iso + 'T12:00:00');
        return {
          iso,
          label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
          total: totals[iso] ?? 0,
        };
      }),
    [totals],
  );

  const activeDays = days.filter((d) => d.total > 0);
  const activeDayCount = activeDays.length;
  const weekTotal = days.reduce((s, d) => s + d.total, 0);
  const weekTotalDisplay = Math.round(weekTotal);
  const goalDisplay = Math.round(goal);
  const avg =
    activeDayCount > 0 ? Math.round(weekTotal / activeDayCount) : 0;
  const hitDays = days.filter((d) => goal > 0 && d.total >= goal).length;
  const maxValue = Math.max(goal, ...days.map((d) => d.total), 1);
  const streak =
    profile && goal > 0
      ? goalHitStreakDays(totals, goal, todayISO, todayISODate(-1), {
          freezeKeepsAlive: canUseStreakFreeze(profile),
        })
      : 0;

  const avgLabel =
    activeDayCount === 0
      ? 'log a meal to start'
      : activeDayCount === 1
        ? 'average on your one logged day'
        : `average across ${activeDayCount} logged days`;

  return (
    <PageCanvas>
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          column,
          { paddingBottom: tabBarScrollInset },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>LAST {WINDOW} DAYS</Text>
          <Text
            style={[styles.title, { fontSize: titleSize, lineHeight: displayLH(titleSize) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}>
            Progress
          </Text>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.heroRow}>
            <Text
              style={[
                styles.heroNumber,
                { fontSize: heroNumSize, lineHeight: displayLH(heroNumSize) },
              ]}>
              {avg}
            </Text>
            <Text style={styles.heroUnit}>g</Text>
          </View>
          <Text style={styles.heroCaption}>{avgLabel}</Text>
          {goal > 0 && activeDayCount > 0 ? (
            <Text style={styles.heroMeta}>
              {weekTotalDisplay}g total · goal {goalDisplay}g · {hitDays} hit
            </Text>
          ) : goal > 0 ? (
            <Text style={styles.heroMeta}>goal {goalDisplay}g per day</Text>
          ) : null}
        </View>

        <View style={styles.rule} />

        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>Daily intake</Text>
            {goal > 0 ? (
              <Text style={styles.chartGoal}>{goalDisplay}g target</Text>
            ) : null}
          </View>

          <View style={[styles.plot, { height: plotHeight }]}>
            {goal > 0 ? (
              <View
                style={[
                  styles.targetLine,
                  { bottom: `${Math.min(100, (goal / maxValue) * 100)}%` },
                ]}
              />
            ) : null}

            {days.map((d, i) => {
              const hit = goal > 0 && d.total >= goal;
              const isToday = i === WINDOW - 1;
              const hasData = d.total > 0;
              const barH = hasData
                ? Math.max(4, (d.total / maxValue) * 100)
                : 0;

              return (
                <View key={d.iso} style={styles.plotCol}>
                  <Text style={styles.plotGrams}>
                    {hasData ? Math.round(d.total) : '·'}
                  </Text>
                  <View style={styles.plotTrack}>
                    {hasData ? (
                      <View
                        style={[
                          styles.plotBar,
                          {
                            height: `${barH}%`,
                            backgroundColor: hit ? colors.accent : colors.text,
                            opacity: hit ? 1 : 0.55,
                          },
                        ]}
                      />
                    ) : (
                      <View style={styles.plotDot} />
                    )}
                  </View>
                  <Text style={[styles.plotDay, isToday && styles.plotDayToday]}>
                    {d.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.rule} />

        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{streak}</Text>
            <Text style={styles.metricLabel}>day streak</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {activeDayCount}/{WINDOW}
            </Text>
            <Text style={styles.metricLabel}>days logged</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{weekTotalDisplay}g</Text>
            <Text style={styles.metricLabel}>this week</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  safe: { ...flexFill, backgroundColor: colors.bg },
  scroll: { paddingTop: spacing.lg },
  header: { marginBottom: spacing.xl },
  eyebrow: { ...type.eyebrow, marginBottom: spacing.xs + 2 },
  title: { ...type.pageTitle },
  heroBlock: { marginBottom: spacing.lg },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  heroNumber: {
    ...type.hero,
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: displayLH(28),
    color: colors.textTertiary,
    marginBottom: 10,
  },
  heroCaption: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 4,
  },
  heroMeta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 10,
    letterSpacing: 0.3,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  chartSection: { gap: spacing.md },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  chartTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  chartGoal: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.accent,
  },
  plot: {
    flexDirection: 'row',
    height: 168,
    alignItems: 'flex-end',
    gap: 4,
    position: 'relative',
    paddingTop: 20,
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.accent,
    opacity: 0.35,
  },
  plotCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  plotGrams: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    height: 14,
    fontVariant: ['tabular-nums'],
  },
  plotTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  plotBar: {
    width: 3,
    minHeight: 4,
  },
  plotDot: {
    width: 2,
    height: 2,
    backgroundColor: colors.hairlineBright,
    marginBottom: 2,
  },
  plotDay: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 10,
    letterSpacing: 0.5,
  },
  plotDayToday: {
    color: colors.accent,
    fontFamily: fonts.monoBold,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  metric: { flex: 1, alignItems: 'center', gap: 4 },
  metricValue: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: displayLH(20),
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: colors.hairline,
  },
});
