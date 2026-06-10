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

import { nextStage, stageForGoalsHit } from '@/lib/character';
import { effectiveStreak } from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import type { Profile } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';

export function CharacterCard({ profile }: { profile: Profile }) {
  const stage = stageForGoalsHit(profile.goals_hit ?? 0);
  const next = nextStage(profile.goals_hit ?? 0);
  const streak = effectiveStreak(profile, todayISODate(), todayISODate(-1));

  // Idle float: Whey gently bobs.
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [float]);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));

  const progressToNext = next
    ? Math.min((profile.goals_hit - stage.goalsRequired) / (next.goalsRequired - stage.goalsRequired), 1)
    : 1;

  return (
    <View style={styles.card}>
      <Animated.View style={floatStyle}>
        <Image source={stage.art} style={styles.art} />
      </Animated.View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>Whey</Text>
          <View style={styles.stagePill}>
            <Text style={styles.stagePillText}>{stage.name.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.tagline}>{stage.tagline}</Text>

        <View style={styles.statsRow}>
          <View style={styles.streakChip}>
            <Ionicons name="flame" size={14} color={streak > 0 ? colors.flame : colors.textTertiary} />
            <Text style={[styles.streakText, streak > 0 && { color: colors.flame }]}>
              {streak} day{streak === 1 ? '' : 's'}
            </Text>
          </View>
          <Text style={styles.xp}>{profile.xp ?? 0} XP</Text>
        </View>

        {next ? (
          <View style={styles.evoWrap}>
            <View style={styles.evoTrack}>
              <View style={[styles.evoFill, { width: `${progressToNext * 100}%` }]} />
            </View>
            <Text style={styles.evoLabel}>
              {next.goalsRequired - (profile.goals_hit ?? 0)} goal
              {next.goalsRequired - (profile.goals_hit ?? 0) === 1 ? '' : 's'} to {next.name}
            </Text>
          </View>
        ) : (
          <Text style={styles.evoLabel}>Final form reached</Text>
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
  },
  art: { width: 108, height: 108, borderRadius: radius.md },
  info: { flex: 1, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  stagePill: {
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentDeep,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  stagePillText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  tagline: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textTertiary },
  xp: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
  evoWrap: { marginTop: 4, gap: 4 },
  evoTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  evoFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  evoLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: colors.textTertiary },
});
