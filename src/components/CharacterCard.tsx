import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  displayDragonName,
  displayProgress,
  dragonById,
  dragonLevelProgress,
  effectiveLevel,
  effectiveStreak,
  getDragonProgress,
  goalHitStreakDays,
  microProgress,
  nextEvolutionStage,
  stageForXpLevel,
  xpProgressInLevel,
} from '@/lib/character';
import {
  hungerArtOpacity,
  hungerBreathMs,
  hungerGlowMul,
  hungerLabel,
  hungerSceneCaption,
  hungerVoice,
  type HungerLevel,
} from '@/lib/dragon-hunger';
import { formatXp } from '@/lib/leaderboard';
import { todayISODate } from '@/lib/protein';
import { useLayout } from '@/lib/layout';
import { canUseStreakFreeze, careStreakDays, getRetention } from '@/lib/retention';
import type { Profile } from '@/lib/types';
import { colors, displayLH, fonts, radius, spacing } from '@/theme';

interface Props {
  profile: Profile;
  bleed?: number;
  showSwitcher?: boolean;
  /** When true, dragon switcher is read-only (daily lock active). */
  dragonLocked?: boolean;
  /** Responsive scale - 1 phone, ~1.08 tablet, ~1.2 desktop sidebar */
  scale?: number;
  /** 0 fed → 3 starving; derived from last meal. */
  hunger?: HungerLevel;
  /** Brief post-log feed celebration. */
  fedPulse?: boolean;
  /** Show Feed CTA under hunger chip. */
  onFeedPress?: () => void;
  /** Daily protein totals (calendar source). When set, streak matches Progress hits. */
  dailyTotals?: Record<string, number>;
}

