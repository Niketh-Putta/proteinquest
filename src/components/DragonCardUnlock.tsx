import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DragonPortrait } from '@/components/DragonPortrait';
import type { DragonId } from '@/lib/types';
import { radius } from '@/theme';

const HOLD_MS = 400;
const SHAKE_MS = 600;
const BREAK_MS = 300;
const REVEAL_MS = 1200;

export const CARD_UNLOCK_MS = HOLD_MS + SHAKE_MS + BREAK_MS + REVEAL_MS;

function haptic(type: 'impact' | 'success' | 'heavy') {
  if (Platform.OS === 'web') return;
  if (type === 'success') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  Haptics.impactAsync(
    type === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium,
  ).catch(() => {});
}

interface Props {
  previousArt: ImageSourcePropType;
  newArt: ImageSourcePropType;
  accent: string;
  dragonId: DragonId;
  levelBefore: number;
  levelAfter: number;
  onComplete: () => void;
}

export function DragonCardUnlock({
  previousArt,
  newArt,
  accent,
  dragonId,
  levelBefore,
  levelAfter,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<'hold' | 'shake' | 'break' | 'reveal' | 'done'>('hold');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const shakeX = useSharedValue(0);
  const oldOpacity = useSharedValue(1);
  const oldScale = useSharedValue(1);
  const flash = useSharedValue(0);
  const newOpacity = useSharedValue(0);
  const newScale = useSharedValue(0.5);
  const ring = useSharedValue(0.4);

  useEffect(() => {
    haptic('impact');
    const t1 = setTimeout(() => {
      setPhase('shake');
      shakeX.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 50 }),
          withTiming(-6, { duration: 50 }),
          withTiming(6, { duration: 50 }),
          withTiming(-4, { duration: 50 }),
          withTiming(4, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        ),
        3,
      );
      ring.value = withTiming(1.6, { duration: SHAKE_MS, easing: Easing.out(Easing.cubic) });
    }, HOLD_MS);

    const t2 = setTimeout(() => {
      setPhase('break');
      haptic('heavy');
      flash.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 220 }),
      );
      oldOpacity.value = withTiming(0, { duration: BREAK_MS });
      oldScale.value = withTiming(0.7, { duration: BREAK_MS });
    }, HOLD_MS + SHAKE_MS);

    const t3 = setTimeout(() => {
      setPhase('reveal');
      newOpacity.value = withTiming(1, { duration: 200 });
      newScale.value = withSequence(
        withSpring(1.18, { damping: 7, stiffness: 160 }),
        withSpring(1, { damping: 11, stiffness: 130 }),
      );
    }, HOLD_MS + SHAKE_MS + BREAK_MS);

    const t4 = setTimeout(() => {
      setPhase('done');
      haptic('success');
      onCompleteRef.current();
    }, CARD_UNLOCK_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [flash, newOpacity, newScale, oldOpacity, oldScale, ring, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));
  const oldStyle = useAnimatedStyle(() => ({
    opacity: oldOpacity.value,
    transform: [{ scale: oldScale.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const newStyle = useAnimatedStyle(() => ({
    opacity: newOpacity.value,
    transform: [{ scale: newScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - ring.value / 1.6),
    transform: [{ scale: ring.value }],
  }));

  const showOld = phase === 'hold' || phase === 'shake' || phase === 'break';
  const showNew = phase === 'reveal' || phase === 'done';

  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.ring, ringStyle, { borderColor: accent }]} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, flashStyle, styles.flash]} />

      {showOld ? (
        <Animated.View style={[styles.center, shakeStyle, oldStyle]}>
          <DragonPortrait
            art={previousArt}
            accent={accent}
            level={levelBefore}
            dragonId={dragonId}
            showGlow
          />
        </Animated.View>
      ) : null}

      {showNew ? (
        <Animated.View style={[styles.center, newStyle]}>
          <DragonPortrait
            art={newArt}
            accent={accent}
            level={levelAfter}
            dragonId={dragonId}
            showGlow
          />
        </Animated.View>
      ) : null}
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
  center: {
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
  flash: {
    backgroundColor: '#fff',
    borderRadius: radius.character,
    marginHorizontal: 24,
    pointerEvents: 'none',
  },
});
