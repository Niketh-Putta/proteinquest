import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_UNLOCK_MS, DragonCardUnlock } from '@/components/DragonCardUnlock';
import { DragonPortrait } from '@/components/DragonPortrait';
import { LevelUpNudge } from '@/components/LevelUpNudge';
import {
  XP_GOAL_BONUS,
  displayDragonId,
  displayDragonName,
  displayProgress,
  dragonById,
  effectiveLevel,
  effectiveStreak,
  stageForXpLevel,
} from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import { canUseStreakFreeze } from '@/lib/retention';
import type { Profile } from '@/lib/types';
import { colors, displayLH, fonts, layout, radius, spacing } from '@/theme';

function triggerHaptic(type: 'impact' | 'success' | 'heavy') {
  if (Platform.OS === 'web') return;
  if (type === 'success') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  Haptics.impactAsync(
    type === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
  ).catch(() => {});
}

function Particle({ index, color, delayBase = 800 }: { index: number; color: string; delayBase?: number }) {
  const progress = useSharedValue(0);
  const cfg = useMemo(() => {
    const angle = (index / 24) * Math.PI * 2 + Math.random() * 0.5;
    return {
      x: Math.cos(angle) * (90 + Math.random() * 140),
      y: Math.sin(angle) * (90 + Math.random() * 140) - 60,
      size: 4 + Math.random() * 6,
      color: index % 3 === 0 ? color : index % 3 === 1 ? colors.accent : colors.flame,
      delay: delayBase + Math.random() * 400,
      rotate: Math.random() * 360,
    };
  }, [index, color, delayBase]);

  useEffect(() => {
    progress.value = withDelay(
      cfg.delay,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, cfg.delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: progress.value * cfg.x },
      { translateY: progress.value * cfg.y + progress.value * progress.value * 120 },
      { rotate: `${progress.value * cfg.rotate}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: cfg.size,
          height: cfg.size,
          borderRadius: cfg.size / 2,
          backgroundColor: cfg.color,
        },
        style,
      ]}
    />
  );
}

interface Props {
  visible: boolean;
  profile: Profile;
  evolved: boolean;
  leveledUp?: boolean;
  leveledDown?: boolean;
  goalJustHit?: boolean;
  goalUndone?: boolean;
  xpGained?: number;
  xpLost?: number;
  perkUnlocked?: string | null;
  levelBefore?: number;
  levelAfter?: number;
  previousStageIndex?: number;
  onDone: () => void;
}

export function Celebration({
  visible,
  profile,
  evolved,
  leveledUp = false,
  leveledDown = false,
  goalJustHit = false,
  goalUndone = false,
  xpGained,
  xpLost,
  perkUnlocked,
  levelBefore,
  levelAfter,
  previousStageIndex,
  onDone,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = screenH < 700 || screenW < 390;
  const todayISO = todayISODate();
  const yesterdayISO = todayISODate(-1);
  const dragonId = displayDragonId(profile, todayISO);
  const dragon = dragonById(dragonId);
  const dragonName = displayDragonName(profile, dragonId);
  const progress = displayProgress(profile, todayISO);
  const level = levelAfter ?? effectiveLevel(progress);
  const stage = stageForXpLevel(level, dragonId);
  const previousStage =
    evolved && previousStageIndex != null ? dragon.stages[previousStageIndex] : null;

  const showEvolution = !leveledDown && evolved && previousStage != null && previousStage.index !== stage.index;
  const isQuickLevelUp = !leveledDown && leveledUp && !showEvolution;
  const isLevelDown = leveledDown || (goalUndone && !leveledUp && !showEvolution);
  const prevLevel = levelBefore ?? (isLevelDown ? level + 1 : Math.max(1, level - 1));
  const streakShown = effectiveStreak(progress, todayISO, yesterdayISO, {
    freezeKeepsAlive: canUseStreakFreeze(profile),
  });
  const xpShown = Math.max(0, Math.round(xpGained ?? (goalJustHit ? XP_GOAL_BONUS : 0)));
  const xpLostShown = Math.max(0, Math.round(xpLost ?? 0));

  const [ceremonyDone, setCeremonyDone] = useState(!showEvolution);
  const breath = useSharedValue(1);

  const particleDelay = showEvolution && !ceremonyDone ? CARD_UNLOCK_MS + 200 : isQuickLevelUp ? 200 : 600;

  useEffect(() => {
    if (!visible) return;
    setCeremonyDone(!showEvolution);
    breath.value = 1;
    breath.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [visible, showEvolution, breath]);

  const characterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDone}>
      <Pressable
        style={[
          styles.backdrop,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md,
            paddingHorizontal: spacing.md,
          },
        ]}
        onPress={ceremonyDone ? onDone : undefined}>
        {!isLevelDown && (ceremonyDone || !showEvolution) && (
          <View style={[styles.particles, { top: screenH / 2 - 60, left: screenW / 2 }]}>
            {Array.from({ length: 24 }).map((_, i) => (
              <Particle key={i} index={i} color={dragon.accent} delayBase={particleDelay} />
            ))}
          </View>
        )}

        <Animated.View
          entering={FadeIn.duration(400)}
          style={[styles.arena, isCompact && styles.arenaCompact]}>
          <Text style={[styles.kicker, isLevelDown && styles.kickerDown]}>
            {isLevelDown
              ? leveledDown
                ? 'LEVEL DOWN'
                : 'GOAL UNDONE'
              : showEvolution && !ceremonyDone
                ? 'EVOLVING…'
                : isQuickLevelUp
                  ? 'LEVEL UP'
                  : 'REACH YOUR POTENTIAL'}
          </Text>

          {showEvolution ? (
            <DragonCardUnlock
              previousArt={previousStage!.art}
              newArt={stage.art}
              accent={dragon.accent}
              dragonId={dragonId}
              levelBefore={prevLevel}
              levelAfter={level}
              onComplete={() => {
                triggerHaptic('success');
                setCeremonyDone(true);
              }}
            />
          ) : isQuickLevelUp ? (
            <LevelUpNudge art={stage.art} accent={dragon.accent} dragonId={dragonId} level={level} />
          ) : (
            <View style={styles.stage}>
              <Animated.View style={characterStyle}>
                <DragonPortrait
                  art={stage.art}
                  accent={dragon.accent}
                  level={level}
                  dragonId={dragonId}
                  showGlow={!isLevelDown}
                />
              </Animated.View>
            </View>
          )}

          {ceremonyDone ? (
            <>
              {showEvolution ? (
                <Animated.Text
                  entering={FadeInUp.delay(40).springify().damping(14)}
                  style={[
                    styles.evolvedBanner,
                    isCompact && styles.evolvedBannerCompact,
                    { color: dragon.accent },
                  ]}>
                  EVOLVED!
                </Animated.Text>
              ) : null}

              {showEvolution ? (
                <Animated.Text
                  entering={FadeInUp.delay(120).springify()}
                  style={[styles.title, isCompact && styles.titleCompact]}>
                  {`${dragonName} evolved`}
                </Animated.Text>
              ) : leveledDown || isQuickLevelUp || leveledUp ? (
                <Animated.View
                  entering={FadeInUp.delay(80).springify()}
                  style={styles.levelTransitionRow}
                  accessibilityLabel={`Level ${prevLevel} to level ${level}`}>
                  <Text style={[styles.levelTransitionPrev, isCompact && styles.levelTransitionCompact]}>
                    Lvl {prevLevel}
                  </Text>
                  <Text
                    style={[
                      styles.levelTransitionArrow,
                      { color: leveledDown ? 'rgba(255,255,255,0.45)' : dragon.accent },
                    ]}>
                    →
                  </Text>
                  <Text
                    style={[
                      styles.levelTransitionNext,
                      isCompact && styles.levelTransitionCompact,
                      { color: leveledDown ? colors.text : dragon.accent },
                    ]}>
                    Lvl {level}
                  </Text>
                </Animated.View>
              ) : isLevelDown ? (
                <Animated.Text
                  entering={FadeInUp.delay(80).springify()}
                  style={[styles.title, isCompact && styles.titleCompact]}>
                  Goal undone
                </Animated.Text>
              ) : (
                <Animated.Text
                  entering={FadeInUp.delay(80).springify()}
                  style={[styles.title, isCompact && styles.titleCompact]}>
                  You showed up
                </Animated.Text>
              )}
              {showEvolution ? (
                <Animated.View
                  entering={FadeInUp.delay(200).springify()}
                  style={styles.stageMetaRow}>
                  <Text style={[styles.stageName, styles.stageNameInline, { color: dragon.accent }]}>
                    {stage.name.toUpperCase()}
                  </Text>
                  <View
                    style={[
                      styles.levelTagShell,
                      {
                        borderColor: `${dragon.accent}99`,
                        shadowColor: dragon.accent,
                      },
                    ]}>
                    <LinearGradient
                      colors={[`${dragon.accent}33`, '#141214', '#0C0B0D']}
                      locations={[0, 0.45, 1]}
                      start={{ x: 0.15, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                      style={styles.levelTag}>
                      <View style={styles.levelTagSheen} />
                      <Text style={[styles.levelTagLabel, { color: dragon.accent }]}>LV</Text>
                      <Text style={[styles.levelTagValue, { color: dragon.accent }]}>{level}</Text>
                    </LinearGradient>
                  </View>
                </Animated.View>
              ) : (
                <Animated.Text
                  entering={FadeInUp.delay(160).springify()}
                  style={[
                    styles.stageName,
                    { color: isLevelDown ? 'rgba(255,255,255,0.55)' : dragon.accent },
                  ]}>
                  {isLevelDown
                    ? leveledDown
                      ? `NOW LEVEL ${level}`
                      : 'PROTEIN GOAL UNDONE'
                    : isQuickLevelUp
                      ? perkUnlocked
                        ? 'PERK UNLOCKED'
                        : `LEVEL ${level}`
                      : leveledUp
                        ? `LEVEL ${level}`
                        : 'PROTEIN GOAL HIT'}
                </Animated.Text>
              )}
              <Animated.Text
                entering={FadeInUp.delay(showEvolution ? 280 : 240).springify()}
                style={styles.subline}>
                {isLevelDown
                  ? goalUndone && leveledDown
                    ? `Meal edit dropped XP and undid today's goal. Log more protein to climb back.`
                    : goalUndone
                      ? `Today's protein is under goal again. Keep logging to reclaim the bonus.`
                      : `${dragonName} lost some XP from this edit. Feed more protein to level up again.`
                  : showEvolution
                    ? `New form unlocked: ${stage.tagline}`
                    : isQuickLevelUp && perkUnlocked
                      ? perkUnlocked
                      : isQuickLevelUp
                        ? `${dragonName} grows stronger. Keep hitting your goal.`
                        : leveledUp && perkUnlocked
                          ? `Perk unlocked: ${perkUnlocked}`
                          : leveledUp
                            ? `${dragonName} grows stronger. Keep hitting your goal.`
                            : `${dragonName} is fed. Keep reaching.`}
              </Animated.Text>

              <Animated.View entering={FadeIn.delay(showEvolution ? 360 : 320)} style={styles.rewardRow}>
                {isLevelDown && xpLostShown > 0 ? (
                  <View style={styles.rewardChip}>
                    <Text style={[styles.rewardValue, styles.rewardValueDown]}>-{xpLostShown}</Text>
                    <Text style={styles.rewardLabel}>
                      {goalUndone ? 'xp · goal' : 'xp'}
                    </Text>
                  </View>
                ) : null}
                {!isLevelDown && xpShown > 0 ? (
                  <View style={styles.rewardChip}>
                    <Text style={[styles.rewardValue, { color: dragon.accent }]}>+{xpShown}</Text>
                    <Text style={styles.rewardLabel}>
                      {goalJustHit ? 'xp · goal' : 'xp'}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.rewardChip}>
                  <Text style={styles.rewardValue}>{streakShown}</Text>
                  <Text style={styles.rewardLabel}>day streak</Text>
                </View>
              </Animated.View>

              <Animated.Text entering={FadeIn.delay(showEvolution ? 520 : 480)} style={styles.dismiss}>
                TAP TO CONTINUE
              </Animated.Text>
            </>
          ) : (
            <Text style={styles.ceremonyHint}>
              {showEvolution ? 'New card unlocking…' : 'Level up…'}
            </Text>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 10, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particles: { position: 'absolute' },
  arena: { alignItems: 'center', padding: spacing.xl, maxWidth: 380, width: '100%' },
  arenaCompact: { padding: spacing.lg, maxWidth: 340 },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 3.5,
    color: colors.accentSecondary,
    marginBottom: spacing.lg,
  },
  kickerDown: {
    color: 'rgba(255,255,255,0.45)',
  },
  stage: {
    height: 260,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evolvedBanner: {
    fontFamily: fonts.displayHeavy,
    fontSize: 42,
    lineHeight: displayLH(42),
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  evolvedBannerCompact: {
    fontSize: 32,
    lineHeight: displayLH(32),
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: displayLH(32),
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1,
    marginTop: spacing.md,
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: displayLH(26),
  },
  levelTransitionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 10,
    marginTop: spacing.md,
  },
  levelTransitionPrev: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    lineHeight: displayLH(28),
    color: 'rgba(255,255,255,0.38)',
    letterSpacing: -0.8,
  },
  levelTransitionArrow: {
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
    lineHeight: displayLH(28),
    letterSpacing: 0,
  },
  levelTransitionNext: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: displayLH(32),
    letterSpacing: -1,
  },
  levelTransitionCompact: {
    fontSize: 24,
    lineHeight: displayLH(24),
  },
  stageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: spacing.sm,
  },
  stageName: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  stageNameInline: {
    marginTop: 0,
  },
  levelTagShell: {
    minWidth: 44,
    borderRadius: 11,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0E0D10',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  levelTag: {
    alignSelf: 'stretch',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  levelTagSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  levelTagLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.48)',
    fontWeight: '600',
  },
  levelTagValue: {
    fontFamily: fonts.displayHeavy,
    fontSize: 16,
    lineHeight: 18,
    color: colors.text,
    letterSpacing: -0.4,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  ceremonyHint: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textTertiary,
    marginTop: spacing.lg,
  },
  rewardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  rewardChip: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    minWidth: 100,
  },
  rewardValue: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  rewardValueDown: {
    color: 'rgba(255, 140, 120, 0.95)',
  },
  rewardLabel: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  dismiss: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 2,
    marginTop: spacing.xl,
  },
});
