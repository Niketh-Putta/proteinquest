import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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

import { CARD_UNLOCK_MS, DragonCardUnlock } from '@/components/DragonCardUnlock';
import { DragonPortrait } from '@/components/DragonPortrait';
import { LevelUpNudge } from '@/components/LevelUpNudge';
import {
  XP_GOAL_BONUS,
  displayDragonId,
  displayProgress,
  dragonById,
  effectiveLevel,
  stageForXpLevel,
} from '@/lib/character';
import { todayISODate } from '@/lib/protein';
import type { Profile } from '@/lib/types';
import { colors, displayLH, fonts, radius, spacing } from '@/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
  perkUnlocked,
  levelBefore,
  levelAfter,
  previousStageIndex,
  onDone,
}: Props) {
  const todayISO = todayISODate();
  const dragonId = displayDragonId(profile, todayISO);
  const dragon = dragonById(dragonId);
  const progress = displayProgress(profile, todayISO);
  const level = levelAfter ?? effectiveLevel(progress);
  const stage = stageForXpLevel(level, dragonId);
  const previousStage =
    evolved && previousStageIndex != null ? dragon.stages[previousStageIndex] : null;

  const showEvolution = evolved && previousStage != null && previousStage.index !== stage.index;
  const isQuickLevelUp = leveledUp && !showEvolution;
  const prevLevel = levelBefore ?? Math.max(1, level - 1);

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
      <Pressable style={styles.backdrop} onPress={ceremonyDone ? onDone : undefined}>
        {(ceremonyDone || !showEvolution) && (
          <View style={styles.particles}>
            {Array.from({ length: 24 }).map((_, i) => (
              <Particle key={i} index={i} color={dragon.accent} delayBase={particleDelay} />
            ))}
          </View>
        )}

        <Animated.View entering={FadeIn.duration(400)} style={styles.arena}>
          <Text style={styles.kicker}>
            {showEvolution && !ceremonyDone
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
                  showGlow
                />
              </Animated.View>
            </View>
          )}

          {ceremonyDone ? (
            <>
              {showEvolution ? (
                <Animated.Text
                  entering={FadeInUp.delay(40).springify().damping(14)}
                  style={[styles.evolvedBanner, { color: dragon.accent }]}>
                  EVOLVED!
                </Animated.Text>
              ) : null}

              <Animated.Text
                entering={FadeInUp.delay(showEvolution ? 120 : 80).springify()}
                style={styles.title}>
                {showEvolution
                  ? `${dragon.name} evolved`
                  : isQuickLevelUp
                    ? `+Level ${level}`
                    : leveledUp
                      ? 'Level up'
                      : 'You showed up'}
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.delay(showEvolution ? 200 : 160).springify()}
                style={[styles.stageName, { color: dragon.accent }]}>
                {showEvolution
                  ? stage.name.toUpperCase()
                  : isQuickLevelUp
                    ? perkUnlocked
                      ? 'PERK UNLOCKED'
                      : `LEVEL ${level}`
                    : leveledUp
                      ? `LEVEL ${level}`
                      : 'PROTEIN GOAL HIT'}
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.delay(showEvolution ? 280 : 240).springify()}
                style={styles.subline}>
                {showEvolution
                  ? `New form unlocked: ${stage.tagline}`
                  : isQuickLevelUp && perkUnlocked
                    ? perkUnlocked
                    : isQuickLevelUp
                      ? `${dragon.name} grows stronger. Keep hitting your goal.`
                      : leveledUp && perkUnlocked
                        ? `Perk unlocked: ${perkUnlocked}`
                        : leveledUp
                          ? `${dragon.name} grows stronger. Keep hitting your goal.`
                          : `${dragon.name} is fed. Keep reaching.`}
              </Animated.Text>

              <Animated.View entering={FadeIn.delay(showEvolution ? 360 : 320)} style={styles.rewardRow}>
                <View style={styles.rewardChip}>
                  <Text style={[styles.rewardValue, { color: dragon.accent }]}>+{XP_GOAL_BONUS}</Text>
                  <Text style={styles.rewardLabel}>xp</Text>
                </View>
                <View style={styles.rewardChip}>
                  <Text style={styles.rewardValue}>{progress.streak}</Text>
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
  particles: { position: 'absolute', top: SCREEN_H / 2 - 60, left: SCREEN_W / 2 },
  arena: { alignItems: 'center', padding: spacing.xl, maxWidth: 380, width: '100%' },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 3.5,
    color: colors.accentSecondary,
    marginBottom: spacing.lg,
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
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: displayLH(32),
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1,
    marginTop: spacing.md,
  },
  stageName: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 8,
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
