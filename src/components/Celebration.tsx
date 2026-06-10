import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

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
import { colors, fonts, radius, spacing } from '@/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const MORPH_MS = 3400;
const CHARGE_MS = 1300;
const FLASH_AT = CHARGE_MS;
const CROSSFADE_AT = FLASH_AT + 180;
const CROSSFADE_MS = 900;

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

function RingBurst({ accent, delay, maxScale = 1.6 }: { accent: string; delay: number; maxScale?: number }) {
  const ring = useSharedValue(0.35);

  useEffect(() => {
    ring.value = withDelay(
      delay,
      withTiming(maxScale, { duration: MORPH_MS - delay - 200, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, maxScale, ring]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - ring.value / maxScale),
    transform: [{ scale: ring.value }],
  }));

  return (
    <Animated.View
      style={[morphStyles.ring, style, { borderColor: accent, borderWidth: delay === 0 ? 3 : 2 }]}
    />
  );
}

function EvolutionMorph({
  previousArt,
  newArt,
  accent,
  onMorphComplete,
}: {
  previousArt: ImageSourcePropType;
  newArt: ImageSourcePropType;
  accent: string;
  onMorphComplete: () => void;
}) {
  const oldOpacity = useSharedValue(1);
  const oldScale = useSharedValue(1);
  const newOpacity = useSharedValue(0);
  const newScale = useSharedValue(0.48);
  const flash = useSharedValue(0);
  const charge = useSharedValue(1);
  const glowPulse = useSharedValue(0.18);

  useEffect(() => {
    triggerHaptic('impact');

    charge.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.94, { duration: 260, easing: Easing.inOut(Easing.quad) }),
      ),
      5,
    );
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(0.42, { duration: 260, easing: Easing.out(Easing.quad) }),
        withTiming(0.14, { duration: 260, easing: Easing.in(Easing.quad) }),
      ),
      5,
    );

    flash.value = withDelay(
      FLASH_AT,
      withSequence(
        withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }, (done) => {
          if (done) runOnJS(triggerHaptic)('heavy');
        }),
        withTiming(0, { duration: 620, easing: Easing.out(Easing.cubic) }),
      ),
    );

    oldOpacity.value = withDelay(
      CROSSFADE_AT,
      withTiming(0, { duration: CROSSFADE_MS, easing: Easing.in(Easing.quad) }),
    );
    oldScale.value = withDelay(
      CROSSFADE_AT,
      withTiming(0.62, { duration: CROSSFADE_MS, easing: Easing.in(Easing.cubic) }),
    );

    newOpacity.value = withDelay(
      CROSSFADE_AT + 80,
      withTiming(1, { duration: CROSSFADE_MS + 200, easing: Easing.out(Easing.cubic) }),
    );
    newScale.value = withDelay(
      CROSSFADE_AT + 80,
      withSequence(
        withSpring(1.22, { damping: 7, stiffness: 160 }),
        withSpring(1, { damping: 11, stiffness: 130 }, (done) => {
          if (done) {
            runOnJS(triggerHaptic)('success');
            runOnJS(onMorphComplete)();
          }
        }),
      ),
    );
  }, [charge, flash, glowPulse, newOpacity, newScale, oldOpacity, oldScale, onMorphComplete]);

  const oldStyle = useAnimatedStyle(() => ({
    opacity: oldOpacity.value,
    transform: [{ scale: charge.value * oldScale.value }],
  }));
  const newStyle = useAnimatedStyle(() => ({
    opacity: newOpacity.value,
    transform: [{ scale: newScale.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowPulse.value }));

  return (
    <View style={morphStyles.stage}>
      <RingBurst accent={accent} delay={0} maxScale={1.55} />
      <RingBurst accent={accent} delay={FLASH_AT - 200} maxScale={1.75} />
      <RingBurst accent={accent} delay={CROSSFADE_AT} maxScale={1.9} />
      <Animated.View
        style={[
          morphStyles.glow,
          glowStyle,
          { backgroundColor: accent },
          Platform.OS === 'web' && morphStyles.glowBlur,
        ]}
      />
      <Animated.View style={[morphStyles.flash, flashStyle]} />
      <Animated.View style={[morphStyles.artLayer, oldStyle]}>
        <Image source={previousArt} style={morphStyles.art} />
      </Animated.View>
      <Animated.View style={[morphStyles.artLayer, newStyle]}>
        <Image source={newArt} style={morphStyles.art} />
      </Animated.View>
    </View>
  );
}

function LevelUpPop({ art, accent }: { art: ImageSourcePropType; accent: string }) {
  const pop = useSharedValue(0.88);
  const ring = useSharedValue(0.6);

  useEffect(() => {
    triggerHaptic('impact');
    pop.value = withSequence(
      withSpring(1.14, { damping: 8, stiffness: 200 }),
      withSpring(1, { damping: 12, stiffness: 150 }),
    );
    ring.value = withTiming(1.35, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [pop, ring]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - ring.value / 1.35),
    transform: [{ scale: ring.value }],
  }));

  return (
    <View style={morphStyles.stage}>
      <Animated.View style={[morphStyles.ring, ringStyle, { borderColor: accent }]} />
      <Animated.View style={popStyle}>
        <View style={[styles.portraitFrame, { borderColor: `${accent}50` }]}>
          <Image source={art} style={styles.art} />
        </View>
      </Animated.View>
    </View>
  );
}

