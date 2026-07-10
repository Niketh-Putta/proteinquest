import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CharacterCard } from '@/components/CharacterCard';
import { DailyDragonPicker } from '@/components/DailyDragonPicker';
import { PageCanvas } from '@/components/PageCanvas';
import { ProgressRing } from '@/components/ProgressRing';
import { deleteLog, fetchLogsForDate, countTodayPhotoScans } from '@/lib/api';
import { applyDeleteLogToCharacter, dragonById, isDailyDragonLockedForToday } from '@/lib/character';
import { confirmDestructive } from '@/lib/confirm';
import { flexFill, flexScroll, useLayout, useTabBarScrollInset } from '@/lib/layout';
import { isPro, isInHabitGracePeriod, remainingFreeScans, shouldShowDelayedPaywall } from '@/lib/paywall-gate';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { ProteinLog } from '@/lib/types';
import { formatXp } from '@/lib/leaderboard';
import { xpSnapshot } from '@/lib/xp';
import { colors, displayLH, fonts, noTextCaret, pressableWeb, spacing, type } from '@/theme';

export default function TodayScreen() {
  const {
    ringSize,
    horizontalPad,
    contentMaxWidth,
    heroLayout,
    columnGap,
    asideWidth,
    titleSize,
    isNarrow,
  } = useLayout();
  const tabBarScrollInset = useTabBarScrollInset(isNarrow);
  const insets = useSafeAreaInsets();
  const { profile, saveProfile } = useSession();
  const [logs, setLogs] = useState<ProteinLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  /** Extra air below Dynamic Island so FREE / date never sit under the camera. */
  const headerTopPad = insets.top > 0 ? spacing.md : 0;

  const load = useCallback(async () => {
    try {
      if (isPro(profile)) {
        setScansLeft(null);
        setLogs(await fetchLogsForDate(todayISODate()));
      } else {
        const [logsData, used] = await Promise.all([
          fetchLogsForDate(todayISODate()),
          countTodayPhotoScans(),
        ]);
        setLogs(logsData);
        setScansLeft(remainingFreeScans(used, profile));
      }
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  }, [profile?.is_premium, profile?.created_at]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (shouldShowDelayedPaywall(profile)) {
        router.push('/paywall');
      }
    }, [profile?.paywall_dismissed, profile?.is_premium, profile?.onboarded, profile]),
  );

  const consumed = logs.reduce((sum, l) => sum + Number(l.protein_g), 0);
  const goal = profile?.protein_goal_g ?? 0;
  const hitGoal = goal > 0 && consumed >= goal;
  const showDragonInHero = heroLayout !== 'sidebar';
  const todayISO = todayISODate();
  const dragonLocked = profile ? isDailyDragonLockedForToday(profile, todayISO) : false;
  const todayDragon = profile && dragonLocked ? dragonById(profile.daily_dragon_id!) : null;

  if (profile && !dragonLocked) {
    return (
      <PageCanvas>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View
            style={[
              flexFill,
              {
                paddingHorizontal: horizontalPad,
                maxWidth: contentMaxWidth,
                width: '100%',
                alignSelf: 'center',
              },
            ]}>
            <DailyDragonPicker />
          </View>
        </SafeAreaView>
      </PageCanvas>
    );
  }

  async function confirmDelete(log: ProteinLog) {
    const ok = await confirmDestructive(
      "Didn't eat this?",
      `Remove "${log.food_name}" (${Math.round(Number(log.protein_g))}g protein) from today's log.`,
    );
    if (ok) await handleDelete(log);
  }

  async function handleDelete(log: ProteinLog) {
    if (deletingId) return;
    const previousLogs = logs;
    const remainingLogs = logs.filter((l) => l.id !== log.id);
    const todayTotalAfter = remainingLogs.reduce((s, l) => s + Number(l.protein_g), 0);

    setDeletingId(log.id);
    setLogs(remainingLogs);

    try {
      await deleteLog(log.id);
      if (profile) {
        const updates = applyDeleteLogToCharacter({
          profile,
          deletedProteinG: Number(log.protein_g),
          todayTotalAfterDelete: todayTotalAfter,
          todayISO: todayISODate(),
        });
        await saveProfile(updates);
      }
    } catch (e) {
      console.error('Failed to delete log:', e);
      setLogs(previousLogs);
      if (Platform.OS === 'web') {
        window.alert('Could not delete. Please try again.');
      }
    } finally {
      setDeletingId(null);
    }
  }

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();

  function renderHeader() {
    const snapshot = xpSnapshot(profile);
    return (
      <View style={headerTopPad > 0 ? { paddingTop: headerTopPad } : undefined}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Pressable
              onPress={() => router.push(isPro(profile) ? '/settings' : '/paywall')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                isPro(profile) ? 'Pro account. Open settings' : 'Free account. Upgrade to Pro'
              }
              style={[
                styles.statusTag,
                isPro(profile) ? styles.statusTagPro : styles.statusTagFree,
                pressableWeb,
              ]}>
              {isPro(profile) ? (
                <Ionicons name="sparkles" size={10} color={colors.bg} />
              ) : null}
              <Text
                selectable={false}
                style={[
                  styles.statusTagText,
                  isPro(profile) ? styles.statusTagTextPro : styles.statusTagTextFree,
                ]}>
                {isPro(profile) ? 'PRO' : 'FREE'}
              </Text>
            </Pressable>
            <Text style={styles.eyebrow}>{dateLabel}</Text>
            <Text style={[styles.title, { fontSize: titleSize, lineHeight: displayLH(titleSize) }]}>
              Today
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/league')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Trainer rank ${snapshot.rank.label}, ${formatXp(snapshot.xp)} total XP across all dragons. Open leaderboard`}
            style={[styles.levelBadge, pressableWeb]}>
            <Text selectable={false} style={styles.levelKind}>
              TRAINER · ALL DRAGONS
            </Text>
            <Text selectable={false} style={styles.levelRankName}>
              {snapshot.rank.label}
            </Text>
            <Text selectable={false} style={styles.levelXpLine}>
              {formatXp(snapshot.xp)}
              <Text style={styles.levelXpUnit}> XP total</Text>
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={styles.gearBtn}>
            <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {!isPro(profile) && !isInHabitGracePeriod(profile) && scansLeft !== null ? (
          <Pressable onPress={() => router.push('/paywall')} style={styles.scansPill}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <Text style={styles.scansPillText}>
              {scansLeft > 0
                ? `${scansLeft} free scan${scansLeft === 1 ? '' : 's'} left today`
                : 'Out of free scans. Go Pro'}
            </Text>
          </Pressable>
        ) : null}

        {todayDragon ? (
          <View style={[styles.dailyBanner, { borderColor: todayDragon.accent }]}>
            <Ionicons name="lock-closed" size={12} color={todayDragon.accent} />
            <Text style={[styles.dailyBannerText, { color: todayDragon.accent }]}>
              Growing {todayDragon.name} today
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.hero,
            heroLayout === 'split' && { flexDirection: 'row', gap: columnGap, alignItems: 'flex-start' },
          ]}>
          <View
            style={[
              styles.proteinBlock,
              heroLayout === 'split' && { flex: 1 },
            ]}>
            <ProgressRing consumed={consumed} goal={goal} size={ringSize} />
            {goal <= 0 ? (
              <Text style={styles.proteinMeta}>set your goal in settings</Text>
            ) : hitGoal ? (
              <Text style={styles.proteinMeta}>goal complete - your dragon is fed</Text>
            ) : null}
          </View>

          {profile && showDragonInHero ? (
            <Animated.View
              entering={FadeInDown.delay(100).duration(440)}
              style={heroLayout === 'split' ? { flex: 1 } : undefined}>
              <CharacterCard profile={profile} dragonLocked />
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.rule} />

        {logs.length > 0 ? (
          <Text style={styles.sectionTitle}>LOGGED TODAY</Text>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your dragon is waiting</Text>
            <Text style={styles.emptyText}>
              Scan your first meal - every gram of protein brings you closer.
            </Text>
          </View>
        )}
      </View>
    );
  }

  const listProps = {
    data: logs,
    keyExtractor: (l: ProteinLog) => l.id,
    showsVerticalScrollIndicator: false as const,
    refreshControl: (
      <RefreshControl
        refreshing={refreshing}
        tintColor={colors.accent}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
      />
    ),
    renderItem: ({ item, index }: { item: ProteinLog; index: number }) => (
      <Animated.View entering={FadeInDown.delay(60 * Math.min(index, 5)).duration(380)}>
        <View style={[styles.logRow, index > 0 && styles.logRowBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.logName} numberOfLines={1}>
              {item.food_name}
            </Text>
            <Text style={styles.logTime}>
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <Text style={styles.logProtein}>
            {Math.round(Number(item.protein_g))}
            <Text style={styles.logUnit}>g</Text>
            {item.calories ? (
              <Text style={styles.logCal}> ({Math.round(Number(item.calories))} cal)</Text>
            ) : null}
          </Text>
          <Pressable
            onPress={() => confirmDelete(item)}
            disabled={deletingId === item.id}
            accessibilityLabel="Delete meal"
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.5 },
              deletingId === item.id && { opacity: 0.35 },
            ]}>
            <Ionicons
              name={deletingId === item.id ? 'hourglass-outline' : 'trash-outline'}
              size={16}
              color={colors.textTertiary}
            />
          </Pressable>
        </View>
      </Animated.View>
    ),
  };

  return (
    <PageCanvas>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {heroLayout === 'sidebar' ? (
          <View
            style={[
              styles.desktopShell,
              {
                paddingHorizontal: horizontalPad,
                maxWidth: contentMaxWidth,
                alignSelf: 'center',
                width: '100%',
              },
            ]}>
            <View style={[styles.desktopRow, { gap: columnGap }]}>
              <FlatList
                {...listProps}
                testID="today-log-list"
                style={styles.desktopMain}
                contentContainerStyle={[styles.list, { paddingBottom: tabBarScrollInset }]}
                ListHeaderComponent={renderHeader()}
              />
              {profile ? (
                <View style={[styles.desktopAside, { width: asideWidth }]}>
                  <CharacterCard profile={profile} dragonLocked />
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <FlatList
            {...listProps}
            testID="today-log-list"
            style={styles.listScroll}
            contentContainerStyle={[
              styles.list,
              {
                paddingHorizontal: horizontalPad,
                maxWidth: contentMaxWidth,
                width: '100%',
                alignSelf: 'center',
                paddingBottom: tabBarScrollInset,
              },
            ]}
            ListHeaderComponent={renderHeader()}
          />
        )}
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  safe: flexFill,
  listScroll: flexScroll,
  desktopShell: flexFill,
  desktopRow: {
    ...flexFill,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  desktopMain: { ...flexScroll, flex: 1, minWidth: 0 },
  desktopAside: {
    paddingTop: spacing.xl + 8,
    ...(Platform.OS === 'web'
      ? ({ position: 'sticky', top: 24 } as object)
      : {}),
  },
  list: { paddingTop: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  statusTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 8,
  },
  statusTagPro: {
    backgroundColor: colors.accent,
  },
  statusTagFree: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  statusTagText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  statusTagTextPro: { color: colors.bg },
  statusTagTextFree: { color: colors.textSecondary },
  eyebrow: {
    ...type.eyebrow,
    color: colors.accent,
    marginBottom: 6,
  },
  title: {
    ...type.pageTitle,
  },
  gearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadge: {
    alignItems: 'flex-start',
    gap: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 5,
    marginRight: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    backgroundColor: colors.surface,
    marginTop: 2,
  },
  levelKind: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    color: colors.textTertiary,
    lineHeight: 10,
  },
  levelRankName: {
    ...noTextCaret,
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.text,
    lineHeight: 13,
  },
  levelXpLine: {
    ...noTextCaret,
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.2,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 13,
  },
  levelXpSep: {
    color: colors.textTertiary,
    fontFamily: fonts.mono,
    fontWeight: '600',
  },
  levelXpUnit: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '600',
  },
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  scansPillText: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dailyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
  },
  dailyBannerText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    marginBottom: spacing.xs,
  },
  proteinBlock: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    width: '100%',
  },
  proteinMeta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.3,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  empty: {
    paddingVertical: spacing.lg,
    gap: 4,
  },
  emptyTitle: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: spacing.md,
  },
  logRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  logName: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  logTime: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  logProtein: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  logUnit: { fontSize: 13, color: colors.textTertiary },
  logCal: {
    fontSize: 11,
    fontFamily: fonts.mono,
    color: colors.textTertiary,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
