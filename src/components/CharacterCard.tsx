import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  DRAGONS,
  displayDragonId,
  displayProgress,
  dragonById,
  dragonLevelProgress,
  effectiveLevel,
  effectiveStreak,
  getDragonProgress,
  microProgress,
  nextEvolutionStage,
  stageForXpLevel,
  xpProgressInLevel,
} from '@/lib/character';
import { formatXp } from '@/lib/leaderboard';
import { todayISODate } from '@/lib/protein';
import { useLayout } from '@/lib/layout';
import type { Profile } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';

interface Props {
  profile: Profile;
  bleed?: number;
  showSwitcher?: boolean;
  /** When true, dragon switcher is read-only (daily lock active). */
  dragonLocked?: boolean;
  /** Responsive scale - 1 phone, ~1.08 tablet, ~1.2 desktop sidebar */
  scale?: number;
}

function CharacterCardInner({
  profile,
  bleed,
  showSwitcher = true,
  dragonLocked = false,
  scale: scaleProp,
}: Props) {
  const { characterScale: layoutScale } = useLayout();
  const scale = scaleProp ?? layoutScale;
  const nameSize = Math.round(24 * scale);
  const sceneW = Math.round(300 * scale);
  const sceneH = Math.round(200 * scale);

  const todayISO = todayISODate();
  const dragonId = displayDragonId(profile, todayISO);
  const dragon = dragonById(dragonId);
  const progress = displayProgress(profile, todayISO);
  const { level, xpIntoLevel, xpForNext } = dragonLevelProgress(progress);
  const stage = stageForXpLevel(level, dragonId);
  const next = nextEvolutionStage(level, dragonId);
  const streak = effectiveStreak(progress, todayISO, todayISODate(-1));

  const micro = microProgress(level, dragonId);
  const stretchComp = (micro.scaleY - 1) * (sceneH * 0.12);

  // Slow, calm breathing only — no bounce. Keeps the dragon feeling alive
  // without the springy, jittery motion the previous build had.
  const breath = useSharedValue(1);
  const float = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 3600, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    float.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
        withTiming(2, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [breath, float]);

  const characterStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: float.value + micro.translateY - stretchComp },
      { scaleX: breath.value * micro.scale },
      { scaleY: breath.value * micro.scaleY },
    ],
  }));

  const progressToNext = next
    ? Math.min((level - stage.levelRequired) / (next.levelRequired - stage.levelRequired), 1)
    : 1;
  const levelsToEvo = next ? next.levelRequired - level : 0;
  const xpPct = xpProgressInLevel(progress.xp, level) * 100;

  const evoLabel = next ? `Lv ${next.levelRequired} to evolve` : 'max form';

  return (
    <View
      style={[
        styles.arena,
        bleed != null && { marginHorizontal: -bleed, paddingHorizontal: bleed },
      ]}>
      <View style={styles.stage}>
        <Text style={styles.kicker}>Reach your potential</Text>

        <View style={[styles.scene, { width: sceneW, height: sceneH }]}>
          <Animated.View style={[StyleSheet.absoluteFill, characterStyle]}>
            <Image source={stage.art} style={styles.sceneArt} resizeMode="cover" />
          </Animated.View>
          <View
            pointerEvents="none"
            style={[
              styles.sceneGlow,
              {
                backgroundColor: dragon.accent,
                opacity: micro.glowOpacity * 0.35,
                width: sceneW * 0.7,
                height: sceneH * 0.5,
                borderRadius: sceneW * 0.35,
              },
            ]}
          />
          {/* Feather the rectangular art edges into the page background on all
              four sides so the dragon reads as a character living in its
              scene rather than a pasted-on image. */}
          <LinearGradient
            pointerEvents="none"
            colors={[colors.bg, 'transparent', 'transparent', colors.bg]}
            locations={[0, 0.16, 0.84, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[colors.bg, 'transparent', 'transparent', colors.bg]}
            locations={[0, 0.12, 0.88, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={styles.identity}>
          <Text style={[styles.name, { fontSize: nameSize }]}>{dragon.name}</Text>
          <Text style={[styles.stageLabel, { color: dragon.accent }]}>
            {dragon.name} · Lv {level} · {stage.name}
          </Text>
          <Text style={styles.dragonScope}>This dragon only</Text>
        </View>

        <View style={styles.statsRow}>
          {streak > 0 ? (
            <View style={styles.streakBit}>
              <Ionicons name="flame" size={10} color={colors.flame} />
              <Text style={[styles.statsLine, { color: colors.flame }]}>
                {streak} day streak
              </Text>
            </View>
          ) : (
            <Text style={styles.statsLine}>0 day streak</Text>
          )}
          <Text style={styles.statsDot}>·</Text>
          <Text style={styles.statsLine}>
            {formatXp(xpIntoLevel)} / {formatXp(xpForNext)} XP
          </Text>
          <Text style={styles.statsDot}>·</Text>
          <Text style={styles.statsLine}>
            {next ? `${levelsToEvo} lv to evolve` : evoLabel}
          </Text>
        </View>

        <View style={styles.bars}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${xpPct}%`, backgroundColor: dragon.accent },
              ]}
            />
          </View>
          {next ? (
            <View style={[styles.barTrack, { marginTop: 6 }]}>
              <View
                style={[
                  styles.barFill,
                  { width: `${progressToNext * 100}%`, backgroundColor: dragon.accent },
                ]}
              />
            </View>
          ) : null}
        </View>

        {stage.tagline ? (
          <Text style={styles.tagline}>{stage.tagline}</Text>
        ) : null}
      </View>

      {showSwitcher ? (
        <View style={styles.switcher}>
          <View style={styles.switcherRow}>
            {DRAGONS.map((d) => {
              const isActive = d.id === dragonId;
              const prog = getDragonProgress(profile, d.id);
              const st = stageForXpLevel(effectiveLevel(prog), d.id);
              return (
                <View key={d.id} style={styles.switcherItem}>
                  <Image
                    source={st.art}
                    style={[
                      styles.switcherArt,
                      { borderRadius: radius.sm },
                      isActive
                        ? { borderColor: d.accent, opacity: 1 }
                        : { opacity: dragonLocked ? 0.25 : 0.4 },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          {dragonLocked ? (
            <Text style={styles.lockedHint}>Locked for today</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export const CharacterCard = React.memo(CharacterCardInner);

const styles = StyleSheet.create({
  arena: {
    position: 'relative',
    overflow: 'visible',
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    width: '100%',
  },
  stage: {
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    zIndex: 1,
  },
  scene: {
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.bg,
    zIndex: 1,
  },
  sceneGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: '28%',
    zIndex: 0,
  },
  sceneArt: {
    width: '100%',
    height: '100%',
  },
  identity: {
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.sm,
    zIndex: 1,
  },
  name: {
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    letterSpacing: -0.6,
  },
  stageLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'capitalize',
  },
  dragonScope: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.6,
    color: colors.textTertiary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    zIndex: 1,
  },
  streakBit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statsLine: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },
  statsDot: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.hairlineBright,
  },
  bars: {
    width: '72%',
    maxWidth: 220,
    marginTop: spacing.sm,
    zIndex: 1,
  },
  barTrack: {
    height: 2,
    backgroundColor: colors.ringTrack,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  tagline: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 260,
    lineHeight: 17,
    zIndex: 1,
  },
  switcher: {
    width: '100%',
    marginTop: spacing.md,
    alignItems: 'center',
    zIndex: 1,
  },
  switcherRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  switcherItem: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherArt: {
    width: 32,
    height: 32,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  lockedHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
