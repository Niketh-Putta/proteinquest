import React, { useEffect, useMemo } from 'react';
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import {
  XP_GOAL_BONUS,
  activeDragonId,
  activeProgress,
  dragonById,
  stageForGoalsHit,
} from '@/lib/character';
import type { Profile } from '@/lib/types';
import { colors, fonts, spacing } from '@/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function Particle({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);
  const cfg = useMemo(() => {
    const angle = (index / 20) * Math.PI * 2 + Math.random() * 0.5;
    return {
      x: Math.cos(angle) * (90 + Math.random() * 140),
      y: Math.sin(angle) * (90 + Math.random() * 140) - 60,
      size: 5 + Math.random() * 8,
      color: index % 3 === 0 ? color : index % 3 === 1 ? colors.accent : colors.flame,
      delay: Math.random() * 200,
      rotate: Math.random() * 360,
    };
  }, [index, color]);

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
        { position: 'absolute', width: cfg.size, height: cfg.size, borderRadius: 2, backgroundColor: cfg.color },
        style,
      ]}
    />
  );
}

interface Props {
  visible: boolean;
  profile: Profile;
  evolved: boolean;
  onDone: () => void;
}

export function Celebration({ visible, profile, evolved, onDone }: Props) {
  const dragonId = activeDragonId(profile);
  const dragon = dragonById(dragonId);
  const progress = activeProgress(profile);
  const stage = stageForGoalsHit(progress.goals_hit, dragonId);
  const bounce = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!visible) return;
    bounce.value = 0;
    scale.value = 1;
    if (evolved) {
      scale.value = withSequence(
        withSpring(1.15, { damping: 6, stiffness: 200 }),
        withSpring(1, { damping: 8, stiffness: 180 }),
      );
    }
    bounce.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withSpring(-14, { damping: 5, stiffness: 160 }),
          withSpring(0, { damping: 5, stiffness: 160 }),
        ),
        evolved ? 4 : 2,
      ),
    );
  }, [visible, evolved, bounce, scale]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }, { scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDone}>
      <Pressable style={styles.backdrop} onPress={onDone}>
        <View style={styles.particles}>
          {Array.from({ length: 20 }).map((_, i) => (
            <Particle key={i} index={i} color={dragon.accent} />
          ))}
        </View>

        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.card}>
          <Animated.View style={bounceStyle}>
            <Image source={stage.art} style={styles.art} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(200)} style={styles.title}>
            {evolved ? `${dragon.name} evolved to ${stage.name}!` : 'Goal hit — dragon fed!'}
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(350)} style={[styles.xp, { color: dragon.accent }]}>
            +{XP_GOAL_BONUS} XP
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(500)} style={styles.streak}>
            {progress.streak} day streak {'\u00B7'} Reach your potential
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(800)} style={styles.dismiss}>
            tap to continue
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 10, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particles: { position: 'absolute', top: SCREEN_H / 2 - 60, left: SCREEN_W / 2 },
  card: { alignItems: 'center', padding: spacing.xl, maxWidth: 360 },
  art: { width: 200, height: 200, borderRadius: 32 },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  xp: { fontFamily: fonts.monoBold, fontSize: 18, marginTop: spacing.sm, letterSpacing: 1 },
  streak: { fontFamily: fonts.mono, fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  dismiss: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    letterSpacing: 1,
  },
});
