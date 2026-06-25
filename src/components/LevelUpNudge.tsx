import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DragonPortrait } from '@/components/DragonPortrait';
import type { DragonId } from '@/lib/types';

export const LEVEL_UP_NUDGE_MS = 900;

function haptic() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

interface Props {
  art: ImageSourcePropType;
  accent: string;
  dragonId: DragonId;
  level: number;
}

export function LevelUpNudge({ art, accent, dragonId, level }: Props) {
  const shakeX = useSharedValue(0);
  const pop = useSharedValue(1);
  const ring = useSharedValue(0.5);

  useEffect(() => {
    haptic();
    shakeX.value = withSequence(
      withTiming(-5, { duration: 45 }),
      withTiming(5, { duration: 45 }),
      withTiming(-3, { duration: 45 }),
      withTiming(3, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
    pop.value = withSequence(
      withSpring(1.1, { damping: 8, stiffness: 220 }),
      withSpring(1, { damping: 12, stiffness: 160 }),
    );
    ring.value = withTiming(1.25, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [pop, ring, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { scale: pop.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - ring.value / 1.25),
    transform: [{ scale: ring.value }],
  }));

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.ring, ringStyle, { borderColor: accent }]} />
      <Animated.View style={shakeStyle}>
        <DragonPortrait art={art} accent={accent} level={level} dragonId={dragonId} showGlow />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: 260,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
  },
});
