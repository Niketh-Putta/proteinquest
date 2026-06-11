import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PageCanvas } from '@/components/PageCanvas';
import { flexFill, flexScroll, useLayout } from '@/lib/layout';
import { buildLeaderboard, formatXp, type LeaderboardEntry } from '@/lib/leaderboard';
import { useSession } from '@/lib/session';
import { getPreferredName, xpSnapshot } from '@/lib/xp';
import { colors, fonts, pressableWeb, radius, spacing } from '@/theme';

const AVATAR_HUES = ['#FF7A59', '#9B8CFF', '#5BC8F5', '#5AD67A', '#FFB454', '#FF6B7A'];

function avatarColor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 9973;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

function Avatar({ entry, size }: { entry: LeaderboardEntry; size: number }) {
  const tint = entry.isYou ? colors.accent : avatarColor(entry.handle);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${tint}22`,
        borderWidth: 1.5,
        borderColor: tint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontFamily: fonts.displayHeavy,
          fontSize: size * 0.38,
          color: tint,
        }}>
        {entry.displayName.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function PodiumSlot({ entry, champion }: { entry?: LeaderboardEntry; champion?: boolean }) {
  if (!entry) return <View style={styles.podiumSlot} />;
  return (
    <Animated.View
      entering={FadeInUp.delay(champion ? 100 : 220).springify().damping(16)}
      style={[styles.podiumSlot, champion && styles.podiumChampion]}>
      {champion ? (
        <Ionicons name="trophy" size={16} color={colors.warning} style={{ marginBottom: 6 }} />
      ) : (
        <Text style={styles.podiumRank}>{entry.position}</Text>
      )}
      <Avatar entry={entry} size={champion ? 64 : 48} />
      <Text style={styles.podiumName} numberOfLines={1}>
        {entry.isYou ? 'You' : `@${entry.handle}`}
      </Text>
      <Text style={styles.podiumXp}>
        {formatXp(entry.xp)} <Text style={styles.xpUnit}>XP</Text>
      </Text>
      <Text style={styles.podiumLevel}>LV {entry.level}</Text>
    </Animated.View>
  );
}

export default function LeagueScreen() {
  const { profile } = useSession();
  const { horizontalPad, contentMaxWidth } = useLayout();
  const [name, setName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPreferredName().then(setName).catch(() => {});
    }, []),
  );

  const entries = buildLeaderboard(profile, name);
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const you = entries.find((e) => e.isYou);
  const snapshot = xpSnapshot(profile);

  return (
    <PageCanvas>
      <SafeAreaView style={flexFill} edges={['top', 'bottom']}>
        <ScrollView
          style={flexScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
            },
          ]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>PROTEIN LEAGUE</Text>
              <Text style={styles.title}>Leaderboard</Text>
            </View>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close leaderboard"
              style={[styles.closeBtn, pressableWeb]}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {you ? (
            <Animated.View entering={FadeInDown.duration(300)} style={styles.youCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.youRankLabel}>{snapshot.rank.label.toUpperCase()}</Text>
                <Text style={styles.youLine}>
                  Rank {you.position} · Level {snapshot.level}
                </Text>
                <View style={styles.youBarTrack}>
                  <View style={[styles.youBarFill, { width: `${snapshot.levelPct * 100}%` }]} />
                </View>
              </View>
              <Text style={styles.youXp}>
                {formatXp(snapshot.xp)}
                <Text style={styles.xpUnit}> XP</Text>
              </Text>
            </Animated.View>
          ) : null}

          <View style={styles.podiumRow}>
            <PodiumSlot entry={podium[1]} />
            <PodiumSlot entry={podium[0]} champion />
            <PodiumSlot entry={podium[2]} />
          </View>

          <View style={styles.list}>
            {rest.map((entry, i) => (
              <Animated.View
                key={entry.id}
                entering={FadeInDown.delay(60 * Math.min(i, 6)).duration(280)}
                style={[styles.row, i > 0 && styles.rowBorder, entry.isYou && styles.rowYou]}>
                <Text style={[styles.rowRank, entry.isYou && { color: colors.accent }]}>
                  {entry.position}
                </Text>
                <Avatar entry={entry} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowName, entry.isYou && { color: colors.accent }]} numberOfLines={1}>
                    {entry.isYou ? `${entry.displayName} (you)` : `@${entry.handle}`}
                  </Text>
                  <Text style={styles.rowRankName}>{entry.rank.label}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowXp}>
                    {formatXp(entry.xp)}
                    <Text style={styles.xpUnit}> XP</Text>
                  </Text>
                  <Text style={styles.rowLevel}>LV {entry.level}</Text>
                </View>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.footnote}>Every gram you log moves you up the board.</Text>
        </ScrollView>
      </SafeAreaView>
    </PageCanvas>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontSize: 34,
    color: colors.text,
    letterSpacing: -1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  youCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  youRankLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.accent,
  },
  youLine: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
    marginTop: 4,
  },
  youBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.ringTrack,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  youBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  youXp: {
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  xpUnit: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textTertiary,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  podiumSlot: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  podiumChampion: {
    paddingVertical: spacing.lg,
    backgroundColor: colors.bgRaised,
    borderColor: colors.hairlineBright,
  },
  podiumRank: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  podiumName: {
    fontFamily: fonts.displayMedium,
    fontSize: 12,
    color: colors.text,
    maxWidth: '90%',
    marginTop: 4,
  },
  podiumXp: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  podiumLevel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.textTertiary,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  rowYou: {
    backgroundColor: colors.accentSurface,
    borderRadius: radius.sm,
    borderTopWidth: 0,
    paddingHorizontal: spacing.sm,
    marginVertical: 2,
  },
  rowRank: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textTertiary,
    width: 22,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  rowName: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: colors.text,
  },
  rowRankName: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowXp: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  rowLevel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.textTertiary,
  },
  footnote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
