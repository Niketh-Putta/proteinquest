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

import { XP_GOAL_BONUS, stageForGoalsHit } from '@/lib/character';
import type { Profile } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PARTICLE_COLORS = [colors.accent, '#8FD13A', colors.flame, '#F4F4F0'];

function Particle({ index }: { index: number }) {
  const progress = useSharedValue(0);
  const cfg = useMemo(() => {
    const angle = (index / 18) * Math.PI * 2 + Math.random() * 0.5;
    return {
      x: Math.cos(angle) * (90 + Math.random() * 130),
      y: Math.sin(angle) * (90 + Math.random() * 130) - 60,
      size: 5 + Math.random() * 7,
      color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
      delay: Math.random() * 180,
      rotate: Math.random() * 360,
    };
  }, [index]);

  useEffect(() => {
    progress.value = withDelay(
      cfg.delay,
      withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, cfg.delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: progress.value * cfg.x },
      { translateY: progress.value * cfg.y + progress.value * progress.value * 110 },
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
          borderRadius: 2,
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
  onDone: () => void;
}

export function Celebration({ visible, profile, evolved, onDone }: Props) {
  const stage = stageForGoalsHit(profile.goals_hit ?? 0);
  const bounce = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    bounce.value = 0;
    bounce.value = withDelay(
      300,
      withRepeat(
        withSequence(
          withSpring(-12, { damping: 6, stiffness: 180 }),
          withSpring(0, { damping: 6, stiffness: 180 }),
        ),
        3,
      ),
    );
  }, [visible, bounce]);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDone}>
      <Pressable style={styles.backdrop} onPress={onDone}>
        <View style={styles.particles}>
          {Array.from({ length: 18 }).map((_, i) => (
            <Particle key={i} index={i} />
          ))}
        </View>

        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.card}>
          <Animated.View style={bounceStyle}>
            <Image source={stage.art} style={styles.art} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(250)} style={styles.title}>
            {evolved ? `Whey evolved to ${stage.name}!` : 'Daily goal hit!'}
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(420)} style={styles.xp}>
            +{XP_GOAL_BONUS} XP
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(560)} style={styles.streak}>
            {profile.streak} day streak {'\u00B7'} {profile.goals_hit} goals total
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(900)} style={styles.dismiss}>
            tap anywhere to continue
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 10, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  particles: {
    position: 'absolute',
    top: SCREEN_H / 2 - 60,
    left: SCREEN_W / 2,
  },
  card: { alignItems: 'center', padding: spacing.xl },
  art: { width: 220, height: 220, borderRadius: 36 },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 26,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  xp: {
    fontFamily: fonts.monoBold,
    fontSize: 18,
    color: colors.accent,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  streak: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
  },
  dismiss: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    letterSpacing: 1,
  },
});
