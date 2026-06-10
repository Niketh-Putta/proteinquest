import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import {
  activeDragonId,
  activeProgress,
  dragonById,
  effectiveStreak,
  nextStage,
  stageForGoalsHit,
} from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import type { Profile } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme';

export function CharacterCard({ profile }: { profile: Profile }) {
  const dragonId = activeDragonId(profile);
  const dragon = dragonById(dragonId);
  const progress = activeProgress(profile);
  const stage = stageForGoalsHit(progress.goals_hit, dragonId);
  const next = nextStage(progress.goals_hit, dragonId);
  const streak = effectiveStreak(progress, todayISODate(), todayISODate(-1));

  const float = useSharedValue(0);
  const glow = useSharedValue(0.3);
  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.55, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.25, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [float, glow]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const progressToNext = next
    ? Math.min(
        (progress.goals_hit - stage.goalsRequired) / (next.goalsRequired - stage.goalsRequired),
        1,
      )
    : 1;

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.glowDisc, glowStyle, { backgroundColor: dragon.accent }]} />
      <Animated.View style={floatStyle}>
        <Image source={stage.art} style={styles.art} />
      </Animated.View>

      <View style={styles.info}>
        <Text style={styles.potential}>REACH YOUR POTENTIAL</Text>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{dragon.name}</Text>
          <View style={[styles.stagePill, { borderColor: dragon.accent }]}>
            <Text style={[styles.stagePillText, { color: dragon.accent }]}>
              {stage.name.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.tagline}>{stage.tagline}</Text>

        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${Math.min((progress.xp % 500) / 5, 100)}%`, backgroundColor: dragon.accent }]} />
        </View>
        <View style={styles.statsRow}>
          <View style={styles.streakChip}>
            <Ionicons name="flame" size={14} color={streak > 0 ? colors.flame : colors.textTertiary} />
            <Text style={[styles.streakText, streak > 0 && { color: colors.flame }]}>
              {streak} day{streak === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={styles.xp}>{progress.xp} XP</Text>
        </View>

        {next ? (
          <View style={styles.evoWrap}>
            <View style={styles.evoTrack}>
              <View style={[styles.evoFill, { width: `${progressToNext * 100}%`, backgroundColor: dragon.accent }]} />
            </View>
            <Text style={styles.evoLabel}>
              {next.goalsRequired - progress.goals_hit} goal
              {next.goalsRequired - progress.goals_hit === 1 ? '' : 's'} to {next.name}
            </Text>
          </View>
        ) : (
          <Text style={styles.evoLabel}>Legendary — keep feeding</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    overflow: 'hidden',
    minHeight: 44,
  },
  glowDisc: {
    position: 'absolute',
    left: spacing.md,
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  art: { width: 100, height: 100, borderRadius: radius.md },
  info: { flex: 1, gap: 4 },
  potential: { ...type.label, fontSize: 9, color: colors.textTertiary },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  stagePill: {
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  stagePillText: { fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 1.2 },
  tagline: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  xpTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ringTrack,
    marginTop: 4,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  streakText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textTertiary },
  xp: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
  evoWrap: { marginTop: 2, gap: 4 },
  evoTrack: { height: 5, borderRadius: 3, backgroundColor: colors.ringTrack, overflow: 'hidden' },
  evoFill: { height: '100%', borderRadius: 3 },
  evoLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: colors.textTertiary },
});