const morphStyles = StyleSheet.create({
  stage: {
    height: 240,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
  },
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  glowBlur: Platform.select({
    web: { filter: 'blur(52px)' as unknown as undefined },
    default: {},
  }),
  flash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fff',
    borderRadius: radius.character,
    marginHorizontal: 32,
  },
  artLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: { width: 200, height: 200, borderRadius: radius.character },
});

interface Props {
  visible: boolean;
  profile: Profile;
  evolved: boolean;
  leveledUp?: boolean;
  perkUnlocked?: string | null;
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
    evolved && previousStageIndex != null
      ? dragon.stages[previousStageIndex]
      : null;

  const [morphDone, setMorphDone] = useState(!evolved);
  const breath = useSharedValue(1);
  const glow = useSharedValue(0.16);

  const showEvolutionMorph = evolved && previousStage != null && previousStage.index !== stage.index;
  const isQuickLevelUp = leveledUp && !showEvolutionMorph;
  const particleDelay = showEvolutionMorph && !morphDone ? MORPH_MS + 200 : isQuickLevelUp ? 200 : 600;

  useEffect(() => {
    if (!visible) return;
    setMorphDone(!showEvolutionMorph);
    breath.value = 1;
    breath.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(0.24, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [visible, showEvolutionMorph, breath, glow]);

  const characterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDone}>
      <Pressable style={styles.backdrop} onPress={morphDone ? onDone : undefined}>
        {(morphDone || !showEvolutionMorph) && (
          <View style={styles.particles}>
            {Array.from({ length: 24 }).map((_, i) => (
              <Particle key={i} index={i} color={dragon.accent} delayBase={particleDelay} />
            ))}
          </View>
        )}

        <Animated.View entering={FadeIn.duration(400)} style={styles.arena}>
          <Text style={styles.kicker}>
            {showEvolutionMorph && !morphDone
              ? 'EVOLVING…'
              : isQuickLevelUp
                ? 'LEVEL UP'
                : 'REACH YOUR POTENTIAL'}
          </Text>

          {showEvolutionMorph ? (
            <EvolutionMorph
              previousArt={previousStage!.art}
              newArt={stage.art}
              accent={dragon.accent}
              onMorphComplete={() => setMorphDone(true)}
            />
          ) : isQuickLevelUp ? (
            <LevelUpPop art={stage.art} accent={dragon.accent} />
          ) : (
            <View style={styles.stage}>
              <Animated.View
                style={[
                  styles.glow,
                  glowStyle,
                  { backgroundColor: dragon.accent },
                  Platform.OS === 'web' && styles.glowBlur,
                ]}
              />
              <Animated.View style={characterStyle}>
                <View style={[styles.portraitFrame, { borderColor: `${dragon.accent}50` }]}>
                  <Image source={stage.art} style={styles.art} />
                </View>
              </Animated.View>
            </View>
          )}

          {morphDone ? (
            <>
              {showEvolutionMorph ? (
                <Animated.Text
                  entering={FadeInUp.delay(40).springify().damping(14)}
                  style={[styles.evolvedBanner, { color: dragon.accent }]}>
                  EVOLVED!
                </Animated.Text>
              ) : null}

              <Animated.Text
                entering={FadeInUp.delay(showEvolutionMorph ? 120 : 80).springify()}
                style={styles.title}>
                {showEvolutionMorph
                  ? `${dragon.name} evolved`
                  : isQuickLevelUp
                    ? `+Level ${level}`
                    : leveledUp
                      ? 'Level up'
                      : 'You showed up'}
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.delay(showEvolutionMorph ? 200 : 160).springify()}
                style={[styles.stageName, { color: dragon.accent }]}>
                {showEvolutionMorph
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
                entering={FadeInUp.delay(showEvolutionMorph ? 280 : 240).springify()}
                style={styles.subline}>
                {showEvolutionMorph
                  ? `New form unlocked — ${stage.tagline}`
                  : isQuickLevelUp && perkUnlocked
                    ? perkUnlocked
                    : isQuickLevelUp
                      ? `${dragon.name} grows stronger. Keep hitting your goal.`
                      : leveledUp && perkUnlocked
                        ? `Perk unlocked — ${perkUnlocked}`
                        : leveledUp
                          ? `${dragon.name} grows stronger. Keep hitting your goal.`
                          : `${dragon.name} is fed. Keep reaching.`}
              </Animated.Text>

              <Animated.View entering={FadeIn.delay(showEvolutionMorph ? 360 : 320)} style={styles.rewardRow}>
                <View style={styles.rewardChip}>
                  <Text style={[styles.rewardValue, { color: dragon.accent }]}>+{XP_GOAL_BONUS}</Text>
                  <Text style={styles.rewardLabel}>xp</Text>
                </View>
                <View style={styles.rewardChip}>
                  <Text style={styles.rewardValue}>{progress.streak}</Text>
                  <Text style={styles.rewardLabel}>day streak</Text>
                </View>
              </Animated.View>

              <Animated.Text entering={FadeIn.delay(showEvolutionMorph ? 520 : 480)} style={styles.dismiss}>
                TAP TO CONTINUE
              </Animated.Text>
            </>
          ) : (
            <Text style={styles.morphHint}>Watch your dragon transform…</Text>
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
    height: 240,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.14,
  },
  glowBlur: Platform.select({
    web: { filter: 'blur(48px)' as unknown as undefined },
    default: {},
  }),
  portraitFrame: {
    borderRadius: radius.character,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: colors.bgRaised,
  },
  art: { width: 200, height: 200, borderRadius: radius.character },
  evolvedBanner: {
    fontFamily: fonts.displayHeavy,
    fontSize: 42,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
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
  morphHint: {
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
