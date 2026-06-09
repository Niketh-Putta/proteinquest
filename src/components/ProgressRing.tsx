import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export function ProgressRing({ consumed, goal, size = 240 }: Props) {
  const strokeWidth = 18;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const remaining = Math.max(goal - consumed, 0);
  const hitGoal = goal > 0 && consumed >= goal;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.ringTrack}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.consumed}>{Math.round(consumed)}</Text>
      <Text style={styles.unit}>of {goal}g protein</Text>
      <Text style={[styles.remaining, hitGoal && { color: colors.accent }]}>
        {hitGoal ? 'Goal hit \u{1F389}' : `${Math.round(remaining)}g to go`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  consumed: {
    fontSize: 64,
    fontWeight: '800',
    color: colors.text,
    fontFamily: fonts?.rounded,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: -4,
  },
  remaining: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 6,
  },
});