function CharacterCardInner({
  profile,
  bleed,
  showSwitcher = true,
  dragonLocked = false,
  scale: scaleProp,
  hunger = 0,
  fedPulse = false,
  onFeedPress,
  dailyTotals,
}: Props) {
  const { characterScale: layoutScale } = useLayout();
  const scale = scaleProp ?? layoutScale;
  const nameSize = Math.round(24 * scale);
  const sceneW = Math.round(300 * scale);
  const sceneH = Math.round(200 * scale);

  const todayISO = todayISODate();
  const yesterdayISO = todayISODate(-1);
  const dragonId = displayDragonId(profile, todayISO);
  const dragon = dragonById(dragonId);
  const dragonName = displayDragonName(profile, dragonId);
  const progress = displayProgress(profile, todayISO);
  const { level, xpIntoLevel, xpForNext } = dragonLevelProgress(progress);
  const stage = stageForXpLevel(level, dragonId);
  const next = nextEvolutionStage(level, dragonId);
  const freezeKeepsAlive = canUseStreakFreeze(profile);
  const goalG = profile.protein_goal_g ?? 0;
  const streakFromTotals =
    dailyTotals && goalG > 0
      ? goalHitStreakDays(dailyTotals, goalG, todayISO, yesterdayISO, { freezeKeepsAlive })
      : null;
  const streak =
    streakFromTotals ??
    effectiveStreak(progress, todayISO, yesterdayISO, { freezeKeepsAlive });
  const bondDays = careStreakDays(getRetention(profile), todayISO, yesterdayISO);
  const trainerName = profile.display_name?.trim() || null;

  const micro = microProgress(level, dragonId);
  const stretchComp = (micro.scaleY - 1) * (sceneH * 0.12);
  const breathMs = hungerBreathMs(hunger);
  const breathAmp = hunger === 0 || fedPulse ? 1.035 : hunger >= 3 ? 1.012 : 1.02;
  const floatAmp = hunger >= 3 ? 1.5 : hunger === 0 || fedPulse ? 4 : 3;

  // Mood-linked breath: fed = lively, starving = slow and shallow.
  const breath = useSharedValue(1);
  const float = useSharedValue(0);
  const tilt = useSharedValue(0);
  const feedGlow = useSharedValue(1);

  useEffect(() => {
    breath.value = withRepeat(
      withSequence(
        withTiming(breathAmp, { duration: breathMs, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: breathMs, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    float.value = withRepeat(
      withSequence(
        withTiming(-floatAmp, { duration: breathMs + 200, easing: Easing.inOut(Easing.sin) }),
        withTiming(floatAmp * 0.6, { duration: breathMs + 200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    // Peckish: slight look-aside; starving: almost still.
    const tiltDeg = hunger === 1 ? 2.2 : hunger >= 3 ? 0.4 : 0;
    tilt.value = withRepeat(
      withSequence(
        withTiming(tiltDeg, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
        withTiming(-tiltDeg, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [breath, float, tilt, breathMs, breathAmp, floatAmp, hunger]);

  useEffect(() => {
    if (!fedPulse) {
      feedGlow.value = 1;
      return;
    }
    feedGlow.value = withSequence(
      withTiming(2.4, { duration: 280, easing: Easing.out(Easing.cubic) }),
      withTiming(1.6, { duration: 420, easing: Easing.inOut(Easing.sin) }),
      withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
    );
  }, [fedPulse, feedGlow]);

  const artOpacity = hungerArtOpacity(hunger);
  const glowMul = hungerGlowMul(hunger);
  const hungerChipColor =
    hunger === 0 ? dragon.accent : hunger === 1 ? colors.flame : colors.warning;

  const characterStyle = useAnimatedStyle(() => ({
    opacity: artOpacity,
    transform: [
      { translateY: float.value + micro.translateY - stretchComp },
      { rotate: `${tilt.value}deg` },
      { scaleX: breath.value * micro.scale * (fedPulse ? 1.04 : 1) },
      { scaleY: breath.value * micro.scaleY * (fedPulse ? 1.04 : 1) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: micro.glowOpacity * 0.35 * glowMul * feedGlow.value,
  }));

  const levelsToEvo = next ? next.levelRequired - level : 0;
  const xpPct = xpProgressInLevel(progress.xp, level) * 100;
  const sceneCaption = fedPulse ? null : hungerSceneCaption(hunger);
  const evoLabel = next
    ? `${levelsToEvo} more level${levelsToEvo === 1 ? '' : 's'} to evolve`
    : 'max form';

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
            <Image
              source={stage.art}
              style={styles.sceneArt}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
            />
            {hunger >= 1 ? (
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  styles.hungerVeil,
                  {
                    opacity: hunger === 1 ? 0.12 : hunger === 2 ? 0.28 : 0.42,
                    backgroundColor: hunger >= 2 ? '#1A1420' : '#0B0D12',
                  },
                ]}
              />
            ) : null}
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sceneGlow,
              glowStyle,
              {
                backgroundColor: dragon.accent,
                width: sceneW * 0.7,
                height: sceneH * 0.5,
                borderRadius: sceneW * 0.35,
              },
            ]}
          />
          {sceneCaption ? (
            <View style={styles.sceneCaptionWrap} pointerEvents="none">
              <View
                style={[
                  styles.sceneCaption,
                  {
                    borderColor: `${hungerChipColor}66`,
                    backgroundColor: 'rgba(8,10,14,0.72)',
                  },
                ]}>
                <Ionicons name="restaurant-outline" size={9} color={hungerChipColor} />
                <Text style={[styles.sceneCaptionText, { color: hungerChipColor }]}>
                  {sceneCaption}
                </Text>
              </View>
            </View>
          ) : null}
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
          <Text style={[styles.name, { fontSize: nameSize, lineHeight: displayLH(nameSize) }]}>
            {dragonName}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.stageLabel, { color: dragon.accent }]}>
              Lv {level} · {stage.name}
            </Text>
            {bondDays > 0 ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.bondLine}>cared {bondDays}d</Text>
              </>
            ) : null}
          </View>
          <View
            style={[
              styles.hungerChip,
              {
                borderColor: `${hungerChipColor}88`,
                backgroundColor: `${hungerChipColor}14`,
              },
            ]}>
            <Ionicons
              name={
                fedPulse || hunger === 0
                  ? 'happy-outline'
                  : hunger >= 2
                    ? 'restaurant-outline'
                    : 'time-outline'
              }
              size={10}
              color={hungerChipColor}
            />
            <Text style={[styles.hungerChipText, { color: hungerChipColor }]}>
              {fedPulse ? 'Just fed' : hungerLabel(hunger)}
            </Text>
          </View>
          <Text style={styles.hungerHint}>
            {fedPulse ? `Yum. That hit the spot.` : hungerVoice(hunger, trainerName)}
          </Text>
          {onFeedPress && hunger >= 1 ? (
            <Pressable onPress={onFeedPress} style={styles.feedCta} hitSlop={8}>
              <Ionicons name="restaurant" size={11} color={colors.onAccent} />
              <Text style={styles.feedCtaText}>Feed {dragonName}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          {streak > 0 ? (
            <View style={styles.streakBit}>
              <Ionicons name="flame" size={10} color={colors.flame} />
              <Text style={[styles.statsLine, { color: colors.flame }]}>{streak}d streak</Text>
            </View>
          ) : (
            <Text style={styles.statsLine}>no streak yet</Text>
          )}
          <Text style={styles.statsDot}>·</Text>
          <Text style={[styles.statsLine, styles.evoLine]}>{evoLabel}</Text>
        </View>

        <View style={styles.bars}>
          <View style={styles.barHeader}>
            <Text style={styles.barLabel}>XP · {dragonName}</Text>
            <Text style={styles.barLabel}>
              {formatXp(xpIntoLevel)} / {formatXp(xpForNext)}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${xpPct}%`, backgroundColor: dragon.accent },
              ]}
            />
          </View>
        </View>
      </View>

      {showSwitcher ? (
        <View style={styles.switcher}>
          <View style={styles.switcherRow}>
            {DRAGONS.map((d) => {
              const isActive = d.id === dragonId;
              const prog = getDragonProgress(profile, d.id);
              const lvl = effectiveLevel(prog);
              const st = stageForXpLevel(lvl, d.id);
              const showLock = !isActive && dragonLocked;
              return (
                <View key={d.id} style={styles.switcherItem}>
                  <View
                    style={[
                      styles.dragonPod,
                      isActive && [
                        styles.dragonPodActive,
                        { backgroundColor: colors.accentSurface, borderColor: d.accent, shadowColor: d.accent },
                      ],
                    ]}>
                    <Image
                      source={st.art}
                      style={[
                        isActive ? styles.artActive : styles.artIdle,
                        showLock && { opacity: 0.55 },
                      ]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={0}
                    />
                    {showLock ? (
                      <View style={styles.lockChip}>
                        <Ionicons name="lock-closed" size={8} color={colors.textSecondary} />
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.levelPill, isActive && { backgroundColor: d.accent }]}>
                    <Text style={[styles.levelPillText, isActive && { color: colors.bg }]}>
                      Lv {lvl}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          {dragonLocked ? (
            <Text style={styles.lockedHint}>Switch dragons again tomorrow</Text>
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
    marginTop: 8,
    marginBottom: spacing.md,
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
  hungerVeil: {
    backgroundColor: '#0B0D12',
  },
  sceneCaptionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: 'center',
    zIndex: 3,
  },
  sceneCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sceneCaptionText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'lowercase',
  },
  identity: {
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    zIndex: 1,
    paddingHorizontal: spacing.sm,
  },
  name: {
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    letterSpacing: -0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 2,
  },
  metaDot: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.hairlineBright,
  },
  hungerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  hungerChipText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  stageLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'capitalize',
  },
  bondLine: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.textTertiary,
  },
  hungerHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.2,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    fontStyle: 'italic',
    lineHeight: 15,
  },
  feedCta: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },
  feedCtaText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.onAccent,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
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
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },
  evoLine: {
    color: colors.textSecondary,
  },
  statsDot: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.hairlineBright,
  },
  bars: {
    width: '72%',
    maxWidth: 240,
    marginTop: spacing.md,
    zIndex: 1,
    gap: 6,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  barTrack: {
    height: 4,
    backgroundColor: colors.ringTrack,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  switcher: {
    width: '100%',
    marginTop: spacing.lg,
    alignItems: 'center',
    zIndex: 1,
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  switcherRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: spacing.lg,
  },
  switcherItem: {
    alignItems: 'center',
    gap: 8,
    minWidth: 62,
  },
  dragonPod: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragonPodActive: {
    width: 62,
    height: 62,
    borderRadius: radius.md,
    borderWidth: 1.5,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  artIdle: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    opacity: 0.9,
  },
  artActive: {
    width: 54,
    height: 54,
    borderRadius: radius.sm,
  },
  lockChip: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  levelPillText: {
    fontFamily: fonts.mono,
    fontSize: 8.5,
    letterSpacing: 0.8,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    textAlign: 'center',
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
