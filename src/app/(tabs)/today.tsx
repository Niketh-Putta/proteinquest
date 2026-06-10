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
import { SafeAreaView } from 'react-native-safe-area-context';

import { CharacterCard } from '@/components/CharacterCard';
import { DailyDragonPicker } from '@/components/DailyDragonPicker';
import { PageCanvas } from '@/components/PageCanvas';
import { ProgressRing } from '@/components/ProgressRing';
import { deleteLog, fetchLogsForDate } from '@/lib/api';
import { applyDeleteLogToCharacter, dragonById, isDailyDragonLockedForToday } from '@/lib/character';
import { confirmDestructive } from '@/lib/confirm';
import { useLayout, useTabBarScrollInset } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { ProteinLog } from '@/lib/types';
import { colors, fonts, spacing } from '@/theme';

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
  const { profile, saveProfile } = useSession();
  const [logs, setLogs] = useState<ProteinLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLogs(await fetchLogsForDate(todayISODate()));
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
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
            style={{
              flex: 1,
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
            }}>
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
    return (
      <View>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{dateLabel}</Text>
            <Text style={[styles.title, { fontSize: titleSize }]}>Today</Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={styles.gearBtn}>
            <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

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
              entering={FadeInDown.delay(100).springify().damping(16)}
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
      <Animated.View entering={FadeInDown.delay(60 * Math.min(index, 5)).springify().damping(16)}>
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
  safe: { flex: 1 },
  listScroll: { flex: 1 },
  desktopShell: { flex: 1 },
  desktopRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopMain: { flex: 1, minWidth: 0 },
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
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.accent,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    letterSpacing: -1.2,
  },
  gearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
